<script setup lang="ts">
// OnchainRunView.vue —— 链上版蜂群运行页(核心 demo 页)。
// 输入 goal + 预算 → POST /api/injective/run → 渲染 答案 / 协作trace / 分润流向图 / 交易回执。
// 契约见 docs/injective-plan/05-API-CONTRACT.md §3。
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useInjectiveStore, injToBaseUnits, baseUnitsToInj, shortAddr } from "../../stores/injective";
import SplitFlowGraph from "../../components/injective/SplitFlowGraph.vue";
import TxTimelineCard from "../../components/injective/TxTimelineCard.vue";

const wallet = useInjectiveStore();

// ── 表单状态 ──
const goal = ref("用一句话解释 Injective 链上分润如何激励 AI agent 协作。");
const tier = ref<"swarm-evo" | "swarm-heavy" | "swarm-lite" | "swarm-baseline">("swarm-evo");
const budgetInj = ref("5"); // INJ 数值字符串(人类可读)
const denom = ref("inj");

// ── 运行结果 ──
type SplitShareLike = { archetype: string; addr: string; amount: string; weight: number };
type DistributeResultLike = {
  txHash: string;
  mode: "contract" | "direct";
  splits: SplitShareLike[];
  totalDistributed: string;
  feeDeducted: string;
  success: boolean;
  error?: string;
};
type StageLike = { phase?: string; agent?: string; label?: string; status?: string; verdict?: string };

const loading = ref(false);
const errorMsg = ref<string | null>(null);
const content = ref<string>("");
const stages = ref<StageLike[]>([]);
const rewardSplit = ref<{ archetype: string; weight: number; contribution: string }[]>([]);
const breakthroughs = ref(0);
const payment = ref<DistributeResultLike | null>(null);
const elapsedSec = ref(0);

const tiers = [
  { value: "swarm-evo", label: "swarm-evo (蜂群+经验继承)" },
  { value: "swarm-heavy", label: "swarm-heavy (蜂群+聚合)" },
  { value: "swarm-lite", label: "swarm-lite (并行投票)" },
  { value: "swarm-baseline", label: "swarm-baseline (单模型基线)" },
] as const;

const renderedContent = computed(() =>
  DOMPurify.sanitize(marked.parse(content.value || "", { async: false }) as string),
);

const budgetBaseUnits = computed(() => injToBaseUnits(budgetInj.value || "0"));
const hasResult = computed(() => !!content.value || !!payment.value);

/** 提交链上蜂群运行。 */
async function runOnchain() {
  if (!goal.value.trim()) {
    errorMsg.value = "请输入目标(goal)";
    return;
  }
  if (!wallet.address) {
    errorMsg.value = "请先连接钱包或粘贴测试网地址";
    return;
  }
  loading.value = true;
  errorMsg.value = null;
  content.value = "";
  stages.value = [];
  rewardSplit.value = [];
  breakthroughs.value = 0;
  payment.value = null;
  const t0 = Date.now();

  try {
    const res = await fetch("/api/injective/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: goal.value,
        tier: tier.value,
        budgetAmount: budgetBaseUnits.value,
        budgetDenom: denom.value,
        senderAddr: wallet.address,
      }),
    });
    const data = await res.json();
    elapsedSec.value = Number(((Date.now() - t0) / 1000).toFixed(1));

    if (!res.ok || data.error) {
      const err = data.error || {};
      if (err.type === "insufficient_balance") {
        errorMsg.value = `链上余额不足:需 ${baseUnitsToInj(err.need)} INJ,仅有 ${baseUnitsToInj(err.have)} INJ`;
      } else {
        errorMsg.value = err.message || `HTTP ${res.status}`;
      }
      return;
    }

    content.value = data.content || "";
    const trace = data.trace || {};
    stages.value = trace.events || trace.stages || [];
    rewardSplit.value = trace.reward_split || trace.rewardSplit || [];
    breakthroughs.value = trace.breakthroughs_broadcast || 0;
    payment.value = data.payment || null;
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

/** 协作 trace 时间线:把 events 压成可读步骤。 */
const timeline = computed(() =>
  stages.value
    .filter((s) => s.phase || s.agent || s.label)
    .slice(0, 40)
    .map((s) => ({
      phase: s.phase || "-",
      agent: s.agent || "-",
      label: s.label || s.status || "",
      verdict: s.verdict || "",
      status: s.status || "",
    })),
);
</script>

