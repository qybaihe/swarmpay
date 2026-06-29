// 蜂群推理 API(POST /v1/chat/completions)
// 返回 OpenAI 兼容格式 + x_swarm_trace

export interface SwarmBee {
  id: string;
  variant: string;
  agent?: string;
  phase?: string;
  status: "ran" | "breakthrough" | "hinted" | "timed_out";
  latency_ms: number;
  snippet: string;
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
  bees: SwarmBee[];
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

export interface SwarmResponse {
  content: string;
  trace: SwarmTrace | null;
}

export interface PlaygroundTopology {
  mode: "custom";
  nodes: {
    id: string;
    role: Exclude<SwarmGraphArchetype, "evomap" | "system">;
    label?: string;
    petId?: string;
    // 节点定制(用户在 PetNode 内联面板填,保存舰队时 AI 据此美化)
    customTaskType?: string;
    customSkill?: string;
  }[];
  edges: {
    id: string;
    source: string;
    target: string;
    kind?: SwarmGraphEdge["kind"];
    label?: string;
  }[];
}

export async function runSwarm(params: {
  goal: string;
  tier: string;
  apiKey?: string;
  topology?: PlaygroundTopology;
  demo?: boolean;
}): Promise<SwarmResponse> {
  const { goal, tier, apiKey, topology, demo } = params;
  // 普通真实调用必须有用户 API Key;Demo 演示请求由后端走本地 mock 蜂群。
  if (!apiKey && !demo) {
    throw new Error("未检测到 API Key,请先登录或注册获取。");
  }
  const authHeader = apiKey ? `Bearer ${apiKey}` : "";
  if (topology || demo) {
    const res = await fetch("/api/playground/swarm/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
        ...(demo ? { "X-EvoShip-Demo": "true" } : {}),
      },
      body: JSON.stringify({ goal, tier, topology, demo: demo === true }),
    });

    if (!res.ok) {
      let msg = `后端返回 ${res.status}`;
      try {
        const j = await res.json();
        msg = j.error?.message || msg;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }

    const d = await res.json();
    return { content: d.content || "(空)", trace: d.trace || null };
  }

  const res = await fetch("/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({
      model: tier,
      messages: [{ role: "user", content: goal }],
      ...(topology ? { x_playground_topology: topology } : {}),
    }),
  });

  if (!res.ok) {
    let msg = `后端返回 ${res.status}`;
    try {
      const j = await res.json();
      msg = j.error?.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const d = await res.json();
  return {
    content: d.choices?.[0]?.message?.content || "(空)",
    trace: d.x_swarm_trace || null,
  };
}
