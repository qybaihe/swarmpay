<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import NavBar from "../components/NavBar.vue";
import SiteFooter from "../components/SiteFooter.vue";
import { useAuthStore } from "../stores/auth";

type Plan = {
  key: "free" | "standard" | "pro" | "max";
  name: string;
  nameCn: string;
  price: number;
  credits: number;
  tagline: string;
  featured?: boolean;
  features: string[];
};

const auth = useAuthStore();
const router = useRouter();
const CALL_COST = 50;
const selectedPlanKey = ref<Plan["key"]>("pro");

const plans: Plan[] = [
  {
    key: "free",
    name: "Free",
    nameCn: "免费套餐",
    price: 0,
    credits: 1000,
    tagline: "注册即开通,适合初次体验与小规模验证。",
    features: [
      "注册后赠送 1,000 积分",
      "约可完成 20 次完整调用",
      "支持 Playground 与 API 端点体验",
      "可浏览社区舰队并进行基础试用",
    ],
  },
  {
    key: "standard",
    name: "Standard",
    nameCn: "标准套餐",
    price: 39,
    credits: 20000,
    tagline: "适合个人开发、日常调试与稳定的小规模项目。",
    features: [
      "包含 20,000 积分",
      "约可完成 400 次完整调用",
      "适用于 Playground、API 端点与舰队运行",
      "账户内统一查看余额与积分流水",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    nameCn: "专业套餐",
    price: 129,
    credits: 80000,
    tagline: "适合高频使用、团队协作与持续迭代场景。",
    featured: true,
    features: [
      "包含 80,000 积分",
      "约可完成 1,600 次完整调用",
      "适用于批量测试、原型迭代与集成验证",
      "与现有账户、API Key 和调用记录统一管理",
    ],
  },
  {
    key: "max",
    name: "Max",
    nameCn: "旗舰套餐",
    price: 359,
    credits: 250000,
    tagline: "适合密集评测、连续任务与生产前验证负载。",
    features: [
      "包含 250,000 积分",
      "约可完成 5,000 次完整调用",
      "适用于更高频的 API 调用与舰队编排任务",
      "适合将额度集中给团队或核心项目使用",
    ],
  },
];

function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}

function callCount(credits: number): string {
  return formatNumber(Math.floor(credits / CALL_COST));
}

const selectedPlanIndex = computed(() => {
  const index = plans.findIndex((plan) => plan.key === selectedPlanKey.value);
  return index >= 0 ? index : 0;
});

const selectionStyle = computed(() => ({
  "--active-index": String(selectedPlanIndex.value),
}));

function selectPlan(plan: Plan) {
  selectedPlanKey.value = plan.key;
}

function ctaLabel(plan: Plan): string {
  if (plan.key === "free") return auth.isAuthed ? "当前套餐" : "免费注册";
  return `升级到 ${plan.name}`;
}

function upgradePlan(plan: Plan) {
  selectPlan(plan);

  if (plan.key === "free") {
    if (!auth.isAuthed) router.push({ path: "/login", query: { redirect: "/pricing" } });
    return;
  }

  if (!auth.isAuthed) {
    router.push({ path: "/login", query: { redirect: "/pricing" } });
    return;
  }

  const subject = encodeURIComponent(`申请升级 ${plan.name} 套餐`);
  const body = encodeURIComponent(
    [
      `你好,我想开通 ${plan.name} 套餐。`,
      `套餐价格: ¥${plan.price}`,
      `套餐积分: ${formatNumber(plan.credits)}`,
      `账号邮箱: ${auth.user?.email ?? ""}`,
    ].join("\n"),
  );
  window.location.href = `mailto:support@evoship.me?subject=${subject}&body=${body}`;
}

onMounted(async () => {
  await auth.ensureLoaded();
});
</script>

