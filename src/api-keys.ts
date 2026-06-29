import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Request, Router } from "express";
import { DB_PATH, getSessionToken, type AuthStore } from "./auth.js";
import { publicV1BaseUrl } from "./url.js";

export const EVOSHIP_KEY_PREFIX = "sk-evoship-";

export interface UserApiKey {
  id: number;
  user_id: number;
  name: string;
  api_key_preview: string;
  status: "active" | "revoked";
  created_at: number;
  updated_at: number;
  last_used_at?: number;
  success_count: number;
  failure_count: number;
}

export interface ApiKeyRow extends UserApiKey {
  api_key_hash: string;
}

export interface ApiKeyIssueResult extends UserApiKey {
  api_key: string;
}

function now(): number {
  return Date.now();
}

function apiKey(): string {
  return `${EVOSHIP_KEY_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function keyPreview(key: string): string {
  return `${EVOSHIP_KEY_PREFIX}${key.slice(EVOSHIP_KEY_PREFIX.length, EVOSHIP_KEY_PREFIX.length + 8)}...${key.slice(-6)}`;
}

function publicKey(row: ApiKeyRow): UserApiKey {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    api_key_preview: row.api_key_preview,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_used_at: row.last_used_at,
    success_count: row.success_count,
    failure_count: row.failure_count,
  };
}

function normalizeName(input: unknown, fallback = "默认 API Key"): string {
  const name = typeof input === "string" ? input.trim().slice(0, 80) : "";
  return name || fallback;
}

export class ApiKeyStore {
  private db: DatabaseSync;

  constructor(dbPath = DB_PATH) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS user_api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        api_key_hash TEXT NOT NULL UNIQUE,
        api_key_preview TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_used_at INTEGER,
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_api_keys_key_hash ON user_api_keys(api_key_hash);
      CREATE INDEX IF NOT EXISTS idx_user_api_keys_status ON user_api_keys(status);
    `);
  }

  createKey(input: { userId: number; name?: string }): ApiKeyIssueResult {
    const key = apiKey();
    const ts = now();
    const result = this.db.prepare(`
      INSERT INTO user_api_keys (
        user_id, name, api_key_hash, api_key_preview, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).run(input.userId, normalizeName(input.name), tokenHash(key), keyPreview(key), ts, ts);
    const row = this.findById(Number(result.lastInsertRowid));
    if (!row) throw new Error("API Key 写入失败。");
    return { ...publicKey(row), api_key: key };
  }

  rotateKey(input: { id: number; userId: number }): ApiKeyIssueResult {
    const key = apiKey();
    const ts = now();
    this.db.prepare(`
      UPDATE user_api_keys
      SET api_key_hash = ?,
          api_key_preview = ?,
          status = 'active',
          updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(tokenHash(key), keyPreview(key), ts, input.id, input.userId);
    const row = this.findById(input.id);
    if (!row || row.user_id !== input.userId) throw new Error("API Key 不存在。");
    return { ...publicKey(row), api_key: key };
  }

  revokeKey(input: { id: number; userId: number }): UserApiKey {
    this.db.prepare(`
      UPDATE user_api_keys
      SET status = 'revoked',
          updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(now(), input.id, input.userId);
    const row = this.findById(input.id);
    if (!row || row.user_id !== input.userId) throw new Error("API Key 不存在。");
    return publicKey(row);
  }

  findById(id: number): ApiKeyRow | null {
    return this.db.prepare("SELECT * FROM user_api_keys WHERE id = ?").get(id) as ApiKeyRow | undefined || null;
  }

  findByApiKey(key: string): ApiKeyRow | null {
    if (!key.startsWith(EVOSHIP_KEY_PREFIX)) return null;
    return this.db.prepare(`
      SELECT * FROM user_api_keys
      WHERE api_key_hash = ? AND status = 'active'
    `).get(tokenHash(key)) as ApiKeyRow | undefined || null;
  }

  listForUser(userId: number): UserApiKey[] {
    const rows = this.db.prepare(`
      SELECT * FROM user_api_keys
      WHERE user_id = ?
      ORDER BY status = 'active' DESC, created_at DESC
    `).all(userId) as unknown as ApiKeyRow[];
    return rows.map(publicKey);
  }

  markUse(id: number, ok: boolean): void {
    this.db.prepare(`
      UPDATE user_api_keys
      SET last_used_at = ?,
          updated_at = ?,
          success_count = success_count + ?,
          failure_count = failure_count + ?
      WHERE id = ?
    `).run(now(), now(), ok ? 1 : 0, ok ? 0 : 1, id);
  }
}

function modelsForUser(userId: number, fleetStore?: { modelIdsForUser(userId: number): string[] }): string[] {
  const builtinModels = ["swarm-baseline", "swarm-lite", "swarm-heavy", "swarm-evo"];
  const customModels = fleetStore ? fleetStore.modelIdsForUser(userId) : [];
  return [...builtinModels, ...customModels];
}

function issuePayload(req: Request, userId: number, key: ApiKeyIssueResult, fleetStore?: { modelIdsForUser(userId: number): string[] }) {
  return {
    base_url: publicV1BaseUrl(req),
    api_key: key.api_key,
    model: "swarm-evo",
    models: modelsForUser(userId, fleetStore),
    key,
    created_at: key.created_at,
  };
}

export function registerApiKeyRoutes(
  router: Router,
  auth: AuthStore,
  apiKeys = new ApiKeyStore(),
  fleetStore?: { modelIdsForUser(userId: number): string[] },
): ApiKeyStore {
  router.get("/api/api-keys", (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    res.json({
      keys: apiKeys.listForUser(user.id),
      base_url: publicV1BaseUrl(req),
      model: "swarm-evo",
      models: modelsForUser(user.id, fleetStore),
    });
  });

  router.post("/api/api-keys", (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "请先登录后再创建 API Key。" } });
    try {
      const key = apiKeys.createKey({ userId: user.id, name: normalizeName((req.body || {}).name) });
      res.status(201).json(issuePayload(req, user.id, key, fleetStore));
    } catch (e) {
      res.status(400).json({ error: { message: e instanceof Error ? e.message : "API Key 创建失败。" } });
    }
  });

  router.post("/api/api-keys/:id/rotate", (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    try {
      const key = apiKeys.rotateKey({ id: Number(req.params.id), userId: user.id });
      res.json(issuePayload(req, user.id, key, fleetStore));
    } catch (e) {
      res.status(404).json({ error: { message: e instanceof Error ? e.message : "API Key 不存在。" } });
    }
  });

  router.delete("/api/api-keys/:id", (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    try {
      const key = apiKeys.revokeKey({ id: Number(req.params.id), userId: user.id });
      res.json({ key });
    } catch (e) {
      res.status(404).json({ error: { message: e instanceof Error ? e.message : "API Key 不存在。" } });
    }
  });

  return apiKeys;
}
