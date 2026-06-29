import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Request, Response, Router } from "express";
import { publicV1BaseUrl } from "./url.js";

const SESSION_COOKIE = "evoship_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DATA_DIR = path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_DIR, "evoship.sqlite");

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  credits: number;
  created_at: number;
}

interface UserRow extends AuthUser {
  password_hash: string;
}

function now(): number {
  return Date.now();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function publicUser(row: UserRow | AuthUser): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    credits: row.credits ?? 0,
    created_at: row.created_at,
  };
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split(":");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(password, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function sessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie || "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey || rest.length === 0) continue;
    out[rawKey] = decodeURIComponent(rest.join("="));
  }
  return out;
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

function clearSessionCookie(res: Response): void {
  res.cookie(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export class AuthStore {
  private db: DatabaseSync;

  constructor(dbPath = DB_PATH) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS credit_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        delta INTEGER NOT NULL,
        balance INTEGER NOT NULL,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions(user_id);
    `);
    // 向后兼容:旧库 users 表无 credits 列时补上(幂等)
    const cols = this.db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "credits")) {
      this.db.exec("ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 1000");
    }
  }

  createUser(input: { email: string; password: string; name?: string }): AuthUser {
    const email = normalizeEmail(input.email);
    const name = input.name?.trim() || email.split("@")[0] || "EvoShip 用户";
    const passwordHash = hashPassword(input.password);
    const createdAt = now();
    try {
      const result = this.db.prepare(
        "INSERT INTO users (email, name, password_hash, credits, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(email, name, passwordHash, 1000, createdAt);
      return { id: Number(result.lastInsertRowid), email, name, credits: 1000, created_at: createdAt };
    } catch (e) {
      if (e instanceof Error && /UNIQUE|constraint/i.test((e as Error).message)) {
        throw new Error("该邮箱已注册。");
      }
      throw e;
    }
  }

  findUserByEmail(email: string): UserRow | null {
    return this.db.prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email)) as UserRow | undefined || null;
  }

  findUserBySession(token: string): AuthUser | null {
    if (!token) return null;
    this.deleteExpiredSessions();
    const row = this.db.prepare(`
      SELECT users.id, users.email, users.name, users.credits, users.created_at
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(tokenHash(token), now()) as AuthUser | undefined;
    return row ? publicUser(row) : null;
  }

  verifyUser(email: string, password: string): AuthUser | null {
    const user = this.findUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) return null;
    return publicUser(user);
  }

  createSession(userId: number): string {
    const token = sessionToken();
    this.db.prepare(
      "INSERT INTO sessions (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
    ).run(userId, tokenHash(token), now(), now() + SESSION_TTL_MS);
    return token;
  }

  deleteSession(token: string): void {
    if (!token) return;
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
  }

  deleteExpiredSessions(): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now());
  }

  // ── 积分体系 ──
  getCredits(userId: number): number {
    const row = this.db.prepare("SELECT credits FROM users WHERE id = ?").get(userId) as { credits: number } | undefined;
    return Number(row?.credits ?? 0);
  }

  /** 扣分:原子操作,余额不足返回 false(不扣)。成功则记流水 */
  deductCredits(userId: number, amount: number, reason: string): { ok: boolean; balance: number } {
    const r = this.db.prepare("UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?")
      .run(amount, userId, amount);
    if (Number(r.changes) === 0) {
      return { ok: false, balance: this.getCredits(userId) };
    }
    const balance = this.getCredits(userId);
    this.db.prepare("INSERT INTO credit_transactions (user_id, delta, balance, reason, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(userId, -amount, balance, reason, now());
    return { ok: true, balance };
  }

  /** 加分(注册赠送/充值/兑换)。记流水 */
  addCredits(userId: number, amount: number, reason: string): number {
    this.db.prepare("UPDATE users SET credits = credits + ? WHERE id = ?").run(amount, userId);
    const balance = this.getCredits(userId);
    this.db.prepare("INSERT INTO credit_transactions (user_id, delta, balance, reason, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(userId, amount, balance, reason, now());
    return balance;
  }

  listTransactions(userId: number, limit = 50): Array<{ id: number; delta: number; balance: number; reason: string; created_at: number }> {
    const rows = this.db.prepare("SELECT id, delta, balance, reason, created_at FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(userId, limit) as Array<{ id: number; delta: number; balance: number; reason: string; created_at: number }>;
    return rows;
  }
}

function validateAuthInput(body: unknown, mode: "login" | "register"): { email: string; password: string; name?: string } {
  const b = (body || {}) as { email?: unknown; password?: unknown; name?: unknown };
  const email = typeof b.email === "string" ? normalizeEmail(b.email) : "";
  const password = typeof b.password === "string" ? b.password : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("请输入有效的邮箱地址。");
  if (password.length < 6) throw new Error("密码至少 6 位。");
  if (mode === "register" && name.length > 80) throw new Error("称呼不能超过 80 个字符。");
  return { email, password, name };
}

export function getSessionToken(req: Request): string {
  return parseCookies(req)[SESSION_COOKIE] || "";
}

export interface ProvisionedKey {
  api_key: string;
  base_url: string;
  model: string;
}

export function registerAuthRoutes(
  router: Router,
  auth = new AuthStore(),
  opts: { onUserCreated?: (userId: number, req: Request) => Promise<ProvisionedKey | null> } = {},
): void {
  router.get("/api/auth/me", (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    res.json({ user });
  });

  router.post("/api/auth/register", async (req, res) => {
    try {
      const input = validateAuthInput(req.body, "register");
      const user = auth.createUser(input);
      const token = auth.createSession(user.id);
      setSessionCookie(res, token);
      // 注册自动发一个绑定内置默认模型的 key
      let provisionedKey: ProvisionedKey | null = null;
      if (opts.onUserCreated) {
        try {
          provisionedKey = await opts.onUserCreated(user.id, req);
        } catch (e) {
          console.warn("[auth] 自动发 key 失败(不阻断注册):", e instanceof Error ? e.message : String(e));
        }
      }
      const baseUrl = provisionedKey ? publicV1BaseUrl(req) : undefined;
      res.status(201).json({ user, api_key: provisionedKey?.api_key, base_url: baseUrl, model: provisionedKey?.model });
    } catch (e) {
      res.status(400).json({ error: { message: e instanceof Error ? e.message : "注册失败。" } });
    }
  });

  router.post("/api/auth/login", (req, res) => {
    try {
      const input = validateAuthInput(req.body, "login");
      const user = auth.verifyUser(input.email, input.password);
      if (!user) return res.status(401).json({ error: { message: "邮箱或密码不正确。" } });
      const token = auth.createSession(user.id);
      setSessionCookie(res, token);
      res.json({ user });
    } catch (e) {
      res.status(400).json({ error: { message: e instanceof Error ? e.message : "登录失败。" } });
    }
  });

  router.post("/api/auth/logout", (req, res) => {
    auth.deleteSession(getSessionToken(req));
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // ── 积分管理路由 ──
  router.get("/api/credits", (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    res.json({ balance: user.credits, transactions: auth.listTransactions(user.id) });
  });
}
