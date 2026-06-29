// protocol/adapter.ts
// 通信适配层:有 node 凭证 + 平台可达 → 真实平台调用;否则 → 本地 MessageBus(协议格式一致)
// 这保证无论平台状态如何,demo 都能跑,且 agent 间消息格式始终对齐 GEP-A2A。

import { config } from "../config.js";
import { pingPlatform, proposeDecomposition as platformDecomp, relayToTeam, routeToMember, swarmIntent, swarmResult, startSession } from "./platform-client.js";
import type { AgentMessage, Subtask } from "../agents/types.js";
import { emit } from "../log.js";

let platformStatus: { reachable: boolean; level?: number; detail: string } | null = null;

export interface SideEffectOptions {
  /** false 时即使平台可用也只走本地 MessageBus/无操作,用于 swarm-lite 等轻量档。 */
  platform?: boolean;
  /** true 时平台请求后台发送,不阻塞蜂群主响应。默认 true。 */
  background?: boolean;
}

function shouldUsePlatform(options?: SideEffectOptions): boolean {
  return options?.platform !== false && isPlatformMode();
}

async function runPlatformEffect(label: string, work: () => Promise<void>, background = true): Promise<void> {
  const guarded = async () => {
    try {
      await work();
    } catch (e) {
      emit("broadcast", `⚠️ 平台副作用失败:${label} ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`);
    }
  };

  if (background) {
    void guarded();
    return;
  }
  await guarded();
}

/** 启动时探测平台,缓存结果 */
export async function initAdapter(): Promise<void> {
  platformStatus = await pingPlatform();
  if (platformStatus.reachable) {
    emit("inherit", `🧬 EvoMap 平台连通:${platformStatus.detail}`);
  } else {
    emit("inherit", `🧬 EvoMap 平台不可达,降级本地 MessageBus:${platformStatus.detail}`);
  }
}

/** 当前是否走真实平台 */
export function isPlatformMode(): boolean {
  if (config.adapterMode === "local") return false;
  if (config.adapterMode === "platform") return true;
  return !!platformStatus?.reachable && (platformStatus?.level ?? 0) >= 2;
}

// ── 本地 MessageBus(降级用)──
const localInbox: AgentMessage[] = [];
function localDeliver(msg: AgentMessage): void {
  localInbox.push(msg);
  emit("broadcast", `(local) ${msg.payload.intent} ${msg.sender_id}→${msg.payload.to || "team"}`);
}

/** 开始新的协作会话(每个请求开始时调,平台模式创建真实 session) */
export async function beginSession(topic: string): Promise<void> {
  if (isPlatformMode()) {
    await startSession(topic);
  }
}

/** 统一接口:提议分解 */
export async function proposeDecomposition(goal: string, subtasks: Subtask[], options?: SideEffectOptions): Promise<{ ok: boolean; detail: string }> {
  if (shouldUsePlatform(options)) {
    const r = await platformDecomp({ goal, subtasks });
    return { ok: r.ok, detail: r.detail };
  }
  // 本地:直接记录
  emit("diverge", `(local) 分解为 ${subtasks.length} 个子任务`);
  return { ok: true, detail: "local decomposition" };
}

/** 统一接口:发送 P2P handoff 消息 */
export async function sendMessage(msg: AgentMessage, options?: SideEffectOptions): Promise<void> {
  if (shouldUsePlatform(options)) {
    await runPlatformEffect("message", async () => {
      let ok = true;
      let detail = "";
      if (msg.payload.to) {
        const r = await routeToMember(msg);
        ok = r.ok;
        detail = r.detail;
      } else {
        const r = await relayToTeam(msg);
        ok = r.ok;
        detail = r.detail;
      }
      emit(
        "broadcast",
        ok
          ? `📡 平台 ${msg.payload.intent} ${msg.sender_id}→${msg.payload.to || "team"}`
          : `⚠️ 平台 ${msg.payload.intent} 未确认:${detail}`,
      );
    }, options?.background ?? true);
    return;
  }

  localDeliver(msg);
}

/** 统一接口:声明意图 */
export async function declareIntent(senderId: string, intent: string, detail: string, options?: SideEffectOptions): Promise<void> {
  if (!shouldUsePlatform(options)) return;
  await runPlatformEffect("intent", () => swarmIntent(senderId, intent, detail), options?.background ?? true);
}

/** 统一接口:提交结果 */
export async function submitResult(senderId: string, result: string, options?: SideEffectOptions): Promise<void> {
  if (!shouldUsePlatform(options)) return;
  await runPlatformEffect("result", () => swarmResult(senderId, result), options?.background ?? true);
}
