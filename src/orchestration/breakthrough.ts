// orchestration/breakthrough.ts
// 突破检测 + 广播。从原 swarm.ts 升级:除长度外,加验证通过/新颖性判定。

import { buildMessage } from "../protocol/envelope.js";
import { declareIntent, sendMessage } from "../protocol/adapter.js";
import { emit } from "../log.js";

/** 判断某 agent 产出是否构成"突破" */
export function isBreakthrough(content: string, context?: { verified?: boolean }): boolean {
  const text = content.trim();
  if (text.length < 80) return false;
  // 已验证的产出(如 reviewer APPROVE 的)直接算突破
  if (context?.verified) return true;
  // 启发式:含结构化/实质性内容
  const signals = [
    /```/,                    // 代码块
    /^\s*[-*\d]/m,           // 列表
    /^#{1,3}\s/m,            // 标题
    /(方案|实现|步骤|function|const|class|答案|answer)/i,
    /\\boxed\{/,             // 数学答案
  ];
  return signals.some((re) => re.test(text));
}

/** 从突破产出里抽 hint,供广播 */
export function extractHint(content: string): string {
  const text = content.trim();
  const firstChunk = text.split(/\n\n/)[0] ?? text;
  return firstChunk.length > 300 ? firstChunk.slice(0, 300) + "…" : firstChunk;
}

/** 触发突破广播:通过 relay-to-team 发给全队 */
export async function broadcastBreakthrough(params: {
  senderId: string;
  hint: string;
  taskRef?: { id: string; goal: string; weight: number };
  platformSideEffects?: boolean;
}): Promise<void> {
  emit("breakthrough", `✨ ${params.senderId} 突破 → 抽取 hint 广播全队`);
  const msg = buildMessage({
    senderId: params.senderId,
    messageType: "dialog",
    intent: "breakthrough",
    task: params.taskRef,
    hint: params.hint,
  });
  await sendMessage(msg, { platform: params.platformSideEffects });  // 平台模式走 relay-to-team,本地模式记 inbox
  emit("broadcast", `📡 突破 hint 已发送/记录`);
}

/** 声明某 agent 将要做的事(intent) */
export async function declareWill(senderId: string, intent: string, detail: string): Promise<void> {
  await declareIntent(senderId, intent, detail);
}
