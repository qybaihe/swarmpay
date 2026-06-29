// 蜂群运行 + 画布回放引擎:
// 普通模式调用真实蜂群;Demo 模式加载预制 trace,二者都映射到画布上播放。
import { ref, computed } from "vue";
import {
  runSwarm,
  type PlaygroundTopology,
  type SwarmBee,
  type SwarmGraph,
  type SwarmGraphEdge,
  type SwarmGraphEvent,
  type SwarmGraphNode,
  type SwarmTrace,
} from "../api/swarm";
import { usePlaygroundStore } from "../stores/playground";
import { PET_BY_ID, ROLE_INFO, VOICE_BASE, type Role } from "../constants/pets";

// 用宽松类型避开 vue-flow Node/Edge 泛型的深层类型实例化(TS2589)
interface FlowNode {
  id: string;
  position: { x: number; y: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}
interface FlowEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  style?: any;
}

export interface RunnerHandles {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface Particle {
  id: string;
  fromX: number; fromY: number; toX: number; toY: number;
  color: string;
  kind: "msg" | "broadcast";
}

interface RunParams {
  goal: string;
  tier: string;
  apiKey?: string;
  demo?: boolean;
  syncGraphCanvas?: (graph: SwarmGraph) => RunnerHandles | void;
  topology?: PlaygroundTopology;
  /** 经验宝箱动效钩子:回放遇到 inherit(宝箱→agent)/backflow(agent→宝箱)时触发
   *  kind: "in"=经验回流入宝箱 / "out"=宝箱发经验给agent
   *  count: 金币数(in 恒为1, out=inherited_recipes.length)
   *  nodeId: 关联的画布节点 id(算金币起点/终点用) */
  onExperience?: (kind: "in" | "out", count: number, nodeId?: string) => void;
  /** 积分扣减动效钩子:普通真实调用成功扣费后触发,用于播放 -50 金币飞向 NavBar 的动画 */
  onCreditsDeducted?: () => void;
  /** 链上分润动效钩子:回放结束后,若有 payment.splits,触发金色分润流向箭头 overlay */
  onRewardDistributed?: (payment: { splits?: { archetype: string; addr: string; amount: string; weight: number }[]; txHash?: string; success?: boolean } | null) => void;
  /** 深度3:悬赏动效钩子(若有 bounties,reviewer→coder 画金色流向 + 飘字) */
  onBounty?: (bounties: { fromArch: string; toArch: string; amountSmallest: string; reason: string; status?: string }[]) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ROLES: Role[] = ["orchestrator", "planner", "coder", "reviewer", "explorer"];
const PHASE_LABEL: Record<string, string> = {
  inherit: "继承",
  decompose: "拆解",
  plan: "规划",
  implement: "实现",
  review: "审查",
  breakthrough: "突破",
  aggregate: "聚合",
  backflow: "回流",
};
const EDGE_COLOR: Record<SwarmGraphEdge["kind"], string> = {
  dispatch: "#3ae0ff",
  handoff: "#5eead4",
  feedback: "#ff5c7a",
  report: "#a78bfa",
  aggregate: "#facc15",
  broadcast: "#ffb84d",
  inherit: "#22c55e",
  backflow: "#14b8a6",
};
const EVENT_KIND_LABEL: Record<SwarmGraphEvent["kind"], string> = {
  classify: "难度判定",
  policy: "策略生成",
  inherit: "经验继承",
  decompose: "任务拆解",
  agent_start: "开始执行",
  agent_result: "执行结果",
  handoff: "上下文交接",
  broadcast: "突破广播",
  review_verdict: "审查结论",
  revision: "返工修订",
  report: "结果汇报",
  aggregate: "聚合",
  backflow: "经验回流",
};

function shortSpeech(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 70 ? `${cleaned.slice(0, 70)}...` : cleaned;
}

function normalizeRole(role: string | undefined): Role | null {
  if (!role) return null;
  return ROLES.includes(role as Role) ? (role as Role) : null;
}

export function useFlowRunner() {
  const store = usePlaygroundStore();
  const particles = ref<Particle[]>([]);
  const running = computed(() => store.running);
  let runToken = 0;

  // 拓扑排序(Kahn):无边按添加顺序;检测到环时退化为添加顺序。
  function topoOrder(nodes: FlowNode[], edges: FlowEdge[]): { order: string[]; hasCycle: boolean } {
    if (edges.length === 0) return { order: nodes.map((n) => n.id), hasCycle: false };

    const indeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const n of nodes) { indeg.set(n.id, 0); adj.set(n.id, []); }
    for (const e of edges) {
      if (!indeg.has(e.source) || !indeg.has(e.target)) continue;
      indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
      adj.get(e.source)!.push(e.target);
    }
    const queue = nodes.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id);
    const order: string[] = [];
    const seen = new Set<string>();
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
      for (const nb of adj.get(id) || []) {
        indeg.set(nb, (indeg.get(nb) || 0) - 1);
        if ((indeg.get(nb) || 0) === 0) queue.push(nb);
      }
    }

