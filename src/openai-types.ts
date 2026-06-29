// 最小化的 OpenAI 兼容类型(只覆盖 chat/completions 用到的部分)

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  x_playground_topology?: CustomSwarmTopology;
  // 透传其他字段(本次 MVP 不实现 tool_calls,但保留不报错)
  [k: string]: unknown;
}

export interface CustomSwarmTopology {
  mode: "custom";
  nodes: {
    id: string;
    role: "orchestrator" | "planner" | "coder" | "reviewer" | "explorer";
    label?: string;
    petId?: string;
  }[];
  edges: {
    id: string;
    source: string;
    target: string;
    kind?: "dispatch" | "handoff" | "feedback" | "report" | "aggregate" | "broadcast";
    label?: string;
  }[];
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    index: number;
    message: { role: "assistant"; content: string };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  // 额外字段:蜂群过程的可见性(demo 用)
  x_swarm_trace?: SwarmTrace;
}

export interface ExecutionPolicyTrace {
  tier: string;
  difficulty: "SIMPLE" | "MEDIUM" | "HARD";
  createSession: boolean;
  useInheritance: boolean;
  publishBackflow: boolean;
  mediumSolverCount: number;
  hardMaxSubtasks: number;
  hardConcurrency: number;
  maxRevisionRounds: number;
}

export type SwarmGraphArchetype =
  | "orchestrator"
  | "planner"
  | "coder"
  | "reviewer"
  | "explorer"
  | "evomap"
  | "system";

export interface SwarmGraphNode {
  id: string;
  instanceId: string;
  archetype: SwarmGraphArchetype;
  label: string;
  taskId?: string;
  laneId?: string;
  status: "pending" | "running" | "ran" | "approved" | "rejected" | "timed_out" | "skipped";
  role?: string;
  order: number;
  createdAtSeq: number;
}

export interface SwarmGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "dispatch" | "handoff" | "feedback" | "report" | "broadcast" | "aggregate" | "inherit" | "backflow";
  taskId?: string;
  laneId?: string;
  revisionRound?: number;
  status?: "sent" | "delivered" | "failed" | "skipped";
  label?: string;
  snippet?: string;
  seq: number;
}

export interface SwarmGraphEvent {
  id: string;
  seq: number;
  ts: string;
  kind:
    | "classify"
    | "policy"
    | "inherit"
    | "decompose"
    | "agent_start"
    | "agent_result"
    | "handoff"
    | "broadcast"
    | "review_verdict"
    | "revision"
    | "report"
    | "aggregate"
    | "backflow";
  nodeId?: string;
  edgeId?: string;
  agent?: string;
  instanceId?: string;
  fromNodeId?: string;
  toNodeId?: string;
  taskId?: string;
  laneId?: string;
  phase?: string;
  status?: string;
  verdict?: "APPROVE" | "REJECT";
  revisionRound?: number;
  text?: string;
  fullContent?: string;
  receiverContent?: string;
  latencyMs?: number;
}

export interface SwarmLane {
  id: string;
  taskId: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
  nodeIds: string[];
  edgeIds: string[];
}

export interface SwarmGraph {
  runId: string;
  difficulty: "SIMPLE" | "MEDIUM" | "HARD";
  tier: "swarm-baseline" | "swarm-lite" | "swarm-heavy" | "swarm-evo";
  policy: ExecutionPolicyTrace;
  nodes: SwarmGraphNode[];
  edges: SwarmGraphEdge[];
  events: SwarmGraphEvent[];
  lanes?: SwarmLane[];
  metrics?: {
    totalLatencyMs: number;
    agentRuns: number;
    handoffs: number;
    broadcasts: number;
    revisions: number;
    subtasks: number;
  };
}

export interface SwarmTrace {
  tier: string;
  model: string;
  difficulty?: "SIMPLE" | "MEDIUM" | "HARD";
  policy?: ExecutionPolicyTrace;
  swarm_size: number;
  inherited_recipes?: {
    title: string;
    description?: string;
    source?: "local" | "capsule" | "recipe";
    qualityScore?: number;
    reuseCount?: number;
    generation?: number;
    matchScore?: number;
    memoryId?: number;
  }[];
  graph?: SwarmGraph;
  subtasks?: { id: string; title: string; weight: number; status: string }[];
  handoffs?: {
    from: string;
    to: string;
    fromInstanceId?: string;
    toInstanceId?: string;
    taskId: string;
    taskGoal: string;
    feedback?: string;
    revisionRound?: number;
    snippet: string;
  }[];
  reward_split?: { archetype: string; weight: number; contribution: string }[];
  events?: {
    id: string;
    kind: SwarmGraphEvent["kind"] | "agent_run";
    phase: string;
    agent?: string;
    instanceId?: string;
    from?: string;
    to?: string;
    fromNodeId?: string;
    toNodeId?: string;
    taskId?: string;
    status?: string;
    verdict?: "APPROVE" | "REJECT";
    text?: string;
    fullContent?: string;
    receiverContent?: string;
    latencyMs?: number;
    revisionRound?: number;
  }[];
  bees: {
    id: string;
    variant: string;
    agent?: string;
    phase?: string;
    status: "ran" | "breakthrough" | "hinted" | "timed_out";
    latency_ms: number;
    snippet: string; // 前 120 字
  }[];
  breakthroughs_broadcast: number;
  aggregator: "vote" | "llm";
  evomap_backflow?: {
    status: "skipped" | "queued" | "published";
    title?: string;
    localMemoryId?: number;
    qualityScore?: number;
    generation?: number;
  };
  evolution?: {
    inheritedLocal: number;
    inheritedRemote: number;
    deposited?: {
      id: number;
      title: string;
      qualityScore: number;
      generation: number;
      successStreak: number;
    };
  };
  total_latency_ms: number;
}
