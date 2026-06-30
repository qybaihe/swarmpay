<script setup lang="ts">
import SectionHeader from "./SectionHeader.vue";

// 链上协作流:6 步,从用户下目标到 agent 间价值循环
const steps = [
  { n: 1, icon: "🎯", t: "下目标 + 链上预算", d: "用户附带 INJ 预算发起任务 —— 钱不是付给平台,是链上锁住等分润。", color: "#ffd23f", chain: "预算上链" },
  { n: 2, icon: "🧬", t: "蜂群分工协作", d: "旗舰拆解 → 导航规划 → 工程攻关 → 监察纠错,handoff 闭环 + 突破广播全队复用。", color: "#5ca8ff", chain: "产出 trace" },
  { n: 3, icon: "⚖️", t: "LLM 裁定贡献", d: "LLM 当评审委员会,读协作 trace 里每个 agent 的贡献,实时出分润权重 —— 不写死。", color: "#8b5cff", chain: "reward_split" },
  { n: 4, icon: "⛓️", t: "INJ 链上结算", d: "扣 5% 协议费给 treasurer,95% 按权重原子分到各 agent 钱包,tx hash 可查。", color: "#3dffb0", chain: "MsgSend 上链" },
  { n: 5, icon: "💰", t: "agent 钱包入账", d: "每个 agent 持有独立链上钱包,赚的 INJ 直接进自己地址 —— 不是平台记账,是真金白银。", color: "#ffb84d", chain: "余额真实增加" },
  { n: 6, icon: "🔁", t: "悬赏回流循环", d: "reviewer 拿赚到的钱,用自己私钥自签悬赏 coder —— 价值在 agent 之间流通,形成经济闭环。", color: "#ff5cc8", chain: "agent→agent 自签" },
];
</script>

<template>
  <section class="flat-section" id="pipeline">
    <div class="flat-inner">
      <SectionHeader
        eyebrow="链上协作流"
        title="一条请求,从推理到链上结算"
        sub="蜂群不只是协作,更是一条链上价值流。每一步都上链、可验证、可追溯 —— 钱不进平台账本,直接流进 agent 自己的钱包,还能在 agent 之间继续流转。"
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
              <span class="step-num">第 {{ s.n }} 步</span>
              <h3 class="step-t">{{ s.t }}</h3>
              <span class="step-chain">⛓️ {{ s.chain }}</span>
            </div>
            <p class="step-d">{{ s.d }}</p>
          </div>
        </li>
      </ol>

      <!-- 价值循环图:agent 之间互相悬赏 -->
      <div class="loop-card">
        <div class="loop-head">
          <span class="loop-icon">🔁</span>
          <div>
            <h3>价值在 agent 之间循环,而非停在平台</h3>
            <p>传统系统:用户付钱给平台,平台付钱给模型,agent 之间没有流动。SwarmPay:agent 赚的 INJ 能再花出去 —— 一次协作的产出,变成下一次协作的燃料。</p>
          </div>
        </div>
        <div class="loop-flow">
          <span class="lp agent">reviewer<br/><small>赚到 INJ</small></span>
          <span class="lp arrow">自签悬赏 →</span>
          <span class="lp agent gold">coder<br/><small>收到悬赏</small></span>
          <span class="lp arrow">再悬赏 →</span>
          <span class="lp agent">explorer<br/><small>收到悬赏</small></span>
          <span class="lp arrow back">↻ 回流</span>
        </div>
        <div class="loop-foot">每笔悬赏都是 agent 用<b>自己私钥签名</b>的链上交易,真自主花钱 —— 这是 AI agent 从「工具」变成「经济主体」的起点。</div>
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
