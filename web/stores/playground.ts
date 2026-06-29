// Playground 状态:节点运行态、突破源、运行控制
import { defineStore } from "pinia";
import { ref } from "vue";
import type { SwarmTrace } from "../api/swarm";

export type NodeStatus = "idle" | "active" | "breakthrough" | "entrancing" | "error";
export type PlaygroundMode = "default" | "custom";
export type PlaybackStatus = "idle" | "calling" | "replaying" | "done" | "error";

export interface NodeRuntime {
  status: NodeStatus;
  bubble: string;
}

export interface EvolutionRunSnapshot {
  id: string;
  runNumber: number;
  at: number;
  tier: string;
  difficulty: string;
  inheritedLocal: number;
  inheritedRemote: number;
  inheritedTotal: number;
  topRecipeTitle: string;
  topRecipeSource: string;
  topRecipeGeneration?: number;
  topRecipeQuality?: number;
  topRecipeReuse?: number;
  depositedGeneration?: number;
  depositedQuality?: number;
  qualityDelta?: number;
  depositedStreak?: number;
  depositedTitle: string;
  backflowStatus: string;
  backflowTitle: string;
  graphInheritEvents: number;
  graphBackflowEvents: number;
  agentRuns: number;
  handoffs: number;
  subtasks: number;
  revisions: number;
}