<template>
  <div class="onchain-page">
    <header class="page-head">
      <h1>⛓️ SwarmPay · 链上蜂群</h1>
      <p class="sub">下目标 → 蜂群分工协作 → payer agent 按贡献在 Injective 链上分润。</p>
      <div class="wallet-strip">
        <span v-if="wallet.address" class="addr-pill" :title="wallet.address">
          🪪 {{ shortAddr(wallet.address) }}
          <span v-if="wallet.balance" class="bal">· {{ baseUnitsToInj(wallet.balance.amount) }} {{ wallet.balance.denom }}</span>
        </span>
        <span v-else class="addr-pill warn">未连接钱包</span>
        <RouterLink to="/wallet" class="link">钱包管理</RouterLink>
        <span class="net" :class="wallet.isMock ? 'mock' : 'real'">{{ wallet.status?.network || "?" }}</span>
      </div>
    </header>

    <!-- 表单 -->
    <section class="form-card">
      <label class="field">
        <span>目标 goal</span>
        <textarea v-model="goal" rows="3" placeholder="让蜂群协作完成什么?" />
      </label>
      <div class="row">
        <label class="field grow">
          <span>蜂群档位 tier</span>
          <select v-model="tier">
            <option v-for="t in tiers" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
        </label>
        <label class="field">
          <span>预算 (INJ)</span>
          <input v-model="budgetInj" type="text" inputmode="decimal" />
          <small class="hint">→ {{ budgetBaseUnits }} 最小单位</small>
        </label>
        <label class="field">
          <span>denom</span>
          <input v-model="denom" type="text" />
        </label>
      </div>
      <button class="run-btn" :disabled="loading || !wallet.address" @click="runOnchain">
        {{ loading ? "蜂群协作中…" : "🚀 运行链上蜂群" }}
      </button>
      <p v-if="errorMsg" class="error">⚠️ {{ errorMsg }}</p>
    </section>

    <!-- 结果 -->
    <section v-if="hasResult" class="result-grid">
      <div class="cell answer">
        <h3>🐝 蜂群答案</h3>
        <div v-if="content" class="markdown" v-html="renderedContent" />
        <p v-else class="muted">(无答案返回)</p>
        <small class="meta">耗时 {{ elapsedSec }}s · 突破 {{ breakthroughs }} 次</small>
      </div>

      <div class="cell trace">
        <h3>🧩 协作 trace</h3>
        <ol v-if="timeline.length" class="timeline">
          <li v-for="(s, i) in timeline" :key="i" :class="s.status">
            <span class="ph">{{ s.phase }}</span>
            <span class="ag">{{ s.agent }}</span>
            <span class="lb">{{ s.label }}</span>
            <span v-if="s.verdict" class="vd" :class="s.verdict.toLowerCase()">{{ s.verdict }}</span>
          </li>
        </ol>
        <p v-else class="muted">(无 trace 事件)</p>
        <details v-if="rewardSplit.length" class="split-raw">
          <summary>reward_split ({{ rewardSplit.length }})</summary>
          <ul>
            <li v-for="(r, i) in rewardSplit" :key="i">
              <b>{{ r.archetype }}</b> · 权重 {{ r.weight.toFixed(3) }} · {{ r.contribution?.slice(0, 40) }}
            </li>
          </ul>
        </details>
      </div>

      <div class="cell flow">
        <h3>💸 分润流向</h3>
        <SplitFlowGraph
          v-if="payment?.splits?.length"
          :splits="payment.splits"
          :total-distributed="payment.totalDistributed"
          :denom="denom"
        />
        <p v-else class="muted">{{ payment ? "无有效分润方" : "预算为 0,未分润" }}</p>
      </div>

      <div class="cell receipt">
        <h3>🧾 交易回执</h3>
        <TxTimelineCard v-if="payment" :payment="payment" :denom="denom" />
        <p v-else class="muted">无链上交易</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.onchain-page { max-width: 1100px; margin: 0 auto; padding: 24px; color: var(--text, #e8e8f0); }
.page-head h1 { margin: 0 0 4px; font-size: 24px; }
.page-head .sub { margin: 0 0 12px; color: var(--muted, #8a8aa0); }
.wallet-strip { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.addr-pill { font-family: monospace; background: rgba(99,102,241,.15); padding: 4px 10px; border-radius: 999px; font-size: 13px; }
.addr-pill.warn { background: rgba(245,158,11,.18); }
.addr-pill .bal { opacity: .8; }
.link { color: #818cf8; font-size: 13px; }
.net { font-size: 11px; padding: 2px 8px; border-radius: 999px; text-transform: uppercase; }
.net.mock { background: rgba(148,163,184,.2); color: #94a3b8; }
.net.real { background: rgba(34,197,94,.2); color: #4ade80; }

.form-card { background: rgba(20,20,35,.6); border: 1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 20px; margin: 16px 0; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.field span { color: var(--muted, #8a8aa0); }
.field textarea, .field input, .field select { background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; color: inherit; padding: 8px 10px; font-size: 14px; }
.row { display: flex; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
.grow { flex: 1; min-width: 220px; }
.hint { font-size: 11px; opacity: .6; }
.run-btn { margin-top: 16px; width: 100%; padding: 12px; font-size: 15px; font-weight: 600; border: none; border-radius: 10px; background: linear-gradient(135deg,#6366f1,#22d3ee); color: #fff; cursor: pointer; }
.run-btn:disabled { opacity: .5; cursor: not-allowed; }
.error { color: #f87171; margin: 10px 0 0; font-size: 13px; }

.result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
.cell { background: rgba(20,20,35,.6); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 16px; }
.cell h3 { margin: 0 0 10px; font-size: 15px; }
.muted { color: var(--muted, #8a8aa0); font-size: 13px; }
.meta { color: var(--muted, #8a8aa0); font-size: 12px; }
.markdown { line-height: 1.6; font-size: 14px; }
.timeline { list-style: none; padding: 0; margin: 0; max-height: 280px; overflow: auto; }
.timeline li { display: flex; gap: 6px; align-items: center; padding: 4px 0; font-size: 12px; border-bottom: 1px dashed rgba(255,255,255,.05); }
.timeline .ph { background: rgba(99,102,241,.2); padding: 1px 6px; border-radius: 4px; font-size: 10px; }
.timeline .ag { color: #a5b4fc; min-width: 70px; }
.timeline .lb { flex: 1; color: var(--text, #e8e8f0); opacity: .85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.timeline .vd { font-size: 10px; padding: 1px 6px; border-radius: 4px; }
.timeline .vd.approve { background: rgba(34,197,94,.2); color: #4ade80; }
.timeline .vd.reject { background: rgba(239,68,68,.2); color: #f87171; }
.split-raw { margin-top: 10px; font-size: 12px; }
.split-raw ul { padding-left: 16px; }
@media (max-width: 760px) { .result-grid { grid-template-columns: 1fr; } }
</style>