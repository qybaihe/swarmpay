// evomap-webhook.ts
// EvoMap Webhook 接收层 —— 订阅平台事件(recipe.created / recipe.published 等)。
//
// 机制(对齐官方 developers/examples/quickstart):
//   - EvoMap 在事件发生时主动 POST 到我们注册的端点
//   - 签名头 X-EvoMap-Webhook-Signature: t=<unix>,v1=<hmac>
//     HMAC-SHA256 对 `${时间戳}.${原始body}` 计算
//   - 必须用原始 raw body 验签(JSON.parse 后再 stringify 字节会变,验签失败)
//   - 校验时间戳防重放(±5 分钟)
//
// 价值:recipe.published 事件让蜂群「即时感知」平台新增的高价值经验,
//      写入本地进化记忆表,下次 HARD 任务继承层会优先复用(越用越聪明)。

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH } from "./auth.js";
import { activeEvolutionMemory } from "./evolution-memory.js";
import { emit } from "./log.js";

/** Webhook 签名重放容忍窗口(秒),与官方 quickstart 一致 */
const REPLAY_TOLERANCE_SEC = 300;

/**
 * 验证 X-EvoMap-Webhook-Signature 签名。
 * 官方约 15 行 node:crypto 实现,无额外依赖。
 *
 * @param rawBody 原始请求体(Buffer/string,绝不能是 JSON.parse 后的对象)
 * @param header  X-EvoMap-Webhook-Signature 头("t=<unix>,v1=<hex>")
 * @param secret  门户注册端点时拿到的 whsec_... 密钥
 * @param toleranceSec 时间戳偏移容忍(秒),过期或未来时间都拒
 */
export function verifyWebhook(
  rawBody: Buffer | string,
  header: string | undefined,
  secret: string,
  toleranceSec = REPLAY_TOLERANCE_SEC,
): boolean {
  if (!secret || !header) return false;
  // 解析 "t=123,v1=abc" 形式
  const parts = Object.fromEntries(
    String(header)
      .split(",")
      .map((p) => {
        const i = p.indexOf("=");
        return i > 0 ? [p.slice(0, i).trim(), p.slice(i + 1).trim()] : [p, ""];
      }),
  );
  if (!parts.t || !parts.v1) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody);
  // HMAC-SHA256 over `${t}.${rawBody}`
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${body}`).digest("hex");
  // 常量时间比较防时序攻击
  const a = Buffer.from(parts.v1, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  // 时间戳校验:绝对值,拒绝过期 AND 未来(防重放)
  const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t));
  return Number.isFinite(skew) && skew <= toleranceSec;
}

// ── 事件类型 ──
export interface WebhookEvent {
  id: string;
  type: string; // recipe.created | recipe.published | ...
  livemode: boolean;
  data: Record<string, unknown>;
}

export interface WebhookDeliveryRow {
  id: number;
  event_id: string;
  event_type: string;
  livemode: number;
  status: string; // verified | processed | ignored | error
  detail?: string;
  received_at: number;
}

/** Webhook 投递日志(便于排查 + 门户对账) */
export class WebhookEventStore {
  private db: DatabaseSync;

  constructor(dbPath = DB_PATH) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS webhook_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        livemode INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        detail TEXT,
        payload_json TEXT,
        received_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_received ON webhook_events(received_at);
    `);
  }

  /** 记录一次投递(幂等:event_id 唯一,重复投递不重复处理) */
  record(input: {
    eventId: string;
    eventType: string;
    livemode: boolean;
    status: string;
    detail?: string;
    payload?: unknown;
  }): { inserted: boolean } {
    const ts = Date.now();
    try {
      this.db.prepare(`
        INSERT INTO webhook_events (event_id, event_type, livemode, status, detail, payload_json, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.eventId,
        input.eventType,
        input.livemode ? 1 : 0,
        input.status,
        input.detail?.slice(0, 500) || null,
        input.payload ? JSON.stringify(input.payload).slice(0, 8000) : null,
        ts,
      );
      return { inserted: true };
    } catch {
      // event_id 重复(平台重试)→ 幂等忽略
      return { inserted: false };
    }
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM webhook_events").get() as { count: number };
    return Number(row.count || 0);
  }

  recent(limit = 10): Array<WebhookDeliveryRow & { payload_json?: string }> {
    return this.db.prepare(`
      SELECT id, event_id, event_type, livemode, status, detail, payload_json, received_at
      FROM webhook_events
      ORDER BY received_at DESC
      LIMIT ?
    `).all(limit) as unknown as Array<WebhookDeliveryRow & { payload_json?: string }>;
  }
}

// 单例(整个进程共享一个投递日志)
let store: WebhookEventStore | null = null;
export function webhookEventStore(): WebhookEventStore {
  if (!store) store = new WebhookEventStore();
  return store;
}

/**
 * 处理已验签的 webhook 事件。
 * recipe.published / recipe.created → 把经验写入本地进化记忆表,
 * 让蜂群继承层(orchestrator 先查本地)下次优先复用。
 */
export function handleWebhookEvent(event: WebhookEvent): { status: string; detail?: string } {
  const data = event.data || {};
  const recipe = (data.recipe || data.asset || data.gene || data) as {
    title?: string;
    name?: string;
    description?: string;
    summary?: string;
    content?: string;
    signals?: string[];
    signals_match?: string[];
    trigger?: string[];
    quality?: number;
    score?: number;
  };

  const title = String(recipe.title || recipe.name || recipe.summary || "").trim() || "(未命名经验)";
  const description = String(recipe.description || recipe.summary || "").trim();
  const content = String(recipe.content || recipe.summary || description || "").trim();
  const signalsRaw = recipe.signals || recipe.signals_match || recipe.trigger || [];
  const signals = Array.isArray(signalsRaw)
    ? signalsRaw.map((s) => String(s)).filter(Boolean)
    : [title, description].join(" ").split(/[\s,，。]+|/).filter(Boolean);
  const quality = Math.max(0.6, Math.min(0.95, Number(recipe.quality || recipe.score) || 0.8));

  if (event.type === "recipe.published" || event.type === "recipe.created") {
    // 写入本地进化记忆:source 走 depositExternal,继承层零改动即可命中
    const record = activeEvolutionMemory().depositExternal({
      title: `[EvoMap webhook] ${title.slice(0, 60)}`,
      description: description.slice(0, 200) || `来自 EvoMap 平台的已发布经验 · ${event.type}`,
      content: content.slice(0, 2400),
      signals,
      quality,
      origin: "evomap-webhook",
    });
    emit("inherit", `🧬 收到 EvoMap webhook ${event.type}:「${title.slice(0, 30)}」已沉淀为本地经验 #${record.id}`);
    return { status: "processed", detail: `deposited as memory #${record.id}` };
  }

  // 其它事件类型(平台持续增加):先记录,不处理
  emit("inherit", `🧬 收到 EvoMap webhook ${event.type}(暂未接入处理逻辑)`);
  return { status: "ignored", detail: `unhandled event type: ${event.type}` };
}
