<script setup lang="ts">
// INJ 钱包流水页：链上 INJ 账本（取代旧的「积分管理」）。
// 4 个区块：① 我的链上钱包 ② Agent 蜂群钱包总览 ③ 最近流水 ④ 流向说明图。
// 不依赖登录态，评委可直接访问；若已登录则展示其绑定钱包。

import { ref, computed, onMounted } from "vue";
import { RouterLink } from "vue-router";
import NavBar from "../components/NavBar.vue";
import SiteFooter from "../components/SiteFooter.vue";
import { useInjectiveStore, baseUnitsToInj, shortAddr } from "../stores/injective";

const inj = useInjectiveStore();

// ── 角色元数据 ──
const ARCH_LABEL: Record<string, string> = {
  orchestrator: "旗舰",
  planner: "导航舰",
  coder: "工程舰",
  reviewer: "监察舰",
  explorer: "斥候舰",
  payer: "支付舰",
  treasurer: "金库舰",
};
const ARCH_COLOR: Record<string, string> = {
  orchestrator: "#ffb84d",
  planner: "#5ca8ff",
  coder: "#3ae0ff",
  reviewer: "#8b5cff",
  explorer: "#ff5cc8",
  payer: "#ffd23f",
  treasurer: "#3dffb0",
};

// ── Block 1：我的钱包 ──
const manualAddr = ref("");
const connecting = ref(false);

const balanceInj = computed(() => baseUnitsToInj(inj.balance?.amount || "0"));

const networkLabel = computed(() => {
  const s = inj.status;
  if (!s) return "检测中…";
  const map: Record<string, string> = { mock: "Mock 模拟链", testnet: "Injective 测试网", mainnet: "Injective 主网" };
  return map[s.network] || s.network;
});
const networkTagClass = computed(() => {
  const n = inj.status?.network;
  if (n === "testnet") return "testnet";
  if (n === "mainnet") return "mainnet";
  if (n === "mock") return "mock";
  return "off";
});

async function onConnectManual() {
  const addr = manualAddr.value.trim();
  if (!addr) return;
  connecting.value = true;
  try {
    await inj.connectManual(addr);
  } catch {
    /* store 内已记 error */
  } finally {
    connecting.value = false;
  }
}

// ── Block 2：Agent 蜂群钱包总览 ──
interface ArchWallet {
  key: string;
  label: string;
  color: string;
  addr: string;
  amount: string; // 最小单位
  loading: boolean;
  failed: boolean;
}
const archWallets = ref<ArchWallet[]>([]);
const swarmLoading = ref(true);

async function loadSwarmWallets() {
  swarmLoading.value = true;
  try {
    await inj.fetchStatus();
    const addrs = inj.archetypeAddrs || {};
    const keys = Object.keys(addrs);
    archWallets.value = keys.map((k) => ({
      key: k,
      label: ARCH_LABEL[k] || k,
      color: ARCH_COLOR[k] || "#a8b0d4",
      addr: addrs[k],
      amount: "0",
      loading: true,
      failed: false,
    }));
    // 并发拉每个角色地址的余额
    await Promise.all(
      archWallets.value.map(async (w) => {
        try {
          const res = await fetch(`/api/injective/balance?addr=${encodeURIComponent(w.addr)}&denom=inj`);
          if (!res.ok) throw new Error(`http ${res.status}`);
          const data = (await res.json()) as { amount?: string; denom?: string };
          w.amount = String(data.amount ?? "0");
        } catch {
          w.failed = true;
          w.amount = "0";
        } finally {
          w.loading = false;
        }
      }),
    );
  } catch {
    /* 静默 */
  } finally {
    swarmLoading.value = false;
  }
}

// ── Block 3：最近流水 ──
type TxType = "reward_split" | "bounty" | "protocol_fee";
type TxDirection = "in" | "out";
interface OnchainTx {
  txHash: string;
  type: TxType;
  direction: TxDirection;
  amount: string;
  denom: string;
  counterpartyAddr?: string;
  counterpartyArchetype?: string;
  memo?: string;
  timestamp: string | number;
}
const transactions = ref<OnchainTx[]>([]);
const txLoading = ref(true);
const txSource = ref<"api" | "local" | "empty">("empty");

const TYPE_LABEL: Record<TxType, string> = {
  reward_split: "分润",
  bounty: "悬赏",
  protocol_fee: "协议费",
};

