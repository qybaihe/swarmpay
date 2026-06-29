<script setup lang="ts">
// 钱包页：Keplr 连接 / 手动粘贴测试网地址 + 余额展示 + 网络状态。
// 契约：GET /api/injective/balance, GET /api/injective/status。见 05-API-CONTRACT.md §3 §5。

import { onMounted, ref, computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import SiteFooter from "../../components/SiteFooter.vue";
import { useInjectiveStore, baseUnitsToInj, shortAddr } from "../../stores/injective";
import { useToast } from "../../composables/useToast";

const wallet = useInjectiveStore();
const toast = useToast();
const router = useRouter();

const manualAddr = ref("");
const connecting = ref(false);

const balanceInj = computed(() => baseUnitsToInj(wallet.balance?.amount || "0"));

const networkLabel = computed(() => {
  const s = wallet.status;
  if (!s) return "检测中…";
  if (!s.enabled) return `未启用（${s.network}）`;
  const map: Record<string, string> = { mock: "Mock 模拟", testnet: "Injective 测试网", mainnet: "Injective 主网" };
  return map[s.network] || s.network;
});

const networkTagClass = computed(() => {
  const n = wallet.status?.network;
  if (n === "testnet") return "testnet";
  if (n === "mainnet") return "mainnet";
  if (n === "mock") return "mock";
  return "off";
});

async function onConnectKeplr() {
  connecting.value = true;
  try {
    await wallet.connect();
    toast.show("Keplr 已连接 ✓");
  } catch (e) {
    // Keplr 未装 → 提示走手动粘贴，不报错
    const msg = e instanceof Error ? e.message : "";
    if (msg === "keplr-not-installed") {
      toast.show("未检测到 Keplr，请在下方粘贴测试网地址");
    } else {
      toast.show(`连接失败：${msg || "未知错误"}`);
    }
  } finally {
    connecting.value = false;
  }
}

async function onConnectManual() {
  const addr = manualAddr.value.trim();
  if (!addr) {
    toast.show("请输入 Injective 测试网地址");
    return;
  }
  if (!/^inj1[a-z0-9]+$/i.test(addr)) {
    toast.show("地址格式不对，应以 inj1 开头");
    return;
  }
  connecting.value = true;
  try {
    await wallet.connectManual(addr);
    toast.show("地址已记录 ✓");
  } catch (e) {
    toast.show(e instanceof Error ? `失败：${e.message}` : "失败");
  } finally {
    connecting.value = false;
  }
}

async function onRefreshBalance() {
  await wallet.fetchBalance();
  toast.show("余额已刷新");
}

function goOnchain() {
  router.push("/onchain");
}

onMounted(async () => {
  await wallet.fetchStatus();
  // 若已连接（store 态保留），刷新余额
  if (wallet.connected && wallet.address) {
    manualAddr.value = wallet.connectMode === "manual" ? wallet.address : "";
    await wallet.fetchBalance().catch(() => { /* 静默 */ });
  }
});
</script>

<template>
  <video class="bg-video" autoplay muted loop playsinline preload="auto" poster="/bg-starship.png">
    <source src="/bg-launch.mp4" type="video/mp4" />
  </video>
  <div class="bg-overlay"></div>

  <div class="top">
    <RouterLink to="/" class="logo">
      <span class="mark"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2 19 20 12 16 5 20z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="11" r="1.7" fill="currentColor"/></svg></span>
      <b>SwarmPay</b>
    </RouterLink>
    <RouterLink to="/onchain" class="back-home">链上蜂群 →</RouterLink>
  </div>

  <div class="stage">
    <div class="container">
      <div class="head">
        <div>
          <h1>⛓️ 链上钱包</h1>
          <p class="sub">连接 Keplr 或粘贴 Injective 测试网地址，蜂群分润将按此地址作为发送方上链。</p>
        </div>
      </div>

      <!-- 网络状态 -->
      <div class="net-card">
        <div class="net-row">
          <span class="net-label">网络</span>
          <span class="net-tag" :class="networkTagClass">{{ networkLabel }}</span>
          <span v-if="wallet.status?.chainId" class="net-chain">chainId: {{ wallet.status.chainId }}</span>
        </div>
        <div class="net-row">
          <span class="net-label">分润合约</span>
          <code v-if="wallet.status?.contractAddr" class="net-addr">{{ shortAddr(wallet.status.contractAddr, 10, 8) }}</code>
          <span v-else class="net-none">未配置（mock 或后端未挂载）</span>
        </div>
        <div class="net-row">
          <span class="net-label">链上通道</span>
          <span class="net-state" :class="{ on: wallet.status?.enabled }">
            {{ wallet.status?.enabled ? "已启用 · 真实上链" : "演示通道 · 后端代签" }}
          </span>
        </div>
      </div>

      <!-- 连接区 -->
      <div class="connect-grid">
        <div class="connect-card keplr">
          <div class="cc-head">
            <span class="cc-icon">🦊</span>
            <div>
              <div class="cc-title">Keplr 钱包</div>
              <div class="cc-desc">已安装 Keplr 扩展时一键连接，自动读取测试网地址</div>
            </div>
          </div>
          <div class="cc-status">
            <span v-if="wallet.hasKeplr" class="has-keplr">✓ 检测到 Keplr</span>
            <span v-else class="no-keplr">未检测到 Keplr 扩展</span>
          </div>
          <button class="cc-btn" :disabled="connecting" @click="onConnectKeplr">
            {{ connecting ? "连接中…" : "连接 Keplr" }}
          </button>
        </div>

        <div class="connect-card manual">
          <div class="cc-head">
            <span class="cc-icon">📋</span>
            <div>
              <div class="cc-title">手动粘贴地址</div>
              <div class="cc-desc">无 Keplr 时的降级方案，粘贴 inj1… 测试网地址即可</div>
            </div>
          </div>
          <input
            v-model="manualAddr"
            class="cc-input"
            placeholder="inj1..."
            autocomplete="off"
            spellcheck="false"
          />
          <button class="cc-btn manual-btn" :disabled="connecting" @click="onConnectManual">
            {{ connecting ? "处理中…" : "使用该地址" }}
          </button>
        </div>
      </div>

      <!-- 已连接态：地址 + 余额 -->
      <div v-if="wallet.connected" class="wallet-panel">
        <div class="wp-head">
          <span class="wp-badge" :class="wallet.connectMode">
            {{ wallet.connectMode === "keplr" ? "🦊 Keplr" : "📋 手动地址" }}
          </span>
          <span class="wp-title">已连接钱包</span>
          <button class="wp-disconnect" type="button" @click="wallet.disconnect">断开</button>
        </div>
        <div class="wp-body">
          <div class="wp-addr-block">
            <label>钱包地址</label>
            <code class="wp-addr">{{ wallet.address }}</code>
          </div>
          <div class="wp-balance-block">
            <label>INJ 余额</label>
            <div class="wp-balance">
              <span class="wp-amt">{{ balanceInj }}</span>
              <span class="wp-denom">INJ</span>
              <button class="wp-refresh" type="button" @click="onRefreshBalance" title="刷新余额">↻</button>
            </div>
            <div class="wp-base">最小单位：{{ wallet.balance?.amount || "0" }}</div>
          </div>
        </div>
        <button class="go-onchain-btn" @click="goOnchain">进入链上蜂群运行 →</button>
      </div>

      <div v-if="wallet.error" class="err-msg">⚠️ {{ wallet.error }}</div>
    </div>
  </div>

  <SiteFooter />
</template>

<style scoped>
.bg-video { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; background: #04050d url("/bg-starship.png") center/cover no-repeat; }
.bg-overlay { position: fixed; inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(90deg, rgba(4,5,13,0.62) 0%, rgba(4,5,13,0.48) 50%, rgba(4,5,13,0.62) 100%), linear-gradient(180deg, rgba(4,5,13,0.55) 0%, rgba(4,5,13,0.42) 40%, rgba(4,5,13,0.82) 100%); }
.top { position: fixed; top: 0; left: 0; right: 0; z-index: 10; padding: 26px 6vw; display: flex; justify-content: space-between; align-items: center; }
.top .logo { display: flex; align-items: center; gap: 8px; color: #fff; text-decoration: none; }
.top .logo .mark { width: 26px; height: 26px; color: var(--cyan); }
.top .logo b { font-size: 18px; font-weight: 800; background: linear-gradient(90deg, #fff, var(--cyan)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.back-home { color: var(--cyan); text-decoration: none; font-size: 14px; font-weight: 600; }
.back-home:hover { text-shadow: 0 0 12px rgba(58,224,255,0.5); }

.stage { position: relative; z-index: 2; min-height: 100vh; padding: 110px 6vw 60px; }
.container { max-width: 980px; margin: 0 auto; }
.head { margin-bottom: 24px; }
.head h1 { font-size: 30px; color: #fff; font-weight: 800; margin: 0 0 8px; }
.head .sub { font-size: 14px; color: var(--muted); margin: 0; }

.net-card {
  background: rgba(8,11,26,0.72);
  border: 1px solid var(--panel-line);
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 22px;
  backdrop-filter: blur(8px);
}
.net-row { display: flex; align-items: center; gap: 14px; padding: 7px 0; flex-wrap: wrap; }
.net-row + .net-row { border-top: 1px solid rgba(120,160,255,0.08); }
.net-label { font-size: 12px; color: var(--dim); font-weight: 700; width: 84px; letter-spacing: 0.4px; }
.net-tag { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px; border: 1px solid; }
.net-tag.testnet { color: var(--cyan); border-color: rgba(58,224,255,0.35); background: rgba(58,224,255,0.1); }
.net-tag.mainnet { color: var(--green); border-color: rgba(61,255,176,0.35); background: rgba(61,255,176,0.1); }
.net-tag.mock { color: var(--amber); border-color: rgba(255,184,77,0.35); background: rgba(255,184,77,0.1); }
.net-tag.off { color: var(--dim); border-color: var(--panel-line); }
.net-chain { font-size: 11px; color: var(--muted); font-family: ui-monospace, monospace; }
.net-addr { font-size: 12px; color: #e8e8f0; font-family: ui-monospace, monospace; background: rgba(0,0,0,0.34); padding: 3px 8px; border-radius: 6px; }
.net-none { font-size: 12px; color: var(--dim); }
.net-state { font-size: 12px; font-weight: 600; color: var(--muted); }
.net-state.on { color: var(--green); }

.connect-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 22px;
}
.connect-card {
  background: rgba(8,11,26,0.78);
  border: 1px solid var(--panel-line);
  border-radius: 12px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.connect-card.keplr { border-color: rgba(58,224,255,0.25); }
.connect-card.manual { border-color: rgba(255,210,63,0.25); }
.cc-head { display: flex; gap: 12px; align-items: flex-start; }
.cc-icon { font-size: 28px; }
.cc-title { font-size: 16px; font-weight: 800; color: #fff; }
.cc-desc { font-size: 12px; color: var(--muted); margin-top: 2px; line-height: 1.45; }
.cc-status { font-size: 12px; }
.has-keplr { color: var(--green); font-weight: 600; }
.no-keplr { color: var(--amber); font-weight: 600; }
.cc-input {
  width: 100%;
  padding: 11px 14px;
  background: rgba(0,0,0,0.4);
  border: 1px solid var(--panel-line);
  color: #fff;
  font-size: 13px;
  font-family: ui-monospace, monospace;
  border-radius: 8px;
}
.cc-input:focus { outline: none; border-color: var(--amber); }
.cc-btn {
  padding: 11px 18px;
  border: none;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  background: linear-gradient(135deg, rgba(58,224,255,0.3), rgba(58,224,255,0.18));
  color: var(--cyan);
  border: 1px solid rgba(58,224,255,0.5);
  transition: 0.18s;
}
.cc-btn:hover:not(:disabled) { box-shadow: 0 0 18px rgba(58,224,255,0.4); transform: translateY(-1px); }
.cc-btn.manual-btn {
  background: linear-gradient(135deg, rgba(255,210,63,0.3), rgba(255,184,77,0.18));
  color: var(--amber);
  border-color: rgba(255,184,77,0.5);
}
.cc-btn.manual-btn:hover:not(:disabled) { box-shadow: 0 0 18px rgba(255,184,77,0.4); }
.cc-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.wallet-panel {
  background: rgba(10,14,32,0.88);
  border: 1px solid rgba(61,255,176,0.3);
  border-radius: 12px;
  padding: 18px 20px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.4), 0 0 24px rgba(61,255,176,0.1);
}
.wp-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.wp-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
.wp-badge.keplr { color: var(--cyan); background: rgba(58,224,255,0.12); border: 1px solid rgba(58,224,255,0.3); }
.wp-badge.manual { color: var(--amber); background: rgba(255,184,77,0.12); border: 1px solid rgba(255,184,77,0.3); }
.wp-title { font-size: 15px; font-weight: 800; color: #fff; flex: 1; }
.wp-disconnect { font-size: 12px; padding: 5px 12px; border-radius: 6px; background: rgba(255,92,122,0.1); border: 1px solid rgba(255,92,122,0.3); color: var(--red); cursor: pointer; font-family: inherit; }
.wp-disconnect:hover { background: rgba(255,92,122,0.2); }
.wp-body { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; margin-bottom: 14px; }
.wp-addr-block label, .wp-balance-block label { display: block; font-size: 11px; color: var(--dim); font-weight: 700; margin-bottom: 6px; letter-spacing: 0.4px; }
.wp-addr { display: block; font-size: 13px; color: #e8e8f0; font-family: ui-monospace, monospace; background: rgba(0,0,0,0.34); padding: 10px 12px; border-radius: 8px; word-break: break-all; border: 1px solid var(--panel-line); }
.wp-balance { display: flex; align-items: baseline; gap: 8px; }
.wp-amt { font-size: 28px; font-weight: 800; color: var(--green); font-family: ui-monospace, monospace; text-shadow: 0 0 16px rgba(61,255,176,0.4); }
.wp-denom { font-size: 14px; color: var(--muted); font-weight: 700; }
.wp-refresh { font-size: 16px; padding: 2px 10px; border-radius: 6px; background: rgba(58,224,255,0.1); border: 1px solid rgba(58,224,255,0.3); color: var(--cyan); cursor: pointer; font-family: inherit; }
.wp-refresh:hover { background: rgba(58,224,255,0.2); }
.wp-base { font-size: 10px; color: var(--dim); font-family: ui-monospace, monospace; margin-top: 6px; }

.go-onchain-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-family: inherit;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  background: linear-gradient(90deg, var(--cyan), var(--violet));
  color: #04050d;
  letter-spacing: 0.5px;
  transition: 0.2s;
}
.go-onchain-btn:hover { box-shadow: 0 0 24px rgba(58,224,255,0.5); transform: translateY(-1px); }

.err-msg {
  margin-top: 16px;
  padding: 12px 15px;
  background: rgba(255,92,122,0.1);
  border: 1px solid rgba(255,92,122,0.3);
  color: var(--red);
  font-size: 13px;
  border-radius: 8px;
}

@media (max-width: 760px) {
  .connect-grid { grid-template-columns: 1fr; }
  .wp-body { grid-template-columns: 1fr; }
}
</style>