<template>
  <NavBar />
  <video class="bg-video" autoplay muted loop playsinline preload="auto" poster="/bg-starship.png">
    <source src="/bg-launch.mp4" type="video/mp4" />
  </video>
  <div class="bg-overlay"></div>

  <main class="pricing-page" aria-labelledby="pricing-title">
    <section class="hero">
      <div class="eyebrow">升级套餐</div>
      <h1 id="pricing-title">为你的 EvoShip 调用选择合适额度</h1>
    </section>

    <div class="plans-wrap" :style="selectionStyle">
      <div class="selection-beam" aria-hidden="true"></div>
      <section class="plans" aria-label="套餐列表">
        <article
          v-for="plan in plans"
          :key="plan.key"
          class="plan-card"
          :class="{ featured: plan.featured, active: selectedPlanKey === plan.key }"
          role="button"
          tabindex="0"
          :aria-pressed="selectedPlanKey === plan.key"
          @click="selectPlan(plan)"
          @focusin="selectPlan(plan)"
          @keydown.enter.prevent="selectPlan(plan)"
          @keydown.space.prevent="selectPlan(plan)"
        >
          <div v-if="plan.featured" class="ribbon">推荐选择</div>
          <div v-if="selectedPlanKey === plan.key" class="active-chip">已选中</div>
          <header class="plan-head">
            <div>
              <h2>{{ plan.name }}</h2>
              <p>{{ plan.nameCn }}</p>
            </div>
          </header>

          <div class="price-row">
            <span class="currency">¥</span>
            <span class="amount">{{ plan.price }}</span>
            <span class="price-note">{{ plan.price === 0 ? "注册即享" : "套餐价" }}</span>
          </div>
          <p class="tagline">{{ plan.tagline }}</p>

          <div class="credits-block">
            <span class="credits">{{ formatNumber(plan.credits) }}</span>
            <span class="credits-label">积分额度</span>
            <span class="credits-calls">约 {{ callCount(plan.credits) }} 次完整调用</span>
          </div>

          <ul class="feature-list">
            <li v-for="feature in plan.features" :key="feature">
              <span class="check" aria-hidden="true">✓</span>
              <span>{{ feature }}</span>
            </li>
          </ul>

          <button
            class="plan-action"
            :class="{ primary: selectedPlanKey === plan.key }"
            :disabled="plan.key === 'free' && auth.isAuthed"
            type="button"
            :aria-label="ctaLabel(plan)"
            @click.stop="upgradePlan(plan)"
          >
            {{ ctaLabel(plan) }}
          </button>
        </article>
      </section>
    </div>

    <section class="notes" aria-label="套餐说明">
      <div class="note-item">
        <h3>统一计费口径</h3>
        <p>完整舰队调用按 50 积分/次结算,余额不足时调用会返回积分不足提示。</p>
      </div>
      <div class="note-item">
        <h3>账户内统一使用</h3>
        <p>套餐积分进入当前账户余额,可同时覆盖 Playground、API 端点和已创建舰队的运行消耗。</p>
      </div>
      <div class="note-item">
        <h3>开通协助</h3>
        <p>点击付费套餐后将生成开通邮件,我们会根据套餐与账号信息协助完成升级。</p>
      </div>
    </section>

    <p class="contact">
      团队或企业用量方案可联系
      <a href="mailto:support@evoship.me">support@evoship.me</a>
      获取正式报价。
    </p>
  </main>

  <SiteFooter />
</template>

<style scoped>
.bg-video {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  background: #04050d url("/bg-starship.png") center/cover no-repeat;
}

.bg-overlay {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(4, 5, 13, 0.7), rgba(4, 5, 13, 0.5) 50%, rgba(4, 5, 13, 0.72)),
    linear-gradient(180deg, rgba(4, 5, 13, 0.54), rgba(4, 5, 13, 0.45) 42%, rgba(4, 5, 13, 0.86));
}

.pricing-page {
  position: relative;
  z-index: 2;
  max-width: 1280px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 132px 6vw 96px;
}

.hero {
  max-width: 860px;
  margin: 0 auto 48px;
  text-align: center;
}

.eyebrow {
  margin-bottom: 14px;
  color: var(--cyan);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 2px;
}

.hero h1 {
  margin: 0;
  color: #fff;
  font-size: 52px;
  font-weight: 800;
  line-height: 1.08;
}

.plans-wrap {
  --active-index: 2;
  position: relative;
  isolation: isolate;
}

