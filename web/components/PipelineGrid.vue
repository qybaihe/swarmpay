<script setup lang="ts">
import { useI18n } from "vue-i18n";
import SectionHeader from "./SectionHeader.vue";
const { t } = useI18n();

// 链上协作流:6 步,从用户下目标到 agent 间价值循环
const steps = [
  { n: 1, icon: "🎯", t: "pipelinegrid.s1t", d: "pipelinegrid.s1d", color: "#ffd23f", chain: "pipelinegrid.s1c" },
  { n: 2, icon: "🧬", t: "pipelinegrid.s2t", d: "pipelinegrid.s2d", color: "#5ca8ff", chain: "pipelinegrid.s2c" },
  { n: 3, icon: "⚖️", t: "pipelinegrid.s3t", d: "pipelinegrid.s3d", color: "#8b5cff", chain: "reward_split" },
  { n: 4, icon: "⛓️", t: "pipelinegrid.s4t", d: "pipelinegrid.s4d", color: "#3dffb0", chain: "pipelinegrid.s4c" },
  { n: 5, icon: "💰", t: "pipelinegrid.s5t", d: "pipelinegrid.s5d", color: "#ffb84d", chain: "pipelinegrid.s5c" },
  { n: 6, icon: "🔁", t: "pipelinegrid.s6t", d: "pipelinegrid.s6d", color: "#ff5cc8", chain: "pipelinegrid.s6c" },
];
</script>

<template>
  <section class="flat-section" id="pipeline">
    <div class="flat-inner">
      <SectionHeader
        :eyebrow="t('pipelinegrid.eyebrow')"
        :title="t('pipelinegrid.k11')"
        :sub="t('pipelinegrid.sub')"
      />

      <!-- 链上价值流:6 步竖向时间线,每步带链上标记 -->
      <ol class="flow">
        <li v-for="(s, i) in steps" :key="s.n" class="flow-step" :style="{ '--c': s.color }">
          <div class="step-rail">
            <div class="step-node">{{ s.icon }}</div>
            <div v-if="i < steps.length - 1" class="step-line"></div>
          </div>
          <div class="step-body">
            <div class="step-head">
              <span class="step-num">{{ t('pipelinegrid.stepN', { n: s.n }) }}</span>
              <h3 class="step-t">{{ t(s.t) }}</h3>
              <span class="step-chain">⛓️ {{ t(s.chain) }}</span>
            </div>
            <p class="step-d">{{ t(s.d) }}</p>
          </div>
        </li>
      </ol>

      <!-- 价值循环图:agent 之间互相悬赏 -->
      <div class="loop-card">
        <div class="loop-head">
          <span class="loop-icon">🔁</span>
          <div>
            <h3>{{ t('pipelinegrid.k1') }}</h3>
            <p>{{ t('pipelinegrid.k2') }}</p>
          </div>
        </div>
        <div class="loop-flow">
          <span class="lp agent">reviewer<br/><small>{{ t('pipelinegrid.k3') }}</small></span>
          <span class="lp arrow">{{ t('pipelinegrid.k4') }}</span>
          <span class="lp agent gold">coder<br/><small>{{ t('pipelinegrid.k5') }}</small></span>
          <span class="lp arrow">{{ t('pipelinegrid.k6') }}</span>
          <span class="lp agent">explorer<br/><small>{{ t('pipelinegrid.k5') }}</small></span>
          <span class="lp arrow back">{{ t('pipelinegrid.k7') }}</span>
        </div>
        <div class="loop-foot">{{ t('pipelinegrid.k8') }}<b>{{ t('pipelinegrid.k9') }}</b>{{ t('pipelinegrid.k10') }}</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.flat-section {
  padding: 120px 6vw;
  background: var(--bg);
  position: relative;
}
.flat-section::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 52% 42% at 22% 4%, rgba(139, 92, 255, 0.12), transparent 62%),
    radial-gradient(ellipse 56% 44% at 78% 96%, rgba(58, 224, 255, 0.11), transparent 64%);
}
.flat-inner {
  position: relative;
  z-index: 1;
  max-width: 1080px;
  margin: 0 auto;
}

/* 6 步链上价值流时间线 */
.flow {
  list-style: none;
  margin: 48px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.flow-step {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 20px;
  padding: 18px 0;
}
.step-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.step-node {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  background: rgba(8, 11, 26, 0.8);
  border: 2px solid var(--c);
  box-shadow: 0 0 18px color-mix(in srgb, var(--c) 40%, transparent);
  flex-shrink: 0;
}
.step-line {
  width: 2px;
  flex: 1;
  margin-top: 6px;
  background: linear-gradient(180deg, var(--c), transparent);
  opacity: 0.5;
}
.step-body {
  padding-top: 4px;
}
.step-head {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.step-num {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--c);
  text-transform: uppercase;
  padding: 3px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--c) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--c) 35%, transparent);
}
.step-t {
  margin: 0;
  font-size: 19px;
  font-weight: 800;
  color: #fff;
}
.step-chain {
  font-size: 11px;
  font-family: ui-monospace, monospace;
  color: var(--green);
  background: rgba(61, 255, 176, 0.08);
  padding: 2px 9px;
  border-radius: 5px;
  border: 1px solid rgba(61, 255, 176, 0.22);
  white-space: nowrap;
}
.step-d {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--muted);
}

/* 价值循环卡 */
.loop-card {
  margin-top: 56px;
  padding: 32px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(139, 92, 255, 0.1), rgba(58, 224, 255, 0.04));
  border: 1px solid rgba(139, 92, 255, 0.3);
  box-shadow: 0 0 48px rgba(139, 92, 255, 0.1);
}
.loop-head {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  margin-bottom: 24px;
}
.loop-icon {
  font-size: 36px;
  flex-shrink: 0;
}
.loop-head h3 {
  margin: 0 0 8px;
  font-size: 20px;
  color: #fff;
  font-weight: 800;
}
.loop-head p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--muted);
}
.loop-flow {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  padding: 20px;
  border-radius: 10px;
  background: rgba(4, 5, 13, 0.5);
  border: 1px dashed rgba(255, 255, 255, 0.1);
}
.lp.agent {
  text-align: center;
  font-size: 14px;
  font-weight: 800;
  color: #fff;
  padding: 10px 16px;
  border-radius: 8px;
  background: rgba(139, 92, 255, 0.16);
  border: 1px solid rgba(139, 92, 255, 0.35);
}
.lp.agent small {
  display: block;
  font-size: 10px;
  font-weight: 500;
  color: var(--muted);
  margin-top: 2px;
}
.lp.agent.gold {
  background: rgba(255, 210, 63, 0.16);
  border-color: rgba(255, 210, 63, 0.45);
  box-shadow: 0 0 18px rgba(255, 210, 63, 0.18);
}
.lp.arrow {
  font-size: 13px;
  font-weight: 700;
  color: var(--cyan);
  white-space: nowrap;
}
.lp.arrow.back {
  color: var(--green);
  font-size: 16px;
}
.loop-foot {
  margin-top: 18px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--dim);
  text-align: center;
}
.loop-foot b {
  color: var(--green);
}

@media (max-width: 760px) {
  .flat-section { padding: 80px 5vw; }
  .flow-step { grid-template-columns: 48px 1fr; gap: 14px; }
  .step-node { width: 40px; height: 40px; font-size: 18px; }
  .loop-card { padding: 22px; }
  .loop-flow { gap: 8px; }
}
</style>
