// agents/registry.ts
// AgentRegistry:从 AGENTS.md 的角色定义生成 AgentDef,管理运行时实例

import type { AgentDef, AgentState, Archetype } from "./types.js";
import { config } from "../config.js";

// AGENTS.md 里定义的角色(与 agents/*/AGENTS.md 一一对应)
// 这里用代码内联,避免运行时解析 markdown;AGENTS.md 作为人类可读的"身份证"并存
const ARCHETYPE_DEFS: Record<Archetype, Omit<AgentDef, "name">> = {
  orchestrator: {
    archetype: "orchestrator",
    temperature: 0.3,
    rewardWeight: 0.15, // proposer 0.05 + aggregator 0.10
    handoffTargets: ["planner"],
    acceptFrom: [],
    escalationPolicy: "self",
    focus: "我是蜂群的蜂后。我把目标拆解成可分工的子任务,分派给专长蜂,最后融合它们的突破点成一个超越单蜂的答案。",
    persona: [
      "你是 SwarmPay 蜂群的 Orchestrator(蜂后)。",
      "你的职责:把用户目标拆解为 2-6 个可分工的子任务。",
      "输出格式必须是 JSON 数组,每个元素含 title/body/signals/weight(weight 是 0-1 的贡献权重,总和≤0.85)。",
      '示例输出:[{"title":"...","body":"...","signals":"...","weight":0.3}]',
      "只输出 JSON,不要解释。",
    ].join("\n"),
  },
  planner: {
    archetype: "planner",
    temperature: 0.4,
    rewardWeight: 0.20,
    handoffTargets: ["coder"],
    acceptFrom: ["orchestrator"],
    escalationPolicy: "supervisor",
    focus: "我是首席规划师蜂。我理清子任务结构和关键约束,产出可执行的步骤计划,交给 coder 实现。",
    persona: [
      "你是 SwarmPay 蜂群的 Planner 蜂(首席规划师)。",
      "你收到一个子任务,要产出一个清晰的执行计划:分步骤、标注关键约束和潜在风险。",
      "不要写最终实现细节,那是 coder 的职责;你负责『怎么做的蓝图』。",
      "输出格式:\n## 执行计划\n1. [步骤] ...\n- 关键约束: ...\n- 潜在风险: ...",
    ].join("\n"),
  },
  coder: {
    archetype: "coder",
    temperature: 0.6,
    rewardWeight: 0.30,
    handoffTargets: ["reviewer"],
    acceptFrom: ["planner", "reviewer"],
    escalationPolicy: "supervisor",
    focus: "我是实现专家蜂。我消费 planner 的计划(或 reviewer 的返工反馈),直奔可落地的具体方案。",
    persona: [
      "你是 SwarmPay 蜂群的 Coder 蜂(实现专家)。",
      "你会收到上游的执行计划(planner)或返工反馈(reviewer)。请据此产出具体、可落地的方案/代码/答案。",
      "重细节、重边界处理、重正确性。直接给结果,不要解释过程。",
    ].join("\n"),
  },
  reviewer: {
    archetype: "reviewer",
    temperature: 0.7,
    rewardWeight: 0.20,
    handoffTargets: ["coder", "orchestrator"],
    acceptFrom: ["coder"],
    escalationPolicy: "supervisor",
    focus: "我是审阅批判蜂。我找出 coder 产出的缺陷,给出可操作的返工意见,做组织级纠错。",
    persona: [
      "你是 SwarmPay 蜂群的 Reviewer 蜂(审阅批判)。",
      "你审查 coder 的产出。判断是否满足任务要求,找出缺陷。",
      "输出格式必须包含裁决:\n## 审查结论\nverdict: APPROVE | REJECT\n- 优点: ...\n- 问题: ...(REJECT 时必填)\n## 返工意见(REJECT 时)\n1. [需修正] ...",
      "严格:有问题就 REJECT,不要勉强 APPROVE。",
    ].join("\n"),
  },
  explorer: {
    archetype: "explorer",
    temperature: 0.9,
    rewardWeight: 0.15,
    handoffTargets: ["planner", "coder"],
    acceptFrom: ["orchestrator"],
    escalationPolicy: "supervisor",
    optional: true,
    focus: "我是创意探索蜂。我跳出常规,给出非显然但有价值的方案,打破局部最优。",
    persona: [
      "你是 SwarmPay 蜂群的 Explorer 蜂(创意探索)。",
      "你故意跳出常规思路,给出非显然、有创造性的方案。不追求可执行性,追求新颖性。",
      "哪怕只有 1 个想法能启发别人,就是成功。",
    ].join("\n"),
  },
  // ── 以下两个角色为 Injective 链上通道(SwarmPay)新增,加法式 ──
  // 不参与答案质量分润(rewardWeight=0),其收益来自调用预算的协议服务费。
  payer: {
    archetype: "payer",
    temperature: 0.2, // 严谨,涉及资金
    rewardWeight: 0,
    handoffTargets: ["treasurer"],
    acceptFrom: ["orchestrator"], // orchestrator 把协作 trace 交给它结算
    escalationPolicy: "supervisor",
    focus: "根据协作 trace 计算 agent 贡献权重并发起 Injective 链上分润。",
    persona: [
      "你是 SwarmPay 的 Payer Agent(付款蜂)。",
      "你接收 orchestrator 交来的协作 trace 与本次调用的链上预算。",
      "你的职责:把预算按 trace.rewardSplit 权重分配给参与 agent 的 Injective 链上地址,",
      "决策走 CosmWasm 分润合约还是多笔直接转账,并产出可上链的分润指令(SplitInstruction)。",
      "你不产出自然语言答案,只产出结构化分润指令。涉及资金,务必严谨。",
    ].join("\n"),
  },
  treasurer: {
    archetype: "treasurer",
    temperature: 0.1,
    rewardWeight: 0,
    handoffTargets: [], // 终态:对账完成
    acceptFrom: ["payer"],
    escalationPolicy: "supervisor",
    focus: "接收协议服务费,对账分润结果,产出 TxReceipt 回执。",
    persona: [
      "你是 SwarmPay 的 Treasurer Agent(资金托管蜂)。",
      "你接收 payer 的分润指令执行结果(TxReceipt),对账『总入 = 总出 + 协议服务费』,",
      "产出最终 DistributeResult 回执,交还 orchestrator。",
      "任何对账不平,标注 error 并要求重试。",
    ].join("\n"),
  },
};

