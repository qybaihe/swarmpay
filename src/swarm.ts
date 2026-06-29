// swarm.ts
// 蜂群协调入口。tier=swarm-baseline 走单次;其余走新的异构分工流水线(orchestrate)。
// 这是 OpenAI 兼容端点背后的编排层。

import { config } from "./config.js";
import type { Tier } from "./config.js";
import { emit } from "./log.js";
import { activeModelName, activeProviderLabel, baseline } from "./model.js";
import { evomap } from "./evomap.js";
import { activeEvolutionMemory } from "./evolution-memory.js";
import { orchestrate } from "./orchestration/orchestrator.js";
import { isBreakthrough } from "./orchestration/breakthrough.js";
import { isPlatformMode } from "./protocol/adapter.js";
import type { SwarmGraph, SwarmGraphEdge, SwarmGraphEvent, SwarmGraphNode, SwarmLane, SwarmTrace } from "./openai-types.js";
import type { CustomSwarmTopology } from "./agents/types.js";

export interface SwarmInput {
  tier: Tier;
  messages: { role: string; content: string }[];
  customTopology?: CustomSwarmTopology;
}

export interface SwarmOutput {
  content: string;
  trace: SwarmTrace;
}

export function extractGoal(messages: { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return messages.map((m) => m.content).join("\n");
}

function traceSnippet(text: string | undefined): string {
  const clean = (text || "").trim().replace(/\s+/g, " ");
  if (!clean) return "(空产出)";
  return clean.length > 260 ? clean.slice(0, 260) + "…" : clean;
}

function newRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function labelFor(archetype: string, count: number): string {
  if (archetype === "evomap") return "EvoMap";
  if (archetype === "system") return "System";
  return `${archetype[0]?.toUpperCase() || ""}${archetype.slice(1)} #${count}`;
}

function nodeStatus(status?: string): SwarmGraphNode["status"] {
  if (status === "timed_out") return "timed_out";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "failed") return "rejected";
  if (status === "skipped") return "skipped";
  return "ran";
}

function statusRank(status: SwarmGraphNode["status"]): number {
  return {
    pending: 0,
    running: 1,
    skipped: 1,
    timed_out: 2,
    ran: 3,
    approved: 4,
    rejected: 4,
  }[status];
}

function legacyKind(kind: SwarmGraphEvent["kind"]): NonNullable<SwarmTrace["events"]>[number]["kind"] {
  return kind === "agent_result" ? "agent_run" : kind;
}

