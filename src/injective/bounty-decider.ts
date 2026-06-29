// src/injective/bounty-decider.ts
// LLM 悬赏决策(深度3):reviewer 看完 coder 产出后,由 LLM 判断"这活难不难、值不值得悬赏加码"。
// 若 shouldBounty,生成 BountyRequest(reviewer 用自己钱包悬赏 coder)。
// 复用项目统一 LLM 入口(callAgent / openai SDK),失败兜底不悬赏(不阻断编排)。

import { config } from "../config.js";

/** 悬赏决策输入:reviewer 审查内容 + coder 产出 + reviewer 当前链上余额。 */
export interface BountyDecisionInput {
  reviewerVerdict: "APPROVE" | "REJECT";
  reviewerContent: string;   // reviewer 的审查意见
  coderContent: string;       // coder 的产出
  taskGoal: string;
  reviewerBalanceInj: string; // reviewer 钱包 INJ 余额(最小单位)
}

/** 悬赏决策输出。 */
export interface BountyDecision {
  shouldBounty: boolean;
  amountSmallest: string;     // 悬赏金额(最小单位 INJ)
  reason: string;
  difficultySignal: "hard" | "normal";
}

/** 默认悬赏金额(余额的 10%,上限 0.01 INJ)。 */
function defaultBountyAmount(balanceInj: string): string {
  const bal = BigInt(balanceInj || "0");
  if (bal <= 0n) return "0";
  const tenPct = bal / 10n;
  const cap = 10_000_000_000_000n; // 0.01 INJ
  return tenPct > cap ? cap.toString() : tenPct.toString();
}

/**
 * LLM 决策是否悬赏。输入审查上下文,输出 BountyDecision。
 * MVP:轻量 LLM 调用(类似 classifyDifficulty 模式),温度 0.3,JSON 输出。
 */
export async function decideBounty(input: BountyDecisionInput): Promise<BountyDecision> {
  const noBounty: BountyDecision = { shouldBounty: false, amountSmallest: "0", reason: "无需悬赏", difficultySignal: "normal" };

  // 余额不足直接不悬赏
  if (BigInt(input.reviewerBalanceInj || "0") <= 0n) return noBounty;

  // mock 模式或未配 LLM → 用规则兜底:REJECT + 任务含"难/复杂"关键词时悬赏
  if (config.useMock) {
    return ruleBasedBounty(input);
  }

  try {
    const prompt = buildBountyPrompt(input);
    const resp = await callLLM(prompt);
    return parseBountyResponse(resp, input.reviewerBalanceInj);
  } catch (e) {
    console.warn("[bounty] LLM decide failed, fallback to rule:", e instanceof Error ? e.message : e);
    return ruleBasedBounty(input);
  }
}

function buildBountyPrompt(input: BountyDecisionInput): string {
  return [
    "你是 SwarmPay 蜂群的悬赏决策 Agent。根据以下协作上下文判断是否应该由 reviewer 悬赏 coder。",
    "",
    `任务目标: ${input.taskGoal}`,
    `reviewer 裁决: ${input.reviewerVerdict}`,
    `reviewer 审查意见: ${input.reviewerContent.slice(0, 500)}`,
    `coder 产出: ${input.coderContent.slice(0, 500)}`,
    `reviewer 链上 INJ 余额(最小单位): ${input.reviewerBalanceInj}`,
    "",
    "判断规则:若 coder 产出质量高且任务确实困难(reviewer 返工多次/审查意见长/任务复杂),reviewer 应悬赏激励。",
    "输出严格 JSON,不要解释:",
    '{"shouldBounty": boolean, "amountInj": number(0.001-0.01), "reason": "一句话理由", "difficultySignal": "hard"|"normal"}',
  ].join("\n");
}

async function callLLM(prompt: string): Promise<string> {
  // 复用项目的 openai SDK 调用(与 model.ts 的 realClient 同款)
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({
    baseURL: config.openaiBaseUrl || config.defaultProvider.baseUrl,
    apiKey: config.openaiApiKey || config.defaultProvider.apiKey,
  });
  const resp = await client.chat.completions.create({
    model: config.aggregatorModel || config.swarmModel,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 200,
    response_format: { type: "json_object" },
  });
  return resp.choices[0]?.message?.content || "";
}

function parseBountyResponse(resp: string, balanceInj: string): BountyDecision {
  try {
    const obj = JSON.parse(resp);
    if (!obj.shouldBounty) return { shouldBounty: false, amountSmallest: "0", reason: obj.reason || "LLM 判定无需悬赏", difficultySignal: obj.difficultySignal || "normal" };
    const amountInj = Number(obj.amountInj || 0);
    if (amountInj <= 0) return { shouldBounty: false, amountSmallest: "0", reason: "金额为0", difficultySignal: "normal" };
    // INJ → 最小单位(18 decimals)
    const amountSmallest = BigInt(Math.round(amountInj * 1e15)) * 1000n; // 1e18
    // 不超过余额
    const bal = BigInt(balanceInj);
    const final = amountSmallest > bal ? bal : amountSmallest;
    return { shouldBounty: true, amountSmallest: final.toString(), reason: obj.reason || "LLM 判定值得悬赏", difficultySignal: obj.difficultySignal || "hard" };
  } catch {
    return { shouldBounty: false, amountSmallest: "0", reason: "LLM 响应解析失败", difficultySignal: "normal" };
  }
}

/** 规则兜底:REJECT + 任务/审查含困难信号 → 悬赏默认金额。 */
function ruleBasedBounty(input: BountyDecisionInput): BountyDecision {
  const hardSignals = /难|复杂|困难|返工|重做|边界|异常|棘手/i;
  const isHard = input.reviewerVerdict === "REJECT" || hardSignals.test(input.reviewerContent) || hardSignals.test(input.taskGoal);
  if (!isHard) return { shouldBounty: false, amountSmallest: "0", reason: "规则判定无需悬赏", difficultySignal: "normal" };
  const amt = defaultBountyAmount(input.reviewerBalanceInj);
  if (amt === "0") return { shouldBounty: false, amountSmallest: "0", reason: "余额不足", difficultySignal: "normal" };
  return { shouldBounty: true, amountSmallest: amt, reason: "规则判定任务困难,悬赏激励", difficultySignal: "hard" };
}