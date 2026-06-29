import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import OpenAI from "openai";
import type { Request, Router } from "express";
import { DB_PATH, getSessionToken, type AuthStore } from "./auth.js";
import type { ModelProvider } from "./model.js";
import { publicV1BaseUrl } from "./url.js";

const KEY_PREFIX = "sk-swarmpay-";

export interface RegisteredEndpoint {
  id: number;
  user_id: number;
  label: string;
  upstream_base_url: string;
  upstream_model: string;
  status: "active" | "error";
  last_error?: string;
  created_at: number;
  updated_at: number;
  last_checked_at?: number;
  last_used_at?: number;
  success_count: number;
  failure_count: number;
}

export interface EndpointRow extends RegisteredEndpoint {
  upstream_api_key: string;
  api_key_hash: string;
  api_key_preview: string;
}

export interface EndpointRegistrationResult extends RegisteredEndpoint {
  api_key: string;
}

function now(): number {
  return Date.now();
}

function endpointKey(): string {
  return `${KEY_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function keyPreview(key: string): string {
  return `${KEY_PREFIX}${key.slice(KEY_PREFIX.length, KEY_PREFIX.length + 8)}...${key.slice(-6)}`;
}

function publicEndpoint(row: EndpointRow): RegisteredEndpoint {
  return {
    id: row.id,
    user_id: row.user_id,
    label: row.label,
    upstream_base_url: row.upstream_base_url,
    upstream_model: row.upstream_model,
    status: row.status,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_checked_at: row.last_checked_at,
    last_used_at: row.last_used_at,
    success_count: row.success_count,
    failure_count: row.failure_count,
  };
}

function normalizeBaseUrl(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error("Base URL 不能为空。");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Base URL 不是有效 URL。");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Base URL 只支持 http/https。");
  // SSRF 防护:阻断指向内网/本机/云元数据的上游
  assertPublicHost(url.hostname);
  return url.toString().replace(/\/+$/, "");
}

/** 校验主机名不是 loopback / 私网 / link-local / 云元数据地址(防 SSRF) */
function assertPublicHost(hostname: string): void {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  // 元数据 / 内部保留域名
  const blockedHosts = [
    "metadata.google.internal",
    "metadata",
    "169.254.169.254", // 云 metadata 经典地址(AWS/Azure/DO 等)
    "metadata.azure.com",
  ];
  if (blockedHosts.includes(host)) {
    throw new Error("不允许的上游地址(内网/元数据地址被拦截)。");
  }
  // IPv4 字面量解析
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const oct = m.slice(1, 5).map(Number);
    if (oct.some((n) => n > 255)) {
      /* 非法,后续按普通域名处理 */
    } else {
      const [a, b] = oct;
      const isLoopback = a === 127;
      const isPrivate = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
      const isLinkLocal = a === 169 && b === 254;
      const isCurrent = a === 0 || (a === 100 && b >= 64 && b <= 127); // 0.0.0.0 / CGNAT
      if (isLoopback || isPrivate || isLinkLocal || isCurrent) {
        throw new Error("不允许的上游地址(内网地址被拦截)。");
      }
      return;
    }
  }
  // IPv6 loopback / link-local / ULA
  if (host === "::1" || host === "0:0:0:0:0:0:0:1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    throw new Error("不允许的上游地址(内网地址被拦截)。");
  }
  // localhost 系
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("不允许的上游地址(localhost 被拦截)。");
  }
}

function validateRegistrationInput(body: unknown): {
  userBaseUrl: string;
  userApiKey: string;
  userModel: string;
  label: string;
} {
  const b = (body || {}) as {
    user_base_url?: unknown;
    user_api_key?: unknown;
    user_model?: unknown;
    label?: unknown;
  };
  const userBaseUrl = normalizeBaseUrl(typeof b.user_base_url === "string" ? b.user_base_url : "");
  const userApiKey = typeof b.user_api_key === "string" ? b.user_api_key.trim() : "";
  const userModel = typeof b.user_model === "string" ? b.user_model.trim() : "";
  const label = typeof b.label === "string" ? b.label.trim().slice(0, 80) : "";
  if (userApiKey.length < 3) throw new Error("API 密钥不能为空。");
  if (!userModel) throw new Error("模型名不能为空。");
  return { userBaseUrl, userApiKey, userModel, label };
}

export async function checkOpenAICompatibleEndpoint(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}): Promise<{ ok: true; sample: string; latencyMs: number } | { ok: false; error: string; latencyMs: number }> {
  const t0 = now();
  try {
    const client = new OpenAI({ baseURL: input.baseUrl, apiKey: input.apiKey });
    const res = await client.chat.completions.create(
      {
        model: input.model,
        messages: [
          { role: "system", content: "Reply with exactly: ok" },
          { role: "user", content: "healthcheck" },
        ],
        temperature: 0,
        max_tokens: 8,
      },
      { signal: AbortSignal.timeout(input.timeoutMs ?? 15000) },
    );
    const sample = res.choices[0]?.message?.content?.trim() || "";
    return { ok: true, sample, latencyMs: now() - t0 };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
      latencyMs: now() - t0,
    };
  }
}

export class EndpointStore {
  private db: DatabaseSync;

  constructor(dbPath = DB_PATH) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS model_endpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        upstream_base_url TEXT NOT NULL,
        upstream_api_key TEXT NOT NULL,
        upstream_model TEXT NOT NULL,
        api_key_hash TEXT NOT NULL UNIQUE,
        api_key_preview TEXT NOT NULL,
        status TEXT NOT NULL,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_checked_at INTEGER,
        last_used_at INTEGER,
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_model_endpoints_user_id ON model_endpoints(user_id);
      CREATE INDEX IF NOT EXISTS idx_model_endpoints_key_hash ON model_endpoints(api_key_hash);
      CREATE INDEX IF NOT EXISTS idx_model_endpoints_status ON model_endpoints(status);
    `);
  }

  async register(input: {
    userId: number;
    baseUrl: string;
    apiKey: string;
    model: string;
    label?: string;
    skipHealthCheck?: boolean;
  }): Promise<EndpointRegistrationResult> {
    if (!input.skipHealthCheck) {
      const checked = await checkOpenAICompatibleEndpoint({
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
        model: input.model,
      });
      if (!checked.ok) {
        throw new Error(`端点健康检查失败:${checked.error}`);
      }
    }

    const key = endpointKey();
    const ts = now();
    const label = input.label?.trim() || input.model;
    const result = this.db.prepare(`
      INSERT INTO model_endpoints (
        user_id, label, upstream_base_url, upstream_api_key, upstream_model,
        api_key_hash, api_key_preview, status, last_error, created_at, updated_at, last_checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?)
    `).run(
      input.userId,
      label,
      input.baseUrl,
      input.apiKey,
      input.model,
      tokenHash(key),
      keyPreview(key),
      ts,
      ts,
      ts,
    );
    const row = this.findById(Number(result.lastInsertRowid));
    if (!row) throw new Error("端点写入失败。");
    return { ...publicEndpoint(row), api_key: key };
  }

  rotateKey(id: number): EndpointRegistrationResult {
    const key = endpointKey();
    const ts = now();
    this.db.prepare(`
      UPDATE model_endpoints
      SET api_key_hash = ?,
          api_key_preview = ?,
          updated_at = ?
      WHERE id = ?
    `).run(tokenHash(key), keyPreview(key), ts, id);
    const row = this.findById(id);
    if (!row) throw new Error("端点不存在。");
    return { ...publicEndpoint(row), api_key: key };
  }

  findById(id: number): EndpointRow | null {
    return this.db.prepare("SELECT * FROM model_endpoints WHERE id = ?").get(id) as EndpointRow | undefined || null;
  }

  findByApiKey(apiKey: string): EndpointRow | null {
    if (!apiKey.startsWith(KEY_PREFIX)) return null;
    return this.db.prepare("SELECT * FROM model_endpoints WHERE api_key_hash = ?").get(tokenHash(apiKey)) as EndpointRow | undefined || null;
  }

  listForUser(userId: number): RegisteredEndpoint[] {
    const rows = this.db.prepare(`
      SELECT * FROM model_endpoints
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId) as unknown as EndpointRow[];
    return rows.map(publicEndpoint);
  }

  findConfiguredProviderForUser(userId: number): { row: EndpointRow; provider: ModelProvider } | null {
    const row = this.db.prepare(`
      SELECT * FROM model_endpoints
      WHERE user_id = ?
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `).get(userId) as EndpointRow | undefined;
    return row ? { row, provider: this.toProvider(row) } : null;
  }

  countActive(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM model_endpoints WHERE status = 'active'").get() as { count: number };
    return Number(row.count || 0);
  }

  markUse(id: number, ok: boolean, error?: string): void {
    this.db.prepare(`
      UPDATE model_endpoints
      SET last_used_at = ?,
          updated_at = ?,
          status = ?,
          last_error = ?,
          success_count = success_count + ?,
          failure_count = failure_count + ?
      WHERE id = ?
    `).run(now(), now(), ok ? "active" : "error", ok ? null : (error || "request failed").slice(0, 300), ok ? 1 : 0, ok ? 0 : 1, id);
  }

  markCheck(id: number, ok: boolean, error?: string): void {
    this.db.prepare(`
      UPDATE model_endpoints
      SET last_checked_at = ?,
          updated_at = ?,
          status = ?,
          last_error = ?,
          success_count = success_count + ?,
          failure_count = failure_count + ?
      WHERE id = ?
    `).run(now(), now(), ok ? "active" : "error", ok ? null : (error || "healthcheck failed").slice(0, 300), ok ? 1 : 0, ok ? 0 : 1, id);
  }

  toProvider(row: EndpointRow): ModelProvider {
    return {
      baseUrl: row.upstream_base_url,
      apiKey: row.upstream_api_key,
      model: row.upstream_model,
      label: row.label,
    };
  }
}

export function bearerToken(req: Request): string {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export function resolveEndpointProvider(req: Request, endpoints: EndpointStore): {
  row: EndpointRow;
  provider: ModelProvider;
} | null {
  const token = bearerToken(req);
  const row = token ? endpoints.findByApiKey(token) : null;
  return row ? { row, provider: endpoints.toProvider(row) } : null;
}

export function isEvoShipApiKey(token: string): boolean {
  return token.startsWith(KEY_PREFIX);
}

export function registerEndpointRoutes(router: Router, auth: AuthStore, endpoints = new EndpointStore(), fleetStore?: { modelIdsForUser(userId: number): string[] }): EndpointStore {
  router.get("/api/endpoints", (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    res.json({ endpoints: endpoints.listForUser(user.id) });
  });

  router.post("/api/endpoints/register", async (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "请先登录后再注册模型端点。" } });
    try {
      const input = validateRegistrationInput(req.body);
      const endpoint = await endpoints.register({
        userId: user.id,
        baseUrl: input.userBaseUrl,
        apiKey: input.userApiKey,
        model: input.userModel,
        label: input.label,
      });
      const { api_key: _legacyEndpointKey, ...publicRegisteredEndpoint } = endpoint;
      const builtinModels = ["swarm-baseline", "swarm-lite", "swarm-heavy", "swarm-evo"];
      const customModels = fleetStore ? fleetStore.modelIdsForUser(user.id) : [];
      res.status(201).json({
        id: endpoint.id,
        base_url: publicV1BaseUrl(req),
        model: "swarm-evo",
        models: [...builtinModels, ...customModels],
        endpoint: publicRegisteredEndpoint,
        created_at: endpoint.created_at,
      });
    } catch (e) {
      res.status(400).json({ error: { message: e instanceof Error ? e.message : "端点注册失败。" } });
    }
  });

  router.post("/api/endpoints/:id/check", async (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    const row = endpoints.findById(Number(req.params.id));
    if (!row || row.user_id !== user.id) return res.status(404).json({ error: { message: "endpoint not found" } });
    const checked = await checkOpenAICompatibleEndpoint({
      baseUrl: row.upstream_base_url,
      apiKey: row.upstream_api_key,
      model: row.upstream_model,
    });
    endpoints.markCheck(row.id, checked.ok, checked.ok ? undefined : checked.error);
    const updated = endpoints.findById(row.id);
    res.json({ ok: checked.ok, result: checked, endpoint: updated ? publicEndpoint(updated) : null });
  });

  router.post("/api/endpoints/:id/key", async (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    res.status(410).json({
      error: {
        message: "端点转换不再生成或轮换 API Key。请在「我的 API Key」页面创建或重新生成用户 API Key。",
        type: "endpoint_key_retired",
      },
    });
  });

  return endpoints;
}