function buildSwarmGraph(params: {
  runId: string;
  tier: Tier;
  orch: Awaited<ReturnType<typeof orchestrate>>;
  backflow?: SwarmTrace["evomap_backflow"];
  totalLatencyMs: number;
}): SwarmGraph {
  const { runId, tier, orch, backflow, totalLatencyMs } = params;
  const nodes = new Map<string, SwarmGraphNode>();
  const edges: SwarmGraphEdge[] = [];
  const events: SwarmGraphEvent[] = [];
  const lanes = new Map<string, SwarmLane>();
  const roleCounts = new Map<string, number>();
  let nodeOrder = 0;
  let edgeSeq = 0;
  let eventSeq = 0;

  const nextTs = () => new Date().toISOString();
  const nextEventSeq = () => ++eventSeq;

  function addLane(taskId?: string, title?: string): SwarmLane | undefined {
    if (!taskId) return undefined;
    const laneId = `lane-${taskId}`;
    const existing = lanes.get(laneId);
    if (existing) return existing;
    const subtask = orch.trace.subtasks.find((s) => s.id === taskId);
    const lane: SwarmLane = {
      id: laneId,
      taskId,
      title: title || subtask?.title || taskId,
      status: "completed",
      nodeIds: [],
      edgeIds: [],
    };
    lanes.set(laneId, lane);
    return lane;
  }

  function addNode(input: {
    id: string;
    instanceId: string;
    archetype: SwarmGraphNode["archetype"];
    label?: string;
    taskId?: string;
    laneId?: string;
    status?: SwarmGraphNode["status"];
  }): SwarmGraphNode {
    const existing = nodes.get(input.id);
    if (existing) {
      if (input.status && statusRank(input.status) >= statusRank(existing.status)) existing.status = input.status;
      if (input.taskId && !existing.taskId) existing.taskId = input.taskId;
      if (input.laneId && !existing.laneId) existing.laneId = input.laneId;
      return existing;
    }
    const count = (roleCounts.get(input.archetype) || 0) + 1;
    roleCounts.set(input.archetype, count);
    const node: SwarmGraphNode = {
      id: input.id,
      instanceId: input.instanceId,
      archetype: input.archetype,
      label: input.label || labelFor(input.archetype, count),
      taskId: input.taskId,
      laneId: input.laneId,
      status: input.status || "ran",
      role: input.archetype,
      order: ++nodeOrder,
      createdAtSeq: nodeOrder,
    };
    nodes.set(input.id, node);
    const lane = addLane(input.taskId);
    if (lane && !lane.nodeIds.includes(node.id)) lane.nodeIds.push(node.id);
    return node;
  }

  function addEdge(input: Omit<SwarmGraphEdge, "id" | "seq">): SwarmGraphEdge {
    const edge: SwarmGraphEdge = {
      ...input,
      id: `${input.kind}-${++edgeSeq}-${input.source}-${input.target}`,
      seq: edgeSeq,
    };
    edges.push(edge);
    const lane = addLane(edge.taskId);
    if (lane && !lane.edgeIds.includes(edge.id)) lane.edgeIds.push(edge.id);
    return edge;
  }

  function addEvent(input: Omit<SwarmGraphEvent, "id" | "seq" | "ts"> & { id?: string }): SwarmGraphEvent {
    const seq = nextEventSeq();
    const event: SwarmGraphEvent = {
      ...input,
      id: input.id || `${input.kind}-${seq}`,
      seq,
      ts: nextTs(),
    };
    events.push(event);
    return event;
  }

  for (const subtask of orch.trace.subtasks) addLane(subtask.id, subtask.title);

  addEvent({
    kind: "classify",
    status: orch.difficulty,
    text: `difficulty=${orch.difficulty}; reason=${orch.classification.reason}; source=${orch.classification.source}`,
  });
  addEvent({
    kind: "policy",
    status: orch.policy.createSession ? "session:on" : "session:off",
    text: `tier=${tier}; inheritance=${orch.policy.useInheritance ? "on" : "off"}; backflow=${orch.policy.publishBackflow ? "on" : "off"}`,
  });

  const stageNodes = orch.trace.stages.map((stage, index) => {
    const instanceId = stage.instanceId || `${stage.agent}-${stage.phase}-${index + 1}`;
    const taskId = stage.taskId;
    const laneId = stage.laneId || (taskId ? `lane-${taskId}` : undefined);
    const node = addNode({
      id: stage.clientNodeId || instanceId,
      instanceId,
      archetype: stage.agent,
      label: stage.label,
      taskId,
      laneId,
      status: nodeStatus(stage.status),
    });
    return { stage, node };
  });

  const orchestratorNode =
    stageNodes.find((s) => s.stage.phase === "decompose" && s.stage.agent === "orchestrator")?.node ||
    stageNodes.find((s) => s.stage.phase === "aggregate" && s.stage.agent === "orchestrator")?.node ||
    stageNodes.find((s) => s.stage.agent === "orchestrator")?.node;
  const aggregateNode =
    stageNodes.find((s) => s.stage.phase === "aggregate" && s.stage.agent === "orchestrator")?.node ||
    orchestratorNode;

  const edgeEvents = new Map<string, Omit<SwarmGraphEvent, "id" | "seq" | "ts">>();
  const incomingEdgeIds = new Map<string, string[]>();
  const afterStageEdgeIds = new Map<string, string[]>();
  const emittedEdgeEvents = new Set<string>();
  const customMode = !!orch.customTopology;

  function rememberIncoming(edge: SwarmGraphEdge) {
    const arr = incomingEdgeIds.get(edge.target) || [];
    arr.push(edge.id);
    incomingEdgeIds.set(edge.target, arr);
  }

  function rememberEdgeEvent(edge: SwarmGraphEdge, event: Omit<SwarmGraphEvent, "id" | "seq" | "ts">) {
    edgeEvents.set(edge.id, event);
    rememberIncoming(edge);
  }

  function rememberAfter(sourceNodeId: string, edgeId: string) {
    const arr = afterStageEdgeIds.get(sourceNodeId) || [];
    arr.push(edgeId);
    afterStageEdgeIds.set(sourceNodeId, arr);
  }

  function emitEdgeEvent(edgeId: string) {
    if (emittedEdgeEvents.has(edgeId)) return;
    const event = edgeEvents.get(edgeId);
    if (!event) return;
    addEvent(event);
    emittedEdgeEvents.add(edgeId);
  }

  function emitIncoming(nodeId: string) {
    for (const edgeId of incomingEdgeIds.get(nodeId) || []) emitEdgeEvent(edgeId);
  }

  let inheritEdgeId: string | undefined;
  let backflowEdgeId: string | undefined;

  if (orch.policy.useInheritance || backflow) {
    const evomapNode = addNode({ id: "evomap", instanceId: "evomap", archetype: "evomap", status: "ran" });
    if (orch.policy.useInheritance && orchestratorNode) {
      const edge = addEdge({
        source: evomapNode.id,
        target: orchestratorNode.id,
        kind: "inherit",
        status: "sent",
        label: "inherit",
        snippet: orch.inheritedRecipes.length
          ? orch.inheritedRecipes.map((r) => r.title).join(" / ")
          : "inherit attempted",
      });
      inheritEdgeId = edge.id;
      rememberEdgeEvent(edge, {
        kind: "inherit",
        nodeId: evomapNode.id,
        edgeId: edge.id,
        fromNodeId: evomapNode.id,
        toNodeId: orchestratorNode.id,
        status: orch.inheritedRecipes.length ? "hit" : "miss",
        text: `继承 ${orch.inheritedRecipes.length} 条经验`,
      });
    }
    if (backflow && aggregateNode) {
      const edge = addEdge({
        source: aggregateNode.id,
        target: evomapNode.id,
        kind: "backflow",
        status: backflow.status === "queued" || backflow.status === "published" ? "sent" : "skipped",
        label: "backflow",
        snippet: backflow.title,
      });
      backflowEdgeId = edge.id;
      edgeEvents.set(edge.id, {
        kind: "backflow",
        nodeId: aggregateNode.id,
        edgeId: edge.id,
        fromNodeId: aggregateNode.id,
        toNodeId: evomapNode.id,
        status: backflow.status,
        text: backflow.title ? `回流:${backflow.title}` : "回流状态已记录",
      });
    }
  }

  if (!customMode && orchestratorNode) {
    for (const { stage, node } of stageNodes) {
      if (stage.agent === "orchestrator") continue;
      const isDispatchTarget =
        orch.difficulty === "HARD"
          ? stage.phase === "plan"
          : stage.phase === "implement" && ["planner", "coder", "explorer"].includes(stage.agent);
      if (!isDispatchTarget) continue;
      const edge = addEdge({
        source: orchestratorNode.id,
        target: node.id,
        kind: "dispatch",
        taskId: stage.taskId,
        laneId: stage.laneId,
        status: "sent",
        label: "dispatch",
      });
      rememberEdgeEvent(edge, {
        kind: "handoff",
        edgeId: edge.id,
        fromNodeId: orchestratorNode.id,
        toNodeId: node.id,
        taskId: stage.taskId,
        laneId: stage.laneId,
        status: "sent",
        text: "orchestrator dispatch",
      });
      rememberAfter(orchestratorNode.id, edge.id);
    }
  }

  for (const handoff of orch.trace.handoffs) {
    const fromStage = stageNodes.find((s) => s.stage.instanceId === handoff.fromInstanceId);
    const toStage = stageNodes.find((s) => s.stage.instanceId === handoff.toInstanceId);
    addNode({
      id: fromStage?.stage.clientNodeId || handoff.fromInstanceId,
      instanceId: handoff.fromInstanceId,
      archetype: handoff.from,
      taskId: handoff.task.id,
      laneId: `lane-${handoff.task.id}`,
    });
    addNode({
      id: toStage?.stage.clientNodeId || handoff.toInstanceId,
      instanceId: handoff.toInstanceId,
      archetype: handoff.to,
      taskId: handoff.task.id,
      laneId: `lane-${handoff.task.id}`,
      status: "pending",
    });
    const isFeedback = handoff.from === "reviewer" && handoff.to === "coder" && (!!handoff.feedback || !!handoff.revisionRound);
    const edge = addEdge({
      source: fromStage?.node.id || handoff.fromInstanceId,
      target: toStage?.node.id || handoff.toInstanceId,
      kind: isFeedback ? "feedback" : "handoff",
      taskId: handoff.task.id,
      laneId: `lane-${handoff.task.id}`,
      revisionRound: handoff.revisionRound,
      status: "sent",
      label: isFeedback ? "feedback" : "handoff",
      snippet: traceSnippet(handoff.feedback || handoff.blob),
    });
    rememberEdgeEvent(edge, {
      kind: isFeedback ? "revision" : "handoff",
      edgeId: edge.id,
      fromNodeId: fromStage?.node.id || handoff.fromInstanceId,
      toNodeId: toStage?.node.id || handoff.toInstanceId,
      taskId: handoff.task.id,
      laneId: `lane-${handoff.task.id}`,
      revisionRound: handoff.revisionRound,
      status: "sent",
      text: traceSnippet(handoff.feedback || handoff.blob),
      fullContent: handoff.feedback || handoff.blob,
    });
    rememberAfter(fromStage?.node.id || handoff.fromInstanceId, edge.id);
  }

  const broadcastSources = stageNodes
    .filter(({ stage }) => isBreakthrough(stage.fullContent || stage.message || ""))
    .slice(0, orch.trace.breakthroughsBroadcast);
  const broadcastBySource = new Map<string, string[]>();
  for (const { stage, node } of broadcastSources) {
    const targets = [...nodes.values()].filter((target) => (
      target.id !== node.id && target.archetype !== "evomap" && target.archetype !== "system"
    ));
    for (const target of targets) {
      const edge = addEdge({
        source: node.id,
        target: target.id,
        kind: "broadcast",
        taskId: stage.taskId,
        laneId: stage.laneId,
        status: "sent",
        label: "breakthrough",
        snippet: traceSnippet(stage.message),
      });
      edgeEvents.set(edge.id, {
        kind: "broadcast",
        nodeId: node.id,
        edgeId: edge.id,
        fromNodeId: node.id,
        toNodeId: target.id,
        agent: stage.agent,
        instanceId: stage.instanceId,
        taskId: stage.taskId,
        laneId: stage.laneId,
        status: "sent",
        text: traceSnippet(stage.message),
        fullContent: stage.fullContent,
      });
      const arr = broadcastBySource.get(node.id) || [];
      arr.push(edge.id);
      broadcastBySource.set(node.id, arr);
    }
  }

  const customNonTerminalNodeIds = new Set((orch.customTopology?.edges || []).map((edge) => edge.source));
  if (aggregateNode) {
    for (const { stage, node } of stageNodes) {
      if (node.id === aggregateNode.id || stage.agent === "orchestrator") continue;
      if (!["implement", "review"].includes(stage.phase)) continue;
      if (customMode && stage.clientNodeId && customNonTerminalNodeIds.has(stage.clientNodeId)) continue;
      if (stage.phase === "review") {
        const reportEdge = addEdge({
          source: node.id,
          target: aggregateNode.id,
          kind: "report",
          taskId: stage.taskId,
          laneId: stage.laneId,
          revisionRound: stage.revisionRound,
          status: stage.status === "timed_out" ? "failed" : "sent",
          label: "review report",
          snippet: traceSnippet(stage.message),
        });
        edgeEvents.set(reportEdge.id, {
          kind: "report",
          edgeId: reportEdge.id,
          fromNodeId: node.id,
          toNodeId: aggregateNode.id,
          agent: stage.agent,
          instanceId: stage.instanceId,
          taskId: stage.taskId,
          laneId: stage.laneId,
          status: stage.status || "ran",
          verdict: stage.verdict,
          revisionRound: stage.revisionRound,
          text: traceSnippet(stage.message),
          fullContent: stage.fullContent,
        });
        rememberAfter(node.id, reportEdge.id);
      }
      const aggregateEdge = addEdge({
        source: node.id,
        target: aggregateNode.id,
        kind: "aggregate",
        taskId: stage.taskId,
        laneId: stage.laneId,
        status: stage.status === "timed_out" ? "failed" : "sent",
        label: "aggregate input",
        snippet: traceSnippet(stage.message),
      });
      edgeEvents.set(aggregateEdge.id, {
        kind: "aggregate",
        edgeId: aggregateEdge.id,
        fromNodeId: node.id,
        toNodeId: aggregateNode.id,
        agent: stage.agent,
        instanceId: stage.instanceId,
        taskId: stage.taskId,
        laneId: stage.laneId,
        status: stage.status || "ran",
        text: traceSnippet(stage.message),
        fullContent: stage.fullContent,
      });
      rememberAfter(node.id, aggregateEdge.id);
    }
  }

  if (inheritEdgeId) emitEdgeEvent(inheritEdgeId);

  for (const { stage, node } of stageNodes) {
    emitIncoming(node.id);
    const instanceId = stage.instanceId || node.instanceId;
    const taskId = stage.taskId;
    const laneId = stage.laneId || (taskId ? `lane-${taskId}` : undefined);
    addEvent({
      kind: "agent_start",
      nodeId: node.id,
      agent: stage.agent,
      instanceId,
      taskId,
      laneId,
      phase: stage.phase,
      text: `${stage.agent} start ${stage.phase}`,
    });
    addEvent({
      kind: "agent_result",
      nodeId: node.id,
      agent: stage.agent,
      instanceId,
      taskId,
      laneId,
      phase: stage.phase,
      status: stage.status || "ran",
      verdict: stage.verdict,
      revisionRound: stage.revisionRound,
      text: traceSnippet(stage.message),
      fullContent: stage.fullContent,
      latencyMs: stage.latencyMs,
    });
    if (stage.phase === "decompose" || stage.phase === "aggregate" || (stage.phase === "review" && stage.verdict)) {
      addEvent({
        kind: stage.phase === "review" ? "review_verdict" : stage.phase,
        nodeId: node.id,
        agent: stage.agent,
        instanceId,
        taskId,
        laneId,
        phase: stage.phase,
        status: stage.status || "ran",
        verdict: stage.verdict,
        revisionRound: stage.revisionRound,
        text: traceSnippet(stage.message),
        fullContent: stage.fullContent,
        latencyMs: stage.latencyMs,
      });
    }
    for (const edgeId of afterStageEdgeIds.get(node.id) || []) emitEdgeEvent(edgeId);
    for (const edgeId of broadcastBySource.get(node.id) || []) emitEdgeEvent(edgeId);
  }

  for (const edgeId of edgeEvents.keys()) {
    if (edgeId !== backflowEdgeId) emitEdgeEvent(edgeId);
  }
  if (backflowEdgeId) emitEdgeEvent(backflowEdgeId);

  return {
    runId,
    difficulty: orch.difficulty,
    tier,
    policy: orch.policy,
    nodes: [...nodes.values()],
    edges,
    events,
    lanes: [...lanes.values()],
    metrics: {
      totalLatencyMs,
      agentRuns: stageNodes.length,
      handoffs: orch.trace.handoffs.length,
      broadcasts: orch.trace.breakthroughsBroadcast,
      revisions: orch.trace.revisionRounds,
      subtasks: orch.trace.subtasks.length,
    },
  };
}