function timeFmt(ts: string | number): string {
  const t = typeof ts === "number" ? ts : Date.parse(ts);
  if (!Number.isFinite(t)) return String(ts);
  return new Date(t).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function mintscanUrl(hash: string): string {
  return `https://testnet.mintscan.io/injective-testnet/tx/${hash}`;
}

async function loadTransactions() {
  txLoading.value = true;
  const addr = inj.address;
  const url = addr
    ? `/api/injective/transactions?addr=${encodeURIComponent(addr)}`
    : `/api/injective/transactions`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as { transactions?: OnchainTx[] };
      if (data.transactions && data.transactions.length) {
        transactions.value = data.transactions;
        txSource.value = "api";
        return;
      }
    }
  } catch {
    /* 落到本地兜底 */
  }
  // 兜底：localStorage 最近一次支付
  try {
    const raw = localStorage.getItem("swarmpay:last-payment");
    if (raw) {
      const lp = JSON.parse(raw) as {
        txHash?: string;
        splits?: Array<{ archetype?: string; to?: string; amount?: string; addr?: string }>;
        totalDistributed?: string;
        feeDeducted?: string;
      };
      const txs: OnchainTx[] = [];
      const hash = lp.txHash || "mock_local";
      if (lp.feeDeducted) {
        txs.push({
          txHash: hash,
          type: "protocol_fee",
          direction: "out",
          amount: String(lp.feeDeducted),
          denom: "inj",
          counterpartyArchetype: "treasurer",
          memo: "协议费(金库)",
          timestamp: Date.now(),
        });
      }
      for (const s of lp.splits || []) {
        txs.push({
          txHash: hash,
          type: "reward_split",
          direction: "out",
          amount: String(s.amount ?? "0"),
          denom: "inj",
          counterpartyAddr: s.addr || s.to,
          counterpartyArchetype: s.archetype,
          memo: `分润 → ${s.archetype || "agent"}`,
          timestamp: Date.now(),
        });
      }
      if (txs.length) {
        transactions.value = txs;
        txSource.value = "local";
        return;
      }
    }
  } catch {
    /* 解析失败则空态 */
  }
  transactions.value = [];
  txSource.value = "empty";
}

onMounted(async () => {
  // 钱包态由 store 自恢复；刷新余额 + 状态
  await inj.fetchStatus();
  if (inj.connected && inj.address) {
    manualAddr.value = inj.connectMode === "manual" ? inj.address : "";
    await inj.fetchBalance().catch(() => {});
  }
  await Promise.all([loadSwarmWallets(), loadTransactions()]);
});
</script>

