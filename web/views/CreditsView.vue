<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { fetchCredits, type CreditTransaction as CT } from "../api/auth";
import SiteFooter from "../components/SiteFooter.vue";

const auth = useAuthStore();
const router = useRouter();
const balance = ref<number>(0);
const transactions = ref<CT[]>([]);
const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    const d = await fetchCredits();
    balance.value = d.balance;
    transactions.value = d.transactions;
  } catch (e) {
    // ignore
  } finally {
    loading.value = false;
  }
}

function timeFmt(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const isLow = computed(() => balance.value < 100);

onMounted(async () => {
  await auth.ensureLoaded();
  if (!auth.isAuthed) {
    router.replace({ path: "/login", query: { redirect: "/credits" } });
    return;
  }
  await load();
});
</script>

<template>
  <video class="bg-video" autoplay muted loop playsinline preload="auto" poster="/bg-starship.png"><source src="/bg-launch.mp4" type="video/mp4" /></video>
  <div class="bg-overlay"></div>
  <div class="top">
    <RouterLink to="/" class="logo"><b>SwarmPay</b></RouterLink>
    <RouterLink to="/playground" class="back-home">← 返回 Playground</RouterLink>
  </div>

  <div class="stage">
    <div class="container">
      <h1>🪙 积分管理</h1>

      <!-- 余额大卡 -->
      <div class="balance-card" :class="{ low: isLow }">
        <div class="bal-label">当前余额</div>
        <div class="bal-num">{{ balance }}</div>
        <div class="bal-hint">{{ isLow ? "余额不足,请充值" : `还能调用 ${Math.floor(balance / 50)} 次蜂群` }}</div>
      </div>

      <!-- 说明 -->
      <div class="info-row">
        <div class="info-item"><span class="ii-num">+1000</span><span class="ii-text">注册赠送</span></div>
        <div class="info-item"><span class="ii-num">-50</span><span class="ii-text">每次完整蜂群调用</span></div>
        <div class="info-item"><span class="ii-num">🪙</span><span class="ii-text">1 积分 = 1 次模型调用单元</span></div>
      </div>

      <!-- 充值入口 -->
      <div class="recharge-card">
        <div class="rc-title">充值 / 兑换码</div>
        <div class="rc-body">充值功能即将开放。如有需求可联系 support@evoship.me 获取测试额度。</div>
        <button class="rc-btn" disabled>即将开放</button>
      </div>

      <!-- 流水 -->
      <h2 class="sec-title">积分流水</h2>
      <div v-if="loading" class="state">加载中…</div>
      <div v-else-if="!transactions.length" class="empty">还没有积分变动记录。</div>
      <div v-else class="tx-table">
        <div class="tx-head">
          <span class="tx-time">时间</span>
          <span class="tx-delta">变动</span>
          <span class="tx-reason">原因</span>
          <span class="tx-bal">余额</span>
        </div>
        <div v-for="t in transactions" :key="t.id" class="tx-row">
          <span class="tx-time">{{ timeFmt(t.created_at) }}</span>
          <span class="tx-delta" :class="{ neg: t.delta < 0, pos: t.delta > 0 }">{{ t.delta > 0 ? '+' : '' }}{{ t.delta }}</span>
          <span class="tx-reason">{{ t.reason }}</span>
          <span class="tx-bal">{{ t.balance }}</span>
        </div>
      </div>
    </div>
  </div>
  <SiteFooter />
</template>

<style scoped>
.bg-video { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; background: #04050d url("/bg-starship.png") center/cover no-repeat; }
.bg-overlay { position: fixed; inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(90deg, rgba(4,5,13,0.62), rgba(4,5,13,0.48) 50%, rgba(4,5,13,0.62)), linear-gradient(180deg, rgba(4,5,13,0.55), rgba(4,5,13,0.42) 40%, rgba(4,5,13,0.78)); }
.top { position: fixed; top: 0; left: 0; right: 0; z-index: 10; padding: 26px 6vw; display: flex; justify-content: space-between; }
.top .logo { color: #fff; text-decoration: none; font-size: 18px; font-weight: 800; }
.back-home { color: var(--muted); text-decoration: none; font-size: 14px; }
.back-home:hover { color: #fff; }
.stage { position: relative; z-index: 2; min-height: 100vh; padding: 100px 6vw 40px; }
.container { max-width: 720px; margin: 0 auto; }
h1 { font-size: 26px; color: #fff; font-weight: 800; margin: 0 0 24px; }

.balance-card { padding: 32px; border-radius: 16px; background: linear-gradient(135deg, rgba(255,210,63,0.12), rgba(137,91,255,0.08)); border: 1.5px solid rgba(255,210,63,0.4); text-align: center; margin-bottom: 24px; }
.balance-card.low { border-color: rgba(255,92,122,0.5); background: linear-gradient(135deg, rgba(255,92,122,0.12), rgba(137,91,255,0.08)); }
.bal-label { font-size: 13px; color: var(--muted); margin-bottom: 8px; }
.bal-num { font-size: 52px; font-weight: 800; color: #ffd23f; font-family: ui-monospace, monospace; line-height: 1; text-shadow: 0 0 20px rgba(255,210,63,0.4); }
.balance-card.low .bal-num { color: #ff7a96; text-shadow: 0 0 20px rgba(255,92,122,0.4); }
.bal-hint { font-size: 13px; color: var(--dim); margin-top: 10px; }

.info-row { display: flex; gap: 12px; margin-bottom: 24px; }
.info-item { flex: 1; padding: 16px; border-radius: 10px; background: rgba(8,11,26,0.6); border: 1px solid var(--panel-line); text-align: center; }
.ii-num { display: block; font-size: 18px; font-weight: 800; color: var(--cyan); font-family: ui-monospace, monospace; margin-bottom: 4px; }
.ii-text { font-size: 11px; color: var(--dim); }

.recharge-card { padding: 20px; border-radius: 12px; background: rgba(8,11,26,0.6); border: 1px solid var(--panel-line); margin-bottom: 32px; text-align: center; }
.rc-title { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 8px; }
.rc-body { font-size: 12px; color: var(--dim); margin-bottom: 14px; line-height: 1.6; }
.rc-btn { padding: 9px 24px; font-size: 13px; font-family: inherit; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid var(--panel-line); color: var(--dim); cursor: not-allowed; }

.sec-title { font-size: 17px; color: #fff; margin: 0 0 16px; }
.state, .empty { padding: 30px; text-align: center; color: var(--dim); font-size: 14px; background: rgba(8,11,26,0.6); border: 1px solid var(--panel-line); border-radius: 10px; }
.tx-table { background: rgba(8,11,26,0.7); border: 1px solid var(--panel-line); border-radius: 12px; overflow: hidden; }
.tx-head, .tx-row { display: grid; grid-template-columns: 1fr 0.6fr 1.8fr 0.6fr; gap: 10px; align-items: center; padding: 12px 16px; }
.tx-head { background: rgba(137,91,255,0.08); border-bottom: 1px solid rgba(137,91,255,0.2); font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; }
.tx-row { border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; }
.tx-row:last-child { border-bottom: 0; }
.tx-time { color: var(--dim); font-size: 12px; }
.tx-delta { font-weight: 700; font-family: ui-monospace, monospace; }
.tx-delta.neg { color: #ff7a96; }
.tx-delta.pos { color: #5eead4; }
.tx-reason { color: #e8e8f0; }
.tx-bal { color: var(--muted); font-family: ui-monospace, monospace; }
</style>
