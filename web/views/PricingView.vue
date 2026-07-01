<script setup lang="ts">
import { useI18n } from "vue-i18n";
// PricingView —— 「链上计费模式」专页。
// 不卖 SaaS 套餐,讲清 SwarmPay 的链上计费创新:LLM 动态分润 + 5% 协议费 + agent 自签悬赏 + INJ 结算。
// 真实数据从 GET /api/injective/status 拉(network/chainId/contractAddr/protocolFeeBps/6 archetype 地址)。
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import NavBar from "../components/NavBar.vue";
import SiteFooter from "../components/SiteFooter.vue";
import { useInjectiveStore, baseUnitsToInj, shortAddr, type InjectiveStatus } from "../stores/injective";

const { t } = useI18n();
const inj = useInjectiveStore();
const status = ref<InjectiveStatus | null>(null);

const feeBps = ref(500); // 5% 默认,会被 status 覆盖
const feePct = () => (feeBps.value / 100).toFixed(0);

// 四张特性卡
const features = [
  {
    icon: "⚖️",
    title: "pricing.f1t",
    sub: "pricing.f1s",
    desc: "pricing.f1d",
    color: "var(--cyan)",
  },
  {
    icon: "🏦",
    title: `t("pricing.f2t", { pct: feePct() })`,
    sub: "pricing.f2s",
    desc: "pricing.f2d",
    color: "var(--green)",
  },
  {
    icon: "💰",
    title: "pricing.f3t",
    sub: "pricing.f3s",
    desc: "pricing.f3d",
    color: "var(--violet)",
  },
  {
    icon: "⛓️",
    title: "pricing.f4t",
    sub: "pricing.f4s",
    desc: "pricing.f4d",
    color: "var(--amber)",
  },
];

// 对比表
const compareRows = [
  { dim: "pricing.c1d", saas: "pricing.c1s", swarm: "pricing.c1w" },
  { dim: "pricing.c2d", saas: "pricing.c2s", swarm: "pricing.c2w" },
  { dim: "pricing.c3d", saas: "pricing.c3s", swarm: "pricing.c3w" },
  { dim: "pricing.c4d", saas: "pricing.c4s", swarm: "pricing.c4w" },
  { dim: "pricing.c5d", saas: "pricing.c5s", swarm: "pricing.c5w" },
];

// 编号时间线
const timeline = [
  { n: 1, t: "pricing.t1", d: "pricing.t1d" },
  { n: 2, t: "pricing.t2", d: "pricing.t2d" },
  { n: 3, t: "pricing.t3", d: "pricing.t3d" },
  { n: 4, t: `t("pricing.t4", { pct: feePct() })`, d: "pricing.t4d" },
  { n: 5, t: "pricing.t5", d: "pricing.t5d" },
  { n: 6, t: "pricing.t6", d: "pricing.t6d" },
  { n: 7, t: "pricing.t7", d: "pricing.t7d" },
];

// archetype 展示
const ARCH_LABEL: Record<string, string> = {
  orchestrator: "pricing.arch_orch", planner: "pricing.arch_plan", coder: "pricing.arch_code", reviewer: "pricing.arch_rev", explorer: "pricing.arch_exp", payer: "pricing.arch_payer", treasurer: "pricing.arch_treas",
};
const ARCH_COLOR: Record<string, string> = {
  orchestrator: "#ffb84d", planner: "#5ca8ff", coder: "#3ae0ff", reviewer: "#8b5cff", explorer: "#ff5cc8", payer: "#ffd23f", treasurer: "#3dffb0",
};

onMounted(async () => {
  await inj.fetchStatus();
  status.value = inj.status;
  if (inj.status?.protocolFeeBps) feeBps.value = inj.status.protocolFeeBps;
});

const archEntries = () => Object.entries(inj.archetypeAddrs || {});
const mintscanTx = (h: string) => `https://testnet.mintscan.io/injective-testnet/tx/${h}`;
</script>

