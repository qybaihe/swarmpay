// Pinia store:对话页状态(多轮问答,不复用 playground 单例)
import { defineStore } from "pinia";
import { ref } from "vue";
import type { SwarmTrace } from "../api/swarm";
import { runSwarm } from "../api/swarm";
import { useTransformStore } from "./transform";

export interface ChatLog {
  from: string;
  text: string;
  ts: number;
}

export interface ChatMetrics {
  latencyMs: number;
  agentRuns: number;
  handoffs: number;
  broadcasts: number;
  revisions: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: SwarmTrace | null;
  logs: ChatLog[];
  metrics?: ChatMetrics;
  // direct 单次对比(开关开启时)
  direct?: { content: string; latencyMs: number; error?: string };
  error?: string;
  replaying?: boolean;
}

function rid(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function extractMetrics(trace: SwarmTrace | null | undefined): ChatMetrics | undefined {
  if (!trace) return undefined;
  const g = trace.graph;
  if (g?.metrics) {
    return {
      latencyMs: g.metrics.totalLatencyMs ?? trace.total_latency_ms ?? 0,
      agentRuns: g.metrics.agentRuns ?? 0,
      handoffs: g.metrics.handoffs ?? 0,
      broadcasts: g.metrics.broadcasts ?? 0,
      revisions: g.metrics.revisions ?? 0,
    };
  }
  return { latencyMs: trace.total_latency_ms ?? 0, agentRuns: trace.swarm_size ?? 0, handoffs: 0, broadcasts: trace.breakthroughs_broadcast ?? 0, revisions: 0 };
}

export const useChatStore = defineStore("chat", () => {
  const messages = ref<ChatMessage[]>([]);
  const modelId = ref("swarm-evo");
  const compareDirect = ref(false);
  const running = ref(false);

  function setModel(id: string) {
    modelId.value = id;
  }

  function toggleCompare() {
    compareDirect.value = !compareDirect.value;
  }

  function clear() {
    messages.value = [];
  }

  /** 发送一条消息:跑舰队(必) + 可选 direct 对比 */
  async function send(text: string, onReplay: (msg: ChatMessage) => Promise<void>) {
    const goal = text.trim();
    if (!goal || running.value) return;
    const transformStore = useTransformStore();
    const apiKey = transformStore.lastApiKey || undefined;

    // 用户消息
    messages.value.push({ id: rid(), role: "user", content: goal, logs: [] });

    // AI 占位消息(跑完回填)。始终通过 messages.value[aiIdx] 访问响应式代理,
    // 不要持有原始引用直接改(改原始对象不触发更新)。
    messages.value.push({ id: rid(), role: "assistant", content: "", logs: [], replaying: true });
    const aiIdx = messages.value.length - 1;
    const getAi = () => messages.value[aiIdx];

    running.value = true;
    try {
      // 舰队请求
      const fleetPromise = runSwarm({ goal, tier: modelId.value, apiKey }).catch((e) => {
        return { content: "", trace: null, error: e instanceof Error ? e.message : "舰队调用失败" } as const;
      });

      // direct 对比(开关开启时)
      let directPromise: Promise<{ content: string; latencyMs: number; error?: string }> | undefined;
      if (compareDirect.value) {
        directPromise = runSwarm({ goal, tier: "swarm-baseline", apiKey })
          .then((r) => ({ content: r.content, latencyMs: r.trace?.total_latency_ms ?? 0 }))
          .catch((e) => ({ content: "", latencyMs: 0, error: e instanceof Error ? e.message : "direct 失败" }));
      }

      const fleetResult = await fleetPromise as { content: string; trace: SwarmTrace | null; error?: string };
      if ("error" in fleetResult && fleetResult.error) {
        getAi().error = fleetResult.error;
        getAi().content = "";
      } else {
        getAi().content = fleetResult.content || "(空)";
        getAi().trace = fleetResult.trace;
        getAi().metrics = extractMetrics(fleetResult.trace);
        // 回放日志(逐条,会 push 到 getAi().logs)
        await onReplay(getAi());
      }
      getAi().replaying = false;

      // direct 结果回填
      if (directPromise) {
        const direct = await directPromise;
        getAi().direct = { content: direct.content, latencyMs: direct.latencyMs, error: direct.error };
      }
    } finally {
      running.value = false;
      getAi().replaying = false;
    }
  }

  return { messages, modelId, compareDirect, running, setModel, toggleCompare, clear, send };
});
