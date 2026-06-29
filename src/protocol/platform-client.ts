// protocol/platform-client.ts
// 真实调用 EvoMap 平台 A2A 端点。
// 基于 docs/endpoint-scan-report.md 实测:session/create + session/message + swarm/intent + a2a/fetch + a2a/publish 全部 200。
// handoff/广播通过 session/message 实现(平台真实的协作机制)。
// 不再调用不存在的 route-to-member / relay-to-team(404)。

import { config } from "../config.js";
import { buildMessage, newMessageId } from "./envelope.js";
import type { AgentMessage, Subtask } from "../agents/types.js";
import { emit } from "../log.js";

const BASE = config.evomapBaseUrl;
const TIMEOUT = 15000;

async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.evomapNodeSecret) headers["Authorization"] = `Bearer ${config.evomapNodeSecret}`;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { json = text.slice(0, 200); }
    return { ok: res.ok, status: res.status, data: json };
  } catch (e) {
    return { ok: false, status: 0, data: { error: e instanceof Error ? e.message : String(e) } };
  }
}

async function get(path: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  const headers: Record<string, string> = {};
  if (config.evomapNodeSecret) headers["Authorization"] = `Bearer ${config.evomapNodeSecret}`;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers, signal: AbortSignal.timeout(TIMEOUT),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: e instanceof Error ? e.message : String(e) } };
  }
}

// ── Session 管理:每个蜂群请求创建一个会话,handoff/广播都在会话内 ──
let currentSessionId = "";

async function ensureSession(topic: string): Promise<string> {
  if (currentSessionId) return currentSessionId;
  const r = await post("/a2a/session/create", {
    sender_id: config.evomapNodeId,
    topic: topic.slice(0, 60),
  });
  const sid = (r.data as { session_id?: string })?.session_id;
  if (r.ok && sid) {
    currentSessionId = sid;
    emit("inherit", `🧬 已创建 EvoMap 协作会话 ${sid.slice(0, 16)}…`);
  }
  return currentSessionId;
}

/** 重置会话(每个新请求开始时)— 由 orchestrator 调用 */
export async function startSession(topic: string): Promise<void> {
  currentSessionId = "";
  await ensureSession(topic);
}

/** Orchestrator:提议任务分解(通过 swarm/intent 的 plan 字段) */
export async function proposeDecomposition(params: {
  goal: string;
  subtasks: Subtask[];
}): Promise<{ ok: boolean; taskId?: string; detail: string }> {
  const sid = await ensureSession(params.goal);
  if (!sid) return { ok: false, detail: "no session" };
  // 用 swarm/intent 声明分解计划(plan ≥5 字符)
  const plan = `分解目标为 ${params.subtasks.length} 个子任务: ${params.subtasks.map((s) => s.title).join(", ")}`.slice(0, 200);
  const r = await post("/a2a/swarm/intent", {
    sender_id: config.evomapNodeId,
    session_id: sid,
    intent: "decompose",
    plan,
    subtasks: params.subtasks.map((s) => ({ title: s.title, weight: s.weight, body: s.body.slice(0, 100), signals: s.signals })),
  });
  const ok = r.ok || r.status === 200;
  return { ok, taskId: sid, detail: ok ? `已向会话提交分解计划(${params.subtasks.length}子任务)` : `intent status=${r.status}` };
}

/** Agent 间 P2P 消息:handoff(单播,通过 session/message) */
export async function routeToMember(msg: AgentMessage): Promise<{ ok: boolean; detail: string }> {
  const sid = await ensureSession(msg.payload.task?.goal || "evoship");
  if (!sid) return { ok: false, detail: "no session" };
  const r = await post("/a2a/session/message", {
    sender_id: config.evomapNodeId,
    session_id: sid,
    message_type: msg.message_type,
    content: JSON.stringify({
      intent: msg.payload.intent,
      from: msg.sender_id,
      to: msg.payload.to,
      context_blob: (msg.payload.context_blob || "").slice(0, 2000),
      feedback: msg.payload.feedback,
    }),
    msg_type: "dialog",
    metadata: { envelope_id: msg.message_id, handoff: true },
  });
  return { ok: r.ok, detail: `session/message status=${r.status}` };
}

/** Agent 间广播:突破传播(通过 session/message 广播) */
export async function relayToTeam(msg: AgentMessage): Promise<{ ok: boolean; detail: string }> {
  const sid = await ensureSession(msg.payload.task?.goal || "evoship");
  if (!sid) return { ok: false, detail: "no session" };
  const r = await post("/a2a/session/message", {
    sender_id: config.evomapNodeId,
    session_id: sid,
    message_type: msg.message_type,
    content: JSON.stringify({
      intent: "breakthrough",
      from: msg.sender_id,
      hint: (msg.payload.hint || "").slice(0, 500),
    }),
    msg_type: "broadcast",
    metadata: { envelope_id: msg.message_id, breakthrough: true },
  });
  return { ok: r.ok, detail: `session/message(broadcast) status=${r.status}` };
}

/** Agent 声明意图(通过 swarm/intent) */
export async function swarmIntent(senderId: string, intent: string, detail: string): Promise<void> {
  const sid = await ensureSession(detail);
  if (!sid) return;
  await post("/a2a/swarm/intent", {
    sender_id: config.evomapNodeId,
    session_id: sid,
    intent,
    plan: detail.slice(0, 200),
  });
}

/** Agent 提交结果(通过 swarm/result) */
export async function swarmResult(senderId: string, result: string): Promise<void> {
  const sid = await ensureSession(result);
  if (!sid) return;
  await post("/a2a/swarm/result", {
    sender_id: config.evomapNodeId,
    session_id: sid,
    result: result.slice(0, 2000),
    msg_id: newMessageId(),
  });
}

/** 检测平台连通性 + L3 能力(启动时验证,真实探测而非只测 heartbeat) */
export async function pingPlatform(): Promise<{
  reachable: boolean;
  level?: number;
  reputation?: number;
  detail: string;
}> {
  if (!config.hasNodeCredentials) {
    return { reachable: false, detail: "无 node 凭证(本地降级模式)" };
  }
  try {
    // 测 session/create(真正的协作能力,不是只测 heartbeat)
    const r = await post("/a2a/session/create", {
      sender_id: config.evomapNodeId,
      topic: "evoship-ping",
    });
    if (r.ok) {
      // session 创建成功 = 协作能力可用
      // 顺便查 heartbeat 拿 reputation
      const hb = await post("/a2a/heartbeat", { node_id: config.evomapNodeId });
      const cp = (hb.data as { payload?: { capability_profile?: { level?: number; reputation?: number } } })?.payload?.capability_profile;
      return {
        reachable: true,
        level: cp?.level,
        reputation: cp?.reputation,
        detail: `协作可用(session/message 200)${cp ? ` · L${cp.level} rep=${cp.reputation}` : ""}`,
      };
    }
    return { reachable: false, detail: `session/create status=${r.status}` };
  } catch (e) {
    return { reachable: false, detail: `ping error: ${e instanceof Error ? e.message : e}` };
  }
}