<template>
  <NavBar />
  <video class="bg-video" autoplay muted loop playsinline preload="auto" poster="/bg-starship.png">
    <source src="/bg-launch.mp4" type="video/mp4" />
  </video>
  <div class="bg-overlay"></div>

  <main class="pricing-page">
    <!-- Hero -->
    <section class="hero">
      <div class="eyebrow">{{ t('pricing.k1') }}</div>
      <h1>{{ t('pricing.k2') }}</h1>
      <p class="hero-sub"
        >{ t('pricing.k3') }}<b style="color:var(--green)">{{ t('pricing.k4') }}</b>{{ t('pricing.k5') }}<b style="color:var(--green)">{{ feePct() }}% 协议服务费</b>,<b style="color:var(--green)">{{ t('pricing.k6') }}</b>{{ t('pricing.k7') }}<b style="color:var(--violet)">{{ t('pricing.k8') }}</b>{{ t('pricing.k9') }}
      </p>
      <div class="hero-cta">
        <RouterLink to="/onchain" class="cta primary">{{ t('pricing.k10') }}</RouterLink>
        <RouterLink to="/credits" class="cta ghost">{{ t('pricing.k11') }}</RouterLink>
      </div>
    </section>

    <!-- Section A: 四张特性卡 -->
    <section class="features">
      <article v-for="f in features" :key="f.title" class="feat-card" :style="{ '--fc': f.color }">
        <div class="feat-icon">{{ f.icon }}</div>
        <h3>{{ t(f.title) }}</h3>
        <div class="feat-sub">{{ t(f.sub) }}</div>
        <p class="feat-desc">{{ t(f.desc) }}</p>
      </article>
    </section>

    <!-- Section B: 对比表 -->
    <section class="compare">
      <div class="cmp-head">
        <div class="cmp-eyebrow">{{ t('pricing.k12') }}</div>
        <h2>{{ t('pricing.k13') }}</h2>
      </div>
      <div class="cmp-table">
        <div class="cmp-row cmp-head-row">
          <div class="cmp-cell dim">{{ t('pricing.k14') }}</div>
          <div class="cmp-cell saas">{{ t('pricing.k15') }}</div>
          <div class="cmp-cell swarm">SwarmPay</div>
        </div>
        <div v-for="r in compareRows" :key="r.dim" class="cmp-row">
          <div class="cmp-cell dim">{{ t(r.dim) }}</div>
          <div class="cmp-cell saas">✕ {{ t(r.saas) }}</div>
          <div class="cmp-cell swarm">✓ {{ t(r.swarm) }}</div>
        </div>
      </div>
    </section>

    <!-- Section C: 编号时间线 -->
    <section class="timeline-sec">
      <div class="cmp-head">
        <div class="cmp-eyebrow">{{ t('pricing.k16') }}</div>
        <h2>{{ t('pricing.k17') }}</h2>
      </div>
      <ol class="tl">
        <li v-for="s in timeline" :key="s.n" class="tl-item">
          <div class="tl-num">{{ s.n }}</div>
          <div class="tl-body">
            <div class="tl-title">{{ t(s.t) }}</div>
            <div class="tl-desc">{{ t(s.d) }}</div>
          </div>
        </li>
      </ol>
    </section>

    <!-- Section D: 真实数据条 -->
    <section class="realdata">
      <div class="cmp-head">
        <div class="cmp-eyebrow">{{ t('pricing.k18') }}</div>
        <h2>{{ t('pricing.k19') }}</h2>
      </div>
      <div class="rd-grid">
        <div class="rd-card"><div class="rd-label">{{ t('pricing.k20') }}</div><div class="rd-val" :class="status?.network">{{ status?.network || "…" }}</div></div>
        <div class="rd-card"><div class="rd-label">chainId</div><div class="rd-val mono">{{ status?.chainId || "…" }}</div></div>
        <div class="rd-card"><div class="rd-label">{{ t('pricing.k21') }}</div><div class="rd-val">{{ feePct() }}% ({{ feeBps }} bps)</div></div>
        <div class="rd-card"><div class="rd-label">{{ t('pricing.k22') }}</div><div class="rd-val mono">{{ status?.contractAddr ? shortAddr(status.contractAddr, 8, 6) : t('pricing.directTransfer') }}</div></div>
      </div>

      <div class="arch-list">
        <div class="arch-list-title">{{ t('pricing.k23') }}</div>
        <div class="arch-grid">
          <div v-for="[arch, addr] in archEntries()" :key="arch" class="arch-card" :style="{ '--ac': ARCH_COLOR[arch] || '#3ae0ff' }">
            <div class="arch-dot"></div>
            <div class="arch-meta">
              <div class="arch-name">{{ t(ARCH_LABEL[arch] || arch) }} <span class="arch-key">{{ arch }}</span></div>
              <div class="arch-addr mono">{{ shortAddr(addr, 8, 6) }}</div>
            </div>
          </div>
        </div>
        <p v-if="!archEntries().length" class="rd-empty">{{ t('pricing.k24') }}</p>
      </div>
    </section>

    <!-- Section E: CTA -->
    <section class="cta-final">
      <h2>{{ t('pricing.k25') }}</h2>
      <p>{{ t('pricing.k26') }}</p>
      <RouterLink to="/onchain" class="cta primary">{{ t('pricing.k27') }}</RouterLink>
    </section>
  </main>

  <SiteFooter />
