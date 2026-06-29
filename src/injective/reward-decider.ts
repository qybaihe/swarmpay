// src/injective/reward-decider.ts
// LLM 动态 reward_split 决策器:像评审委员会一样,根据各 agent 的贡献 + 链上余额 +
// 历史绩效(成功率/突破率)动态评定权重,替代静态的 registry.rewardWeight。
// 失败兜底:LLM 不可用/超时/解析失败 → 回落 registry 静态权重。

import { config } from "../config.js";
import { callAgent, isMock } from "../model.js";
import { AgentRegistry } from "../agents/registry.js";
import { successRate, breakthroughRate } from "../agents/identity.js";
import type { Archetype } from "../agents/types.js";

/** LLM 决策的输入:单个 agent 的画像 */
export interface DeciderInput {
  archetype: Archetype;
  /** 本次运行中该 agent 的产出条数(用于描述贡献量级) */
  contribution: string;
  /** 链上 INJ 余额(最小单位字符串,展示时转 INJ 浮点;空表示未配置地址) */
  balance: string;
}

/** LLM 决策的输出:归一化到总和 1 的权重 */
export interface DeciderOutput {
  archetype: Archetype;
  weight: number;
  contribution: string;
}

/** 把最小单位字符串转成 INJ 浮点字符串(展示给 LLM 用,避免大数扰动) */
function smallestToInj(smallest: string): string {
  if (!smallest) return "0";
  const ONE_INJ = 10n ** 18n;
  let n: bigint;
  try {
    n = BigInt(smallest);
  } catch {
    return "0";
  }
  const intPart = n / ONE_INJ;
  const fracPart = n % ONE_INJ;
  const fracStr = fracPart.toString().padStart(18, "0").replace(/0+$/, "");
  return fracStr ? `${intPart}.${fracStr}` : intPart.toString();
}

/** 静态兜底:用 registry.rewardWeight 归一化(总和可能 < 1,这里强制归一到 1) */
function staticFallback(inputs: DeciderInput[]): DeciderOutput[] {
  const raw = inputs.map((i) => ({
    archetype: i.archetype,
    weight: AgentRegistry.getDef(i.archetype).rewardWeight,
    contribution: i.contribution,
  }));
  const total = raw.reduce((s, r) => s + r.weight, 0);
  if (total <= 0) {
    // 全 0 时均分
    const even = 1 / raw.length;
    return raw.map((r) => ({ ...r, weight: even }));
  }
  return raw.map((r) => ({ ...r, weight: r.weight / total }));
}

/**
 * 让 LLM 像评审委员会一样评定各 agent 的 reward 权重。
 * 输出权重归一化到总和 1;任何环节失败都回落静态权重。
 */
export async function decideRewardSplit(inputs: DeciderInput[]): Promise<DeciderOutput[]> {
  if (inputs.length === 0) return [];
  // 兜底入口:mock 模式下没有真实 LLM,直接静态
  if (isMock()) {
    return staticFallback(inputs);
  }

  // 构造每个 agent 的评审画像
  const profiles = inputs.map((i) => {
    const sr = successRate(i.archetype);
    const br = breakthroughRate(i.archetype);
    return {
      archetype: i.archetype,
      contribution: i.contribution,
      balance_inj: smallestToInj(i.balance),
      success_rate: Number(sr.toFixed(3)),
      breakthrough_rate: Number(br.toFixed(3)),
    };
  });

  const system =
    "你是 SwarmPay 的 reward 评审委员会。根据每个 agent 本轮的贡献、链上 INJ 余额、" +
    "历史成功率与突破率,公平地评定各 agent 在本次 reward 分配中的权重。\n" +
    "规则:\n" +
    "1. 贡献大、绩效好、余额低(更需要激励)的 agent 应得更高权重。\n" +
    "2. 余额极高者可适当降低权重,避免资金过度集中。\n" +
    "3. 输出必须是合法 JSON,不要带 markdown 代码块,不要解释。\n" +
    "4. 输出格式:{\"weights\":[{\"archetype\":\"planner\",\"weight\":0.2},...]}," +
    "weights 数量与输入 agents 完全一致,所有 weight 为非负数且总和归一化到 1。";

  const user =
    "待评审的 agents 画像(JSON):\n" +
    JSON.stringify(profiles, null, 2) +
    "\n\n请输出权重 JSON。";

  try {
    const res = await callAgent(
      config.aggregatorModel,
      system,
      user,
      0.2,
      "orchestrator",
      Math.min(config.beeTimeoutMs, 10000),
    );
    if (res.status !== "ran" || !res.content.trim()) {
      return staticFallback(inputs);
    }

    // 从 LLM 输出里抠出 JSON(容错:可能裹了 ```json)
    const text = res.content.trim();
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd <= jsonStart) {
      return staticFallback(inputs);
    }
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
      weights?: { archetype: string; weight: number }[];
    };
    const weights = parsed.weights;
    if (!Array.isArray(weights) || weights.length === 0) {
      return staticFallback(inputs);
    }

    // 映射回输入顺序并归一化
    const byArch = new Map<string, number>();
    for (const w of weights) {
      const v = Number(w.weight);
      if (Number.isFinite(v) && v >= 0) byArch.set(String(w.archetype), v);
    }
    let out = inputs.map((i) => ({
      archetype: i.archetype,
      // LLM 没给该 archetype 的 → 0
      weight: byArch.get(i.archetype) ?? 0,
      contribution: i.contribution,
    }));
    const total = out.reduce((s, o) => s + o.weight, 0);
    if (total <= 0) {
      // LLM 全给 0 或漏了 → 兜底
      return staticFallback(inputs);
    }
    out = out.map((o) => ({ ...o, weight: o.weight / total }));
    return out;
  } catch {
    return staticFallback(inputs);
  }
}
