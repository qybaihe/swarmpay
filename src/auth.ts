import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Request, Response, Router } from "express";
import { publicV1BaseUrl } from "./url.js";

const SESSION_COOKIE = "swarmpay_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DATA_DIR = path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_DIR, "evoship.sqlite");

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  /** 用户绑定的 Injective 链上地址(链上付费的付款方) */
  injective_address?: string;
  /** credits 已废除,保留字段仅为向后兼容(始终 0),新逻辑用链上 INJ */
  credits?: number;
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
    injective_address: row.injective_address,
    credits: 0,
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
        injective_address TEXT,
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
    `);
    // 向后兼容迁移:旧库可能无 injective_address 列(或仍有 credits 列)
    const cols = this.db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "injective_address")) {
      this.db.exec("ALTER TABLE users ADD COLUMN injective_address TEXT");
    }
  }

  createUser(input: { email: string; password: string; name?: string; injective_address?: string }): AuthUser {
    const email = normalizeEmail(input.email);
    const name = input.name?.trim() || email.split("@")[0] || "SwarmPay 用户";
    const passwordHash = hashPassword(input.password);
    const injectiveAddress = input.injective_address?.trim() || null;
    const createdAt = now();
    try {
      const result = this.db.prepare(
        "INSERT INTO users (email, name, password_hash, injective_address, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(email, name, passwordHash, injectiveAddress, createdAt);
      return { id: Number(result.lastInsertRowid), email, name, injective_address: injectiveAddress || undefined, credits: 0, created_at: createdAt };
    } catch (e) {
      if (e instanceof Error && /UNIQUE|constraint/i.test((e as Error).message)) {
        throw new Error("该邮箱已注册。");
      }
      throw e;
    }
  }

  /** 绑定/更新用户的 Injective 链上地址 */
  bindInjectiveAddress(userId: number, address: string): boolean {
    const r = this.db.prepare("UPDATE users SET injective_address = ? WHERE id = ?").run(address.trim(), userId);
    return r.changes > 0;
  }

  findUserByEmail(email: string): UserRow | null {
    return this.db.prepare("SELECT * FROM users WHERE email = ?").get(normalizeEmail(email)) as UserRow | undefined || null;
  }

  /** 按 id 查用户(链上付费时用:从 API key 的 userId 反查 injective_address) */
  findUserById(userId: number): AuthUser | null {
    const row = this.db.prepare("SELECT id, email, name, injective_address, created_at FROM users WHERE id = ?").get(userId) as AuthUser | undefined;
    return row ? publicUser(row) : null;
  }

  findUserBySession(token: string): AuthUser | null {
    if (!token) return null;
    this.deleteExpiredSessions();
    const row = this.db.prepare(`
      SELECT users.id, users.email, users.name, users.injective_address, users.created_at
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

  // credits 体系已废除,改用链上 INJ 付费(见 src/injective/)。
  // 下列 getCredits/deductCredits/addCredits/listTransactions 已移除。
}

function validateAuthInput(body: unknown, mode: "login" | "register"): { email: string; password: string; name?: string; injective_address?: string } {
  const b = (body || {}) as { email?: unknown; password?: unknown; name?: unknown; injective_address?: unknown };
  const email = typeof b.email === "string" ? normalizeEmail(b.email) : "";
  const password = typeof b.password === "string" ? b.password : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const injective_address = typeof b.injective_address === "string" ? b.injective_address.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("请输入有效的邮箱地址。");
  if (password.length < 6) throw new Error("密码至少 6 位。");
  if (mode === "register" && name.length > 80) throw new Error("称呼不能超过 80 个字符。");
  if (mode === "register" && injective_address && !/^inj1[a-z0-9]+$/i.test(injective_address)) {
    throw new Error("Injective 地址格式不正确,应以 inj1 开头。");
  }
  return { email, password, name, injective_address: injective_address || undefined };
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

  // ── 绑定 Injective 链上地址(链上付费的付款方)──
  router.post("/api/auth/bind-address", (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    const addr = (req.body as { injective_address?: unknown })?.injective_address;
    if (typeof addr !== "string" || !/^inj1[a-z0-9]+$/i.test(addr.trim())) {
      return res.status(400).json({ error: { message: "Injective 地址格式不正确,应以 inj1 开头。" } });
    }
    auth.bindInjectiveAddress(user.id, addr.trim());
    res.json({ ok: true, injective_address: addr.trim() });
  });
}
