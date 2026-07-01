<script setup lang="ts">
import { useI18n } from "vue-i18n";
// OnchainRunView.vue —— 链上版蜂群运行页(核心 demo 页)。
// 输入 goal + 预算 → POST /api/injective/run → 渲染 答案 / 协作trace / 分润流向图 / 交易回执。
// 契约见 docs/injective-plan/05-API-CONTRACT.md §3。
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useInjectiveStore, injToBaseUnits, baseUnitsToInj, shortAddr } from "../../stores/injective";
import SplitFlowGraph from "../../components/injective/SplitFlowGraph.vue";
import TxTimelineCard from "../../components/injective/TxTimelineCard.vue";

const { t } = useI18n();
const wallet = useInjectiveStore();

// ── 表单状态 ──
const goal = ref(t("onchainrun.defaultGoal"));
const tier = ref<"swarm-evo" | "swarm-heavy" | "swarm-lite" | "swarm-baseline">("swarm-evo");
const budgetInj = ref("5"); // INJ 数值字符串(人类可读)
const denom = ref("inj");
const localAddr = ref(""); // 未连接钱包时的内联地址输入

/** 内联使用粘贴的地址。 */
async function useLocalAddr() {
  const a = localAddr.value.trim();
  if (!/^inj1[a-z0-9]+$/i.test(a)) {
    errorMsg.value = t("onchainrun.errAddrFormat");
    return;
  }
  await wallet.connectManual(a);
  errorMsg.value = null;
}

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

/** 链上悬赏执行回执(深度3:reviewer→coder),宽松匹配后端 BountyExecutionResult。 */
type BountyResultLike = {
  bounty?: { fromArch?: string; toArch?: string; amountSmallest?: string; reason?: string };
  fromArch?: string;
  toArch?: string;
  amountSmallest?: string;
  reason?: string;
  success?: boolean;
  txHash?: string;
  receipt?: { txHash?: string };
};

const loading = ref(false);
const errorMsg = ref<string | null>(null);
const content = ref<string>("");
const stages = ref<StageLike[]>([]);
const rewardSplit = ref<{ archetype: string; weight: number; contribution: string }[]>([]);
const breakthroughs = ref(0);
const payment = ref<DistributeResultLike | null>(null);
const bounties = ref<BountyResultLike[]>([]);
const elapsedSec = ref(0);

/** 协议费基点(默认 500 = 5%),从 wallet.status 读取,前端计费预览用。 */
const protocolFeeBps = computed(() => wallet.status?.protocolFeeBps ?? 500);

/** 计费预览:预算拆为 协议费 + 按 LLM 权重分给 agent 的池子。 */
const billingPreview = computed(() => {
  const budget = Number(budgetInj.value || "0") || 0;
  const bps = protocolFeeBps.value;
  const feeRate = bps / 10000;
  const fee = budget * feeRate;
  const pool = budget - fee;
  const pct = (bps / 100).toFixed(bps % 100 === 0 ? 0 : 1);
  return {
    budget,
    fee,
    pool,
    pct,
  };
});

/** 取某个 archetype 的短链上地址(从 /api/injective/status 拉取的 archetypeAddrs)。 */
function archShort(archetype?: string): string | null {
  if (!archetype) return null;
  const addr = wallet.archetypeAddrs[archetype];
  if (!addr) return null;
  return shortAddr(addr, 6, 4);
}

onMounted(() => {
  // 拉取链层状态 + 各 archetype 链上地址(供 trace 时间线显示短地址)
  wallet.fetchStatus?.();
});

const tiers = [
  { value: "swarm-evo", label: "onchainrun.tierEvo" },
  { value: "swarm-heavy", label: "onchainrun.tierHeavy" },
  { value: "swarm-lite", label: "onchainrun.tierLite" },
  { value: "swarm-baseline", label: "onchainrun.tierBaseline" },
] as const;

const renderedContent = computed(() =>
  DOMPurify.sanitize(marked.parse(content.value || "", { async: false }) as string),
);

const budgetBaseUnits = computed(() => injToBaseUnits(budgetInj.value || "0"));
const hasResult = computed(() => !!content.value || !!payment.value);