const nameCounter: Partial<Record<Archetype, number>> = {};

function nextName(arch: Archetype): string {
  nameCounter[arch] = (nameCounter[arch] || 0) + 1;
  return `evo-bee-${arch}-${String(nameCounter[arch]).padStart(2, "0")}`;
}

export class AgentRegistry {
  /** 获取某 archetype 的定义(用于构造 system prompt) */
  static getDef(arch: Archetype): AgentDef {
    return { name: arch, ...ARCHETYPE_DEFS[arch] };
  }

  /** 构造某 agent 的完整 system prompt(persona + focus + 继承经验 + handoff context) */
  static systemPrompt(
    arch: Archetype,
    inheritanceText: string,
    handoffContext?: string,
  ): string {
    const def = ARCHETYPE_DEFS[arch];
    const parts = [def.persona];
    if (inheritanceText) parts.push(`\n【EvoMap 继承的可复用经验】\n${inheritanceText}`);
    if (handoffContext) {
      parts.push(
        `\n【上游 handoff 上下文】\n${handoffContext}\n请基于以上上游产出继续,不要无视。`,
      );
    }
    parts.push(`\n你的角色定位:${def.focus}`);
    return parts.filter(Boolean).join("\n\n");
  }

  /** 生成一个新的 agent 实例 id(每次调用递增) */
  static newInstanceId(arch: Archetype): string {
    return nextName(arch);
  }

  /** 校验 handoff 是否合法(sender 能否转给 receiver archetype) */
  static canHandoff(from: Archetype, to: Archetype): boolean {
    return ARCHETYPE_DEFS[from].handoffTargets.includes(to);
  }
}

// 校验 reward 权重总和(solvers ≤ 0.85)
export function validateRewardSplit(): { ok: boolean; solversTotal: number } {
  const solvers: Archetype[] = ["planner", "coder", "reviewer", "explorer"];
  const total = solvers.reduce((s, a) => s + ARCHETYPE_DEFS[a].rewardWeight, 0);
  return { ok: total <= 0.85 + 1e-9, solversTotal: total };
}

void config; // config 在其他模块用;此处引用避免 tree-shake 误删 import 链路
