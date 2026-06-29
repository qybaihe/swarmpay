<script setup lang="ts">
import { ref, markRaw, onMounted, computed, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { VueFlow, useVueFlow } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import { MiniMap } from "@vue-flow/minimap";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import "@vue-flow/minimap/dist/style.css";

import Sidebar from "../components/playground/Sidebar.vue";
import PetNode, { type PetNodeData } from "../components/playground/PetNode.vue";
import ExperienceTreasure from "../components/playground/ExperienceTreasure.vue";
import RewardFlowOverlay from "../components/playground/RewardFlowOverlay.vue";
import FleetPicker from "../components/FleetPicker.vue";
import { PET_BY_ID } from "../constants/pets";
import { usePlaygroundStore } from "../stores/playground";
import { useAuthStore } from "../stores/auth";
import { useTransformStore } from "../stores/transform";
import { useFleetsStore } from "../stores/fleets";
import { useInjectiveStore } from "../stores/injective";
import { useFlowRunner, type Particle } from "../composables/useFlowRunner";
import { useToast } from "../composables/useToast";
import type { PlaygroundTopology, SwarmGraph, SwarmGraphArchetype, SwarmGraphEdge, SwarmGraphEvent, SwarmGraphNode } from "../api/swarm";
import type { SelectedFleet } from "../types/fleet-picker";

const store = usePlaygroundStore();
const auth = useAuthStore();
const transformStore = useTransformStore();
const inj = useInjectiveStore();
const fleetsStore = useFleetsStore();
const toast = useToast();
const router = useRouter();
const { run, stop, particles, running } = useFlowRunner();
const canvasFocus = computed(() => store.playbackStatus === "calling" || store.playbackStatus === "replaying");

// 舰队选择器(FleetPicker)选中项 + 组件实例引用
const selectedFleetId = ref("");
const selectedFleet = ref<SelectedFleet | null>(null);
const fleetPickerRef = ref<InstanceType<typeof FleetPicker> | null>(null);

// 用 untyped 数组避开 vue-flow Node/Edge 泛型的深层类型实例化(TS2589)
// vue-flow 的 v-model 在运行时接受普通对象
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodes = ref<any[]>([]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const edges = ref<any[]>([]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { project, vueFlowRef, fitView } = useVueFlow() as any;

// 拖拽:从 sidebar 拖入
let nodeSeq = 0;
function onDrop(e: DragEvent) {
  e.preventDefault();
  const petId = e.dataTransfer?.getData("application/pet");
  if (!petId || !PET_BY_ID[petId]) return;
  const meta = PET_BY_ID[petId];
  const rect = vueFlowRef.value?.getBoundingClientRect();
  if (!rect) return;
  const position = project({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  nodeSeq++;
  const nodeId = `pet-${nodeSeq}`;
  const data: PetNodeData = { petId, role: meta.role };
  store.mode = "custom";
  nodes.value = [
    ...nodes.value,
    {
      id: nodeId,
      type: "pet",
      position,
      data: markRaw(data),
    },
  ];
  // 登场动画:播语音 + 闪光态 + 台词气泡(iOS app 风格)
  triggerEntrance(nodeId, meta);
}

function triggerEntrance(nodeId: string, meta: { voice?: string; catchphrase: string; name: string }) {
  store.entrance(nodeId, meta.catchphrase);
  store.addLog(meta.name, meta.catchphrase);
  // 播登场语音
  if (meta.voice) {
    try {
      const a = new Audio(`/assets/audio/${meta.voice}`);
      a.volume = 0.6;
      a.play().catch(() => { /* 自动播放策略 */ });
    } catch { /* ignore */ }
  }
  // 2.4 秒后退出登场态(语音通常 ~2s,留点尾巴)
  setTimeout(() => {
    if (store.nodeState[nodeId]?.status === "entrancing") {
      store.clearBubble(nodeId);
    }
  }, 2400);
}

/** 点击节点卡片:重新触发登场动画(闪光+语音+台词) */
function onNodeClick(nodeId: string) {
  const n = nodes.value.find((x: { id: string }) => x.id === nodeId);
  if (!n) return;
  const data = n.data as PetNodeData;
  const m = PET_BY_ID[data.petId];
  if (m) triggerEntrance(nodeId, m);
}
function onDragOver(e: DragEvent) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
}

// 连线
function onConnect(conn: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) {
  store.mode = "custom";
  edges.value = [
    ...edges.value,
    { id: `e-${Date.now()}`, ...conn, animated: true, style: { stroke: "#3ae0ff", strokeWidth: 2 } },
  ];
}

// 节点 role 切换:PetNode 通过 store.setNodeRole 触发,回写 node.data
function setRole(nodeId: string, role: string) {
  const n = nodes.value.find((x: { id: string }) => x.id === nodeId);
  if (n) (n.data as PetNodeData).role = role;
}
store.setNodeRole = setRole;

const goal = ref("做一个带邮箱和密码校验、含错误提示和加载态的完整登录页应用");
const playgroundApiKey = ref(transformStore.lastApiKey || transformStore.lastResult?.api_key || "");
const tiers = [
  {
    value: "swarm-baseline",
    label: "baseline",
    difficulty: "SIMPLE",
    title: "单舰基线",
    desc: "直通单模型,不创建蜂群协作。用于和真实蜂群做对照。",
    chips: ["SIMPLE preview", "1 node", "no handoff", "no backflow"],
  },
  {
    value: "swarm-lite",
    label: "lite",
    difficulty: "MEDIUM",
    title: "轻量巡逻",
    desc: "短链路蜂群。MEDIUM 走少量 solver 交叉验证,HARD 限制子任务和返工。",
    chips: ["MEDIUM preview", "5 nodes", "2 solvers", "1 revision"],
  },
  {
    value: "swarm-heavy",
    label: "heavy",
    difficulty: "HARD",
    title: "异构突击",
    desc: "真实 A2A session + planner/coder/reviewer 流水线 + verifier 纠错 + 突破广播。",
    chips: ["HARD preview", "14 nodes", "parallel lanes", "review loop"],
  },
  {
    value: "swarm-evo",
    label: "evo",
    difficulty: "HARD",
    title: "进化旗舰",
    desc: "heavy 机构上叠加 EvoMap 经验继承与成功路径回流,只在 HARD 任务触发。",
    chips: ["HARD preview", "14 nodes", "inherit", "backflow"],
  },
];

const selectedTier = computed(() => tiers.find((t) => t.value === store.tier) || tiers[3]);
const endpointLabel = computed(() => {
  if (selectedFleet.value?.source === "endpoint") return selectedFleet.value.label;
  return playgroundApiKey.value ? "我的 API Key" : "默认服务端模型";
});
const actualPolicy = computed(() => store.lastTrace?.policy || null);
const traceStats = computed(() => {
  const trace = store.lastTrace;
  if (!trace) return null;
  const graph = trace.graph;
  if (graph) {
    return [
      `实际:${graph.difficulty}`,
      `节点:${graph.nodes.length}`,
      `边:${graph.edges.length}`,
      `lane:${graph.lanes?.length || 0}`,
      `耗时:${Math.round((graph.metrics?.totalLatencyMs || trace.total_latency_ms || 0) / 1000)}s`,
    ];
  }
  return [
    `实际:${trace.difficulty || "unknown"}`,
    `蜂数:${trace.swarm_size}`,
    `聚合:${trace.aggregator}`,
    `耗时:${Math.round((trace.total_latency_ms || 0) / 1000)}s`,
  ];
});
const policyChips = computed(() => {
  const p = actualPolicy.value;
  if (!p) return selectedTier.value.chips;
  return [
    p.createSession ? "A2A session:on" : "A2A session:off",
    p.useInheritance ? "inherit:on" : "inherit:off",
    p.publishBackflow ? "backflow:on" : "backflow:off",
    `solvers:${p.mediumSolverCount}`,
    `subtasks:${p.hardMaxSubtasks}`,
    `rev:${p.maxRevisionRounds}`,
  ];
});
const visibleTraceBees = computed(() => (store.lastTrace?.bees || []).slice(0, 8));
const graphLanes = computed(() => store.lastTrace?.graph?.lanes || []);
const graphMetrics = computed(() => store.lastTrace?.graph?.metrics || null);
const evolutionTimeline = computed(() => store.evolutionHistory);
const latestEvolutionRun = computed(() => evolutionTimeline.value[evolutionTimeline.value.length - 1] || null);
const purificationChain = computed(() => {
  const trace = store.lastTrace;
  const events = trace?.graph?.events || [];
  const edges = trace?.graph?.edges || [];
  const nodeById = new Map<string, SwarmGraphNode>();
  for (const node of trace?.graph?.nodes || []) {
    nodeById.set(node.id, node);
    nodeById.set(node.instanceId, node);
  }
  const items: { id: string; kind: string; label: string; title: string; detail: string }[] = [];
  const pushEvent = (event: typeof events[number], kind: string, label: string, fallback: string) => {
    const node = event.nodeId || event.instanceId ? nodeById.get(event.nodeId || event.instanceId || "") : null;
    items.push({
      id: event.id,
      kind,
      label,
      title: node?.label || event.agent || fallback,
      detail: event.text || event.status || event.verdict || fallback,
    });
  };

  const rejected = events.find((event) => event.kind === "review_verdict" && event.verdict === "REJECT");
  if (rejected) pushEvent(rejected, "reject", "REJECT", "退回返工");

  const revision = events.find((event) => event.kind === "revision")
    || events.find((event) => event.revisionRound && event.kind === "handoff");
  if (revision) {
    pushEvent(revision, "feedback", `feedback R${revision.revisionRound || 1}`, "返工反馈");
  } else {
    const feedbackEdge = edges.find((edge) => edge.kind === "feedback");
    if (feedbackEdge) {
      items.push({
        id: feedbackEdge.id,
        kind: "feedback",
        label: `feedback R${feedbackEdge.revisionRound || 1}`,
        title: "Reviewer → Coder",
        detail: feedbackEdge.snippet || feedbackEdge.label || "反馈已回传并触发修订",
      });
    }
  }

  const approved = [...events].reverse().find((event) => event.kind === "review_verdict" && event.verdict === "APPROVE");
  if (approved) pushEvent(approved, "approve", "APPROVE", "审查通过");

  const deposited = trace?.evolution?.deposited;
  if (deposited) {
    items.push({
      id: `deposit-${deposited.generation}`,
      kind: "deposit",
      label: `G${deposited.generation}`,
      title: `q=${deposited.qualityScore}`,
      detail: `streak ${deposited.successStreak} · ${deposited.title}`,
    });
  }

  return items;
});
const evoEvidence = computed(() => {
  const trace = store.lastTrace;
  if (!trace) return [];
  const items: { id: string; kind: string; title: string; detail: string }[] = [];
  (trace.inherited_recipes || []).slice(0, 4).forEach((recipe, index) => {
    const meta = [
      recipe.source || "inherit",
      recipe.generation ? `G${recipe.generation}` : "",
      recipe.qualityScore ? `q=${recipe.qualityScore}` : "",
      recipe.reuseCount ? `reuse=${recipe.reuseCount}` : "",
    ].filter(Boolean).join(" · ");
    items.push({
      id: `recipe-${index}`,
      kind: "inherit",
      title: recipe.title || `经验 ${index + 1}`,
      detail: `${meta}${recipe.description ? " · " + recipe.description : ""}`,
    });
  });
  if (trace.evolution?.deposited) {
    items.push({
      id: "local-deposit",
      kind: "backflow",
      title: `本地进化 G${trace.evolution.deposited.generation}`,
      detail: `q=${trace.evolution.deposited.qualityScore} · streak=${trace.evolution.deposited.successStreak} · ${trace.evolution.deposited.title}`,
    });
  }
  for (const event of trace.graph?.events || []) {
    if (event.kind !== "inherit" && event.kind !== "backflow") continue;
    items.push({
      id: event.id,
      kind: event.kind,
      title: event.kind === "inherit" ? "经验继承" : "成功路径回流",
      detail: event.text || event.status || "",
    });
  }
  if (trace.evomap_backflow) {
    items.push({
      id: "backflow-status",
      kind: "backflow",
      title: `回流 ${trace.evomap_backflow.status}`,
      detail: trace.evomap_backflow.title || "Gene+Capsule bundle",
    });
  }
  return items.slice(0, 8);
});
const experienceBoard = computed(() => {
  const trace = store.lastTrace;
  if (!trace) return null;
  const recipes = trace.inherited_recipes || [];
  const localCount = trace.evolution?.inheritedLocal ?? recipes.filter((recipe) => recipe.source === "local").length;
  const evomapCount = trace.evolution?.inheritedRemote ?? recipes.filter((recipe) => recipe.source !== "local").length;
  const deposited = trace.evolution?.deposited;
  const topQuality = Math.max(
    0,
    ...recipes.map((recipe) => recipe.qualityScore || 0),
    deposited?.qualityScore || 0,
    trace.evomap_backflow?.qualityScore || 0,
  );
  const items = recipes.slice(0, 6).map((recipe, index) => {
    const isLocal = recipe.source === "local";
    const source = isLocal ? "local" : "EvoMap";
    const meta = [
      recipe.generation ? `G${recipe.generation}` : "",
      typeof recipe.qualityScore === "number" ? `q=${recipe.qualityScore}` : "",
      recipe.reuseCount ? `reuse=${recipe.reuseCount}` : "",
      typeof recipe.matchScore === "number" ? `match=${Math.round(recipe.matchScore * 100)}%` : "",
    ].filter(Boolean).join(" · ");
    return {
      id: `${source}-${recipe.memoryId || index}`,
      source,
      title: recipe.title || `经验 ${index + 1}`,
      meta: meta || "pending score",
      detail: recipe.description || (isLocal ? "本地成功路径复用" : "EvoMap capsule 命中"),
    };
  });
  return {
    localCount,
    evomapCount,
    total: recipes.length,
    depositedGeneration: deposited?.generation ?? trace.evomap_backflow?.generation,
    depositedQuality: deposited?.qualityScore ?? trace.evomap_backflow?.qualityScore,
    successStreak: deposited?.successStreak,
    topQuality,
    backflowStatus: trace.evomap_backflow?.status || "local-only",
    items,
  };
});

const ARCHETYPE_LABEL: Record<SwarmGraphArchetype, string> = {
  orchestrator: "旗舰",
  planner: "导航舰",
  coder: "工程舰",
  reviewer: "监察舰",
  explorer: "斥候舰",
  evomap: "EvoMap",
  system: "System",
};
const AUDIT_KIND_LABEL: Record<SwarmGraphEvent["kind"], string> = {
  classify: "难度判定",
  policy: "执行策略",
  inherit: "经验继承",
  decompose: "任务拆解",
  agent_start: "模型调用",
  agent_result: "模型返回",
  handoff: "上下文交接",
  broadcast: "突破广播",
  review_verdict: "审查裁决",
  revision: "返工交接",
  report: "结果汇报",
  aggregate: "聚合输入",
  backflow: "经验回流",
};
const AUDIT_EDGE_LABEL: Record<SwarmGraphEdge["kind"], string> = {
  dispatch: "dispatch",
  handoff: "handoff",
  feedback: "feedback",
  report: "report",
  broadcast: "broadcast",
  aggregate: "aggregate",
  inherit: "inherit",
  backflow: "backflow",
};

interface AuditStep {
  id: string;
  seq: number;
  title: string;
  kindClass: string;
  actor: string;
  receiver: string;
  route: string;
  brief: string;
  payloadLabel: string;
  payload: string;
  receiverPayload: string;
  transferText: string;
  meta: string[];
}

const selectedAuditStepId = ref("");

function compactText(text: string, max = 150) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "(无文本载荷)";
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function nodeAuditName(node?: SwarmGraphNode) {
  if (!node) return "";
  const role = ARCHETYPE_LABEL[node.archetype] || node.archetype;
  return node.label ? `${node.label} · ${role}` : role;
}

function auditPayload(event: SwarmGraphEvent, edge?: SwarmGraphEdge) {
  const full = event.fullContent || event.text || edge?.snippet || "";
  if (full.trim()) return full.trim();
  return [event.verdict, event.status, event.phase].filter(Boolean).join(" · ") || "(无文本载荷)";
}

function auditPayloadLabel(event: SwarmGraphEvent, edge?: SwarmGraphEdge) {
  if (event.kind === "agent_start") return "调用入口";
  if (event.kind === "agent_result") return "完整返回";
  if (event.kind === "decompose") return "拆解结果";
  if (event.kind === "review_verdict") return "审查输出";
  if (event.kind === "revision") return "返工反馈";
  if (event.kind === "handoff") return "交接上下文";
  if (edge?.kind === "aggregate") return "聚合输入";
  if (edge?.kind === "report") return "汇报内容";
  return "事件内容";
}

function auditTransferText(event: SwarmGraphEvent, edge?: SwarmGraphEdge) {
  const channel = edge ? AUDIT_EDGE_LABEL[edge.kind] : event.kind;
  const status = event.verdict || event.status || edge?.status || "recorded";
  const round = event.revisionRound ? ` · revision R${event.revisionRound}` : "";
  return `${channel} · ${status}${round}`;
}

const auditSteps = computed<AuditStep[]>(() => {
  const graph = store.lastTrace?.graph;
  if (!graph?.events?.length) return [];
  const nodeById = new Map<string, SwarmGraphNode>();
  for (const node of graph.nodes) {
    nodeById.set(node.id, node);
    nodeById.set(node.instanceId, node);
  }
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  return [...graph.events].sort((a, b) => a.seq - b.seq).map((event) => {
    const edge = event.edgeId
      ? edgeById.get(event.edgeId)
      : event.fromNodeId && event.toNodeId
        ? graph.edges.find((item) => item.source === event.fromNodeId && item.target === event.toNodeId)
        : undefined;
    const node = event.nodeId || event.instanceId ? nodeById.get(event.nodeId || event.instanceId || "") : undefined;
    const source = edge ? nodeById.get(edge.source) : event.fromNodeId ? nodeById.get(event.fromNodeId) : undefined;
    const target = edge ? nodeById.get(edge.target) : event.toNodeId ? nodeById.get(event.toNodeId) : undefined;
    const actor = nodeAuditName(source || node) || event.agent || "SwarmPay";
    const receiver = nodeAuditName(target) || (
      event.kind === "agent_start" ? "模型运行时" :
        event.kind === "agent_result" ? "trace 输出" :
          event.kind === "classify" ? "策略路由" :
            event.kind === "policy" ? "执行器" : ""
    );
    const payload = auditPayload(event, edge);
    const meta = [
      event.taskId ? `task ${event.taskId}` : "",
      event.laneId ? `lane ${event.laneId}` : "",
      event.phase ? `phase ${event.phase}` : "",
      typeof event.latencyMs === "number" ? `${event.latencyMs}ms` : "",
    ].filter(Boolean);
    return {
      id: event.id,
      seq: event.seq,
      title: `${AUDIT_KIND_LABEL[event.kind] || event.kind}${event.revisionRound ? ` R${event.revisionRound}` : ""}`,
      kindClass: edge?.kind || event.kind,
      actor,
      receiver,
      route: receiver ? `${actor} -> ${receiver}` : actor,
      brief: compactText(payload || event.text || edge?.snippet || "", 120),
      payloadLabel: auditPayloadLabel(event, edge),
      payload,
      receiverPayload: event.receiverContent?.trim() || auditTransferText(event, edge),
      transferText: auditTransferText(event, edge),
      meta,
    };
  });
});
const selectedAuditStep = computed(() => auditSteps.value.find((item) => item.id === selectedAuditStepId.value) || auditSteps.value[0] || null);
const auditSummary = computed(() => {
  const graph = store.lastTrace?.graph;
  if (!graph) return "";
  const m = graph.metrics;
  return [
    graph.tier,
    graph.difficulty,
    m ? `${m.handoffs} handoffs` : "",
    m ? `${m.revisions} revisions` : "",
    m ? `${m.broadcasts} broadcasts` : "",
  ].filter(Boolean).join(" · ");
});

function formatClock(ts: number) {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function generationText(run: typeof store.evolutionHistory[number]) {
  return run.depositedGeneration ? `G${run.depositedGeneration}` : "G-";
}

function qualityText(run: typeof store.evolutionHistory[number]) {
  return typeof run.depositedQuality === "number" ? `q=${run.depositedQuality}` : "q=-";
}

function qualityDeltaText(run: typeof store.evolutionHistory[number]) {
  if (typeof run.qualityDelta !== "number") return "new";
  return run.qualityDelta > 0 ? `+${run.qualityDelta.toFixed(3)}` : run.qualityDelta.toFixed(3);
}

function inheritText(run: typeof store.evolutionHistory[number]) {
  if (!run.inheritedTotal && !run.inheritedLocal && !run.inheritedRemote) return "冷启动:未命中经验";
  return `继承 local ${run.inheritedLocal} / EvoMap ${run.inheritedRemote}`;
}

function recipeMeta(run: typeof store.evolutionHistory[number]) {
  const parts = [
    run.topRecipeSource === "none" ? "" : run.topRecipeSource,
    run.topRecipeGeneration ? `G${run.topRecipeGeneration}` : "",
    typeof run.topRecipeQuality === "number" ? `q=${run.topRecipeQuality}` : "",
    run.topRecipeReuse ? `reuse=${run.topRecipeReuse}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "no reusable recipe";
}
const visibleTraceItems = computed(() => {
  const graph = store.lastTrace?.graph;
  if (graph?.events?.length) {
    const nodeById = new Map<string, SwarmGraphNode>();
    for (const node of graph.nodes) {
      nodeById.set(node.id, node);
      nodeById.set(node.instanceId, node);
    }
    return graph.events.slice(0, 8).map((event) => {
      const node = event.nodeId || event.instanceId ? nodeById.get(event.nodeId || event.instanceId || "") : null;
      return {
        id: event.id,
        phase: event.kind,
        actor: node?.label || event.agent || event.phase || "graph",
        status: event.verdict || event.status || event.laneId || "",
      };
    });
  }
  return visibleTraceBees.value.map((bee) => ({
    id: bee.id,
    phase: bee.phase || bee.variant,
    actor: bee.variant,
    status: bee.status,
  }));
});

const ROLE_TO_DEFAULT_PET: Record<string, string> = {
  orchestrator: "claude",
  planner: "doubao",
  coder: "musk",
  reviewer: "conan",
  explorer: "einstein",
  evomap: "sam-altman",
  system: "claude",
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
const GRAPH_EDGE_KINDS = new Set(["dispatch", "handoff", "feedback", "report", "aggregate", "broadcast"]);
type PresetRole = Exclude<SwarmGraphArchetype, "evomap" | "system">;
type PresetDifficulty = "SIMPLE" | "MEDIUM" | "HARD";

interface PresetNodeSpec {
  id: string;
  petId: string;
  role: PresetRole;
  label: string;
  x: number;
  y: number;
  laneId?: string;
}

interface PresetEdgeSpec {
  id: string;
  source: string;
  target: string;
  kind: SwarmGraphEdge["kind"];
  label?: string;
}

function presetDifficultyForTier(tier: string): PresetDifficulty {
  if (tier === "swarm-baseline") return "SIMPLE";
  if (tier === "swarm-lite") return "MEDIUM";
  return "HARD";
}

function makePetNode(id: string, petId: string, role: string, x: number, y: number, extra: Partial<PetNodeData> = {}) {
  nodeSeq++;
  // 按 role(archetype) 写入链上地址到 nodeChainState(节点一创建就带链上身份)
  const addr = inj.archetypeAddrs[role];
  if (addr) store.setNodeChainState(id, { addr });
  return {
    id,
    type: "pet",
    position: { x, y },
    data: markRaw({ petId, role, ...extra } satisfies PetNodeData),
  };
}
function makePresetEdge(edge: PresetEdgeSpec) {
  const color = EDGE_COLOR[edge.kind] || "#3ae0ff";
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: true,
    label: edge.label || edge.kind,
    data: { kind: edge.kind },
    style: { stroke: color, strokeWidth: edge.kind === "report" ? 2.4 : 2 },
    labelStyle: { fill: color, fontWeight: 700, fontSize: 10 },
    labelBgStyle: { fill: "rgba(4, 5, 13, 0.86)" },
  };
}

function applyPresetFleet(nodeSpecs: PresetNodeSpec[], edgeSpecs: PresetEdgeSpec[]) {
  nodes.value = nodeSpecs.map((node) => makePetNode(
    node.id,
    node.petId,
    node.role,
    node.x,
    node.y,
    {
      label: node.label,
      laneId: node.laneId,
      graphNodeId: node.id,
      instanceId: node.id,
    },
  ));
  edges.value = edgeSpecs.map(makePresetEdge);
  setTimeout(() => fitView?.({ padding: 0.2, duration: 350 }), 40);
}

function loadBaselinePresetFleet() {
  applyPresetFleet([
    {
      id: "preset-baseline-orchestrator",
      petId: "claude",
      role: "orchestrator",
      label: "Orchestrator",
      x: 420,
      y: 170,
    },
  ], []);
}

function loadLitePresetFleet() {
  const specs: PresetNodeSpec[] = [
    { id: "preset-lite-orchestrator", petId: "claude", role: "orchestrator", label: "Dispatch", x: 80, y: 180 },
    { id: "preset-lite-planner", petId: "doubao", role: "planner", label: "Plan", x: 320, y: 80, laneId: "preset-lite-lane-plan" },
    { id: "preset-lite-coder", petId: "musk", role: "coder", label: "Build", x: 330, y: 280, laneId: "preset-lite-lane-build" },
    { id: "preset-lite-reviewer", petId: "conan", role: "reviewer", label: "Verify", x: 590, y: 180 },
    { id: "preset-lite-aggregate", petId: "claude", role: "orchestrator", label: "Aggregate", x: 840, y: 188 },
  ];
  applyPresetFleet(specs, [
    { id: "preset-lite-e1", source: "preset-lite-orchestrator", target: "preset-lite-planner", kind: "dispatch" },
    { id: "preset-lite-e2", source: "preset-lite-orchestrator", target: "preset-lite-coder", kind: "dispatch" },
    { id: "preset-lite-e3", source: "preset-lite-planner", target: "preset-lite-reviewer", kind: "handoff" },
    { id: "preset-lite-e4", source: "preset-lite-coder", target: "preset-lite-reviewer", kind: "handoff" },
    { id: "preset-lite-e5", source: "preset-lite-reviewer", target: "preset-lite-aggregate", kind: "report", label: "review report" },
  ]);
}

function loadHardPresetFleet() {
  const dispatcher: PresetNodeSpec = {
    id: "preset-hard-orchestrator",
    petId: "claude",
    role: "orchestrator",
    label: "Dispatch",
    x: 58,
    y: 314,
  };
  const aggregator: PresetNodeSpec = {
    id: "preset-hard-aggregate",
    petId: "claude",
    role: "orchestrator",
    label: "Aggregate",
    x: 1090,
    y: 316,
  };
  const lanes = [
    {
      key: "inherit",
      title: "Inherit",
      pets: ["doubao", "musk", "conan"],
      prefixes: ["Plan", "Code", "Review"],
      points: [{ x: 304, y: 42 }, { x: 552, y: 88 }, { x: 828, y: 54 }],
    },
    {
      key: "split",
      title: "Split",
      pets: ["einstein", "musk", "conan"],
      prefixes: ["Explore", "Code", "Review"],
      points: [{ x: 248, y: 198 }, { x: 504, y: 160 }, { x: 778, y: 228 }],
    },
    {
      key: "solve",
      title: "Solve",
      pets: ["doubao", "sam-altman", "conan"],
      prefixes: ["Plan", "Synthesize", "Review"],
      points: [{ x: 318, y: 362 }, { x: 590, y: 418 }, { x: 846, y: 350 }],
    },
    {
      key: "verify",
      title: "Verify",
      pets: ["einstein", "musk", "conan"],
      prefixes: ["Explore", "Patch", "Review"],
      points: [{ x: 394, y: 548 }, { x: 660, y: 514 }, { x: 910, y: 558 }],
    },
  ];
  const roleColumns: { role: PresetRole }[] = [
    { role: "planner" },
    { role: "coder" },
    { role: "reviewer" },
  ];
  const specs: PresetNodeSpec[] = [dispatcher];
  const presetEdges: PresetEdgeSpec[] = [];

  lanes.forEach((lane, laneIndex) => {
    const laneId = `preset-hard-lane-${lane.key}`;
    const laneNodes = roleColumns.map((column, columnIndex) => {
      const id = `${laneId}-${column.role}`;
      const node: PresetNodeSpec = {
        id,
        petId: lane.pets[columnIndex],
        role: column.role,
        label: `${lane.prefixes[columnIndex]} ${laneIndex + 1}`,
        x: lane.points[columnIndex].x,
        y: lane.points[columnIndex].y,
        laneId,
      };
      specs.push(node);
      return node;
    });
    presetEdges.push(
      {
        id: `${laneId}-dispatch`,
        source: dispatcher.id,
        target: laneNodes[0].id,
        kind: "dispatch",
        label: lane.title,
      },
      {
        id: `${laneId}-plan-code`,
        source: laneNodes[0].id,
        target: laneNodes[1].id,
        kind: "handoff",
      },
      {
        id: `${laneId}-code-review`,
        source: laneNodes[1].id,
        target: laneNodes[2].id,
        kind: "handoff",
      },
      {
        id: `${laneId}-report`,
        source: laneNodes[2].id,
        target: aggregator.id,
        kind: "report",
        label: "report",
      },
    );
  });

  specs.push(aggregator);
  applyPresetFleet(specs, presetEdges);
}

function loadPresetFleetForTier(tier: string) {
  const difficulty = presetDifficultyForTier(tier);
  if (difficulty === "SIMPLE") {
    loadBaselinePresetFleet();
  } else if (difficulty === "MEDIUM") {
    loadLitePresetFleet();
  } else {
    loadHardPresetFleet();
  }
}

function sortGraphNodes(list: SwarmGraphNode[]) {
  return [...list].sort((a, b) => (a.createdAtSeq - b.createdAtSeq) || (a.order - b.order));
}

function graphNodePositionMap(graph: SwarmGraph) {
  const positions = new Map<string, { x: number; y: number }>();
  const ordered = sortGraphNodes(graph.nodes);

  if (graph.difficulty === "SIMPLE" || graph.nodes.length === 1) {
    const node = ordered[0];
    if (node) positions.set(node.id, { x: 390, y: 150 });
    return positions;
  }

  const lanes = graph.lanes?.filter((lane) => lane.nodeIds.length) || [];
  if (lanes.length) {
    const rowGap = lanes.length > 3 ? 148 : 176;
    const baseY = lanes.length > 3 ? 52 : 116;
    const laneCenterY = baseY + ((lanes.length - 1) * rowGap) / 2;
    const orchestrators = ordered.filter((node) => node.archetype === "orchestrator");
    const aggregateTargets = new Set(
      graph.edges
        .filter((edge) => edge.kind === "aggregate" || edge.kind === "report")
        .map((edge) => edge.target),
    );
    const dispatchSources = new Set(
      graph.edges
        .filter((edge) => edge.kind === "dispatch")
        .map((edge) => edge.source),
    );

    orchestrators.forEach((graphNode) => {
      if (aggregateTargets.has(graphNode.id) && !dispatchSources.has(graphNode.id)) {
        positions.set(graphNode.id, { x: 1040, y: laneCenterY + 12 });
      } else {
        positions.set(graphNode.id, { x: 64, y: laneCenterY });
      }
    });

    ordered
      .filter((node) => node.archetype === "evomap")
      .forEach((node, index) => {
        positions.set(node.id, { x: index % 2 === 0 ? 54 : 980, y: index % 2 === 0 ? 28 : 28 });
      });

    lanes.forEach((lane, laneIndex) => {
      const laneNodes = sortGraphNodes(lane.nodeIds
        .map((id) => graph.nodes.find((node) => node.id === id))
        .filter(Boolean) as SwarmGraphNode[]);
      laneNodes.forEach((graphNode, nodeIndex) => {
        const fan = laneIndex - (lanes.length - 1) / 2;
        const columnWave = nodeIndex === 1 ? -22 * Math.sign(fan || 1) : nodeIndex === 2 ? 20 * Math.sign(fan || 1) : 0;
        const x = 292 + nodeIndex * 254 + fan * 24;
        const y = baseY + laneIndex * rowGap + columnWave + (nodeIndex % 2 === 0 ? 8 : -8);
        positions.set(graphNode.id, { x, y });
      });
    });

    let extraIndex = 0;
    for (const graphNode of ordered) {
      if (positions.has(graphNode.id)) continue;
      positions.set(graphNode.id, { x: 900 + (extraIndex % 2) * 90, y: baseY + extraIndex * 112 });
      extraIndex += 1;
    }
    return positions;
  }

  const solvers = ordered.filter((node) => ["planner", "coder", "explorer"].includes(node.archetype));
  const reviewerNodes = ordered.filter((node) => node.archetype === "reviewer");
  const orchestrators = ordered.filter((node) => node.archetype === "orchestrator");
  const systemNodes = ordered.filter((node) => ["evomap", "system"].includes(node.archetype));
  const centerY = 150;

  orchestrators.forEach((node, index) => positions.set(node.id, { x: 70, y: centerY + index * 120 }));
  solvers.forEach((node, index) => {
    const y = centerY + (index - (solvers.length - 1) / 2) * 105;
    positions.set(node.id, { x: 320, y });
  });
  reviewerNodes.forEach((node, index) => positions.set(node.id, { x: 590, y: centerY + index * 120 }));
  systemNodes.forEach((node, index) => positions.set(node.id, { x: 820, y: 35 + index * 120 }));

  let fallbackIndex = 0;
  for (const graphNode of ordered) {
    if (positions.has(graphNode.id)) continue;
    positions.set(graphNode.id, { x: 820, y: centerY + fallbackIndex * 120 });
    fallbackIndex += 1;
  }
  return positions;
}

function makeGraphNode(graphNode: SwarmGraphNode, position: { x: number; y: number }) {
  const petId = ROLE_TO_DEFAULT_PET[graphNode.archetype] || "claude";
  const pet = PET_BY_ID[petId] ? petId : "claude";
  return makePetNode(
    `graph-${graphNode.id}`,
    pet,
    graphNode.archetype,
    position.x,
    position.y,
    {
      label: graphNode.label,
      graphNodeId: graphNode.id,
      instanceId: graphNode.instanceId,
      laneId: graphNode.laneId,
    },
  );
}

function makeGraphEdge(edge: SwarmGraphEdge, nodeIdByGraphId: Map<string, string>) {
  const color = EDGE_COLOR[edge.kind] || "#3ae0ff";
  return {
    id: `graph-${edge.id}`,
    source: nodeIdByGraphId.get(edge.source),
    target: nodeIdByGraphId.get(edge.target),
    animated: true,
    label: edge.label || edge.kind,
    style: { stroke: color, strokeWidth: edge.kind === "feedback" ? 2.5 : 2 },
    labelStyle: { fill: color, fontWeight: 700, fontSize: 10 },
    labelBgStyle: { fill: "rgba(4, 5, 13, 0.86)" },
  };
}

function syncDefaultCanvasFromGraph(graph: SwarmGraph) {
  if (store.mode !== "default") return;
  const positions = graphNodePositionMap(graph);
  const graphNodes = sortGraphNodes(graph.nodes);
  const nextNodes = graphNodes.map((graphNode) => makeGraphNode(graphNode, positions.get(graphNode.id) || { x: 80, y: 80 }));
  const nodeIdByGraphId = new Map<string, string>();
  graphNodes.forEach((graphNode) => {
    nodeIdByGraphId.set(graphNode.id, `graph-${graphNode.id}`);
    nodeIdByGraphId.set(graphNode.instanceId, `graph-${graphNode.id}`);
  });
  const nextEdges = graph.edges
    .map((edge) => makeGraphEdge(edge, nodeIdByGraphId))
    .filter((edge) => edge.source && edge.target);

  nodes.value = nextNodes;
  edges.value = nextEdges;
  setTimeout(() => fitView?.({ padding: 0.22, duration: 350 }), 40);
  return { nodes: nodes.value, edges: edges.value };
}

function buildCustomTopology(): PlaygroundTopology | undefined {
  if (store.mode !== "custom") return undefined;
  const validRoles = new Set(["orchestrator", "planner", "coder", "reviewer", "explorer"]);
  const topoNodes = nodes.value
    .map((node) => {
      const data = node.data as PetNodeData;
      const role = data.role;
      if (!validRoles.has(role)) return null;
      return {
        id: String(node.id),
        role: role as PlaygroundTopology["nodes"][number]["role"],
        label: data.label || PET_BY_ID[data.petId]?.name || String(node.id),
        petId: data.petId,
        // 节点定制:随拓扑透传到后端,保存舰队时 AI 据此美化人设
        customTaskType: data.customTaskType || undefined,
        customSkill: (data.customSkill && data.customSkill.trim()) ? data.customSkill.trim() : undefined,
      };
    })
    .filter(Boolean) as PlaygroundTopology["nodes"];
  const nodeIds = new Set(topoNodes.map((node) => node.id));
  const topoEdges = edges.value
    .filter((edge) => nodeIds.has(String(edge.source)) && nodeIds.has(String(edge.target)))
    .map((edge) => {
      const rawKind = typeof edge.data?.kind === "string" ? edge.data.kind : undefined;
      const kind = rawKind && GRAPH_EDGE_KINDS.has(rawKind) ? rawKind as PlaygroundTopology["edges"][number]["kind"] : "handoff";
      return {
        id: String(edge.id),
        source: String(edge.source),
        target: String(edge.target),
        kind,
        label: typeof edge.label === "string" ? edge.label : kind,
      };
    });
  if (!topoNodes.length) return undefined;
  return { mode: "custom", nodes: topoNodes, edges: topoEdges };
}

// ── 我的舰队:保存/加载自定义拓扑 ──
const savingFleet = ref(false);
const showFleetList = ref(false);

/** 按 role 找一个兜底 petId(舰队没存 petId 时用) */
function fallbackPetIdForRole(role: string): string {
  for (const id of Object.keys(PET_BY_ID)) {
    if (PET_BY_ID[id]?.role === role) return id;
  }
  return "claude";
}

/** 把当前画布拓扑保存为我的舰队(AI 美化在后端发生) */
const lastSavedFleet = ref<{ id: number; model_id: string; name: string } | null>(null);
const showSaveActions = ref(false);

async function saveAsFleet() {
  const topology = buildCustomTopology();
  if (!topology || !topology.nodes.length) {
    toast.show("先拖几个节点再保存 ✋");
    return;
  }
  const name = window.prompt("给这套舰队起个名字(将作为模型名 user:<名字>):", `my-fleet-${Date.now().toString(36)}`);
  if (!name || !name.trim()) return;
  savingFleet.value = true;
  try {
    const result = await fleetsStore.create({ name: name.trim(), topology });
    lastSavedFleet.value = { id: result.fleet.id, model_id: result.fleet.model_id, name: result.fleet.name };
    showSaveActions.value = true;
    toast.show(`✅ 已保存:${result.fleet.model_id}`);
    // 刷新我的舰队列表(供面板即时同步)
    fleetsStore.load();
  } catch (e) {
    toast.show(e instanceof Error ? `❌ ${e.message}` : "保存失败");
  } finally {
    savingFleet.value = false;
  }
}

/** 保存后快捷动作 */
function savedGoChat() {
  if (!lastSavedFleet.value) return;
  showSaveActions.value = false;
  router.push({ path: "/chat", query: { model: lastSavedFleet.value.model_id } });
}
async function savedPublish() {
  if (!lastSavedFleet.value) return;
  try {
    const { publishFleet } = await import("../api/community");
    await publishFleet(lastSavedFleet.value.id, true);
    toast.show("已发布到社区 🌐");
  } catch (e) {
    toast.show(e instanceof Error ? `❌ ${e.message}` : "发布失败");
  }
  showSaveActions.value = false;
}
function savedDismiss() {
  showSaveActions.value = false;
}

/** 加载某个舰队到画布(反序列化 nodes/edges) */
async function loadFleetToCanvas(fleetId: number) {
  try {
    const detail = await fleetsStore.detail(fleetId);
    store.resetRunState();
    store.mode = "custom";
    // 还原节点:网格排布
    const colWidth = 220;
    const rowHeight = 160;
    nodes.value = detail.topology.nodes.map((n, i) => {
      const petId = n.petId || fallbackPetIdForRole(n.role);
      const meta = PET_BY_ID[petId];
      return makePetNode(n.id, petId, n.role, 80 + (i % 3) * colWidth, 60 + Math.floor(i / 3) * rowHeight, {
        label: n.label || meta?.name || n.id,
        // 还原节点定制
        customTaskType: n.customTaskType,
        customSkill: n.customSkill,
      });
    });
    // 还原边
    const validKinds = new Set(["dispatch", "handoff", "feedback", "report", "aggregate", "broadcast"]);
    edges.value = detail.topology.edges
      .filter((e) => nodes.value.some((n) => n.id === e.source) && nodes.value.some((n) => n.id === e.target))
      .map((e) => {
        const kind = (e.kind && validKinds.has(e.kind) ? e.kind : "handoff") as PresetEdgeSpec["kind"];
        return makePresetEdge({ id: e.id, source: e.source, target: e.target, kind, label: e.label || kind });
      });
    setTimeout(() => fitView?.({ padding: 0.22, duration: 350 }), 60);
    showFleetList.value = false;
    toast.show(`已加载舰队:${detail.name}`);
  } catch (e) {
    toast.show(e instanceof Error ? `❌ ${e.message}` : "加载失败");
  }
}

async function deleteFleetFromCanvas(fleetId: number, name: string) {
  if (!window.confirm(`删除舰队「${name}」?此操作不可恢复。`)) return;
  try {
    await fleetsStore.remove(fleetId);
    toast.show("已删除");
  } catch (e) {
    toast.show(e instanceof Error ? `❌ ${e.message}` : "删除失败");
  }
}

function toggleFleetList() {
  showFleetList.value = !showFleetList.value;
  if (showFleetList.value) fleetsStore.load();
}

/** 丝滑跳到对话页:把当前选的舰队和画布上的问题带过去 */
function goChat() {
  // 自定义编队模式 + 画布有节点 + 该用户有对应保存的舰队 → 优先用 user: 模型;
  // 否则用当前 tier。goal 带过去自动填入对话输入框。
  const query: Record<string, string> = {};
  // 推断对话页该用哪个舰队:custom 模式下若刚保存过同名舰队优先,否则用当前 tier
  query.model = store.tier;
  if (goal.value.trim()) query.goal = goal.value.trim();
  router.push({ path: "/chat", query });
}

function loadDefaultFleet() {
  store.resetRunState();
  store.mode = "default";
  loadPresetFleetForTier(store.tier);
}

/** 运行前并发刷新各 agent 节点的链上 INJ 余额(写 nodeChainState,PetNode 实时显示)。 */
async function refreshNodeBalances() {
  const addrs = inj.archetypeAddrs;
  if (!addrs || Object.keys(addrs).length === 0) return;
  // 找画布上每个 archetype 对应的节点(default 模式 data.role=archetype)
  const tasks: Promise<void>[] = [];
  for (const [archetype, addr] of Object.entries(addrs)) {
    const node = nodes.value.find((n: any) => (n.data as any)?.role === archetype);
    if (!node || !addr) continue;
    tasks.push(
      fetch(`/api/injective/balance?addr=${encodeURIComponent(addr)}&denom=inj`)
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { amount?: string } | null) => {
          if (b?.amount) store.setNodeChainState(node.id, { balance: b.amount });
        })
        .catch(() => { /* 余额查询失败不阻塞 */ }),
    );
  }
  await Promise.allSettled(tasks);
}

function dispatch(options: { demo?: boolean } = {}) {
  if (nodes.value.length === 0) loadDefaultFleet();
  if (!goal.value.trim()) return;
  // 运行前刷新各 agent 节点的链上余额(并发,不阻塞)
  refreshNodeBalances();
  // 选中「官方舰队」时,用该舰队 topology(画布已铺),tier 由后端 resolveModel 自动固定为 swarm-evo
  const isOfficial = selectedFleet.value?.source === "official";
  run(nodes.value, edges.value, {
    goal: goal.value.trim(),
    tier: store.tier,
    apiKey: playgroundApiKey.value.trim() || undefined,
    demo: options.demo === true,
    topology: isOfficial ? buildCustomTopology() : (store.mode === "custom" ? buildCustomTopology() : undefined),
    syncGraphCanvas: store.mode === "default" && !isOfficial ? syncDefaultCanvasFromGraph : undefined,
    onExperience: handleExperienceFlow,
    onCreditsDeducted: playCreditDeductAnimation,
    onRewardDistributed: handleRewardDistributed,
    onBounty: handleBounty,
  });
}

/** 深度3:悬赏动效 —— reviewer→coder 画金色金币流 + 节点飘字 +金额 */
function handleBounty(bounties: { fromArch: string; toArch: string; amountSmallest: string; reason: string }[]) {
  for (const b of bounties) {
    const fromNode = nodes.value.find((n: any) => (n.data as any)?.role === b.fromArch);
    const toNode = nodes.value.find((n: any) => (n.data as any)?.role === b.toArch);
    if (!fromNode || !toNode) continue;
    const fromEl = document.querySelector(`.vue-flow__node[data-id="${fromNode.id}"]`) as HTMLElement | null;
    const toEl = document.querySelector(`.vue-flow__node[data-id="${toNode.id}"]`) as HTMLElement | null;
    const fr = fromEl?.getBoundingClientRect();
    const tr = toEl?.getBoundingClientRect();
    if (!fr || !tr) continue;
    const fx = fr.left + fr.width / 2, fy = fr.top + fr.height / 2;
    const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
    // reviewer→coder 金币流(6 枚)
    store.spawnCoins("out", Array.from({ length: 6 }, (_, i) => {
      const j = (i - 3) * 12;
      return { fromX: fx, fromY: fy, toX: tx + j, toY: ty + j };
    }));
    // coder 节点飘 +悬赏金额
    store.showRewardFloat(toNode.id, b.amountSmallest);
    store.addLog("SwarmPay", `💰 ${b.fromArch} 悬赏 ${b.toArch} ${(Number(b.amountSmallest) / 1e18).toFixed(4)} INJ: ${b.reason}`);
  }
}

/** Demo 模式:一键配好最优演示场景,不要求 API Key,由后端走本地 mock 蜂群生成完整 trace */
async function runDemo() {
  const DEMO_GOAL = "做一个带邮箱和密码校验、含错误提示和加载态的完整登录页应用";
  goal.value = DEMO_GOAL;
  store.tier = "swarm-evo";   // HARD + swarm-evo 才有 inherit + backflow 完整链路
  store.mode = "default";
  selectedFleet.value = null; // 清除官方舰队选择,走默认编队
  loadHardPresetFleet();      // 铺 14 节点 HARD 编队
  toast.show("🎬 Demo 已就绪:无需 API Key,正在播放预制默认 Evo 蜂群链路…");
  nextTick(() => dispatch({ demo: true }));
}

/** 链上分润流向:回放结束后,持有 payment 供 RewardFlowOverlay + 画布飞金币(从付款方→各 agent 节点) */
const rewardPayment = ref<{ splits?: { archetype: string; addr: string; amount: string; weight: number }[]; txHash?: string; success?: boolean } | null>(null);
const senderAddr = ref<string>("");
function handleRewardDistributed(payment: { splits?: { archetype: string; addr: string; amount: string; weight: number }[]; txHash?: string; success?: boolean } | null) {
  rewardPayment.value = payment;
  senderAddr.value = inj.address || payment?.splits?.[0]?.addr || "";

  // 画布金色分润流向:从付款方锚点(运行按钮)向各 agent 节点飞金币,数量按权重
  if (!payment?.splits?.length) return;
  const runBtn = document.querySelector(".run-btn, .stop-btn") as HTMLElement | null;
  const rRect = runBtn?.getBoundingClientRect();
  const sx = rRect ? rRect.left + rRect.width / 2 : window.innerWidth / 2;
  const sy = rRect ? rRect.top + rRect.height / 2 : window.innerHeight - 60;

  const routes: Array<{ fromX: number; fromY: number; toX: number; toY: number }> = [];
  for (const s of payment.splits) {
    // 按 archetype 找画布节点(default 模式 data.role=archetype)
    const node = nodes.value.find((n: any) => (n.data as any)?.role === s.archetype);
    if (!node) continue;
    const vfNode = document.querySelector(`.vue-flow__node[data-id="${node.id}"]`) as HTMLElement | null;
    const nRect = vfNode?.getBoundingClientRect();
    if (!nRect) continue;
    const nx = nRect.left + nRect.width / 2;
    const ny = nRect.top + nRect.height / 2;
    // 按权重决定金币数(1-8 枚)
    const coinCount = Math.max(1, Math.min(8, Math.round(s.weight * 16)));
    for (let i = 0; i < coinCount; i++) {
      const jitter = (i - coinCount / 2) * 10;
      routes.push({ fromX: sx, fromY: sy, toX: nx + jitter, toY: ny + jitter });
    }
    // 飘字 +金额(最小单位→INJ)在节点上方
    store.showRewardFloat?.(node.id, s.amount);
  }
  if (routes.length) store.spawnCoins("out", routes);
}

/** 积分扣减动画:调用成功后,金币从画布飞向 NavBar 余额 + 显示 -50 飘字 */
function playCreditDeductAnimation() {
  const cost = 50;
  // 起点:画布运行按钮的屏幕坐标(金币从这里飞出)
  const runBtn = document.querySelector(".run-btn, .stop-btn") as HTMLElement | null;
  const rRect = runBtn?.getBoundingClientRect();
  const fromX = rRect ? rRect.left + rRect.width / 2 : window.innerWidth / 2;
  const fromY = rRect ? rRect.top + rRect.height / 2 : window.innerHeight - 60;
  // 终点:NavBar 的积分余额元素
  const creditEl = document.querySelector(".user-credits") as HTMLElement | null;
  const cRect = creditEl?.getBoundingClientRect();
  const toX = cRect ? cRect.left + cRect.width / 2 : window.innerWidth - 120;
  const toY = cRect ? cRect.top + cRect.height / 2 : 40;

  // 飘字 -50(从起点上浮)
  store.showCreditFloat(-cost, fromX, fromY - 20, toX, toY);
  // 一串金币飞向 NavBar(扇形扩散起点,收敛终点)
  store.spawnCoins("out", Array.from({ length: 8 }, (_, i) => {
    const jitter = (i - 4) * 14;
    return { fromX: fromX + jitter, fromY: fromY + jitter, toX, toY };
  }));
  // 1.2s 后刷新 NavBar 余额(此时金币已"落入"余额区)
  setTimeout(() => { auth.loadMe().catch(() => { /* 静默 */ }); }, 1200);
}

/** FleetPicker 选中回调:官方舰队 → 拉取其 topology 铺到画布;我的端点 → 切回默认编队 */
async function onFleetSelect(fleet: SelectedFleet | null) {
  selectedFleet.value = fleet;
  if (!fleet) return;
  if (fleet.source === "official" && fleet.fleetId != null && fleetPickerRef.value) {
    try {
      const topo = await fleetPickerRef.value.loadFleetTopology(fleet.fleetId);
      if (topo) {
        applyTopologyToCanvas(topo, fleet.label);
      }
    } catch (e) {
      toast.show(e instanceof Error ? `❌ ${e.message}` : "舰队加载失败");
    }
  } else if (fleet.source === "endpoint") {
    // 我的端点:用默认编队跑当前 tier
    store.mode = "default";
    loadPresetFleetForTier(store.tier);
  }
}

/** 把一个 topology 铺到画布(复用 loadFleetToCanvas 的布局逻辑) */
function applyTopologyToCanvas(topo: PlaygroundTopology, name: string) {
  store.resetRunState();
  store.mode = "custom";
  const colWidth = 220;
  const rowHeight = 160;
  nodes.value = topo.nodes.map((n, i) => {
    const petId = n.petId || fallbackPetIdForRole(n.role);
    const meta = PET_BY_ID[petId];
    return makePetNode(n.id, petId, n.role, 80 + (i % 3) * colWidth, 60 + Math.floor(i / 3) * rowHeight, {
      label: n.label || meta?.name || n.id,
      customTaskType: n.customTaskType,
      customSkill: n.customSkill,
    });
  });
  const validKinds = new Set(["dispatch", "handoff", "feedback", "report", "aggregate", "broadcast"]);
  edges.value = topo.edges
    .filter((e) => nodes.value.some((n) => n.id === e.source) && nodes.value.some((n) => n.id === e.target))
    .map((e) => {
      const kind = (e.kind && validKinds.has(e.kind) ? e.kind : "handoff") as PresetEdgeSpec["kind"];
      return makePresetEdge({ id: e.id, source: e.source, target: e.target, kind, label: e.label || kind });
    });
  setTimeout(() => fitView?.({ padding: 0.22, duration: 350 }), 60);
  toast.show(`已加载官方舰队:${name}`);
}

/** 经验宝箱金币动效:计算节点与宝箱的屏幕坐标,驱动金币飞行 */
function handleExperienceFlow(kind: "in" | "out", count: number, nodeId?: string) {
  // 宝箱元素(右上角悬浮)的屏幕中心
  const treasureEl = document.querySelector(".treasure") as HTMLElement | null;
  const tRect = treasureEl?.getBoundingClientRect();
  const tx = tRect ? tRect.left + tRect.width / 2 : window.innerWidth - 80;
  const ty = tRect ? tRect.top + tRect.height / 2 : 80;
  // 节点元素(画布上的 pet 节点)的屏幕中心
  const nodeEl = nodeId ? (document.querySelector(`[data-node-id="${CSS.escape(nodeIdLabel(nodeId))}"]`) as HTMLElement | null) : null;
  // data-node-id 存的是 displayName,这里用 vue-flow 节点 DOM 兜底
  const vfNode = nodeId ? (document.querySelector(`.vue-flow__node[data-id="${nodeId}"]`) as HTMLElement | null) : null;
  const nRect = vfNode?.getBoundingClientRect();
  const nx = nRect ? nRect.left + nRect.width / 2 : window.innerWidth / 2;
  const ny = nRect ? nRect.top + nRect.height / 2 : window.innerHeight / 2;

  if (kind === "in") {
    // 经验回流入宝箱:金币从节点飞向宝箱
    store.spawnCoins("in", Array.from({ length: count }, () => ({ fromX: nx, fromY: ny, toX: tx, toY: ty })));
    store.addTreasury(count);
    store.pulseTreasure();
  } else {
    // 宝箱发经验给 agent:金币从宝箱飞向节点(N 枚错开)
    store.spawnCoins("out", Array.from({ length: count }, (_, i) => {
      const jitter = (i - count / 2) * 18;
      return { fromX: tx, fromY: ty, toX: nx + jitter, toY: ny + jitter };
    }));
  }
}

function nodeIdLabel(id: string): string {
  const n = nodes.value.find((x: { id: string }) => x.id === id);
  return (n?.data as PetNodeData)?.label || id;
}

onMounted(async () => {
  // 拉取经验宝箱库存
  store.loadTreasury();
  // 拉取 Injective 链上配置(含各角色地址,供节点显示链上身份)
  inj.fetchStatus().catch(() => { /* 降级:无地址也能跑 */ });
  // 从"我的舰队"页跳转来时,自动加载指定舰队到画布
  const pendingFleetId = sessionStorage.getItem("evoship:load-fleet");
  if (pendingFleetId) {
    sessionStorage.removeItem("evoship:load-fleet");
    try {
      await loadFleetToCanvas(Number(pendingFleetId));
      return; // 加载成功后不再走默认编队
    } catch {
      /* 加载失败则回落默认 */
    }
  }
  if (store.mode === "default") {
    loadDefaultFleet();
  } else if (nodes.value.length === 0) {
    loadDefaultFleet();
  }
});

watch(() => store.tier, () => {
  if (store.mode === "default" && !running.value) loadDefaultFleet();
});

watch(() => store.mode, (mode) => {
  if (mode === "default" && !running.value) loadDefaultFleet();
});

watch(() => store.lastTrace?.graph?.runId, () => {
  selectedAuditStepId.value = "";
});

// transformStore 的 key 变化时(用户在 ApiKeyView 创建/轮换了新 key)→ 自动同步到 Playground 输入框。
// 之前只在输入框为空时同步,导致用户创建新 key 后 Playground 仍持有失效旧 key → 401。
watch(() => transformStore.lastApiKey, (apiKey) => {
  if (apiKey) playgroundApiKey.value = apiKey;
});

watch(() => transformStore.lastResult?.api_key, (apiKey) => {
  if (apiKey) playgroundApiKey.value = apiKey;
});

// 粒子覆盖层
function particleStyle(p: Particle) {
  return {
    left: `${p.fromX}px`,
    top: `${p.fromY}px`,
    "--tx": `${p.toX - p.fromX}px`,
    "--ty": `${p.toY - p.fromY}px`,
    background: p.color,
    boxShadow: `0 0 12px ${p.color}`,
  };
}

function creditFloatStyle(c: { fromX: number; fromY: number; toX: number; toY: number; delta: number }) {
  return {
    left: `${c.fromX}px`,
    top: `${c.fromY}px`,
    "--tx": `${c.toX - c.fromX}px`,
    "--ty": `${c.toY - c.fromY}px`,
  };
}

/** 链上分润飘字定位:取画布节点屏幕坐标,显示在节点上方居中 */
function rewardFloatStyle(nodeId: string) {
  const vfNode = document.querySelector(`.vue-flow__node[data-id="${nodeId}"]`) as HTMLElement | null;
  const r = vfNode?.getBoundingClientRect();
  return {
    left: r ? `${r.left + r.width / 2}px` : "50%",
    top: r ? `${r.top - 8}px` : "40%",
  };
}

// minimap 节点配色
function miniColor(n: { data?: PetNodeData }) {
  return n.data?.petId ? (PET_BY_ID[n.data.petId]?.tint || "#555") : "#555";
}
</script>

<template>
  <div class="pg-layout" :class="{ 'canvas-focus': canvasFocus }">
    <Sidebar :compact="canvasFocus" />

    <div class="canvas-wrap" :class="{ 'canvas-focus': canvasFocus }" @drop="onDrop" @dragover="onDragOver">
      <!-- 顶栏 -->
      <div class="pg-topbar">
        <RouterLink to="/" class="back">← 首页</RouterLink>
        <div class="pg-title">🎮 Playground · 舰队编排画布</div>
        <div class="pg-actions">
          <span class="badge" v-if="store.breakthroughSources.size">
            ⚡ 突破源 ×{{ store.breakthroughSources.size }}
          </span>
          <select v-model="store.mode" class="top-select" :disabled="running">
            <option value="default">默认编队</option>
            <option value="custom">自定义编队</option>
          </select>
          <FleetPicker
            ref="fleetPickerRef"
            v-model="selectedFleetId"
            @select="onFleetSelect"
          />
          <select v-model="store.tier" class="top-select" :disabled="running">
            <option v-for="t in tiers" :key="t.value" :value="t.value">
              {{ t.difficulty }} · {{ t.value }} · {{ t.label }}
            </option>
          </select>
          <button class="btn-default" @click="loadDefaultFleet" :disabled="running">加载默认编队</button>
          <button class="btn-clear" @click="nodes = []; edges = []; store.resetRunState()" :disabled="running">清空</button>
          <button class="btn-fleet" @click="saveAsFleet" :disabled="running || savingFleet || store.mode !== 'custom'">
            {{ savingFleet ? "保存中…" : "💾 保存为舰队" }}
          </button>
          <button class="btn-fleet" @click="toggleFleetList" :disabled="running">📂 我的舰队</button>
          <button class="btn-chat" @click="goChat" :disabled="running">💬 对话测试 →</button>
        </div>
      </div>

      <!-- 我的舰队列表面板 -->
      <div v-if="showFleetList" class="fleet-panel">
        <div class="fleet-panel-head">
          <span>📂 我的舰队</span>
          <button class="fleet-close" @click="showFleetList = false">✕</button>
        </div>
        <div v-if="fleetsStore.loading" class="fleet-empty">加载中…</div>
        <div v-else-if="fleetsStore.error" class="fleet-empty">⚠️ {{ fleetsStore.error }}</div>
        <div v-else-if="!fleetsStore.fleets.length" class="fleet-empty">
          还没有舰队。拖节点搭一套拓扑,点「💾 保存为舰队」即可。
        </div>
        <div v-else class="fleet-list">
          <div v-for="f in fleetsStore.fleets" :key="f.id" class="fleet-item">
            <div class="fleet-item-main">
              <div class="fleet-name">{{ f.name }}</div>
              <div class="fleet-meta">
                <code>{{ f.model_id }}</code>
                <span>· {{ f.node_count }} 节点 · {{ f.edge_count }} 边</span>
              </div>
              <div v-if="f.label" class="fleet-label">{{ f.label }}</div>
            </div>
            <div class="fleet-item-actions">
              <button class="fleet-btn load" @click="loadFleetToCanvas(f.id)" :disabled="running">加载</button>
              <button class="fleet-btn del" @click="deleteFleetFromCanvas(f.id, f.name)" :disabled="running">删除</button>
            </div>
          </div>
        </div>
      </div>

      <!-- vue-flow 画布 -->
      <div class="flow-area" ref="vueFlowRef">
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          :default-viewport="{ zoom: 1 }"
          :min-zoom="0.3"
          :max-zoom="2"
          fit-view-on-init
          @connect="onConnect"
        >
          <template #node-pet="props">
            <PetNode :id="props.id" :data="props.data as PetNodeData" @click-node="onNodeClick" />
          </template>
          <Background :gap="20" pattern-color="#1a2040" />
          <Controls />
          <MiniMap pannable zoomable :node-color="miniColor" />
        </VueFlow>

        <!-- 经验宝箱(画布内左上角,在 vue-flow 画布区,不遮挡顶栏) -->
        <ExperienceTreasure />

        <!-- 链上分润流向 overlay(回放结束后,金色箭头从付款方流向各 agent 节点) -->
        <RewardFlowOverlay
          v-if="rewardPayment?.splits?.length"
          :splits="rewardPayment.splits"
          :sender-addr="senderAddr"
          :total-distributed="rewardPayment.splits.reduce((a, s) => a + BigInt(s.amount || '0'), 0n).toString()"
          denom="inj"
        />

        <!-- 保存舰队成功后的快捷动作浮层(居中) -->
        <Transition name="fade">
          <div v-if="showSaveActions && lastSavedFleet" class="save-actions">
            <div class="save-actions-card">
              <div class="save-actions-title">✅ 舰队已保存</div>
              <div class="save-actions-sub">{{ lastSavedFleet.model_id }}</div>
              <div class="save-actions-btns">
                <button class="sa-btn primary" @click="savedGoChat">💬 去对话测试</button>
                <button class="sa-btn" @click="savedPublish">🌐 发布到社区</button>
                <button class="sa-btn ghost" @click="savedDismiss">继续编辑</button>
              </div>
            </div>
          </div>
        </Transition>

        <!-- 粒子覆盖层 -->
        <div class="particles">
          <div
            v-for="p in particles"
            :key="p.id"
            class="particle"
            :class="{ broadcast: p.kind === 'broadcast' }"
            :style="particleStyle(p)"
          ></div>
        </div>

        <!-- 经验回流提示 -->
        <Transition name="fade">
          <div v-if="store.backflowMsg" class="backflow-toast">{{ store.backflowMsg }}</div>
        </Transition>

        <!-- 积分扣减飘字(调用成功后 -50 飞向 NavBar) -->
        <div
          v-for="c in store.creditFloat"
          :key="c.id"
          class="credit-float"
          :class="{ negative: c.delta < 0 }"
          :style="creditFloatStyle(c)"
        >{{ c.delta > 0 ? '+' : '' }}{{ c.delta }} 积分</div>

        <!-- 链上分润飘字(各 agent 节点上方 +X INJ) -->
        <div
          v-for="r in store.rewardFloat"
          :key="r.id"
          class="reward-float"
          :style="rewardFloatStyle(r.nodeId)"
        >+{{ r.amountInj }} INJ</div>

        <!-- 空状态 -->
        <div v-if="nodes.length === 0" class="empty-hint">
          <div class="empty-emoji">🐾</div>
          <p>从左侧拖角色到这里,搭建你的舰队编队</p>
          <p class="sub">拖节点右边的圆点拉到另一个节点 = 连线</p>
        </div>
      </div>

      <div class="fleet-strip">
        <div class="fleet-copy">
          <div class="fleet-title">
            <span>{{ selectedTier.title }}</span>
            <code>{{ selectedTier.difficulty }}</code>
            <code>{{ store.tier }}</code>
          </div>
          <div class="fleet-desc">{{ selectedTier.desc }}</div>
        </div>
        <div class="fleet-chips">
          <span v-for="chip in policyChips" :key="chip" class="fleet-chip">{{ chip }}</span>
        </div>
        <div v-if="traceStats" class="trace-stats">
          <span v-for="s in traceStats" :key="s">{{ s }}</span>
        </div>
      </div>

      <!-- 底部运行栏 -->
      <div class="pg-runbar">
        <div class="run-meta">
          <span class="status-dot" :class="store.playbackStatus"></span>
          <span>{{ store.mode === "custom" ? "自定义编队用于 trace 可视化回放" : "默认预览按当前档位展开,运行后替换为后端 graph" }}</span>
        </div>
        <div class="endpoint-key">
          <span>{{ endpointLabel }}</span>
          <input v-model="playgroundApiKey" type="password" placeholder="sk-swarmpay-..." :disabled="running" autocomplete="off" />
        </div>
        <input v-model="goal" class="goal-input" placeholder="输入你的问题..." :disabled="running" />
        <button v-if="!running" class="demo-btn" @click="runDemo" title="一键演示完整蜂群协作链路,无需 API Key">
          🎬 Demo 演示
        </button>
        <button v-if="!running" class="run-btn" @click="runDemo" title="当前演示模式下也播放预制 Evo 蜂群">
          派出真实蜂群
        </button>
        <button v-else class="stop-btn" @click="stop">停止</button>
      </div>

      <div class="answer-panel" v-if="store.finalAnswer || store.errorMsg || store.playbackStatus !== 'idle'">
        <div class="answer-head">
          <span>蜂群输出</span>
          <span class="answer-state">{{ store.playbackStatus }}</span>
        </div>
        <div v-if="store.errorMsg" class="error-msg">{{ store.errorMsg }}</div>
        <pre v-if="store.finalAnswer" class="answer-body">{{ store.finalAnswer }}</pre>
        <div v-else-if="running" class="answer-wait">正在加载蜂群 trace,返回后会在画布上重放协作过程。</div>
        <div v-if="graphMetrics" class="graph-metrics">
          <span>agentRuns {{ graphMetrics.agentRuns }}</span>
          <span>handoffs {{ graphMetrics.handoffs }}</span>
          <span>broadcasts {{ graphMetrics.broadcasts }}</span>
          <span>revisions {{ graphMetrics.revisions }}</span>
          <span>subtasks {{ graphMetrics.subtasks }}</span>
        </div>
        <div v-if="auditSteps.length" class="swarm-audit" data-testid="swarm-audit">
          <div class="audit-head">
            <div>
              <span>默认 Evo 蜂群调用审计</span>
              <em>{{ auditSummary }}</em>
            </div>
            <b>{{ auditSteps.length }} steps</b>
          </div>
          <div class="audit-layout">
            <div class="audit-rail" role="list" aria-label="蜂群调用步骤">
              <button
                v-for="step in auditSteps"
                :key="step.id"
                type="button"
                class="audit-step"
                :class="[step.kindClass, { selected: selectedAuditStep?.id === step.id }]"
                @click="selectedAuditStepId = step.id"
              >
                <span>#{{ step.seq }}</span>
                <b>{{ step.title }}</b>
                <em>{{ step.route }}</em>
                <i>{{ step.brief }}</i>
              </button>
            </div>
            <div v-if="selectedAuditStep" class="audit-dialog">
              <div class="dialog-route">
                <span>{{ selectedAuditStep.actor }}</span>
                <b v-if="selectedAuditStep.receiver">→</b>
                <span v-if="selectedAuditStep.receiver">{{ selectedAuditStep.receiver }}</span>
              </div>
              <div class="dialog-meta">
                <span>{{ selectedAuditStep.transferText }}</span>
                <span v-for="m in selectedAuditStep.meta" :key="m">{{ m }}</span>
              </div>
              <div class="dialog-bubbles">
                <div class="dialog-bubble sender">
                  <label>{{ selectedAuditStep.payloadLabel }}</label>
                  <pre>{{ selectedAuditStep.payload }}</pre>
                </div>
                <div v-if="selectedAuditStep.receiver" class="dialog-bubble receiver">
                  <label>接收方回应</label>
                  <pre>{{ selectedAuditStep.receiverPayload }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="purificationChain.length" class="purification-chain" data-testid="purification-chain">
          <div class="purification-head">自净化链</div>
          <div
            v-for="item in purificationChain"
            :key="item.id"
            class="purification-step"
            :class="item.kind"
          >
            <span>{{ item.label }}</span>
            <b>{{ item.title }}</b>
            <em>{{ item.detail }}</em>
          </div>
        </div>
        <div v-if="evolutionTimeline.length" class="evolution-timeline" data-testid="evolution-timeline">
          <div class="evolution-head">
            <div>
              <span>自进化时间线</span>
              <em v-if="latestEvolutionRun">
                latest {{ generationText(latestEvolutionRun) }} · {{ qualityText(latestEvolutionRun) }}
              </em>
            </div>
            <button type="button" @click="store.clearEvolutionHistory()" :disabled="running">清空历史</button>
          </div>
          <div class="evolution-rail">
            <div
              v-for="run in evolutionTimeline"
              :key="run.id"
              class="evolution-step"
              :class="{ latest: latestEvolutionRun?.id === run.id }"
              :data-evo-run="run.runNumber"
            >
              <div class="evo-step-top">
                <b>Run {{ run.runNumber }}</b>
                <span>{{ formatClock(run.at) }}</span>
              </div>
              <div class="evo-step-score">
                <strong>{{ generationText(run) }}</strong>
                <em>{{ qualityText(run) }}</em>
                <em class="delta" :class="{ up: (run.qualityDelta || 0) > 0 }">{{ qualityDeltaText(run) }}</em>
                <i>streak {{ run.depositedStreak || "-" }}</i>
              </div>
              <div class="evo-step-flow">
                <span :class="{ muted: !run.inheritedTotal && !run.inheritedLocal && !run.inheritedRemote }">
                  {{ inheritText(run) }}
                </span>
                <span>{{ run.subtasks }} subtasks · {{ run.handoffs }} handoffs</span>
                <span>{{ run.revisions }} revisions</span>
                <span>{{ run.backflowStatus }} · {{ run.graphBackflowEvents }} backflow event</span>
              </div>
              <div class="evo-step-recipe">
                <b>{{ run.topRecipeTitle }}</b>
                <em>{{ recipeMeta(run) }}</em>
              </div>
            </div>
          </div>
        </div>
        <div v-if="experienceBoard" class="experience-board" data-testid="experience-board">
          <div class="experience-head">
            <span>自进化经验库</span>
            <em>local {{ experienceBoard.localCount }} / EvoMap {{ experienceBoard.evomapCount }}</em>
            <b v-if="experienceBoard.depositedGeneration">G{{ experienceBoard.depositedGeneration }}</b>
            <b v-if="experienceBoard.depositedQuality">q={{ experienceBoard.depositedQuality }}</b>
            <b>{{ experienceBoard.backflowStatus }}</b>
          </div>
          <div class="experience-stats">
            <span>命中 {{ experienceBoard.total }}</span>
            <span>best q={{ experienceBoard.topQuality.toFixed(3) }}</span>
            <span>streak {{ experienceBoard.successStreak || "-" }}</span>
          </div>
          <div v-if="experienceBoard.items.length" class="experience-recipes">
            <div
              v-for="item in experienceBoard.items"
              :key="item.id"
              class="experience-recipe"
              :class="{ local: item.source === 'local' }"
            >
              <span>{{ item.source }}</span>
              <b>{{ item.title }}</b>
              <em>{{ item.meta }}</em>
              <i>{{ item.detail }}</i>
            </div>
          </div>
        </div>
        <div v-if="evoEvidence.length" class="evo-evidence">
          <div class="evo-evidence-head">EvoMap 自进化证据</div>
          <div v-for="item in evoEvidence" :key="item.id" class="evo-evidence-item" :class="item.kind">
            <span>{{ item.kind }}</span>
            <b>{{ item.title }}</b>
            <em>{{ item.detail }}</em>
          </div>
        </div>
        <div v-if="graphLanes.length" class="lane-mini">
          <div v-for="lane in graphLanes" :key="lane.id" class="lane-mini-row">
            <span>{{ lane.title }}</span>
            <em>{{ lane.status }}</em>
            <b>{{ lane.nodeIds.length }} nodes</b>
          </div>
        </div>
        <div v-if="visibleTraceItems.length" class="trace-mini">
          <div v-for="item in visibleTraceItems" :key="item.id" class="trace-mini-row">
            <span>{{ item.phase }}</span>
            <b>{{ item.actor }}</b>
            <em v-if="item.status">{{ item.status }}</em>
          </div>
        </div>
      </div>

      <!-- 对话日志 -->
      <div class="pg-log" v-if="store.log.length">
        <div class="log-head">💬 舰队对话流</div>
        <div class="log-body">
          <div v-for="(l, i) in store.log" :key="i" class="log-line">
            <span class="log-from">{{ l.from }}:</span> {{ l.text }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pg-layout {
  display: flex;
  height: 100vh;
  background: #04050d;
}
.canvas-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 0;
  min-height: 0;
}
.pg-topbar {
  height: 54px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 0 20px;
  background: rgba(8, 11, 26, 0.85);
  border-bottom: 1px solid var(--panel-line);
}
.back { color: var(--muted); text-decoration: none; font-size: 13px; }
.back:hover { color: #fff; }
.pg-title { font-size: 15px; font-weight: 700; color: #fff; flex: 1; }
.pg-actions { display: flex; align-items: center; gap: 10px; }
.badge {
  font-size: 11px; padding: 4px 10px; border-radius: 8px;
  background: rgba(255, 184, 77, 0.15); color: #ffb84d; font-weight: 600;
}
.top-select {
  height: 30px;
  padding: 0 10px;
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid var(--panel-line);
  color: #fff;
  font-size: 12px;
  font-family: inherit;
  border-radius: 6px;
}
.top-select:disabled { opacity: 0.45; }
.btn-default,
.btn-clear {
  font-size: 12px; padding: 6px 12px; background: rgba(255, 92, 122, 0.1);
  border: 1px solid rgba(255, 92, 122, 0.3); color: var(--red); cursor: pointer;
  font-family: inherit; border-radius: 6px;
}
.btn-default {
  background: rgba(58, 224, 255, 0.1);
  border-color: rgba(58, 224, 255, 0.35);
  color: var(--cyan);
}
.btn-default:hover:not(:disabled) { background: rgba(58, 224, 255, 0.18); }
.btn-clear:hover:not(:disabled) { background: rgba(255, 92, 122, 0.2); }
.btn-default:disabled, .btn-clear:disabled { opacity: 0.4; }

.btn-fleet {
  font-size: 12px; padding: 6px 12px;
  background: rgba(137, 91, 255, 0.12);
  border: 1px solid rgba(137, 91, 255, 0.4);
  color: #b89aff; cursor: pointer; font-family: inherit; border-radius: 6px;
}
.btn-fleet:hover:not(:disabled) { background: rgba(137, 91, 255, 0.22); }
.btn-fleet:disabled { opacity: 0.4; }

.btn-chat {
  font-size: 13px; font-weight: 700; padding: 7px 16px;
  background: linear-gradient(135deg, rgba(94, 234, 212, 0.22), rgba(58, 224, 255, 0.22));
  border: 1px solid rgba(94, 234, 212, 0.55);
  color: #7df5dd; cursor: pointer; font-family: inherit; border-radius: 7px;
  box-shadow: 0 0 14px rgba(94, 234, 212, 0.18);
  transition: 0.18s;
}
.btn-chat:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(94, 234, 212, 0.35), rgba(58, 224, 255, 0.35));
  box-shadow: 0 0 22px rgba(94, 234, 212, 0.4);
  transform: translateY(-1px);
}
.btn-chat:disabled { opacity: 0.4; }

/* 保存成功快捷动作浮层 */
.save-actions {
  position: absolute;
  top: 50%; left: 50%; transform: translate(-50%, -50%);
  z-index: 50; pointer-events: auto;
}
.save-actions-card {
  background: rgba(10, 14, 32, 0.97);
  border: 1.5px solid rgba(94, 234, 212, 0.5);
  border-radius: 14px; padding: 22px 26px;
  box-shadow: 0 12px 50px rgba(0,0,0,0.6), 0 0 30px rgba(94,234,212,0.2);
  text-align: center; min-width: 280px;
}
.save-actions-title { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 4px; }
.save-actions-sub { font-size: 12px; color: #5eead4; margin-bottom: 18px; font-family: ui-monospace, monospace; }
.save-actions-btns { display: flex; flex-direction: column; gap: 9px; }
.sa-btn {
  font-size: 14px; padding: 11px 18px; border-radius: 8px; cursor: pointer; font-family: inherit; font-weight: 600;
  background: rgba(58,224,255,0.12); border: 1px solid rgba(58,224,255,0.3); color: var(--cyan); transition: 0.15s;
}
.sa-btn:hover { background: rgba(58,224,255,0.22); }
.sa-btn.primary { background: rgba(137,91,255,0.18); border-color: rgba(137,91,255,0.45); color: #b89aff; }
.sa-btn.primary:hover { background: rgba(137,91,255,0.28); }
.sa-btn.ghost { background: transparent; border-color: var(--panel-line); color: var(--dim); }
.sa-btn.ghost:hover { background: rgba(255,255,255,0.05); color: #fff; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.fleet-panel {
  position: absolute; top: 56px; right: 16px; z-index: 30;
  width: 320px; max-height: 60vh; overflow-y: auto;
  background: rgba(8, 10, 26, 0.96);
  border: 1px solid rgba(137, 91, 255, 0.35);
  border-radius: 10px; padding: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.fleet-panel-head {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 13px; color: #b89aff; font-weight: 700; margin-bottom: 10px;
}
.fleet-close {
  background: none; border: none; color: var(--dim, #6b7088);
  cursor: pointer; font-size: 14px;
}
.fleet-close:hover { color: #fff; }
.fleet-empty {
  font-size: 12px; color: var(--dim, #6b7088); padding: 16px 4px; text-align: center; line-height: 1.6;
}
.fleet-list { display: flex; flex-direction: column; gap: 8px; }
.fleet-item {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 9px 10px; border-radius: 8px;
  background: rgba(137, 91, 255, 0.06);
  border: 1px solid rgba(137, 91, 255, 0.18);
}
.fleet-item-main { flex: 1; min-width: 0; }
.fleet-name { font-size: 13px; color: #e8e8f0; font-weight: 600; }
.fleet-meta { font-size: 11px; color: var(--dim, #6b7088); margin-top: 2px; }
.fleet-meta code {
  background: rgba(58, 224, 255, 0.1); color: var(--cyan, #3ae0ff);
  padding: 1px 5px; border-radius: 3px; font-size: 10px;
}
.fleet-label { font-size: 11px; color: var(--dim, #8589a8); margin-top: 3px; }
.fleet-item-actions { display: flex; flex-direction: column; gap: 4px; }
.fleet-btn {
  font-size: 11px; padding: 3px 10px; border-radius: 5px; cursor: pointer;
  font-family: inherit; border: 1px solid transparent;
}
.fleet-btn.load {
  background: rgba(58, 224, 255, 0.14); border-color: rgba(58, 224, 255, 0.35); color: var(--cyan, #3ae0ff);
}
.fleet-btn.load:hover:not(:disabled) { background: rgba(58, 224, 255, 0.24); }
.fleet-btn.del {
  background: rgba(255, 92, 122, 0.12); border-color: rgba(255, 92, 122, 0.3); color: var(--red, #ff5c7a);
}
.fleet-btn.del:hover:not(:disabled) { background: rgba(255, 92, 122, 0.2); }
.fleet-btn:disabled { opacity: 0.4; }

.flow-area {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

/* 粒子层 */
.particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
}
.particle {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  animation: fly 1.2s ease-in forwards;
}
.particle.broadcast {
  width: 12px;
  height: 12px;
}
@keyframes fly {
  0% { transform: translate(0, 0) scale(0.6); opacity: 0; }
  15% { opacity: 1; transform: translate(calc(var(--tx) * 0.15), calc(var(--ty) * 0.15)) scale(1); }
  100% { transform: translate(var(--tx), var(--ty)) scale(0.8); opacity: 0; }
}

.backflow-toast {
  position: absolute;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  padding: 10px 20px;
  background: rgba(61, 255, 176, 0.15);
  border: 1px solid rgba(61, 255, 176, 0.4);
  color: var(--green);
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
  backdrop-filter: blur(8px);
}
.fade-enter-active, .fade-leave-active { transition: all 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }

/* 空状态 */
.empty-hint {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--dim);
  pointer-events: none;
}
.empty-emoji { font-size: 56px; margin-bottom: 16px; opacity: 0.6; }
.empty-hint p { font-size: 15px; }
.empty-hint .sub { font-size: 12px; margin-top: 6px; color: var(--dim); }

.fleet-strip {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(240px, 1.2fr) minmax(260px, 1.6fr) auto;
  gap: 14px;
  align-items: center;
  padding: 10px 20px;
  background: rgba(6, 8, 18, 0.94);
  border-top: 1px solid var(--panel-line);
}
.fleet-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}
.fleet-title code {
  color: var(--cyan);
  background: rgba(58, 224, 255, 0.1);
  border: 1px solid rgba(58, 224, 255, 0.22);
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 11px;
}
.fleet-desc {
  margin-top: 3px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
}
.fleet-chips,
.trace-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.fleet-chip,
.trace-stats span {
  padding: 4px 8px;
  border: 1px solid var(--panel-line);
  color: var(--muted);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 5px;
  font-size: 11px;
  white-space: nowrap;
}
.trace-stats span {
  border-color: rgba(139, 92, 255, 0.35);
  color: #cfc4ff;
}

/* 底部运行栏 */
.pg-runbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  background: rgba(8, 11, 26, 0.9);
  border-top: 1px solid var(--panel-line);
}
.run-meta {
  width: 260px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
}
.endpoint-key {
  width: 220px;
  display: grid;
  gap: 4px;
  flex-shrink: 0;
}
.endpoint-key span {
  overflow: hidden;
  color: var(--dim);
  font-size: 10px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.endpoint-key input {
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  color: #fff;
  border: 1px solid var(--panel-line);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.34);
  font: inherit;
  font-size: 12px;
}
.endpoint-key input:focus {
  outline: none;
  border-color: var(--cyan);
}
.endpoint-key input:disabled {
  opacity: 0.45;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dim);
  flex-shrink: 0;
}
.status-dot.calling { background: #ffb84d; box-shadow: 0 0 12px #ffb84d; }
.status-dot.replaying { background: var(--cyan); box-shadow: 0 0 12px var(--cyan); }
.status-dot.done { background: var(--green); box-shadow: 0 0 12px var(--green); }
.status-dot.error { background: var(--red); box-shadow: 0 0 12px var(--red); }
.goal-input {
  flex: 1;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--panel-line);
  color: #fff;
  font-size: 14px;
  font-family: inherit;
  border-radius: 8px;
}
.goal-input:focus { outline: none; border-color: var(--cyan); }
.run-btn {
  padding: 12px 24px;
  background: linear-gradient(90deg, var(--cyan), var(--violet));
  color: #04050d;
  font-weight: 800;
  font-size: 14px;
  border: none;
  cursor: pointer;
  border-radius: 8px;
  font-family: inherit;
  white-space: nowrap;
}
.run-btn:hover:not(:disabled) { box-shadow: 0 0 20px rgba(58, 224, 255, 0.5); }
.run-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.stop-btn {
  padding: 12px 24px;
  background: rgba(255, 92, 122, 0.2);
  border: 1px solid var(--red);
  color: var(--red);
  font-weight: 700;
  cursor: pointer;
  border-radius: 8px;
  font-family: inherit;
}
.demo-btn {
  padding: 12px 18px;
  background: linear-gradient(90deg, rgba(255, 184, 77, 0.25), rgba(255, 210, 63, 0.25));
  border: 1px solid var(--amber);
  color: var(--amber);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  border-radius: 8px;
  font-family: inherit;
  white-space: nowrap;
  transition: all 0.2s;
}
.demo-btn:hover {
  box-shadow: 0 0 20px rgba(255, 184, 77, 0.45);
  background: linear-gradient(90deg, rgba(255, 184, 77, 0.4), rgba(255, 210, 63, 0.4));
  transform: translateY(-1px);
}

/* 积分扣减飘字:从画布飞向 NavBar 余额 */
.credit-float {
  position: fixed;
  z-index: 9999;
  transform: translate(-50%, -50%);
  padding: 6px 14px;
  font-size: 15px;
  font-weight: 800;
  color: var(--amber);
  background: rgba(255, 184, 77, 0.12);
  border: 1px solid var(--amber);
  border-radius: 999px;
  pointer-events: none;
  text-shadow: 0 0 8px rgba(255, 184, 77, 0.6);
  animation: creditFloat 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
.reward-float {
  position: fixed;
  z-index: 9999;
  transform: translate(-50%, -100%);
  padding: 4px 12px;
  font-size: 14px;
  font-weight: 800;
  font-family: ui-monospace, monospace;
  color: #ffd23f;
  background: rgba(255, 210, 63, 0.15);
  border: 1px solid #ffd23f;
  border-radius: 999px;
  pointer-events: none;
  text-shadow: 0 0 10px rgba(255, 210, 63, 0.8);
  animation: rewardFloatUp 2.4s ease-out forwards;
}
@keyframes rewardFloatUp {
  0% { opacity: 0; transform: translate(-50%, -80%) scale(0.6); }
  15% { opacity: 1; transform: translate(-50%, -120%) scale(1.1); }
  80% { opacity: 1; transform: translate(-50%, -180%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -240%) scale(0.9); }
}
@keyframes creditFloat {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
  15% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0.8);
  }
}

.answer-panel {
  flex-shrink: 0;
  max-height: min(520px, 48vh);
  overflow: auto;
  border-top: 1px solid var(--panel-line);
  background: rgba(4, 5, 13, 0.94);
  padding: 12px 20px;
}
.answer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  margin-bottom: 8px;
}
.answer-state {
  color: var(--dim);
  font-size: 11px;
  font-weight: 600;
}
.answer-body {
  margin: 0;
  max-height: 92px;
  overflow: auto;
  white-space: pre-wrap;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
  font-family: inherit;
}
.answer-wait {
  color: var(--dim);
  font-size: 13px;
}
.error-msg {
  margin-bottom: 8px;
  padding: 8px 10px;
  background: rgba(255, 92, 122, 0.1);
  border: 1px solid rgba(255, 92, 122, 0.28);
  color: var(--red);
  font-size: 12px;
  border-radius: 6px;
}
.trace-mini {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.graph-metrics,
.lane-mini {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.graph-metrics span,
.lane-mini-row {
  padding: 4px 7px;
  background: rgba(61, 255, 176, 0.06);
  border: 1px solid rgba(61, 255, 176, 0.22);
  border-radius: 5px;
  color: var(--green);
  font-size: 11px;
}
.swarm-audit {
  display: grid;
  gap: 8px;
  margin-top: 10px;
  padding: 8px;
  border: 1px solid rgba(58, 224, 255, 0.2);
  border-radius: 7px;
  background: rgba(58, 224, 255, 0.035);
}
.audit-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.audit-head div {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.audit-head span {
  color: #fff;
  font-size: 12px;
  font-weight: 900;
}
.audit-head em {
  min-width: 0;
  overflow: hidden;
  color: var(--cyan);
  font-size: 11px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.audit-head b {
  flex-shrink: 0;
  padding: 3px 7px;
  border: 1px solid rgba(58, 224, 255, 0.25);
  border-radius: 5px;
  color: var(--cyan);
  background: rgba(58, 224, 255, 0.07);
  font-size: 10px;
}
.audit-layout {
  display: grid;
  grid-template-columns: minmax(260px, 0.9fr) minmax(320px, 1.35fr);
  gap: 10px;
  min-height: 220px;
}
.audit-rail {
  max-height: 270px;
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 6px;
  padding-right: 4px;
}
.audit-step {
  min-width: 0;
  display: grid;
  grid-template-columns: 40px minmax(80px, 0.8fr) minmax(0, 1.2fr);
  grid-template-areas:
    "seq title route"
    "seq brief brief";
  gap: 3px 7px;
  padding: 7px 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-left: 3px solid rgba(58, 224, 255, 0.55);
  border-radius: 6px;
  color: inherit;
  background: rgba(4, 5, 13, 0.62);
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.audit-step:hover,
.audit-step.selected {
  border-color: rgba(58, 224, 255, 0.45);
  border-left-color: var(--cyan);
  background: rgba(58, 224, 255, 0.08);
}
.audit-step.feedback,
.audit-step.revision {
  border-left-color: var(--red);
}
.audit-step.report,
.audit-step.aggregate {
  border-left-color: #a78bfa;
}
.audit-step.inherit,
.audit-step.backflow {
  border-left-color: var(--green);
}
.audit-step.broadcast {
  border-left-color: #ffb84d;
}
.audit-step span {
  grid-area: seq;
  color: var(--dim);
  font-size: 10px;
  font-weight: 900;
}
.audit-step b {
  grid-area: title;
  overflow: hidden;
  color: #fff;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.audit-step em {
  grid-area: route;
  overflow: hidden;
  color: var(--cyan);
  font-size: 10px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.audit-step i {
  grid-area: brief;
  overflow: hidden;
  color: var(--muted);
  font-size: 10px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.audit-dialog {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 8px;
  padding: 9px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 7px;
  background: rgba(4, 5, 13, 0.68);
}
.dialog-route {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: #fff;
  font-size: 12px;
  font-weight: 900;
}
.dialog-route span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dialog-route b {
  flex-shrink: 0;
  color: var(--cyan);
}
.dialog-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.dialog-meta span {
  padding: 3px 6px;
  border-radius: 4px;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.045);
  font-size: 10px;
}
.dialog-bubbles {
  display: grid;
  gap: 8px;
}
.dialog-bubble {
  min-width: 0;
  max-width: 100%;
  padding: 8px;
  border: 1px solid rgba(58, 224, 255, 0.24);
  border-radius: 7px;
  background: rgba(58, 224, 255, 0.055);
}
.dialog-bubble.receiver {
  justify-self: end;
  width: min(360px, 86%);
  border-color: rgba(61, 255, 176, 0.24);
  background: rgba(61, 255, 176, 0.055);
}
.dialog-bubble label {
  display: block;
  margin-bottom: 5px;
  color: var(--cyan);
  font-size: 10px;
  font-weight: 900;
}
.dialog-bubble.receiver label {
  color: var(--green);
}
.dialog-bubble pre,
.dialog-bubble p {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
}
.dialog-bubble pre {
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.purification-chain {
  display: grid;
  grid-template-columns: auto repeat(4, minmax(130px, 1fr));
  gap: 6px;
  align-items: stretch;
  margin-top: 8px;
}
.purification-head,
.purification-step {
  min-width: 0;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 11px;
}
.purification-head {
  display: flex;
  align-items: center;
  color: #ffb84d;
  border: 1px solid rgba(255, 184, 77, 0.28);
  background: rgba(255, 184, 77, 0.07);
  font-weight: 900;
  white-space: nowrap;
}
.purification-step {
  display: grid;
  grid-template-columns: auto minmax(58px, auto) minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.11);
  background: rgba(255, 255, 255, 0.035);
}
.purification-step span {
  color: #fff;
  font-weight: 900;
  white-space: nowrap;
}
.purification-step b,
.purification-step em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.purification-step b {
  color: var(--muted);
  font-weight: 800;
}
.purification-step em {
  color: var(--dim);
  font-style: normal;
}
.purification-step.reject {
  border-color: rgba(255, 92, 122, 0.34);
  background: rgba(255, 92, 122, 0.08);
}
.purification-step.reject span {
  color: var(--red);
}
.purification-step.feedback {
  border-color: rgba(255, 184, 77, 0.32);
  background: rgba(255, 184, 77, 0.08);
}
.purification-step.feedback span {
  color: #ffb84d;
}
.purification-step.approve,
.purification-step.deposit {
  border-color: rgba(61, 255, 176, 0.3);
  background: rgba(61, 255, 176, 0.07);
}
.purification-step.approve span,
.purification-step.deposit span {
  color: var(--green);
}
.evolution-timeline {
  margin-top: 10px;
  padding: 8px;
  border: 1px solid rgba(58, 224, 255, 0.18);
  background: rgba(58, 224, 255, 0.035);
  border-radius: 7px;
}
.evolution-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.evolution-head div {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.evolution-head span {
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}
.evolution-head em {
  color: var(--cyan);
  font-size: 11px;
  font-style: normal;
  white-space: nowrap;
}
.evolution-head button {
  flex-shrink: 0;
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 5px;
  color: var(--dim);
  background: rgba(255, 255, 255, 0.04);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.evolution-head button:hover:not(:disabled) {
  color: #fff;
  border-color: rgba(58, 224, 255, 0.45);
}
.evolution-head button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.evolution-rail {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 8px;
}
.evolution-step {
  min-width: 0;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(4, 5, 13, 0.66);
}
.evolution-step.latest {
  border-color: rgba(61, 255, 176, 0.38);
  box-shadow: inset 0 0 0 1px rgba(61, 255, 176, 0.08);
}
.evo-step-top,
.evo-step-score,
.evo-step-flow,
.evo-step-recipe {
  min-width: 0;
}
.evo-step-top,
.evo-step-score {
  display: flex;
  align-items: center;
  gap: 6px;
}
.evo-step-top {
  justify-content: space-between;
  margin-bottom: 5px;
}
.evo-step-top b {
  color: #fff;
  font-size: 11px;
}
.evo-step-top span {
  color: var(--dim);
  font-size: 10px;
}
.evo-step-score strong {
  color: var(--green);
  font-size: 15px;
}
.evo-step-score em,
.evo-step-score i {
  color: var(--cyan);
  font-size: 11px;
  font-style: normal;
}
.evo-step-score .delta {
  padding: 1px 5px;
  border-radius: 4px;
  color: var(--dim);
  background: rgba(255, 255, 255, 0.05);
}
.evo-step-score .delta.up {
  color: var(--green);
  background: rgba(61, 255, 176, 0.1);
}
.evo-step-score i {
  color: var(--dim);
}
.evo-step-flow {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}
.evo-step-flow span {
  padding: 3px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--muted);
  font-size: 10px;
  white-space: nowrap;
}
.evo-step-flow span:first-child {
  color: var(--green);
  background: rgba(61, 255, 176, 0.08);
}
.evo-step-flow span.muted {
  color: #ffb84d;
  background: rgba(255, 184, 77, 0.08);
}
.evo-step-recipe {
  display: grid;
  gap: 3px;
  margin-top: 7px;
}
.evo-step-recipe b,
.evo-step-recipe em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.evo-step-recipe b {
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.evo-step-recipe em {
  color: var(--dim);
  font-size: 10px;
  font-style: normal;
}
.experience-board {
  display: grid;
  gap: 7px;
  margin-top: 10px;
  padding: 8px;
  border: 1px solid rgba(139, 92, 255, 0.24);
  border-radius: 7px;
  background: rgba(139, 92, 255, 0.055);
}
.experience-head,
.experience-stats {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.experience-head span {
  color: #fff;
  font-size: 12px;
  font-weight: 900;
}
.experience-head em,
.experience-head b,
.experience-stats span {
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 10px;
  white-space: nowrap;
}
.experience-head em {
  color: var(--green);
  background: rgba(61, 255, 176, 0.08);
  font-style: normal;
}
.experience-head b {
  color: #d8ccff;
  background: rgba(139, 92, 255, 0.16);
}
.experience-stats span {
  color: var(--muted);
  background: rgba(255, 255, 255, 0.04);
}
.experience-recipes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 6px;
}
.experience-recipe {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-areas:
    "source title"
    "source meta"
    "source detail";
  gap: 2px 7px;
  padding: 7px;
  border: 1px solid rgba(58, 224, 255, 0.2);
  border-radius: 6px;
  background: rgba(58, 224, 255, 0.045);
}
.experience-recipe.local {
  border-color: rgba(61, 255, 176, 0.24);
  background: rgba(61, 255, 176, 0.055);
}
.experience-recipe span {
  grid-area: source;
  align-self: start;
  padding: 2px 5px;
  border-radius: 4px;
  color: var(--cyan);
  background: rgba(58, 224, 255, 0.12);
  font-size: 10px;
  font-weight: 900;
}
.experience-recipe.local span {
  color: var(--green);
  background: rgba(61, 255, 176, 0.12);
}
.experience-recipe b,
.experience-recipe em,
.experience-recipe i {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.experience-recipe b {
  grid-area: title;
  color: #fff;
  font-size: 11px;
}
.experience-recipe em {
  grid-area: meta;
  color: #d8ccff;
  font-size: 10px;
  font-style: normal;
}
.experience-recipe i {
  grid-area: detail;
  color: var(--dim);
  font-size: 10px;
  font-style: normal;
}
.evo-evidence {
  display: grid;
  grid-template-columns: auto repeat(3, minmax(180px, 1fr));
  gap: 6px;
  margin-top: 8px;
  align-items: stretch;
}
.evo-evidence-head,
.evo-evidence-item {
  min-width: 0;
  padding: 5px 7px;
  border-radius: 5px;
  font-size: 11px;
}
.evo-evidence-head {
  display: flex;
  align-items: center;
  color: var(--green);
  border: 1px solid rgba(61, 255, 176, 0.24);
  background: rgba(61, 255, 176, 0.06);
  font-weight: 800;
}
.evo-evidence-item {
  display: grid;
  grid-template-columns: auto minmax(72px, auto) minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  border: 1px solid rgba(34, 197, 94, 0.26);
  background: rgba(34, 197, 94, 0.06);
}
.evo-evidence-item.backflow {
  border-color: rgba(20, 184, 166, 0.28);
  background: rgba(20, 184, 166, 0.06);
}
.evo-evidence-item span {
  color: var(--green);
  font-weight: 800;
}
.evo-evidence-item.backflow span {
  color: var(--cyan);
}
.evo-evidence-item b {
  overflow: hidden;
  color: #fff;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.evo-evidence-item em {
  overflow: hidden;
  color: var(--muted);
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lane-mini-row {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 260px;
}
.lane-mini-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lane-mini-row em {
  color: var(--cyan);
  font-style: normal;
}
.lane-mini-row b {
  color: #fff;
  font-weight: 700;
  white-space: nowrap;
}
.trace-mini-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--panel-line);
  border-radius: 5px;
  color: var(--muted);
  font-size: 11px;
}
.trace-mini-row b { color: #fff; font-weight: 700; }
.trace-mini-row em { color: var(--cyan); font-style: normal; }

/* 对话日志 */
.pg-log {
  flex-shrink: 0;
  max-height: 110px;
  border-top: 1px solid var(--panel-line);
  background: rgba(4, 5, 13, 0.9);
  display: flex;
  flex-direction: column;
}
.log-head { padding: 8px 20px; font-size: 12px; font-weight: 700; color: var(--cyan); border-bottom: 1px solid var(--panel-line); }
.log-body { overflow-y: auto; padding: 6px 20px; }
.log-line { font-size: 13px; color: var(--muted); padding: 2px 0; }
.log-from { color: #fff; font-weight: 600; }

.canvas-wrap.canvas-focus .fleet-strip {
  grid-template-columns: minmax(220px, 1fr) auto;
  padding: 7px 20px;
}
.canvas-wrap.canvas-focus .fleet-desc,
.canvas-wrap.canvas-focus .fleet-chips {
  display: none;
}
.canvas-wrap.canvas-focus .pg-runbar {
  gap: 10px;
  padding: 9px 20px;
}
.canvas-wrap.canvas-focus .run-meta,
.canvas-wrap.canvas-focus .endpoint-key {
  display: none;
}
.canvas-wrap.canvas-focus .answer-panel {
  position: absolute;
  right: 16px;
  bottom: 72px;
  z-index: 26;
  width: min(560px, calc(100% - 32px));
  max-height: 220px;
  padding: 10px 12px;
  border: 1px solid rgba(58, 224, 255, 0.28);
  border-radius: 8px;
  background: rgba(4, 5, 13, 0.88);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(12px);
}
.canvas-wrap.canvas-focus .answer-body {
  max-height: 54px;
  font-size: 12px;
}
.canvas-wrap.canvas-focus .graph-metrics {
  margin-top: 7px;
}
.canvas-wrap.canvas-focus .swarm-audit,
.canvas-wrap.canvas-focus .purification-chain,
.canvas-wrap.canvas-focus .evolution-timeline,
.canvas-wrap.canvas-focus .experience-board,
.canvas-wrap.canvas-focus .evo-evidence,
.canvas-wrap.canvas-focus .lane-mini,
.canvas-wrap.canvas-focus .trace-mini,
.canvas-wrap.canvas-focus .pg-log {
  display: none;
}

:deep(.vue-flow__node) { padding: 0; }
:deep(.vue-flow__handle) {
  width: 10px; height: 10px;
  background: var(--cyan);
  border: 2px solid #04050d;
}
:deep(.vue-flow__edge-path) { stroke-width: 2; }
:deep(.vue-flow__controls) { box-shadow: 0 4px 14px rgba(0,0,0,.4); }
@media (max-width: 980px) {
  .fleet-strip {
    grid-template-columns: 1fr;
  }
  .trace-stats {
    display: none;
  }
  .evo-evidence {
    grid-template-columns: 1fr;
  }
  .experience-recipes {
    grid-template-columns: 1fr;
  }
  .audit-layout {
    grid-template-columns: 1fr;
  }
  .audit-rail {
    max-height: 190px;
  }
  .purification-chain {
    grid-template-columns: 1fr;
  }
}
</style>