/** 提交链上蜂群运行。 */
async function runOnchain() {
  if (!goal.value.trim()) {
    errorMsg.value = t("onchainrun.errNoGoal");
    return;
  }
  if (!wallet.address) {
    errorMsg.value = t("onchainrun.errNoWallet");
    return;
  }
  loading.value = true;
  errorMsg.value = null;
  content.value = "";
  stages.value = [];
  rewardSplit.value = [];
  breakthroughs.value = 0;
  payment.value = null;
  bounties.value = [];
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
    bounties.value = Array.isArray(data.bounties) ? data.bounties : [];

    // 持久化最近一次成功分润回执(CreditsView 兜底展示近期活动)
    if (payment.value && payment.value.success !== false) {
      try {
        localStorage.setItem("swarmpay:last-payment", JSON.stringify(payment.value));
      } catch {
        /* localStorage 不可用则忽略 */
      }
    }
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
      archAddr: archShort(s.agent),
      label: s.label || s.status || "",
      verdict: s.verdict || "",
      status: s.status || "",
    })),
);

/** 提取悬赏回执的 txHash(兼容 receipt.txHash 与 top-level txHash 两种形状)。 */
function bountyTxHash(b: BountyResultLike): string | null {
  return b.receipt?.txHash || b.txHash || null;
}

/** 把悬赏 amount(最小单位)转人类可读 INJ。 */
function bountyAmountInj(b: BountyResultLike): string {
  const raw = b.bounty?.amountSmallest ?? b.amountSmallest ?? "0";
  return baseUnitsToInj(raw);
}
</script>

