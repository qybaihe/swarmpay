// agents/types.ts
// 多 Agent 系统的核心类型:身份、消息、子任务、handoff 上下文、绩效

// ── Agent 身份(对应 AGENTS.md)──
// payer/treasurer 为 Injective 链上通道新增的资金角色(加法,不参与答案分润)。
export type Archetype =
  | "orchestrator"
  | "planner"
  | "coder"
  | "reviewer"
  | "explorer"
  | "payer" // 新增:发起链上支付/分润
  | "treasurer"; // 新增:资金托管、对账、协议服务费接收

export interface CustomSwarmTopology {
  mode: "custom";
  nodes: {
    id: string;
    role: Archetype;
    label?: string;
    petId?: string;
    // AI 美化注入的可选自定义人设(用户保存舰队时由 beautifyTopology 产出);
    // 执行时若存在则覆盖 registry 默认 persona/focus/temperature,否则回落默认
    persona?: string;
    focus?: string;
    temperature?: number;
    // 用户在节点定制面板填的定制信息(beautifyTopology 据此生成更贴合的人设)
    customTaskType?: string;  // 场景任务 key (analysis/design/coding/...)
    customSkill?: string;     // 自由文本:擅长做什么
  }[];
  edges: {
    id: string;
    source: string;
    target: string;
    kind?: "dispatch" | "handoff" | "feedback" | "report" | "aggregate" | "broadcast";
    label?: string;
  }[];
}

/** AI 美化后的单个节点人设(存库用) */
export interface FleetNodePersona {
  persona: string;
  focus: string;
  temperature: number;
}
/** nodeId → 美化人设 */
export type FleetNodePersonas = Record<string, FleetNodePersona>;

export interface AgentDef {
  archetype: Archetype;
  name: string;            // evo-bee-planner 等
  temperature: number;
  rewardWeight: number;    // 在 reward split 中的权重
  handoffTargets: Archetype[];  // 允许转交的角色
  acceptFrom: Archetype[];      // 接受转交的来源
  escalationPolicy: "self" | "supervisor";
  focus: string;           // 角色定位(system prompt 的一部分)
  optional?: boolean;      // explorer 可选
  persona: string;         // 完整 persona 文本(用于 system prompt)
}

// ── 运行时 agent 状态(持久化到 state.json)──
export interface AgentState {
  archetype: Archetype;
  instanceId: string;      // 本次运行实例 id(如 planner-run42)
  // 绩效档案(跨请求累积,组织进化用)
  stats: {
    runs: number;          // 总执行次数
    successes: number;     // 成功次数
    breakthroughs: number; // 触发突破的次数
    avgLatencyMs: number;
    rewardWeight: number;  // 当前权重(可随进化调整)
    onchainBalance?: string; // 链上 INJ 余额(最小单位,深度3 用)
    walletAddr?: string;     // 链上钱包地址
  };
  // 记忆:最近 N 次的关键产出摘要
  memory: { goal: string; contribution: string; ts: number }[];
}

// ── GEP-A2A 信封消息(agent 间结构化通信)──
export type MessageIntent =
  | "claim"        // 认领子任务
  | "handoff"      // 转交(带 context_blob)
  | "breakthrough" // 突破信号
  | "report"       // 提交结果
  | "escalate"     // 升级到 supervisor
  | "vote"         // 投票
  | "approval"     // 审批
  | "bounty";      // 悬赏(深度3:agent 自主花钱激励另一 agent)

export type MessageType = "dialog" | "report" | "decision";

export interface AgentMessage {
  protocol: "gep-a2a";
  protocol_version: "1.0.0";
  message_type: MessageType;
  message_id: string;       // msg_<unix>_<rand>
  sender_id: string;        // 发送方 agent instanceId
  timestamp: string;        // ISO 8601
  payload: {
    intent: MessageIntent;
    to?: string;            // P2P 目标 agent instanceId(广播时省略)
    task?: TaskRef;         // 关联的子任务
    context_blob?: string;  // handoff 传递的上下文(plan/代码/反馈)
    feedback?: string;      // reviewer 给 coder 的返工意见
    verdict?: "APPROVE" | "REJECT";  // reviewer 裁决
    reward_weight?: number;
    hint?: string;          // breakthrough 广播的 hint 内容
  };
}

export interface TaskRef {
  id: string;        // 子任务 id
  goal: string;      // 子任务目标
  weight: number;    // 贡献权重(0-1)
  signals?: string;  // 关键词标签
}

// ── Orchestrator 拆解出的子任务 ──
export interface Subtask {
  id: string;
  title: string;
  body: string;        // 详细描述
  signals: string;     // 关键词
  weight: number;      // solver 权重(总和 ≤ 0.85)
}

// ── handoff 上下文(下游 agent 看到的上游产出)──
export interface HandoffContext {
  from: Archetype;
  to: Archetype;
  fromInstanceId: string;
  toInstanceId: string;
  task: TaskRef;
  blob: string;       // 上游产出/反馈文本
  feedback?: string;  // reviewer 返工意见
  revisionRound?: number;  // 第几轮返工(0=首次)
  bounty?: BountyRequest;  // 深度3:reviewer→coder 返工 handoff 可附带悬赏
}

// ── 深度3:agent 自主悬赏(LLM 决策,发起方 agent 用自己钱包签名)──
export interface BountyRequest {
  fromArch: Archetype;        // 悬赏发起方(通常 reviewer)
  toArch: Archetype;          // 被悬赏方(通常 coder)
  fromInstanceId: string;
  toInstanceId: string;
  taskId: string;
  amountSmallest: string;     // 最小单位 INJ 字符串
  denom: string;
  reason: string;             // LLM 给出的悬赏理由
  difficultySignal: "hard" | "normal";
  // 链上回执(执行后回填)
  txHash?: string;
  status?: "proposed" | "executed" | "failed";
}

// ── 单个 agent 执行结果 ──
export interface AgentRunResult {
  archetype: Archetype;
  instanceId: string;
  content: string;        // 产出内容
  latencyMs: number;
  status: "ran" | "timed_out" | "failed";
  isBreakthrough: boolean; // 是否触发突破
  messages: AgentMessage[]; // 本次发出的消息(handoff/广播等)
}

// ── 整条流水线的协作 trace(返回给客户端的可视化数据)──
export interface CollaborationTrace {
  goal: string;
  subtasks: { id: string; title: string; weight: number; status: string }[];
  stages: {
    phase: "inherit" | "decompose" | "plan" | "implement" | "review" | "breakthrough" | "aggregate" | "backflow";
    agent: Archetype;
    instanceId?: string;
    clientNodeId?: string;
    label?: string;
    taskId?: string;
    laneId?: string;
    message?: string;
    fullContent?: string;
    status?: AgentRunResult["status"] | "approved" | "rejected" | "skipped";
    verdict?: "APPROVE" | "REJECT";
    revisionRound?: number;
    latencyMs?: number;
    messages?: AgentMessage[];
  }[];
  handoffs: HandoffContext[];
  breakthroughsBroadcast: number;
  revisionRounds: number;
  rewardSplit: { archetype: Archetype; weight: number; contribution: string }[];
  bounties?: BountyRequest[];  // 深度3:本次协作产生的悬赏(LLM 决策+链上执行)
  totalLatencyMs: number;
}