</template>

<style scoped>
.bg-video { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; background: #04050d url("/bg-starship.png") center/cover no-repeat; }
.bg-overlay { position: fixed; inset: 0; z-index: 1; pointer-events: none;
  background: linear-gradient(180deg, rgba(4,5,13,0.86) 0%, rgba(4,5,13,0.78) 40%, rgba(4,5,13,0.92) 100%); }

.pricing-page { position: relative; z-index: 2; max-width: 1180px; min-height: 100vh; margin: 0 auto; padding: 120px 6vw 96px; }

/* Hero */
.hero { max-width: 860px; margin: 0 auto 64px; text-align: center; }
.eyebrow { margin-bottom: 14px; color: var(--cyan); font-size: 12px; font-weight: 800; letter-spacing: 2px; }
.hero h1 { margin: 0 0 20px; color: #fff; font-size: clamp(34px, 5vw, 52px); font-weight: 800; line-height: 1.1; letter-spacing: -1px; }
.hero-sub { font-size: clamp(15px, 1.8vw, 18px); color: var(--muted); line-height: 1.7; max-width: 720px; margin: 0 auto 28px; }
.hero-cta { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
.cta { padding: 12px 26px; border-radius: 8px; font-weight: 700; font-size: 14px; text-decoration: none; transition: 0.2s; letter-spacing: 0.3px; }
.cta.primary { background: linear-gradient(90deg, var(--violet), var(--pink)); color: #fff; box-shadow: 0 8px 22px rgba(139,92,255,0.28); }
.cta.primary:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(139,92,255,0.4); }
.cta.ghost { border: 1px solid var(--cyan); color: var(--cyan); }
.cta.ghost:hover { background: rgba(58,224,255,0.1); }

/* Section A 四卡 */
.features { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; margin-bottom: 80px; }
.feat-card { padding: 26px 22px; background: rgba(8,11,26,0.6); border: 1px solid var(--panel-line); border-radius: 12px; backdrop-filter: blur(12px); transition: 0.25s; position: relative; overflow: hidden; }
.feat-card::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--fc) 18%, transparent), transparent 60%); opacity: 0; transition: 0.25s; }
.feat-card:hover { transform: translateY(-4px); border-color: var(--fc); }
.feat-card:hover::before { opacity: 1; }
.feat-icon { font-size: 32px; margin-bottom: 12px; }
.feat-card h3 { margin: 0; color: #fff; font-size: 18px; font-weight: 800; }
.feat-sub { color: var(--fc); font-size: 12px; font-weight: 700; margin: 4px 0 12px; letter-spacing: 0.3px; }
.feat-desc { color: var(--muted); font-size: 13px; line-height: 1.6; margin: 0; }

/* 通用 section 头 */
.cmp-head { text-align: center; margin-bottom: 36px; }
.cmp-eyebrow { color: var(--cyan); font-size: 12px; font-weight: 800; letter-spacing: 2px; margin-bottom: 10px; }
.cmp-head h2 { margin: 0; color: #fff; font-size: clamp(26px, 3.5vw, 36px); font-weight: 800; letter-spacing: -0.5px; }

/* Section B 对比表 */
.compare { margin-bottom: 80px; }
.cmp-table { max-width: 820px; margin: 0 auto; border: 1px solid var(--panel-line); border-radius: 12px; overflow: hidden; background: rgba(8,11,26,0.5); }
.cmp-row { display: grid; grid-template-columns: 1.1fr 1.3fr 1.3fr; }
.cmp-row:not(:last-child) { border-bottom: 1px solid var(--panel-line); }
.cmp-cell { padding: 14px 16px; font-size: 13px; line-height: 1.5; }
.cmp-head-row .cmp-cell { font-size: 12px; font-weight: 800; letter-spacing: 0.5px; background: rgba(58,224,255,0.05); }
.cmp-cell.dim { color: var(--dim); font-weight: 600; }
.cmp-cell.saas { color: var(--muted); }
.cmp-cell.swarm { color: var(--green); font-weight: 600; }
.cmp-head-row .saas { color: var(--dim); }
.cmp-head-row .swarm { color: var(--cyan); }

/* Section C 时间线 */
.timeline-sec { margin-bottom: 80px; }
.tl { list-style: none; padding: 0; margin: 0; max-width: 760px; margin-inline: auto; counter-reset: none; }
.tl-item { display: flex; gap: 18px; padding: 14px 0; border-left: 2px solid var(--panel-line); padding-left: 24px; margin-left: 16px; position: relative; }
.tl-item::before { content: ""; position: absolute; left: -7px; top: 18px; width: 12px; height: 12px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 10px var(--cyan); }
.tl-num { position: absolute; left: -16px; top: 12px; width: 26px; height: 26px; display: none; }
.tl-title { color: #fff; font-size: 15px; font-weight: 700; margin-bottom: 4px; }
.tl-desc { color: var(--muted); font-size: 13px; line-height: 1.55; }

/* Section D 真实数据 */
.realdata { margin-bottom: 80px; }
.rd-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 28px; }
.rd-card { padding: 18px; background: rgba(8,11,26,0.6); border: 1px solid var(--panel-line); border-radius: 10px; }
.rd-label { color: var(--dim); font-size: 11px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 8px; text-transform: uppercase; }
.rd-val { color: #fff; font-size: 16px; font-weight: 700; }
.rd-val.mono { font-family: ui-monospace, monospace; font-size: 14px; color: var(--cyan); }
.rd-val.testnet { color: var(--green); }
.rd-val.mock { color: var(--amber); }

.arch-list { background: rgba(8,11,26,0.5); border: 1px solid var(--panel-line); border-radius: 12px; padding: 22px; }
.arch-list-title { color: #fff; font-size: 14px; font-weight: 700; margin-bottom: 16px; }
.arch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.arch-card { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: rgba(255,255,255,0.02); border: 1px solid color-mix(in srgb, var(--ac) 30%, transparent); border-radius: 8px; }
.arch-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--ac); box-shadow: 0 0 8px var(--ac); flex-shrink: 0; }
.arch-name { color: #fff; font-size: 13px; font-weight: 600; }
.arch-key { color: var(--dim); font-size: 11px; font-family: ui-monospace, monospace; }
.arch-addr { color: var(--ac); font-size: 12px; }
.rd-empty { color: var(--dim); font-size: 13px; text-align: center; padding: 20px; }

/* Section E CTA */
.cta-final { text-align: center; padding: 48px 20px; background: linear-gradient(160deg, rgba(139,92,255,0.12), rgba(8,11,26,0.5)); border: 1px solid rgba(139,92,255,0.3); border-radius: 16px; }
.cta-final h2 { margin: 0 0 10px; color: #fff; font-size: 26px; font-weight: 800; }
.cta-final p { color: var(--muted); font-size: 14px; margin: 0 0 22px; }
.cta-final .cta { display: inline-block; }

@media (max-width: 760px) {
  .pricing-page { padding: 100px 5vw 72px; }
  .cmp-row { grid-template-columns: 1fr; }
  .cmp-cell { padding: 8px 14px; }
  .cmp-head-row { display: none; }
  .cmp-cell.dim::before { content: "维度: "; color: var(--dim); }
  .cmp-cell.saas::before { content: "SaaS: "; color: var(--dim); }
  .cmp-cell.swarm::before { content: "SwarmPay: "; color: var(--dim); }
}
</style>
