// orchestration/pipeline.ts
// 异构分工流水线核心:对每个子任务执行 planner→coder→reviewer 串行 + handoff。
// reviewer 拒绝则带反馈 handoff 回 coder(最多 N 轮),通过则交 aggregator。
// 这是 A2A 赛道最核心的"异构分工 + handoff + 组织纠错"实现。

import { config } from "../config.js";
import { AgentRegistry } from "../agents/registry.js";
import { recordRun } from "../agents/identity.js";
import { callAgent } from "../model.js";
import { buildMessage } from "../protocol/envelope.js";
import { declareIntent, sendMessage, submitResult } from "../protocol/adapter.js";
import { handoff, renderHandoffContext } from "./handoff.js";
import { broadcastBreakthrough, isBreakthrough } from "./breakthrough.js";
import { emit } from "../log.js";
import { decideBounty } from "../injective/bounty-decider.js";
import type { BountyRequest } from "../agents/types.js";
import type {
  AgentRunResult,
  Archetype,
  CollaborationTrace,
  HandoffContext,
  Subtask,
  TaskRef,
} from "../agents/types.js";

export interface PipelineOutput {
  results: AgentRunResult[];
  handoffs: HandoffContext[];
  trace: CollaborationTrace["stages"];
  breakthroughsBroadcast: number;
  revisionRounds: number;
}

/** 执行单只 agent(通用包装:调模型 + 记绩效 + 检测突破) */
async function runAgent(params: {
  arch: Archetype;
  taskRef: TaskRef;
  userContent: string;
  inheritanceText: string;
  handoffContext?: HandoffContext;
  platformSideEffects: boolean;
  instanceId?: string;
}): Promise<AgentRunResult> {
  const { arch, taskRef, userContent, inheritanceText, handoffContext, platformSideEffects } = params;
  const instanceId = params.instanceId ?? AgentRegistry.newInstanceId(arch);
  const def = AgentRegistry.getDef(arch);

  // 声明意图
  await declareIntent(instanceId, "claim", `${arch} 处理:${taskRef.goal.slice(0, 40)}`, { platform: platformSideEffects });

  const handoffBlob = handoffContext ? renderHandoffContext(handoffContext) : undefined;
  const system = AgentRegistry.systemPrompt(arch, inheritanceText, handoffBlob);
  const t0 = Date.now();

  emit("diverge", `🐝 ${arch}蜂(${instanceId}) 启动 | 任务:${taskRef.goal.slice(0, 40)}`);

  const res = await callAgent(
    config.swarmModel,
    system,
    userContent,
    def.temperature,
    arch,
    config.beeTimeoutMs,
  );

  const brokeThrough = res.status === "ran" && isBreakthrough(res.content);
  const result: AgentRunResult = {
    archetype: arch,
    instanceId,
    content: res.content,
    latencyMs: Date.now() - t0,
    status: res.status,
    isBreakthrough: brokeThrough,
    messages: [],
  };

  // 记绩效(组织级进化)
  recordRun(arch, {
    success: res.status === "ran",
    breakthrough: brokeThrough,
    latencyMs: result.latencyMs,
    goal: taskRef.goal,
    contribution: res.content.slice(0, 200),
  });

  // A2A 闭环:每只蜂完成后向 EvoMap 提交结果(swarm/result)
  if (res.status === "ran" && res.content) {
    await submitResult(instanceId, `[${arch}] ${taskRef.goal.slice(0, 60)}\n${res.content.slice(0, 800)}`, { platform: platformSideEffects });
  }

  return result;
}

