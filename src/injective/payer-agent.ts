// src/injective/payer-agent.ts
// Payer Agent:可选地根据协作 trace 动态调整分润权重(体现 AI agent 自主资金决策)。
// MVP 默认走确定性权重;开启调权时,对触发突破的 agent 上浮权重后重新归一化。
// 对齐真实 SwarmTrace(openai-types.ts)结构:reward_split / breakthroughs_broadcast / bees[].status。

import type { RewardSplitEntry, TraceSplitView } from "./types.js";

/** 判断某 archetype 在本次 trace 中是否触发了突破。
 *  真实 SwarmTrace 里:trace.bees[].status === "breakthrough",或 events[].status 等价标识。
 *  bees 的 agent/archetype 字段对应角色。 */
function breakthroughArchetypes(trace: TraceSplitView & { bees?: { agent?: string; status?: string }[] }): Set<string> {
  const set = new Set<string>();
  for (const b of trace.bees || []) {
    if (b.status === "breakthrough" && b.agent) set.add(b.agent);
  }
  return set;
}

/** 确定性调权:breakthrough agent 权重 ×1.2,然后归一化使和=1。 */
export function adjustWeightsDeterministic(
  splits: RewardSplitEntry[],
  breakthroughs: Set<string>,
): RewardSplitEntry[] {
  const adjusted = splits.map((r) => ({
    ...r,
    weight: r.weight * (breakthroughs.has(r.archetype) ? 1.2 : 1.0),
  }));
  const sum = adjusted.reduce((a, r) => a + r.weight, 0) || 1;
  return adjusted.map((r) => ({ ...r, weight: r.weight / sum }));
}

/**
 * Payer Agent 决策入口(确定性版,无 LLM 依赖,保证 demo 稳定)。
 * 返回调整后的 reward_split,供 SplitExecutor.distribute 消费。
 *
 * 进阶:可在此接入 LLM,让 payer 阅读 trace 后输出更细粒度的权重调整。
 * Pitch Deck 把"payer agent 可按贡献动态调权"作为进阶能力讲。
 */
export function payerDecide(
  trace: TraceSplitView & { bees?: { agent?: string; status?: string }[] },
): RewardSplitEntry[] {
  const base = trace.reward_split || [];
  if (!base.length) return base;
  // 只有存在突破时才调权,否则原样返回
  const breakthroughs = breakthroughArchetypes(trace);
  if (breakthroughs.size === 0) return base;
  return adjustWeightsDeterministic(base, breakthroughs);
}