<template>
  <video class="bg-video" autoplay muted loop playsinline preload="auto" poster="/bg-starship.png">
    <source src="/bg-launch.mp4" type="video/mp4" />
  </video>
  <div class="bg-overlay"></div>

  <NavBar />

  <div class="stage">
    <div class="container">
      <div class="head">
        <h1>⛓️ INJ 钱包流水</h1>
        <p class="sub">SwarmPay 已废弃积分,所有结算均为链上 INJ。这里是你与蜂群角色的链上账本。</p>
      </div>

      <!-- ── Block 1: 我的链上钱包 ── -->
      <section class="block">
        <div class="block-title"><span class="bn">01</span> 我的链上钱包</div>
        <div v-if="inj.connected" class="wallet-panel">
          <div class="wp-head">
            <span class="wp-badge" :class="inj.connectMode">
              {{ inj.connectMode === "keplr" ? "🦊 Keplr" : "📋 手动地址" }}
            </span>
            <span class="net-tag" :class="networkTagClass">{{ networkLabel }}</span>
            <span v-if="inj.isMock" class="mock-flag">演示通道</span>
          </div>
          <div class="wp-body">
            <div class="wp-addr-block">
              <label>钱包地址</label>
              <code class="wp-addr">{{ inj.address }}</code>
              <span class="wp-short">{{ shortAddr(inj.address) }}</span>
            </div>
            <div class="wp-balance-block">
              <label>INJ 余额</label>
              <div class="wp-balance">
                <span class="wp-amt">{{ balanceInj }}</span>
                <span class="wp-denom">INJ</span>
              </div>
              <div class="wp-base">最小单位：{{ inj.balance?.amount || "0" }}</div>
            </div>
          </div>
        </div>

        <div v-else class="connect-card">
          <div class="cc-head">
            <span class="cc-icon">📋</span>
            <div>
              <div class="cc-title">粘贴测试网地址</div>
              <div class="cc-desc">未连 Keplr?直接粘贴 inj1… 地址即可查看链上流水。评委可任意填入测试地址。</div>
            </div>
          </div>
          <input
            v-model="manualAddr"
            class="cc-input"
            placeholder="inj1..."
            autocomplete="off"
            spellcheck="false"
            @keyup.enter="onConnectManual"
          />
          <div class="cc-actions">
            <button class="cc-btn" :disabled="connecting || !manualAddr.trim()" @click="onConnectManual">
              {{ connecting ? "处理中…" : "使用该地址" }}
            </button>
            <RouterLink to="/wallet" class="cc-link">🦊 用 Keplr 连接 →</RouterLink>
          </div>
        </div>

        <div v-if="inj.error" class="err-msg">⚠️ {{ inj.error }}</div>
      </section>

      <!-- ── Block 2: Agent 蜂群钱包总览 ── -->
      <section class="block">
        <div class="block-title">
          <span class="bn">02</span> Agent 蜂群钱包总览
          <span class="bt-hint">每个角色 = 一个独立链上钱包</span>
        </div>
        <div v-if="swarmLoading && !archWallets.length" class="state">加载蜂群钱包…</div>
        <div v-else-if="!archWallets.length" class="state">
          暂未获取到角色地址。后端 <code>/api/injective/status</code> 可能未返回 archetypeAddrs。
        </div>
        <div v-else class="arch-grid">
          <div v-for="w in archWallets" :key="w.key" class="arch-card">
            <div class="arch-head">
              <span class="arch-dot" :style="{ background: w.color, boxShadow: `0 0 10px ${w.color}` }"></span>
              <span class="arch-label" :style="{ color: w.color }">{{ w.label }}</span>
              <span class="arch-key">{{ w.key }}</span>
            </div>
            <code class="arch-addr">{{ shortAddr(w.addr, 10, 8) }}</code>
            <div class="arch-bal">
              <span v-if="w.loading" class="arch-loading">查询中…</span>
              <span v-else-if="w.failed" class="arch-failed">查询失败</span>
              <template v-else>
                <span class="arch-amt">{{ baseUnitsToInj(w.amount) }}</span>
                <span class="arch-denom">INJ</span>
              </template>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Block 3: 最近流水 ── -->
      <section class="block">
        <div class="block-title">
          <span class="bn">03</span> 最近流水
          <span v-if="txSource === 'local'" class="bt-hint local">来自本地最近一次支付记录</span>
          <span v-else-if="txSource === 'api' && inj.address" class="bt-hint">{{ shortAddr(inj.address) }}</span>
          <span v-else-if="txSource === 'api'" class="bt-hint">全网最近</span>
        </div>
        <div v-if="txLoading" class="state">加载流水…</div>
        <div v-else-if="!transactions.length" class="empty">
          暂无链上流水。去 <RouterLink to="/onchain" class="lk">/onchain</RouterLink> 跑一次蜂群,分润与悬赏会在此显示。
        </div>
        <div v-else class="tx-list">
          <div v-for="(t, i) in transactions" :key="t.txHash + '-' + i" class="tx-row" :class="t.direction">
            <span class="tx-dir" :class="t.direction">{{ t.direction === "in" ? "↓" : "↑" }}</span>
            <span class="tx-type" :class="t.type">{{ TYPE_LABEL[t.type] || t.type }}</span>
            <div class="tx-main">
              <div class="tx-line1">
                <span class="tx-amount">{{ t.direction === "in" ? "+" : "−" }}{{ baseUnitsToInj(t.amount) }}</span>
                <span class="tx-denom">{{ t.denom?.toUpperCase() || "INJ" }}</span>
                <span v-if="t.counterpartyArchetype" class="tx-cp-arch">{{ ARCH_LABEL[t.counterpartyArchetype] || t.counterpartyArchetype }}</span>
                <span v-else-if="t.counterpartyAddr" class="tx-cp-addr">{{ shortAddr(t.counterpartyAddr) }}</span>
              </div>
              <div class="tx-line2">
                <span v-if="t.memo" class="tx-memo">{{ t.memo }}</span>
                <span class="tx-time">{{ timeFmt(t.timestamp) }}</span>
                <a class="tx-hash" :href="mintscanUrl(t.txHash)" target="_blank" rel="noopener">{{ shortAddr(t.txHash, 8, 6) }} ↗</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Block 4: 流向说明图 ── -->
      <section class="block">
        <div class="block-title"><span class="bn">04</span> 流向说明图</div>
        <div class="flow-diagram">
          <div class="flow-source">
            <div class="flow-node user">
              <span class="fn-icon">👤</span>
              <span class="fn-label">用户预算</span>
              <span class="fn-amt">INJ</span>
            </div>
          </div>
          <div class="flow-arrow-down"><span>100%</span></div>
          <div class="flow-split">
            <div class="flow-branch treasurer">
              <div class="flow-node mini treasurer">
                <span class="fn-dot" style="background:#3dffb0"></span>
                <span class="fn-label">金库舰 treasurer</span>
                <span class="fn-amt">5%</span>
              </div>
              <div class="flow-note">协议费</div>
            </div>
            <div class="flow-branch agents">
              <div class="flow-node mini agents">
                <span class="fn-dot" style="background:#3ae0ff"></span>
                <span class="fn-label">5 个 Agent 蜂群</span>
                <span class="fn-amt">95%</span>
              </div>
              <div class="flow-note">按 LLM 权重分润<br />(旗舰 / 导航舰 / 工程舰 / 监察舰 / 斥候舰)</div>
              <div class="flow-bounty">+ 监察舰可对工程舰额外悬赏 bounty</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>

  <SiteFooter />