.selection-beam {
  position: absolute;
  top: -24px;
  left: calc((100% - 60px) / 4 * var(--active-index) + 10px);
  z-index: 0;
  width: calc((100% - 60px) / 4);
  height: calc(100% + 42px);
  border-radius: 16px;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(255, 92, 200, 0.28), transparent 44%),
    radial-gradient(ellipse at 50% 48%, rgba(139, 92, 255, 0.2), transparent 64%),
    linear-gradient(180deg, rgba(58, 224, 255, 0.08), rgba(139, 92, 255, 0.04));
  filter: blur(4px);
  opacity: 0.95;
  transform: translateY(0);
  transition: left 0.42s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s, transform 0.25s;
}

.selection-beam::before {
  content: "";
  position: absolute;
  inset: 8px 22px;
  border-radius: inherit;
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow:
    0 0 34px rgba(139, 92, 255, 0.34),
    inset 0 0 26px rgba(58, 224, 255, 0.09);
}

.selection-beam::after {
  content: "";
  position: absolute;
  left: 18%;
  right: 18%;
  top: 12px;
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, #3ae0ff, #ff5cc8, transparent);
  box-shadow: 0 0 22px rgba(255, 92, 200, 0.72);
  animation: beam-pulse 2.2s ease-in-out infinite;
}

.plans {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;
  align-items: stretch;
}

.plan-card {
  position: relative;
  display: flex;
  min-height: 540px;
  flex-direction: column;
  padding: 28px 24px 24px;
  border: 1px solid var(--panel-line);
  border-radius: 12px;
  background: rgba(8, 11, 26, 0.74);
  backdrop-filter: blur(16px);
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.24s, background 0.24s, box-shadow 0.24s, transform 0.24s;
}

.plan-card::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(circle at 50% 0%, rgba(58, 224, 255, 0.14), transparent 34%),
    radial-gradient(circle at 72% 18%, rgba(255, 92, 200, 0.1), transparent 38%);
  opacity: 0;
  transition: opacity 0.24s;
}

.plan-card::after {
  content: "";
  position: absolute;
  inset: -40% -55%;
  z-index: -1;
  background: linear-gradient(115deg, transparent 36%, rgba(255, 255, 255, 0.14) 48%, transparent 62%);
  opacity: 0;
  transform: translateX(-30%);
  transition: opacity 0.24s;
  animation: sheen-slide 3.2s linear infinite;
}

.plan-card:hover {
  transform: translateY(-3px);
  border-color: rgba(58, 224, 255, 0.38);
  background: rgba(10, 14, 34, 0.82);
}

.plan-card:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 4px;
}

.plan-card.featured {
  border-color: rgba(139, 92, 255, 0.68);
  background:
    linear-gradient(180deg, rgba(139, 92, 255, 0.18), rgba(8, 11, 26, 0.76) 48%),
    rgba(8, 11, 26, 0.78);
  box-shadow: 0 0 34px rgba(139, 92, 255, 0.16);
}

.plan-card.active {
  transform: translateY(-8px);
  border-color: rgba(255, 255, 255, 0.38);
  background:
    linear-gradient(180deg, rgba(139, 92, 255, 0.2), rgba(8, 11, 26, 0.82) 42%),
    rgba(8, 11, 26, 0.86);
  box-shadow:
    0 0 0 1px rgba(58, 224, 255, 0.18),
    0 0 38px rgba(139, 92, 255, 0.28),
    0 24px 54px rgba(0, 0, 0, 0.36);
}

.plan-card.active::before,
.plan-card.active::after {
  opacity: 1;
}

.ribbon {
  position: absolute;
  top: 16px;
  left: 20px;
  padding: 5px 14px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  background: linear-gradient(90deg, var(--violet), var(--pink));
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.plan-card.featured .plan-head {
  padding-top: 24px;
}

.active-chip {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 5px 10px;
  border: 1px solid rgba(58, 224, 255, 0.32);
  border-radius: 999px;
  background: rgba(58, 224, 255, 0.1);
  color: var(--cyan);
  font-size: 11px;
  font-weight: 800;
  box-shadow: 0 0 18px rgba(58, 224, 255, 0.18);
}

.plan-head {
  min-height: 62px;
}

.plan-head h2 {
  margin: 0;
  color: #fff;
  font-size: 25px;
  font-weight: 800;
}

.plan-head p {
  margin: 6px 0 0;
  color: var(--dim);
  font-size: 13px;
  font-weight: 700;
}

.price-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 18px;
}