function extractSystem(messages: { role: string; content: string }[]): string {
  return messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
}

export async function runSwarm(input: SwarmInput): Promise<SwarmOutput> {
  const { tier, messages, customTopology } = input;
  const goal = extractGoal(messages);
  const userSystem = extractSystem(messages);
  const t0 = Date.now();
  const runId = newRunId();
  const swarmModel = activeModelName(config.swarmModel);
  const baselineModel = activeModelName(config.baselineModel);
  const providerLabel = activeProviderLabel();

  emit("diverge", `请求进入 | tier=${tier} | provider=${providerLabel} | 平台=${isPlatformMode() ? "REAL" : "LOCAL"} | 目标="${goal.slice(0, 60)}…"`);

  // ── 基线档:直通单次调用,不进蜂群 ──
  if (tier === "swarm-baseline") {
    const content = await baseline(config.baselineModel, userSystem, goal, config.beeTimeoutMs);
    emit("converge", `基线单次调用完成 | model=${baselineModel}`);
    return {
      content,
      trace: {
        tier,
        model: baselineModel,
        swarm_size: 1,
        bees: [],
        breakthroughs_broadcast: 0,
        aggregator: "vote",
        total_latency_ms: Date.now() - t0,
      },
    };
  }

  // ── 继承 + 编排:由 orchestrator 按难度决定是否继承 ──
  // 复杂度阈值:SIMPLE/MEDIUM(数学/事实)不继承不回流(经验无复用价值);
  //            HARD(复杂应用)才继承经验 + 回流沉淀
  const orch = await orchestrate({ goal, inheritanceText: "", tier, customTopology });

  // ── 回流层:仅 swarm-evo + HARD 才沉淀(简单问题和非 evo 档不写平台经验)──
  let backflow: SwarmTrace["evomap_backflow"] = undefined;
  let depositedMemory: NonNullable<SwarmTrace["evolution"]>["deposited"] | undefined;
  if (orch.policy.publishBackflow && orch.finalContent.length > 50) {
    const memory = activeEvolutionMemory().deposit({
      goal,
      tier,
      finalContent: orch.finalContent,
      trace: orch.trace,
    });
    depositedMemory = {
      id: memory.id,
      title: memory.title,
      qualityScore: memory.qualityScore,
      generation: memory.generation,
      successStreak: memory.successStreak,
    };
    emit("backflow", `本地进化记忆已沉淀 G${memory.generation} q=${memory.qualityScore} | ${memory.title}`);
    emit("backflow", `沉淀成功路径为 Gene+Capsule bundle(/a2a/publish)`);
    backflow = {
      status: "queued",
      title: goal.slice(0, 48),
      localMemoryId: memory.id,
      qualityScore: memory.qualityScore,
      generation: memory.generation,
    };
    if (config.evomapPublishBackflow) {
      void evomap.publishRecipeDraft({
        title: `SwarmPay: ${goal.slice(0, 48)}`,
        description: `蜂群协作沉淀(${tier})。含 ${orch.trace.handoffs.length} 次 handoff、${orch.trace.breakthroughsBroadcast} 次突破广播、${orch.trace.revisionRounds} 轮返工纠错。`,
        steps: orch.trace.stages.map((s) => ({ role: s.agent, action: s.message || s.phase })),
        metadata: {
          source: "evoship",
          tier,
          subtasks: orch.trace.subtasks.length,
          handoffs: orch.trace.handoffs.length,
          revisions: orch.trace.revisionRounds,
          breakthroughs: orch.trace.breakthroughsBroadcast,
        },
        goal,
        finalContent: orch.finalContent,
      }).then((pub) => {
        emit("backflow", pub.ok ? `已回流 Gene+Capsule 到 EvoMap` : `回流跳过:${pub.detail}`);
      }).catch((e) => {
        emit("backflow", `回流异常:${e instanceof Error ? e.message.slice(0, 80) : String(e)}`);
      });
    } else {
      emit("backflow", `远程 EvoMap publish 已关闭,本地进化记忆继续生效`);
    }
  }

  // ── 构造 trace(兼容旧 SwarmTrace + 附加协作细节)──
  const visibleStages = orch.trace.stages.length
    ? orch.trace.stages
    : [{ phase: "aggregate" as const, agent: "orchestrator" as const, instanceId: "orchestrator-fallback", message: orch.finalContent, fullContent: orch.finalContent, status: "ran" as const, latencyMs: orch.trace.totalLatencyMs }];
  const graph = buildSwarmGraph({
    runId,
    tier,
    orch,
    backflow,
    totalLatencyMs: Date.now() - t0,
  });
  const legacyEvents: NonNullable<SwarmTrace["events"]> = graph.events.map((event) => ({
    id: event.id,
    kind: legacyKind(event.kind),
    phase: event.phase || event.kind,
    agent: event.agent,
    instanceId: event.instanceId,
    from: event.fromNodeId,
    to: event.toNodeId,
    fromNodeId: event.fromNodeId,
    toNodeId: event.toNodeId,
    taskId: event.taskId,
    status: event.status,
    verdict: event.verdict,
    text: event.text,
    fullContent: event.fullContent,
    latencyMs: event.latencyMs,
    revisionRound: event.revisionRound,
  }));
  const trace: SwarmTrace = {
    tier,
    model: swarmModel,
    difficulty: orch.difficulty,
    policy: orch.policy,
    swarm_size: graph.nodes.filter((n) => !["evomap", "system"].includes(n.archetype)).length,
    inherited_recipes: orch.inheritedRecipes,
    evolution: {
      inheritedLocal: orch.inheritedRecipes.filter((recipe) => recipe.source === "local").length,
      inheritedRemote: orch.inheritedRecipes.filter((recipe) => recipe.source !== "local").length,
      deposited: depositedMemory,
    },
    graph,
    subtasks: orch.trace.subtasks,
    handoffs: orch.trace.handoffs.map((h) => ({
      from: h.from,
      to: h.to,
      fromInstanceId: h.fromInstanceId,
      toInstanceId: h.toInstanceId,
      taskId: h.task.id,
      taskGoal: h.task.goal,
      feedback: h.feedback,
      revisionRound: h.revisionRound,
      snippet: traceSnippet(h.feedback || h.blob),
    })),
    reward_split: orch.trace.rewardSplit,
    bounties: orch.trace.bounties,
    events: legacyEvents,
    bees: visibleStages
      .map((s, index) => ({
        id: s.instanceId || `${index + 1}-${s.agent}-${s.phase}`,
        variant: s.agent,
        agent: s.agent,
        phase: s.phase,
        status: s.status === "timed_out" ? "timed_out" : s.phase === "breakthrough" ? "breakthrough" : "ran",
        latency_ms: s.latencyMs ?? 0,
        snippet: traceSnippet(s.message),
      })),
    breakthroughs_broadcast: orch.trace.breakthroughsBroadcast,
    aggregator: "llm",
    evomap_backflow: backflow,
    total_latency_ms: Date.now() - t0,
  };

  return { content: orch.finalContent, trace };
}