</template>

<style scoped>
.bg-video { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; background: var(--bg) url("/bg-starship.png") center/cover no-repeat; }
.bg-overlay { position: fixed; inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(90deg, rgba(4,5,13,0.62) 0%, rgba(4,5,13,0.48) 50%, rgba(4,5,13,0.62) 100%), linear-gradient(180deg, rgba(4,5,13,0.55) 0%, rgba(4,5,13,0.42) 40%, rgba(4,5,13,0.82) 100%); }

.stage { position: relative; z-index: 2; min-height: 100vh; padding: 100px 6vw 72px; }
.container { max-width: 1100px; margin: 0 auto; }

.head { margin-bottom: 28px; }
.head h1 { font-size: 30px; color: #fff; font-weight: 800; margin: 0 0 8px; background: linear-gradient(90deg, #fff, var(--cyan)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.head .sub { font-size: 14px; color: var(--muted); margin: 0; line-height: 1.6; }

.block { margin-bottom: 36px; }
.block-title { display: flex; align-items: center; gap: 10px; font-size: 17px; font-weight: 800; color: #fff; margin-bottom: 16px; }
.bn { font-size: 12px; font-family: ui-monospace, monospace; color: var(--cyan); background: rgba(58,224,255,0.1); border: 1px solid rgba(58,224,255,0.3); padding: 2px 8px; border-radius: 6px; }
.bt-hint { font-size: 12px; font-weight: 500; color: var(--dim); margin-left: auto; }
.bt-hint.local { color: var(--amber); }

/* ── Block 1: 钱包 ── */
.wallet-panel { background: rgba(10,14,32,0.88); border: 1px solid rgba(61,255,176,0.3); border-radius: 12px; padding: 18px 20px; box-shadow: 0 12px 40px rgba(0,0,0,0.4), 0 0 24px rgba(61,255,176,0.08); }
.wp-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.wp-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
.wp-badge.keplr { color: var(--cyan); background: rgba(58,224,255,0.12); border: 1px solid rgba(58,224,255,0.3); }
.wp-badge.manual { color: var(--amber); background: rgba(255,184,77,0.12); border: 1px solid rgba(255,184,77,0.3); }
.net-tag { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; border: 1px solid; }
.net-tag.testnet { color: var(--cyan); border-color: rgba(58,224,255,0.35); background: rgba(58,224,255,0.1); }
.net-tag.mainnet { color: var(--green); border-color: rgba(61,255,176,0.35); background: rgba(61,255,176,0.1); }
.net-tag.mock { color: var(--amber); border-color: rgba(255,184,77,0.35); background: rgba(255,184,77,0.1); }
.net-tag.off { color: var(--dim); border-color: var(--panel-line); }
.mock-flag { font-size: 11px; color: var(--amber); font-weight: 700; }
.wp-body { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; }
.wp-addr-block label, .wp-balance-block label { display: block; font-size: 11px; color: var(--dim); font-weight: 700; margin-bottom: 6px; letter-spacing: 0.4px; }
.wp-addr { display: block; font-size: 13px; color: #e8e8f0; font-family: ui-monospace, monospace; background: rgba(0,0,0,0.34); padding: 10px 12px; border-radius: 8px; word-break: break-all; border: 1px solid var(--panel-line); }
.wp-short { display: block; font-size: 11px; color: var(--muted); font-family: ui-monospace, monospace; margin-top: 6px; }
.wp-balance { display: flex; align-items: baseline; gap: 8px; }
.wp-amt { font-size: 28px; font-weight: 800; color: var(--green); font-family: ui-monospace, monospace; text-shadow: 0 0 16px rgba(61,255,176,0.4); }
.wp-denom { font-size: 14px; color: var(--muted); font-weight: 700; }
.wp-base { font-size: 10px; color: var(--dim); font-family: ui-monospace, monospace; margin-top: 6px; }

.connect-card { background: rgba(8,11,26,0.78); border: 1px solid rgba(255,184,77,0.25); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
.cc-head { display: flex; gap: 12px; align-items: flex-start; }
.cc-icon { font-size: 28px; }
.cc-title { font-size: 16px; font-weight: 800; color: #fff; }
.cc-desc { font-size: 12px; color: var(--muted); margin-top: 2px; line-height: 1.45; }
.cc-input { width: 100%; padding: 11px 14px; background: rgba(0,0,0,0.4); border: 1px solid var(--panel-line); color: #fff; font-size: 13px; font-family: ui-monospace, monospace; border-radius: 8px; }
.cc-input:focus { outline: none; border-color: var(--amber); }
.cc-actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.cc-btn { padding: 11px 22px; border: none; border-radius: 8px; font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; background: linear-gradient(135deg, rgba(255,184,77,0.3), rgba(255,210,63,0.18)); color: var(--amber); border: 1px solid rgba(255,184,77,0.5); transition: 0.18s; }
.cc-btn:hover:not(:disabled) { box-shadow: 0 0 18px rgba(255,184,77,0.4); transform: translateY(-1px); }
.cc-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.cc-link { font-size: 13px; color: var(--cyan); text-decoration: none; font-weight: 600; }
.cc-link:hover { text-shadow: 0 0 10px rgba(58,224,255,0.5); }

.err-msg { margin-top: 14px; padding: 12px 15px; background: rgba(255,92,122,0.1); border: 1px solid rgba(255,92,122,0.3); color: var(--red); font-size: 13px; border-radius: 8px; }

/* ── Block 2: 蜂群钱包 ── */
.arch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.arch-card { background: rgba(8,11,26,0.78); border: 1px solid var(--panel-line); border-radius: 12px; padding: 14px 16px; transition: 0.18s; }
.arch-card:hover { border-color: rgba(120,160,255,0.3); transform: translateY(-2px); }
.arch-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.arch-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.arch-label { font-size: 14px; font-weight: 800; }
.arch-key { font-size: 10px; color: var(--dim); margin-left: auto; font-family: ui-monospace, monospace; }
.arch-addr { display: block; font-size: 12px; color: var(--muted); font-family: ui-monospace, monospace; margin-bottom: 10px; word-break: break-all; }
.arch-bal { display: flex; align-items: baseline; gap: 6px; }
.arch-amt { font-size: 20px; font-weight: 800; color: var(--green); font-family: ui-monospace, monospace; text-shadow: 0 0 12px rgba(61,255,176,0.3); }
.arch-denom { font-size: 12px; color: var(--muted); font-weight: 700; }
.arch-loading, .arch-failed { font-size: 12px; color: var(--dim); }
.arch-failed { color: var(--red); }

/* ── Block 3: 流水 ── */
.state, .empty { padding: 28px; text-align: center; color: var(--dim); font-size: 14px; background: rgba(8,11,26,0.6); border: 1px solid var(--panel-line); border-radius: 10px; }
.empty .lk, .state code { color: var(--cyan); }
.empty .lk { text-decoration: none; font-weight: 700; }
.empty .lk:hover { text-shadow: 0 0 10px rgba(58,224,255,0.5); }
.state code { font-family: ui-monospace, monospace; }
.tx-list { background: rgba(8,11,26,0.7); border: 1px solid var(--panel-line); border-radius: 12px; overflow: hidden; }
.tx-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.04); }
.tx-row:last-child { border-bottom: 0; }
.tx-row.in { background: linear-gradient(90deg, rgba(61,255,176,0.04), transparent 60%); }
.tx-row.out { background: linear-gradient(90deg, rgba(255,92,200,0.04), transparent 60%); }
.tx-dir { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 800; flex-shrink: 0; }
.tx-dir.in { color: var(--green); background: rgba(61,255,176,0.12); border: 1px solid rgba(61,255,176,0.3); }
.tx-dir.out { color: var(--pink); background: rgba(255,92,200,0.12); border: 1px solid rgba(255,92,200,0.3); }
.tx-type { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 6px; border: 1px solid; flex-shrink: 0; min-width: 48px; text-align: center; }
.tx-type.reward_split { color: var(--cyan); border-color: rgba(58,224,255,0.3); background: rgba(58,224,255,0.08); }
.tx-type.bounty { color: var(--amber); border-color: rgba(255,184,77,0.3); background: rgba(255,184,77,0.08); }
.tx-type.protocol_fee { color: var(--violet); border-color: rgba(137,91,255,0.3); background: rgba(137,91,255,0.08); }
.tx-main { flex: 1; min-width: 0; }
.tx-line1 { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.tx-amount { font-size: 15px; font-weight: 800; font-family: ui-monospace, monospace; color: #fff; }
.tx-row.in .tx-amount { color: var(--green); }
.tx-row.out .tx-amount { color: var(--pink); }
.tx-denom { font-size: 11px; color: var(--muted); font-weight: 700; }
.tx-cp-arch { font-size: 11px; color: var(--cyan); font-weight: 600; }
.tx-cp-addr { font-size: 11px; color: var(--dim); font-family: ui-monospace, monospace; }
.tx-line2 { display: flex; align-items: center; gap: 12px; margin-top: 4px; flex-wrap: wrap; }
.tx-memo { font-size: 11px; color: var(--dim); }
.tx-time { font-size: 11px; color: var(--dim); font-family: ui-monospace, monospace; }
.tx-hash { font-size: 11px; color: var(--cyan); text-decoration: none; font-family: ui-monospace, monospace; margin-left: auto; }
.tx-hash:hover { text-shadow: 0 0 8px rgba(58,224,255,0.5); }

/* ── Block 4: 流向图 ── */
.flow-diagram { background: rgba(8,11,26,0.7); border: 1px solid var(--panel-line); border-radius: 12px; padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.flow-node { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 24px; border-radius: 10px; border: 1px solid; }
.flow-node.user { border-color: rgba(58,224,255,0.4); background: rgba(58,224,255,0.08); }
.fn-icon { font-size: 22px; }
.fn-label { font-size: 13px; font-weight: 700; color: #fff; }
.fn-amt { font-size: 12px; color: var(--cyan); font-family: ui-monospace, monospace; font-weight: 700; }
.flow-arrow-down { color: var(--dim); font-size: 12px; font-family: ui-monospace, monospace; position: relative; padding: 4px 0; }
.flow-arrow-down::before { content: ""; position: absolute; left: 50%; top: -2px; width: 1px; height: 14px; background: var(--panel-line); transform: translateX(-50%); }
.flow-split { display: flex; gap: 32px; flex-wrap: wrap; justify-content: center; width: 100%; margin-top: 6px; }
.flow-branch { display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1; min-width: 220px; }
.flow-node.mini { flex-direction: row; gap: 8px; padding: 10px 16px; }
.flow-node.mini.treasurer { border-color: rgba(61,255,176,0.4); background: rgba(61,255,176,0.08); }
.flow-node.mini.agents { border-color: rgba(137,91,255,0.4); background: rgba(137,91,255,0.08); }
.fn-dot { width: 9px; height: 9px; border-radius: 50%; }
.flow-note { font-size: 11px; color: var(--dim); text-align: center; line-height: 1.5; }
.flow-bounty { font-size: 11px; color: var(--amber); font-weight: 600; text-align: center; padding: 6px 12px; border: 1px dashed rgba(255,184,77,0.4); border-radius: 8px; }

@media (max-width: 760px) {
  .wp-body { grid-template-columns: 1fr; }
  .flow-split { flex-direction: column; gap: 16px; }
}
</style>