    const hasCycle = order.length < nodes.length;
    return {
      order: hasCycle ? nodes.map((n) => n.id) : order,
      hasCycle,
    };
  }

  function spawnParticle(from: FlowNode, to: FlowNode, kind: Particle["kind"], color?: string) {
    const fx = from.position.x + 66, fy = from.position.y + 48;
    const tx = to.position.x + 66, ty = to.position.y + 48;
    const p: Particle = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fromX: fx, fromY: fy, toX: tx, toY: ty,
      color: color || (kind === "broadcast" ? "#ffb84d" : "#3ae0ff"),
      kind,
    };
    particles.value.push(p);
    setTimeout(() => {
      particles.value = particles.value.filter((x) => x.id !== p.id);
    }, 1200);
  }

  function playVoice(voiceFile: string) {
    try {
      const a = new Audio(VOICE_BASE + voiceFile);
      a.volume = 0.45;
      a.play().catch(() => { /* 自动播放策略拦截,忽略 */ });
    } catch { /* ignore */ }
  }

  function nodeName(node: FlowNode): string {
    const data = node.data as { petId?: string; label?: string };
    if (data?.label) return data.label;
    const petId = data?.petId || "claude";
    return PET_BY_ID[petId]?.name || node.id;
  }

  function graphNodeName(node: SwarmGraphNode): string {
    const role = ROLE_INFO[node.archetype as Role]?.name || node.archetype;
    return node.label || `${role} ${node.instanceId}`;
  }

  function graphEventText(event: SwarmGraphEvent, fallback: string): string {
    if (event.fullContent && ["agent_start", "agent_result", "review_verdict", "revision", "handoff", "broadcast", "report", "aggregate", "backflow", "inherit"].includes(event.kind)) {
      return shortSpeech(event.fullContent);
    }
    if (event.verdict) return event.verdict === "APPROVE" ? "审查通过" : "退回返工";
    if (event.text) return shortSpeech(event.text);
    if (event.status) return `${EVENT_KIND_LABEL[event.kind] || event.kind}:${event.status}`;
    return fallback;
  }

  function receiveText(edgeKind: SwarmGraphEdge["kind"], event: SwarmGraphEvent): string {
    if (event.receiverContent?.trim()) return shortSpeech(event.receiverContent);
    if (edgeKind === "feedback" || event.kind === "revision") return "我收到了返工意见,马上修订。";
    if (edgeKind === "broadcast") return "我收到了突破广播,会按这个约束继续。";
    if (edgeKind === "inherit") return "我继承了这组经验,先注入到拆解里。";
    if (edgeKind === "backflow") return "我收到了成功路径,沉淀为可复用经验。";
    if (edgeKind === "aggregate" || edgeKind === "report") return "我收到了这条 lane 的审查结果,纳入聚合。";
    if (edgeKind === "dispatch") return "我收到子任务,开始给出我的判断。";
    return "我收到上下文,继续下一步。";
  }

  function eventBubbleStatus(edgeKind: SwarmGraphEdge["kind"], event: SwarmGraphEvent): "active" | "breakthrough" | "error" {
    if (edgeKind === "feedback" || event.kind === "revision" || event.verdict === "REJECT") return "error";
    if (edgeKind === "broadcast" || edgeKind === "inherit" || edgeKind === "backflow" || event.verdict === "APPROVE") return "breakthrough";
    return "active";
  }

  function mapGraphNodesToCanvas(graph: SwarmGraph, canvasNodes: FlowNode[], order: string[]) {
    const direct = new Map<string, string>();
    for (const node of canvasNodes) {
      direct.set(node.id, node.id);
      const graphNodeId = (node.data as { graphNodeId?: string })?.graphNodeId;
      if (graphNodeId) direct.set(graphNodeId, node.id);
    }

    const orderedNodes = order.map((id) => canvasNodes.find((n) => n.id === id)).filter(Boolean) as FlowNode[];
    const rolePools = new Map<Role, string[]>();
    for (const role of ROLES) rolePools.set(role, []);
    for (const node of orderedNodes) {
      const role = normalizeRole((node.data as { role?: string })?.role);
      if (role) rolePools.get(role)!.push(node.id);
    }

    const roleCursor = new Map<Role, number>();
    let fallbackCursor = 0;
    const mapping = new Map<string, string>();
    for (const graphNode of graph.nodes) {
      const directId = direct.get(graphNode.id) || direct.get(graphNode.instanceId);
      if (directId) {
        mapping.set(graphNode.id, directId);
        mapping.set(graphNode.instanceId, directId);
        continue;
      }

      const role = normalizeRole(graphNode.archetype);
      const candidates = role ? rolePools.get(role) || [] : [];
      let canvasId = "";
      if (candidates.length > 0) {
        const cursor = roleCursor.get(role!) || 0;
        roleCursor.set(role!, cursor + 1);
        canvasId = candidates[cursor % candidates.length];
      } else {
        const fallback = orderedNodes[fallbackCursor % Math.max(orderedNodes.length, 1)];
        fallbackCursor += 1;
        canvasId = fallback?.id || canvasNodes[0]?.id || "";
      }
      if (canvasId) {
        mapping.set(graphNode.id, canvasId);
        mapping.set(graphNode.instanceId, canvasId);
      }
    }
    return mapping;
  }

  function findGraphEdgeForEvent(graph: SwarmGraph, event: SwarmGraphEvent): SwarmGraphEdge | undefined {
    if (event.edgeId) {
      const byId = graph.edges.find((e) => e.id === event.edgeId);
      if (byId) return byId;
    }
    if (event.fromNodeId && event.toNodeId) {
      return graph.edges.find((e) => e.source === event.fromNodeId && e.target === event.toNodeId);
    }
    return undefined;
  }

  function findCanvasEdge(graphEdge: SwarmGraphEdge, mapped: Map<string, string>, canvasEdges: FlowEdge[]) {
    const source = mapped.get(graphEdge.source);
    const target = mapped.get(graphEdge.target);
    if (!source || !target) return undefined;
    return canvasEdges.find((e) => e.source === source && e.target === target);
  }

  function pulseCanvasEdge(edge: FlowEdge | undefined, color: string) {
    if (!edge) return;
    const previous = edge.style;
    edge.animated = true;
    edge.style = { ...(previous || {}), stroke: color, strokeWidth: 3 };
    setTimeout(() => {
      edge.style = previous || { stroke: "#3ae0ff", strokeWidth: 2 };
    }, 900);
  }

  async function replayGraphOnCanvas(graph: SwarmGraph, nodes: FlowNode[], edges: FlowEdge[], content: string, token: number, opts: { onExperience?: (kind: "in" | "out", count: number, nodeId?: string) => void; inheritedCount: number } = { inheritedCount: 0 }) {
    const { order } = topoOrder(nodes, edges);
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const graphNodeMap = new Map<string, SwarmGraphNode>();
    for (const graphNode of graph.nodes) {
      graphNodeMap.set(graphNode.id, graphNode);
      graphNodeMap.set(graphNode.instanceId, graphNode);
    }
    const mapped = mapGraphNodesToCanvas(graph, nodes, order);
    const orderedEvents = [...graph.events].sort((a, b) => a.seq - b.seq);

    store.addLog(
      "EvoShip Graph",
      `${graph.difficulty} · ${graph.nodes.length} nodes · ${graph.edges.length} edges · ${graph.lanes?.length || 0} lanes`,
    );

    if (!orderedEvents.length) {
      const first = graph.nodes[0];
      const canvasId = first ? mapped.get(first.id) : undefined;
      const node = canvasId ? nodeMap.get(canvasId) : undefined;
      if (node) {
        store.setBubble(node.id, shortSpeech(content || "蜂群返回了最终答案。"), "active");
        await sleep(1000);
        store.clearBubble(node.id);
      }
      return;
    }

    for (const event of orderedEvents) {
      if (token !== runToken || !store.running) return;

      const graphNodeId = event.nodeId || event.instanceId;
      const canvasId = graphNodeId ? mapped.get(graphNodeId) : undefined;
      const canvasNode = canvasId ? nodeMap.get(canvasId) : undefined;
      const graphNode = graphNodeId ? graphNodeMap.get(graphNodeId) : undefined;
      const fallback = EVENT_KIND_LABEL[event.kind] || event.kind;

      if (event.kind === "agent_start" && canvasNode) {
        const text = graphEventText(event, `${graphNode?.label || event.agent || "Agent"} 开始执行`);
        store.setBubble(canvasNode.id, text, "active");
        store.addLog(graphNode ? graphNodeName(graphNode) : nodeName(canvasNode), text);
        await sleep(700);
        continue;
      }

      if ((event.kind === "agent_result" || event.kind === "review_verdict") && canvasNode) {
        const rejected = event.verdict === "REJECT" || event.status === "rejected";
        const text = graphEventText(event, fallback);
        store.setBubble(canvasNode.id, text, rejected ? "error" : event.kind === "review_verdict" ? "breakthrough" : "active");
        store.addLog(graphNode ? graphNodeName(graphNode) : nodeName(canvasNode), text);

        const petId = (canvasNode.data as { petId?: string })?.petId || "claude";
        const meta = PET_BY_ID[petId];
        if (meta?.voice && !rejected) playVoice(meta.voice);
        await sleep(event.kind === "review_verdict" ? 900 : 1000);
        store.clearBubble(canvasNode.id);
        continue;
      }

      const graphEdge = findGraphEdgeForEvent(graph, event);
      if (graphEdge) {
        const sourceId = mapped.get(graphEdge.source);
        const targetId = mapped.get(graphEdge.target);
        const source = sourceId ? nodeMap.get(sourceId) : undefined;
        const target = targetId ? nodeMap.get(targetId) : undefined;
        const color = EDGE_COLOR[graphEdge.kind] || "#3ae0ff";
        const kind: Particle["kind"] = graphEdge.kind === "broadcast" || graphEdge.kind === "inherit" || graphEdge.kind === "backflow"
          ? "broadcast"
          : "msg";
        pulseCanvasEdge(findCanvasEdge(graphEdge, mapped, edges), color);
        if (source && target) {
          spawnParticle(source, target, kind, color);
          const text = graphEventText(event, graphEdge.label || graphEdge.kind);
          const status = eventBubbleStatus(graphEdge.kind, event);
          store.setBubble(source.id, text, status);
          store.setBubble(target.id, receiveText(graphEdge.kind, event), status);
          store.addLog(`${nodeName(source)} → ${nodeName(target)}`, text);
        } else {
          store.addLog("EvoShip Graph", graphEventText(event, graphEdge.label || graphEdge.kind));
        }
        // 经验宝箱金币动效:backflow(agent→宝箱,飞入)/inherit(宝箱→agent,飞出)
        if (opts.onExperience) {
          if (graphEdge.kind === "backflow") {
            opts.onExperience("in", 1, sourceId);
          } else if (graphEdge.kind === "inherit") {
            opts.onExperience("out", Math.max(1, opts.inheritedCount), targetId);
          }
        }
        await sleep(kind === "broadcast" ? 1050 : 900);
        if (source) store.clearBubble(source.id);
        if (target) store.clearBubble(target.id);
        continue;
      }

      if (canvasNode) {
        const text = graphEventText(event, fallback);
        store.setBubble(canvasNode.id, text, "active");
        store.addLog(graphNode ? graphNodeName(graphNode) : nodeName(canvasNode), text);
        await sleep(700);
        store.clearBubble(canvasNode.id);
      } else {
        store.addLog("EvoShip Graph", graphEventText(event, fallback));
        await sleep(260);
      }
    }
  }

  function mapTraceToNodes(bees: SwarmBee[], nodes: FlowNode[], order: string[]): Array<{ bee: SwarmBee; nodeId: string }> {
    const orderedNodes = order.map((id) => nodes.find((n) => n.id === id)).filter(Boolean) as FlowNode[];
    const rolePools = new Map<Role, string[]>();
    for (const role of ROLES) rolePools.set(role, []);
    for (const node of orderedNodes) {
      const role = normalizeRole((node.data as { role?: string })?.role);
      if (role) rolePools.get(role)!.push(node.id);
    }

    const roleCursor = new Map<Role, number>();
    let fallbackCursor = 0;
    return bees.map((bee) => {
      const role = normalizeRole(bee.variant);
      const candidates = role ? rolePools.get(role) || [] : [];
      if (candidates.length > 0) {
        const cursor = roleCursor.get(role!) || 0;
        roleCursor.set(role!, cursor + 1);
        return { bee, nodeId: candidates[cursor % candidates.length] };
      }
      const fallback = orderedNodes[fallbackCursor % Math.max(orderedNodes.length, 1)];
      fallbackCursor += 1;
      return { bee, nodeId: fallback?.id || nodes[0]?.id || "" };
    });
  }

  function fallbackBees(content: string, nodes: FlowNode[], order: string[]): SwarmBee[] {
    const summary = shortSpeech(content || "蜂群返回了最终答案。");
    const roles = order
      .map((id) => nodes.find((n) => n.id === id))
      .filter(Boolean)
      .map((n) => normalizeRole(((n as FlowNode).data as { role?: string })?.role) || "planner");
    return roles.slice(0, Math.max(1, roles.length)).map((role, i) => ({
      id: `fallback-${i + 1}`,
      variant: role,
      status: "ran",
      latency_ms: 0,
      snippet: i === roles.length - 1 ? summary : "接收上下文并推进当前编队步骤。",
    }));
  }

  async function replayTraceOnCanvas(trace: SwarmTrace | null, nodes: FlowNode[], edges: FlowEdge[], content: string, token: number, opts: { onExperience?: (kind: "in" | "out", count: number, nodeId?: string) => void } = {}) {
    if (trace?.graph?.nodes?.length && trace.graph.events?.length) {
      await replayGraphOnCanvas(trace.graph, nodes, edges, content, token, {
        onExperience: opts.onExperience,
        inheritedCount: trace?.inherited_recipes?.length || 0,
      });
      return;
    }

    const { order, hasCycle } = topoOrder(nodes, edges);
    if (hasCycle) {
      store.setError("检测到回环,本次按节点添加顺序回放。");
      store.playbackStatus = "replaying";
    }

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const outEdges = (id: string) => edges.filter((e) => e.source === id);
    const bees = trace?.bees?.length ? trace.bees : fallbackBees(content, nodes, order);
    const events = mapTraceToNodes(bees, nodes, order).filter((e) => e.nodeId);
    const broadcastBudget = trace?.breakthroughs_broadcast || 0;

    for (let i = 0; i < events.length; i++) {
      if (token !== runToken || !store.running) return;
      const current = events[i];
      const node = nodeMap.get(current.nodeId);
      if (!node) continue;

      const petId = (node.data as { petId?: string })?.petId || "claude";
      const meta = PET_BY_ID[petId];
      const timedOut = current.bee.status === "timed_out";
      const shouldBroadcast = current.bee.status === "breakthrough" || i < broadcastBudget;
      const bubble = timedOut ? "这一步超时,跳过。" : shortSpeech(current.bee.snippet || "完成当前协作步骤。");

      store.setBubble(node.id, bubble, timedOut ? "error" : shouldBroadcast ? "breakthrough" : "active");
      const phase = current.bee.phase ? PHASE_LABEL[current.bee.phase] || current.bee.phase : current.bee.variant;
      store.addLog(`${nodeName(node)} · ${phase}`, bubble);
      if (meta?.voice && !timedOut) playVoice(meta.voice);
      await sleep(1100);

      if (token !== runToken || !store.running) return;

      if (shouldBroadcast) {
        for (const otherId of order) {
          if (otherId === node.id) continue;
          const other = nodeMap.get(otherId);
          if (!other) continue;
          spawnParticle(node, other, "broadcast");
          store.setBubble(other.id, "收到突破提示", "breakthrough");
        }
        await sleep(700);
        for (const otherId of order) {
          if (otherId !== node.id) store.clearBubble(otherId);
        }
      }

      const nextNodeId = events[i + 1]?.nodeId;
      const direct = nextNodeId ? edges.find((e) => e.source === node.id && e.target === nextNodeId) : undefined;
      if (direct && nextNodeId) {
        const target = nodeMap.get(nextNodeId);
        if (target) spawnParticle(node, target, "msg");
      } else {
        const outs = outEdges(node.id);
        if (outs.length > 0) {
          for (const e of outs) {
            const target = nodeMap.get(e.target);
            if (target) spawnParticle(node, target, "msg");
          }
        } else if (nextNodeId) {
          const target = nodeMap.get(nextNodeId);
          if (target) spawnParticle(node, target, "msg");
        }
      }
      await sleep(650);
      store.clearBubble(node.id);
    }
  }

  async function run(nodes: FlowNode[], edges: FlowEdge[], params: RunParams) {
    if (store.running) return;
    if (nodes.length === 0) return;
    const token = ++runToken;
    store.resetRunState();
    particles.value = [];
    store.running = true;
    store.playbackStatus = "calling";

    try {
      const result = await runSwarm({
        goal: params.goal,
        tier: params.tier,
        apiKey: params.apiKey,
        topology: params.topology,
        demo: params.demo,
      });
      if (token !== runToken || !store.running) return;

      // Demo 演示不扣积分;普通真实调用在返回 200 前已完成扣费。
      if (!params.demo) params.onCreditsDeducted?.();

      store.setFinalAnswer(result.content);
      store.setTrace(result.trace);
      let canvasNodes = nodes;
      let canvasEdges = edges;
      if (result.trace?.graph && params.syncGraphCanvas) {
        const synced = params.syncGraphCanvas(result.trace.graph);
        if (synced) {
          canvasNodes = synced.nodes;
          canvasEdges = synced.edges;
        }
      }

      store.playbackStatus = "replaying";
      const actual = result.trace?.policy
        ? `${result.trace.policy.difficulty} / ${result.trace.policy.createSession ? "A2A session" : "local side-effects"}`
        : result.trace?.difficulty || params.tier;
      const graphSize = result.trace?.graph
        ? `${result.trace.graph.nodes.length} nodes/${result.trace.graph.edges.length} edges`
        : `${result.trace?.bees?.length || 0} bees`;
      store.addLog("SwarmPay", `${params.demo ? "预制演示" : "真实蜂群"}返回 ${graphSize},实际策略:${actual}。`);
      await replayTraceOnCanvas(result.trace, canvasNodes, canvasEdges, result.content, token, { onExperience: params.onExperience });

      if (token !== runToken || !store.running) return;
      store.backflowMsg = result.trace?.evomap_backflow?.status === "published"
        ? "已回流 Gene+Capsule 到 EvoMap"
        : result.trace?.evomap_backflow?.status === "queued"
          ? "成功路径已进入 EvoMap 回流队列"
          : params.demo ? "预制 Evo 蜂群演示回放完成" : "真实蜂群协作回放完成";
      store.playbackStatus = "done";

      // 链上分润:回放结束后,若有 payment.splits,写 nodeChainState + 触发金色流向 overlay
      // 用 trace.graph.nodes 的 archetype 建立可靠映射(节点 id=pet-N 不含 archetype,data.role 是 petId)
      const graph = result.trace?.graph;
      if (graph?.nodes?.length) {
        // archetype → canvasNodeId(取该 archetype 在画布上的第一个节点)
        const archToCanvas = new Map<string, string>();
        for (const gn of graph.nodes) {
          if (gn.archetype && !archToCanvas.has(gn.archetype)) {
            // graphNode.id/instanceId → canvasId(复用 mapGraphNodesToCanvas 的 direct 逻辑)
            const direct = canvasNodes.find((n: any) => (n.data as any)?.graphNodeId === gn.id || (n.data as any)?.graphNodeId === gn.instanceId);
            if (direct) archToCanvas.set(gn.archetype, direct.id);
          }
        }
        // 兜底:按 role 池分配(graphNode.archetype 对应 canvas node 的 data.role)
        if (archToCanvas.size === 0) {
          for (const gn of graph.nodes) {
            const c = canvasNodes.find((n: any) => (n.data as any)?.role === gn.archetype);
            if (c && gn.archetype) { archToCanvas.set(gn.archetype, c.id); break; }
          }
        }

        // 写链上态:地址 + 本次赚的(从 payment.splits)
        const splitByArch = new Map<string, { addr: string; amount: string; weight: number }>();
        for (const s of result.payment?.splits || []) splitByArch.set(s.archetype, s);

        for (const gn of graph.nodes) {
          const canvasId = archToCanvas.get(gn.archetype);
          if (!canvasId) continue;
          const split = splitByArch.get(gn.archetype);
          if (split) {
            store.setNodeChainState?.(canvasId, { addr: split.addr, earnedInj: split.amount });
          }
        }
      }
      if (result.payment?.splits?.length) {
        params.onRewardDistributed?.(result.payment);
      }
      // 深度3:若有悬赏,触发 bounty 动效
      const traceBounties = (result.trace as { bounties?: { fromArch: string; toArch: string; amountSmallest: string; reason: string; status?: string }[] }).bounties;
      if (traceBounties?.length) {
        params.onBounty?.(traceBounties);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      store.setError(msg.includes("aborted") ? "后端调用被中断,可改用 swarm-lite 后重试。" : msg);
    } finally {
      if (token === runToken) store.running = false;
    }
  }

  function stop() {
    runToken += 1;
    store.running = false;
    store.resetAll();
    store.playbackStatus = "idle";
    particles.value = [];
  }

  return { run, stop, particles, running, topoOrder };
}