<template>
  <div class="onchain-page">
    <header class="page-head">
      <h1>{{ t('onchainrun.k1') }}</h1>
      <p class="sub">{{ t('onchainrun.k2') }}</p>
      <div class="wallet-strip">
        <span v-if="wallet.address" class="addr-pill" :title="wallet.address">
          🪪 {{ shortAddr(wallet.address) }}
          <span v-if="wallet.balance" class="bal">· {{ baseUnitsToInj(wallet.balance.amount) }} {{ wallet.balance.denom }}</span>
        </span>
        <span v-else class="addr-pill warn">{{ t('onchainrun.k3') }}</span>
        <RouterLink to="/wallet" class="link">{{ t('onchainrun.k4') }}</RouterLink>
        <span class="net" :class="wallet.isMock ? 'mock' : 'real'">{{ wallet.status?.network || "?" }}</span>
      </div>
    </header>

    <!-- 表单 -->
    <section class="form-card">
      <!-- 未连接钱包时,内联输入地址(不依赖跨页状态) -->
      <label v-if="!wallet.address" class="field addr-inline">
        <span>{{ t('onchainrun.k5') }}</span>
        <div class="addr-row">
          <input v-model="localAddr" type="text" placeholder="inj1..." />
          <button class="addr-btn" @click="useLocalAddr">{{ t('onchainrun.k6') }}</button>
        </div>
      </label>
      <label class="field">
        <span>{{ t('onchainrun.k7') }}</span>
        <textarea v-model="goal" rows="3" :placeholder="t('onchainrun.k20')" />
      </label>
      <div class="row">
        <label class="field grow">
          <span>{{ t('onchainrun.k8') }}</span>
          <select v-model="tier">
            <option v-for="tierOpt in tiers" :key="tierOpt.value" :value="tierOpt.value">{{ t(tierOpt.label) }}</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('onchainrun.k9') }}</span>
          <input v-model="budgetInj" type="text" inputmode="decimal" />
          <small class="hint">→ {{ budgetBaseUnits }} 最小单位</small>
          <small class="hint billing">
            计费预览:预算 {{ billingPreview.budget }} INJ = {{ billingPreview.pct }}% 协议费
            ({{ billingPreview.fee.toFixed(4) }}) + {{ (100 - Number(billingPreview.pct)).toFixed(billingPreview.pct.includes('.') ? 1 : 0) }}% 按 LLM 权重分给 agent
            ({{ billingPreview.pool.toFixed(4) }})
          </small>
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
        <h3>{{ t('onchainrun.k10') }}</h3>
        <div v-if="content" class="markdown" v-html="renderedContent" />
        <p v-else class="muted">{{ t('onchainrun.k11') }}</p>
        <small class="meta">耗时 {{ elapsedSec }}s · 突破 {{ breakthroughs }} 次</small>
      </div>

      <div class="cell trace">
        <h3>{{ t('onchainrun.k12') }}</h3>
        <ol v-if="timeline.length" class="timeline">
          <li v-for="(s, i) in timeline" :key="i" :class="s.status">
            <span class="ph">{{ s.phase }}</span>
            <span class="ag">{{ s.agent }}</span>
            <span v-if="s.archAddr" class="arch-addr" :title="wallet.archetypeAddrs[s.agent]">{{ s.archAddr }}</span>
            <span class="lb">{{ s.label }}</span>
            <span v-if="s.verdict" class="vd" :class="s.verdict.toLowerCase()">{{ s.verdict }}</span>
          </li>
        </ol>
        <p v-else class="muted">{{ t('onchainrun.k13') }}</p>
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
        <h3>{{ t('onchainrun.k14') }}</h3>
        <SplitFlowGraph
          v-if="payment?.splits?.length"
          :splits="payment.splits"
          :total-distributed="payment.totalDistributed"
          :denom="denom"
        />
        <p v-else class="muted">{{ payment ? "无有效分润方" : "预算为 0,未分润" }}</p>
      </div>

      <div class="cell receipt">
        <h3>{{ t('onchainrun.k15') }}</h3>
        <TxTimelineCard v-if="payment" :payment="payment" :denom="denom" />
        <p v-else class="muted">{{ t('onchainrun.k16') }}</p>
        <a
          v-if="payment?.txHash"
          class="mintscan-link"
          :href="`https://testnet.mintscan.io/injective-testnet/tx/${payment.txHash}`"
          target="_blank"
          rel="noopener noreferrer"
        >{ t('onchainrun.k17') }}</a>
      </div>

      <div class="cell bounty-flow">
        <h3>{{ t('onchainrun.k18') }}</h3>
        <ul v-if="bounties.length" class="bounty-list">
          <li v-for="(b, i) in bounties" :key="i" :class="{ ok: b.success, fail: b.success === false }">
            <span class="bf-arch">{{ b.bounty?.fromArch ?? b.fromArch }}</span>
            <span class="bf-arrow">→</span>
            <span class="bf-arch">{{ b.bounty?.toArch ?? b.toArch }}</span>
            <span class="bf-amt">· {{ bountyAmountInj(b) }} INJ</span>
            <span v-if="b.bounty?.reason ?? b.reason" class="bf-reason">· {{ (b.bounty?.reason ?? b.reason) }}</span>
            <a
              v-if="bountyTxHash(b)"
              class="mintscan-link inline"
              :href="`https://testnet.mintscan.io/injective-testnet/tx/${bountyTxHash(b)}`"
              target="_blank"
              rel="noopener noreferrer"
            >tx ↗</a>
          </li>
        </ul>
        <p v-else class="muted">{{ t('onchainrun.k19') }}</p>
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
.addr-inline { margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px dashed rgba(255,255,255,.08); }
.addr-row { display: flex; gap: 8px; }
.addr-row input { flex: 1; }
.addr-btn { padding: 8px 14px; border: 1px solid #818cf8; background: rgba(99,102,241,.15); color: #a5b4fc; border-radius: 8px; cursor: pointer; font-size: 13px; white-space: nowrap; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.field span { color: var(--muted, #8a8aa0); }
.field textarea, .field input, .field select { background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; color: inherit; padding: 8px 10px; font-size: 14px; }
.row { display: flex; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
.grow { flex: 1; min-width: 220px; }
.hint { font-size: 11px; opacity: .6; }
.run-btn { margin-top: 16px; width: 100%; padding: 12px; font-size: 15px; font-weight: 600; border: none; border-radius: 10px; background: linear-gradient(135deg,#6366f1,#22d3ee); color: #fff; cursor: pointer; }
.run-btn:disabled { opacity: .5; cursor: not-allowed; }
.error { color: #f87171; margin: 10px 0 0; font-size: 13px; }

.result-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-top: 16px; }
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

/* ── 新增:计费预览 / archetype 短地址 / 悬赏流向 / Mintscan 链接 ── */
.billing { display: block; margin-top: 2px; color: var(--muted, #8a8aa0); line-height: 1.4; }
.timeline .arch-addr { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 10px; color: #67e8f9; background: rgba(34,211,238,.12); padding: 1px 5px; border-radius: 4px; letter-spacing: .3px; }
.mintscan-link { display: inline-block; margin-top: 8px; color: #818cf8; font-size: 12px; text-decoration: none; }
.mintscan-link:hover { text-decoration: underline; }
.mintscan-link.inline { display: inline; margin-top: 0; margin-left: 4px; font-size: 11px; }
.bounty-list { list-style: none; padding: 0; margin: 0; }
.bounty-list li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 6px 0; font-size: 12px; border-bottom: 1px dashed rgba(255,255,255,.06); }
.bounty-list li.fail { opacity: .55; }
.bf-arch { color: #a5b4fc; font-weight: 600; }
.bf-arrow { color: var(--muted, #8a8aa0); }
.bf-amt { color: #4ade80; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.bf-reason { color: var(--muted, #8a8aa0); flex: 1; min-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>