.currency {
  color: var(--muted);
  font-size: 20px;
  font-weight: 800;
}

.amount {
  color: #fff;
  font-size: 48px;
  font-weight: 800;
  line-height: 1;
}

.price-note {
  margin-left: 6px;
  color: var(--dim);
  font-size: 13px;
  font-weight: 700;
}

.tagline {
  min-height: 52px;
  margin: 14px 0 20px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.credits-block {
  display: grid;
  gap: 5px;
  min-height: 112px;
  place-items: center;
  margin-bottom: 22px;
  padding: 18px 12px;
  border-top: 1px solid rgba(120, 160, 255, 0.13);
  border-bottom: 1px solid rgba(120, 160, 255, 0.13);
  text-align: center;
}

.credits {
  color: var(--cyan);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 30px;
  font-weight: 800;
  line-height: 1.1;
}

.plan-card.featured .credits {
  color: #bda7ff;
}

.plan-card.active .credits {
  color: #fff;
  text-shadow: 0 0 20px rgba(58, 224, 255, 0.5);
}

.credits-label {
  color: var(--dim);
  font-size: 12px;
  font-weight: 800;
}

.credits-calls {
  color: var(--muted);
  font-size: 12px;
}

.feature-list {
  flex: 1;
  margin: 0 0 24px;
  padding: 0;
  list-style: none;
}

.feature-list li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  min-height: 24px;
  margin-bottom: 12px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.check {
  display: inline-flex;
  flex: 0 0 17px;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  margin-top: 2px;
  border-radius: 50%;
  background: rgba(61, 255, 176, 0.13);
  color: var(--green);
  font-size: 11px;
  font-weight: 900;
}

.plan-action {
  width: 100%;
  min-height: 44px;
  padding: 12px 14px;
  border: 1px solid rgba(120, 160, 255, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  transition: border-color 0.18s, background 0.18s, transform 0.18s;
}

.plan-action:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: var(--cyan);
  background: rgba(58, 224, 255, 0.12);
}

.plan-action.primary {
  border-color: transparent;
  background: linear-gradient(90deg, var(--violet), var(--pink));
  box-shadow: 0 8px 22px rgba(139, 92, 255, 0.28);
}

.plan-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.notes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-top: 56px;
}

.note-item {
  min-height: 142px;
  padding: 22px;
  border: 1px solid var(--panel-line);
  border-radius: 10px;
  background: rgba(8, 11, 26, 0.62);
  backdrop-filter: blur(12px);
}

.note-item h3 {
  margin: 0 0 10px;
  color: #fff;
  font-size: 15px;
  font-weight: 800;
}

.note-item p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
}

.contact {
  margin: 36px 0 0;
  color: var(--dim);
  font-size: 13px;
  line-height: 1.7;
  text-align: center;
}

.contact a {
  color: var(--cyan);
  text-decoration: none;
}

.contact a:hover {
  text-decoration: underline;
}

@keyframes sheen-slide {
  0% {
    transform: translateX(-36%) rotate(0.001deg);
  }
  55%,
  100% {
    transform: translateX(42%) rotate(0.001deg);
  }
}

@keyframes beam-pulse {
  0%,
  100% {
    opacity: 0.55;
    transform: scaleX(0.72);
  }
  50% {
    opacity: 1;
    transform: scaleX(1);
  }
}

@media (max-width: 1180px) {
  .plans {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .selection-beam {
    display: none;
  }
}

@media (max-width: 820px) {
  .pricing-page {
    padding-top: 112px;
  }

  .hero h1 {
    font-size: 38px;
  }

  .notes {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .pricing-page {
    padding: 104px 5vw 72px;
  }

  .hero {
    margin-bottom: 38px;
    text-align: left;
  }

  .hero h1 {
    font-size: 32px;
  }

  .plans {
    grid-template-columns: 1fr;
  }

  .selection-beam {
    display: none;
  }

  .plan-card {
    min-height: auto;
  }
}
</style>
