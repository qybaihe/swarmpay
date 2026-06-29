// orchestration/handoff.ts
// Agent 间 handoff(委托/移交)。每条 handoff 带上下文,下游 agent 据此继续。
// reviewer→coder 返工回路也在这里。

import { AgentRegistry } from "../agents/registry.js";
import { buildMessage } from "../protocol/envelope.js";
import { sendMessage } from "../protocol/adapter.js";
import { emit } from "../log.js";
import type { Archetype, HandoffContext, TaskRef } from "../agents/types.js";

/** 执行一次 handoff:从 from 角色 handoff 到 to 角色,携带上下文 */
export async function handoff(params: {
  fromInstanceId: string;
  fromArch: Archetype;
  toArch: Archetype;
  toInstanceId: string;
  task: TaskRef;
  blob: string;            // 上游产出
  feedback?: string;       // reviewer 返工意见
  revisionRound?: number;  // 第几轮返工
  platformSideEffects?: boolean;
}): Promise<HandoffContext> {
  const { fromInstanceId, fromArch, toArch, toInstanceId, task, blob, feedback, revisionRound, platformSideEffects } = params;

  // 校验 handoff 合法性(AGENTS.md 的 handoff_targets 约束)
  if (!AgentRegistry.canHandoff(fromArch, toArch)) {
    emit("broadcast", `⚠️ 非法 handoff:${fromArch}→${toArch}(不在 handoff_targets),放行但警告`);
  }

  // 构造 GEP-A2A handoff 消息
  const msg = buildMessage({
    senderId: fromInstanceId,
    intent: "handoff",
    to: toInstanceId,
    task,
    contextBlob: blob,
    feedback,
  });

  // 发送(平台模式走 route-to-member,本地模式记 inbox)
  await sendMessage(msg, { platform: platformSideEffects });

  const ctx: HandoffContext = {
    from: fromArch,
    to: toArch,
    fromInstanceId,
    toInstanceId,
    task,
    blob,
    feedback,
    revisionRound,
  };

  const roundTag = revisionRound ? ` (返工第${revisionRound}轮)` : "";
  const fbTag = feedback ? ` +反馈` : "";
  emit("broadcast", `🤝 handoff ${fromArch}→${toArch}${roundTag}${fbTag} | ctx ${blob.length}字`);
  return ctx;
}

/** 把 handoff context 渲染成下游 agent system prompt 里可读的文本 */
export function renderHandoffContext(ctx: HandoffContext): string {
  const lines = [
    `来自 ${ctx.from} 蜂的交接(任务:${ctx.task.goal})`,
    `【${ctx.from} 的产出】`,
    ctx.blob,
  ];
  if (ctx.feedback) {
    lines.push("", `【返工反馈】`, ctx.feedback);
  }
  return lines.join("\n");
}
