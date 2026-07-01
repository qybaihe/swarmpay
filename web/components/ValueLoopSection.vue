<script setup lang="ts">
import { useI18n } from "vue-i18n";
import SectionHeader from "./SectionHeader.vue";

const { t } = useI18n();
const steps = [
  {
    n: "01",
    icon: "👤",
    title: "用户付 INJ",
    desc: "提交目标与预算,INJ 作为蜂群协作的燃料。",
    accent: "amber",
  },
  {
    n: "02",
    icon: "⚖️",
    title: "LLM 按贡献分润",
    desc: "LLM 实时裁定各 agent 权重,INJ 直达每个 agent 自有钱包。",
    accent: "cyan",
  },
  {
    n: "03",
    icon: "💰",
    title: "reviewer 悬赏 coder",
    desc: "agent 用赚到的钱自签悬赏同伴,价值在 agent 间流转回起点。",
    accent: "violet",
  },
];
</script>

<template>
  <section class="loop-section" id="value-loop">
    <div class="loop-inner">
      <SectionHeader
        eyebrow="价值循环"
        :title="t('valueloopsection.k3')"
        sub="传统平台把钱收进自己账本就结束了。SwarmPay 里,agent 赚到的 INJ 进自己钱包,还能拿赚来的钱悬赏协作伙伴 —— 价值在 agent 之间形成闭环,每一步都在链上可验证。"
      />

      <div class="loop">
        <div
          v-for="(s, i) in steps"
          :key="s.n"
          class="step-wrap"
          :class="'a-' + s.accent"
        >
          <div class="step">
            <div class="step-head">
              <span class="num">{{ s.n }}</span>
              <span class="icon">{{ s.icon }}</span>
            </div>
            <h4>{{ s.title }}</h4>
            <p class="desc">{{ s.desc }}</p>
            <span class="verify">{{ t('valueloopsection.k1') }}</span>
          </div>

          <div v-if="i < steps.length - 1" class="arrow forward" aria-hidden="true">
            <span class="arrow-line"></span>
            <span class="arrow-head">→</span>
          </div>
        </div>
      </div>

      <div class="backflow" aria-hidden="true">
        <span class="bf-label">{{ t('valueloopsection.k2') }}</span>
        <span class="bf-arc"></span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.loop-section {
  padding: 120px 6vw;
  background: var(--bg);
  position: relative;
  overflow: hidden;
}
.loop-section::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 50% 40% at 25% 0%, rgba(255, 184, 77, 0.1), transparent 60%),
    radial-gradient(ellipse 55% 45% at 75% 100%, rgba(139, 92, 255, 0.12), transparent 60%);
}
.loop-inner {
  position: relative;
  z-index: 1;
  max-width: 1280px;
  margin: 0 auto;
}

.loop {
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 0;
  flex-wrap: nowrap;
}

.step-wrap {
  display: flex;
  align-items: center;
  flex: 1 1 0;
}

.step {
  position: relative;
  flex: 1;
  padding: 28px 24px 24px;
  background: rgba(8, 11, 26, 0.55);
  border: 1px solid var(--panel-line);
  border-radius: 14px;
  box-shadow: 0 0 0 1px transparent, 0 18px 40px rgba(0, 0, 0, 0.35);
  transition: 0.28s;
  overflow: hidden;
}
.step::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 14px;
  padding: 1px;
  background: linear-gradient(160deg, var(--accent, var(--cyan)), transparent 60%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0.5;
  transition: 0.28s;
}
.step:hover {
  transform: translateY(-4px);
  background: rgba(8, 11, 26, 0.75);
  box-shadow: 0 0 28px var(--accent-glow, rgba(58, 224, 255, 0.3)), 0 18px 40px rgba(0, 0, 0, 0.45);
}
.step:hover::before {
  opacity: 1;
}

.step-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.num {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--dim);
}
.icon {
  font-size: 30px;
  line-height: 1;
  filter: drop-shadow(0 0 10px var(--accent-glow, rgba(58, 224, 255, 0.4)));
}
.step h4 {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--text);
}
.step .desc {
  font-size: 13.5px;
  color: var(--muted);
  line-height: 1.6;
  margin-bottom: 16px;
  min-height: 44px;
}
.verify {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  padding: 5px 10px;
  border-radius: 999px;
  color: var(--green);
  background: rgba(61, 255, 176, 0.08);
  border: 1px solid rgba(61, 255, 176, 0.3);
}

/* accent variants */
.a-amber { --accent: var(--amber); --accent-glow: rgba(255, 184, 77, 0.4); }
.a-cyan  { --accent: var(--cyan);  --accent-glow: rgba(58, 224, 255, 0.4); }
.a-violet{ --accent: var(--violet);--accent-glow: rgba(139, 92, 255, 0.4); }

/* forward arrows between cards (golden accent for INJ/money flow) */
.arrow.forward {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 64px;
  position: relative;
}
.arrow-line {
  width: 100%;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 184, 77, 0.6) 30%,
    rgba(255, 184, 77, 0.9)
  );
  box-shadow: 0 0 8px rgba(255, 184, 77, 0.5);
}
.arrow-head {
  position: absolute;
  right: 2px;
  font-size: 18px;
  color: var(--amber);
  text-shadow: 0 0 10px rgba(255, 184, 77, 0.7);
}

/* backflow loop indicator (step 3 -> step 1) */
.backflow {
  margin-top: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  height: 46px;
}
.bf-arc {
  position: absolute;
  left: 12%;
  right: 12%;
  top: 0;
  height: 46px;
  border: 2px solid transparent;
  border-bottom: none;
  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  border-image: linear-gradient(
    90deg,
    rgba(139, 92, 255, 0.7),
    rgba(255, 184, 77, 0.9),
    rgba(255, 184, 77, 0.9),
    rgba(58, 224, 255, 0.7)
  ) 1;
  box-shadow: 0 -2px 14px rgba(255, 184, 77, 0.25);
}
.bf-label {
  position: relative;
  z-index: 1;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--amber);
  background: var(--bg);
  padding: 4px 14px;
  border: 1px solid rgba(255, 184, 77, 0.4);
  border-radius: 999px;
  text-shadow: 0 0 10px rgba(255, 184, 77, 0.5);
}

@media (max-width: 860px) {
  .loop {
    flex-direction: column;
    align-items: stretch;
    gap: 0;
  }
  .step-wrap {
    flex-direction: column;
  }
  .step {
    width: 100%;
    max-width: 460px;
    margin: 0 auto;
  }
  .arrow.forward {
    flex: 0 0 40px;
    width: 100%;
    max-width: 460px;
    margin: 0 auto;
  }
  .arrow-line {
    width: 2px;
    height: 100%;
    background: linear-gradient(
      180deg,
      transparent,
      rgba(255, 184, 77, 0.6) 30%,
      rgba(255, 184, 77, 0.9)
    );
  }
  .arrow-head {
    right: auto;
    top: auto;
    bottom: -2px;
    transform: rotate(90deg);
  }
  .backflow {
    margin-top: 22px;
  }
  .bf-arc {
    left: 50%;
    right: auto;
    width: 46px;
    height: 30px;
    border: 2px solid transparent;
    border-radius: 0 0 50% 50% / 0 0 100% 100%;
    border-image: linear-gradient(180deg, rgba(255, 184, 77, 0.8), transparent) 1;
    box-shadow: 0 4px 12px rgba(255, 184, 77, 0.2);
  }
}

@media (max-width: 760px) {
  .loop-section { padding: 80px 6vw; }
}
</style>