export const usePlaygroundStore = defineStore("playground", () => {
  // 节点运行态 keyed by node id
  const nodeState = ref<Record<string, NodeRuntime>>({});
  // 标记为突破源的节点 id 集合
  const breakthroughSources = ref<Set<string>>(new Set());
  // 是否正在跑流转
  const running = ref(false);
  // 当前激活的节点 id(画布高亮用)
  const activeNodeId = ref<string | null>(null);
  // Playground 模式与真实蜂群档位
  const mode = ref<PlaygroundMode>("default");
  const tier = ref("swarm-evo");
  const playbackStatus = ref<PlaybackStatus>("idle");
  const finalAnswer = ref("");
  const errorMsg = ref("");
  const lastTrace = ref<SwarmTrace | null>(null);
  const evolutionHistory = ref<EvolutionRunSnapshot[]>([]);
  const evolutionRunSeq = ref(0);
  // 经验回流提示
  const backflowMsg = ref<string>("");
  // 全局消息日志(对话流)
  const log = ref<{ from: string; text: string; ts: number }[]>([]);

  // ── 经验宝箱 ──
  // 宝箱库存总数(从后端 stats 拉,代表累积的经验条数)
  const treasury = ref<number>(0);
  // 宝箱发光态(收到金币时 pulse)
  const treasurePulse = ref<boolean>(false);
  // 飞行中的金币(绝对屏幕坐标)
  interface Coin {
    id: string;
    fromX: number; fromY: number; toX: number; toY: number;
    kind: "in" | "out"; // in=画布→宝箱(回流), out=宝箱→画布(继承)
  }
  const coins = ref<Coin[]>([]);

  // ── 积分扣减飘字(Demo / 真实调用成功后,显示 -50)──
  interface CreditFloat {
    id: string;
    delta: number;      // 负数 = 扣减
    fromX: number; fromY: number;
    toX: number; toY: number;
  }
  const creditFloat = ref<CreditFloat[]>([]);

  /** 显示积分扣减飘字(坐标由调用方算好) */
  function showCreditFloat(delta: number, fromX: number, fromY: number, toX: number, toY: number) {
    const id = `credit-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    creditFloat.value = [...creditFloat.value, { id, delta, fromX, fromY, toX, toY }];
    setTimeout(() => {
      creditFloat.value = creditFloat.value.filter((c) => c.id !== id);
    }, 1500);
  }

  async function loadTreasury() {
    try {
      const res = await fetch("/api/evolution/memory/stats");
      if (res.ok) {
        const d = await res.json();
        treasury.value = Number(d.total) || 0;
      }
    } catch {
      /* 后端不可用时静默,宝箱库存显示 0 */
    }
  }

  function addTreasury(n: number) {
    treasury.value += n;
  }

  function pulseTreasure() {
    treasurePulse.value = true;
    // 宝箱打开音效
    import("../composables/useCoinSound").then(({ playTreasureOpenSound }) => playTreasureOpenSound()).catch(() => { /* ignore */ });
    setTimeout(() => { treasurePulse.value = false; }, 700);
  }

  /** 生成金币飞行(坐标由调用方算好后传入) */
  function spawnCoins(kind: Coin["kind"], routes: Array<{ fromX: number; fromY: number; toX: number; toY: number }>) {
    const newCoins: Coin[] = routes.map((r, i) => ({
      id: `coin-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      fromX: r.fromX, fromY: r.fromY, toX: r.toX, toY: r.toY,
      kind,
    }));
    coins.value = [...coins.value, ...newCoins];
    // 播金币音效(每枚错开 90ms,避免叠音太糊)
    newCoins.forEach((c, i) => {
      setTimeout(() => {
        // 动态 import 避免影响首屏
        import("../composables/useCoinSound").then(({ playCoinSound }) => playCoinSound()).catch(() => { /* ignore */ });
      }, i * 90);
    });
    // 飞行结束后清理(1.2s)
    setTimeout(() => {
      const ids = new Set(newCoins.map((c) => c.id));
      coins.value = coins.value.filter((c) => !ids.has(c.id));
    }, 1300);
  }

  function ensure(id: string): NodeRuntime {
    if (!nodeState.value[id]) {
      nodeState.value[id] = { status: "idle", bubble: "" };
    }
    return nodeState.value[id];
  }

  function activate(id: string, bubble: string, isBreakthrough = false) {
    ensure(id);
    nodeState.value[id] = {
      status: isBreakthrough ? "breakthrough" : "active",
      bubble,
    };
    activeNodeId.value = id;
  }

  function setBubble(id: string, text: string, status: NodeStatus = "active") {
    ensure(id);
    nodeState.value[id] = { status, bubble: text };
    activeNodeId.value = id;
  }

  /** 登场:播语音 + 弹台词 + 闪光态,持续后回 idle */
  function entrance(id: string, bubble: string) {
    ensure(id);
    nodeState.value[id] = { status: "entrancing", bubble };
    activeNodeId.value = id;
  }

  function clearBubble(id: string) {
    if (nodeState.value[id]) {
      nodeState.value[id].bubble = "";
      nodeState.value[id].status = "idle";
    }
  }

  function resetAll() {
    for (const id of Object.keys(nodeState.value)) {
      nodeState.value[id] = { status: "idle", bubble: "" };
    }
    activeNodeId.value = null;
    backflowMsg.value = "";
  }

  function resetRunState() {
    resetAll();
    log.value = [];
    finalAnswer.value = "";
    errorMsg.value = "";
    lastTrace.value = null;
    playbackStatus.value = "idle";
  }

  function setFinalAnswer(text: string) {
    finalAnswer.value = text;
  }

  function setError(text: string) {
    errorMsg.value = text;
    playbackStatus.value = "error";
  }

  function buildEvolutionSnapshot(trace: SwarmTrace): EvolutionRunSnapshot | null {
    const inherited = trace.inherited_recipes || [];
    const evolution = trace.evolution;
    const deposited = evolution?.deposited;
    const backflow = trace.evomap_backflow;
    const graphEvents = trace.graph?.events || [];
    const hasEvidence = !!(
      inherited.length ||
      evolution ||
      deposited ||
      backflow ||
      graphEvents.some((event) => event.kind === "inherit" || event.kind === "backflow")
    );
    if (!hasEvidence) return null;

    const topRecipe = inherited[0];
    const remoteCount = inherited.filter((recipe) => recipe.source !== "local").length;
    const runNumber = evolutionRunSeq.value + 1;
    const depositedQuality = deposited?.qualityScore ?? backflow?.qualityScore;
    const previousQuality = evolutionHistory.value[evolutionHistory.value.length - 1]?.depositedQuality;
    const qualityDelta = typeof depositedQuality === "number" && typeof previousQuality === "number"
      ? Number((depositedQuality - previousQuality).toFixed(3))
      : undefined;
    return {
      id: `${Date.now()}-${runNumber}`,
      runNumber,
      at: Date.now(),
      tier: trace.tier,
      difficulty: trace.graph?.difficulty || trace.difficulty || trace.policy?.difficulty || "unknown",
      inheritedLocal: evolution?.inheritedLocal ?? inherited.filter((recipe) => recipe.source === "local").length,
      inheritedRemote: evolution?.inheritedRemote ?? remoteCount,
      inheritedTotal: inherited.length,
      topRecipeTitle: topRecipe?.title || "本轮未命中可复用经验",
      topRecipeSource: topRecipe?.source || "none",
      topRecipeGeneration: topRecipe?.generation,
      topRecipeQuality: topRecipe?.qualityScore,
      topRecipeReuse: topRecipe?.reuseCount,
      depositedGeneration: deposited?.generation ?? backflow?.generation,
      depositedQuality,
      qualityDelta,
      depositedStreak: deposited?.successStreak,
      depositedTitle: deposited?.title || backflow?.title || "",
      backflowStatus: backflow?.status || "local-only",
      backflowTitle: backflow?.title || deposited?.title || "本地进化记忆",
      graphInheritEvents: graphEvents.filter((event) => event.kind === "inherit").length,
      graphBackflowEvents: graphEvents.filter((event) => event.kind === "backflow").length,
      agentRuns: trace.graph?.metrics?.agentRuns || trace.graph?.nodes?.length || trace.swarm_size || 0,
      handoffs: trace.graph?.metrics?.handoffs || trace.handoffs?.length || 0,
      subtasks: trace.graph?.metrics?.subtasks || trace.subtasks?.length || 0,
      revisions: trace.graph?.metrics?.revisions || trace.events?.filter((event) => event.kind === "revision").length || 0,
    };
  }

  function setTrace(trace: SwarmTrace | null) {
    lastTrace.value = trace;
    if (!trace) return;
    const snapshot = buildEvolutionSnapshot(trace);
    if (!snapshot) return;
    evolutionRunSeq.value = snapshot.runNumber;
    evolutionHistory.value = [...evolutionHistory.value.slice(-5), snapshot];
  }

  function clearEvolutionHistory() {
    evolutionHistory.value = [];
    evolutionRunSeq.value = 0;
  }

  function setNodeRole(_id: string, _role: string) {
    // role 存在 vue-flow node.data 里,由组件通过 emitNodes 回写;这里仅触发响应
    // 实际 role 更新在 PlaygroundView 的 onNodesChange 里处理
  }

  function toggleBreakthroughSource(id: string) {
    if (breakthroughSources.value.has(id)) {
      breakthroughSources.value.delete(id);
    } else {
      breakthroughSources.value.add(id);
    }
    breakthroughSources.value = new Set(breakthroughSources.value);
  }

  function addLog(from: string, text: string) {
    log.value.push({ from, text, ts: Date.now() });
    if (log.value.length > 50) log.value.shift();
  }

  return {
    nodeState, breakthroughSources, running, activeNodeId,
    mode, tier, playbackStatus, finalAnswer, errorMsg, lastTrace, evolutionHistory, backflowMsg, log,
    treasury, treasurePulse, coins, loadTreasury, addTreasury, pulseTreasure, spawnCoins,
    creditFloat, showCreditFloat,
    ensure, activate, setBubble, entrance, clearBubble, resetAll, resetRunState,
    setFinalAnswer, setError, setTrace, clearEvolutionHistory, setNodeRole, toggleBreakthroughSource, addLog,
  };
});