function traceText(content: string, max = 260): string {
  const clean = content.trim().replace(/\s+/g, " ");
  if (!clean) return "(空产出)";
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

/** 从 reviewer 输出解析裁决 */
function parseVerdict(content: string): { verdict: "APPROVE" | "REJECT"; feedback?: string } {
  const upper = content.toUpperCase();
  if (/VERDICT:\s*REJECT|裁决[:：]\s*拒绝|结论[:：]\s*拒绝/.test(upper)) {
    // 提取返工意见
    const fbMatch = content.match(/(?:返工意见|反馈|问题|REJECT)[:：\s]*([\s\S]{10,300})/i);
    return { verdict: "REJECT", feedback: fbMatch ? fbMatch[1].trim().slice(0, 300) : "产出未通过审查,请修正" };
  }
  if (/VERDICT:\s*APPROVE|裁决[:：]\s*通过|结论[:：]\s*通过|APPROVE/.test(upper)) {
    return { verdict: "APPROVE" };
  }
  // 无法解析,默认通过(避免阻塞)
  return { verdict: "APPROVE" };
}

/**
 * 对单个子任务执行完整流水线:planner→coder→reviewer(含返工回路)
 */
export async function runSubtaskPipeline(params: {
  subtask: Subtask;
  inheritanceText: string;
  trace: CollaborationTrace["stages"];
  handoffs: HandoffContext[];
  bounties?: BountyRequest[];
  reviewerBalanceInj?: string;  // reviewer 链上余额(深度3 悬赏决策用)
  maxRevisionRounds?: number;
  platformSideEffects?: boolean;
}): Promise<{ accepted: AgentRunResult[]; allResults: AgentRunResult[]; revisionRounds: number }> {
  const { subtask, inheritanceText, trace, handoffs } = params;
  const bounties = params.bounties ?? [];
  const maxRevisionRounds = params.maxRevisionRounds ?? config.maxRevisionRounds;
  const platformSideEffects = params.platformSideEffects ?? true;
  const taskRef: TaskRef = {
    id: subtask.id,
    goal: subtask.body,
    weight: subtask.weight,
    signals: subtask.signals,
  };
  const allResults: AgentRunResult[] = [];
  let revisionRounds = 0;

  // ── 1. Planner 蜂:产出执行计划 ──
  const plannerRes = await runAgent({
    arch: "planner",
    taskRef,
    userContent: `子任务:${subtask.title}\n详细要求:${subtask.body}`,
    inheritanceText,
    platformSideEffects,
  });
  allResults.push(plannerRes);
  trace.push({
    phase: "plan",
    agent: "planner",
    instanceId: plannerRes.instanceId,
    taskId: taskRef.id,
    laneId: `lane-${taskRef.id}`,
    message: traceText(plannerRes.content),
    fullContent: plannerRes.content,
    status: plannerRes.status,
    latencyMs: plannerRes.latencyMs,
  });

  // planner 突破 → 广播
  if (plannerRes.isBreakthrough) {
    await broadcastBreakthrough({ senderId: plannerRes.instanceId, hint: plannerRes.content.slice(0, 200), taskRef, platformSideEffects });
  }

  // ── 2. handoff: planner → coder ──
  const coderInstanceId = AgentRegistry.newInstanceId("coder");
  const planHandoff = await handoff({
    fromInstanceId: plannerRes.instanceId,
    fromArch: "planner",
    toArch: "coder",
    toInstanceId: coderInstanceId,
    task: taskRef,
    blob: plannerRes.content,
    platformSideEffects,
  });
  handoffs.push(planHandoff);

  // ── 3. Coder 蜂 + Reviewer 蜂(含返工回路)──
  let coderRes = await runAgent({
    arch: "coder",
    taskRef,
    userContent: `子任务:${subtask.title}\n详细要求:${subtask.body}`,
    inheritanceText,
    handoffContext: planHandoff,
    platformSideEffects,
    instanceId: coderInstanceId,
  });
  allResults.push(coderRes);
  trace.push({
    phase: "implement",
    agent: "coder",
    instanceId: coderRes.instanceId,
    taskId: taskRef.id,
    laneId: `lane-${taskRef.id}`,
    message: traceText(coderRes.content),
    fullContent: coderRes.content,
    status: coderRes.status,
    latencyMs: coderRes.latencyMs,
  });

  for (let round = 0; round <= maxRevisionRounds; round++) {
    // handoff: coder → reviewer
    const reviewerInstanceId = AgentRegistry.newInstanceId("reviewer");
    const reviewHandoff = await handoff({
      fromInstanceId: coderRes.instanceId,
      fromArch: "coder",
      toArch: "reviewer",
      toInstanceId: reviewerInstanceId,
      task: taskRef,
      blob: coderRes.content,
      platformSideEffects,
    });
    handoffs.push(reviewHandoff);

    // reviewer 审查
    const reviewerRes = await runAgent({
      arch: "reviewer",
      taskRef,
      userContent: `审查以下 coder 产出是否满足任务:${subtask.title}\n要求:${subtask.body}\n\ncoder 产出:\n${coderRes.content}`,
      inheritanceText,
      handoffContext: reviewHandoff,
      platformSideEffects,
      instanceId: reviewerInstanceId,
    });
    allResults.push(reviewerRes);

    const { verdict, feedback } = parseVerdict(reviewerRes.content);
    trace.push({
      phase: "review",
      agent: "reviewer",
      instanceId: reviewerRes.instanceId,
      taskId: taskRef.id,
      laneId: `lane-${taskRef.id}`,
      message: traceText(reviewerRes.content),
      fullContent: reviewerRes.content,
      status: verdict === "APPROVE" ? "approved" : "rejected",
      verdict,
      revisionRound: round,
      latencyMs: reviewerRes.latencyMs,
    });

    if (verdict === "APPROVE") {
      emit("converge", `✅ reviewer APPROVE | 子任务"${subtask.title}"通过`);
      // 通过 → 提交结果到平台
      await sendMessage(buildMessage({
        senderId: reviewerRes.instanceId,
        messageType: "report",
        intent: "report",
        to: AgentRegistry.newInstanceId("orchestrator"),
        task: taskRef,
        contextBlob: coderRes.content,
        verdict: "APPROVE",
      }), { platform: platformSideEffects });
      return { accepted: [coderRes], allResults, revisionRounds };
    }

    // REJECT → 返工
    revisionRounds += 1;
    if (round >= maxRevisionRounds) {
      emit("converge", `⚠️ reviewer REJECT 第${round + 1}轮,已达上限,强制接受`);
      return { accepted: [coderRes], allResults, revisionRounds };
    }
    emit("converge", `🔁 reviewer REJECT 第${round + 1}轮 → 返工 coder(带反馈)`);

    // ── 深度3:LLM 决策悬赏(reviewer 觉得难 → 用自己 INJ 悬赏 coder)──
    try {
      const decision = await decideBounty({
        reviewerVerdict: "REJECT",
        reviewerContent: reviewerRes.content,
        coderContent: coderRes.content,
        taskGoal: subtask.body,
        reviewerBalanceInj: params.reviewerBalanceInj || "0",
      });
      if (decision.shouldBounty && BigInt(decision.amountSmallest) > 0n) {
        const bounty: BountyRequest = {
          fromArch: "reviewer",
          toArch: "coder",
          fromInstanceId: reviewerRes.instanceId,
          toInstanceId: AgentRegistry.newInstanceId("coder"),
          taskId: taskRef.id,
          amountSmallest: decision.amountSmallest,
          denom: "inj",
          reason: decision.reason,
          difficultySignal: decision.difficultySignal,
          status: "proposed",
        };
        bounties.push(bounty);
        emit("converge", `💰 reviewer 悬赏 coder ${decision.amountSmallest} INJ(${decision.reason})`);
      }
    } catch (e) {
      console.warn("[bounty] decideBounty skipped:", e instanceof Error ? e.message : e);
    }

    // handoff: reviewer → coder(返工)
    const reworkCoderInstanceId = AgentRegistry.newInstanceId("coder");
    const reworkHandoff = await handoff({
      fromInstanceId: reviewerRes.instanceId,
      fromArch: "reviewer",
      toArch: "coder",
      toInstanceId: reworkCoderInstanceId,
      task: taskRef,
      blob: coderRes.content,
      feedback,
      revisionRound: round + 1,
      platformSideEffects,
    });
    handoffs.push(reworkHandoff);

    // coder 返工
    coderRes = await runAgent({
      arch: "coder",
      taskRef,
      userContent: `子任务:${subtask.title}\n详细要求:${subtask.body}\n\n请根据返工反馈修正你的产出。`,
      inheritanceText,
      handoffContext: reworkHandoff,
      platformSideEffects,
      instanceId: reworkCoderInstanceId,
    });
    allResults.push(coderRes);
    trace.push({
      phase: "implement",
      agent: "coder",
      instanceId: coderRes.instanceId,
      taskId: taskRef.id,
      laneId: `lane-${taskRef.id}`,
      message: traceText(coderRes.content),
      fullContent: coderRes.content,
      status: coderRes.status,
      revisionRound: round + 1,
      latencyMs: coderRes.latencyMs,
    });
  }

  return { accepted: [coderRes], allResults, revisionRounds };
}
