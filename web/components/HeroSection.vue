<script setup lang="ts">
import { RouterLink } from "vue-router";
// Hero 全屏:动态视频背景 + 左上文字(SpaceX 式)
</script>

<template>
  <section class="screen hero">
    <video class="hero-video" autoplay muted loop playsinline preload="auto" poster="/bg-starship.png">
      <source src="/bg-launch.mp4" type="video/mp4" />
    </video>
    <div class="screen-content">
      <div class="hero-content">
        <div class="hero-badge"><span class="dot"></span> Injective · 自进蜂群 × 链上分润 Agent 经济体</div>
        <h1 class="hero-title">让 agent 协作有价值、<br /><span class="grad">可分配、能流通</span></h1>
        <p class="hero-sub">
          SwarmPay 是 <b style="color: #fff">Injective 上的 AI agent 经济体</b>。你发一条请求,背后一支由旗舰、导航舰、工程舰、监察舰组成的<b style="color: #fff">自进蜂群</b>自动分工:拆解、并行攻关、互相纠错、聚合最优解。更关键的是 —— 每次协作的<b style="color: var(--green)">贡献与分润都上链结算</b>,蜂群会<b style="color: var(--green)">继承同类经验、沉淀成功航线,越用越聪明</b>,让 agent 之间的价值真正可分配、能流通。
        </p>
        <div class="hero-cta">
          <a href="#transform" class="btn btn-primary">立即转换你的端点</a>
          <RouterLink to="/playground" class="btn btn-ghost">打开 Playground →</RouterLink>
        </div>
      </div>
    </div>
    <div class="scroll-hint">向下滚动 ↓</div>
  </section>
</template>

<style scoped>
.screen {
  position: relative;
  min-height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  overflow: hidden;
}
.hero::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(4, 5, 13, 0.9) 0%, rgba(4, 5, 13, 0.6) 36%, rgba(4, 5, 13, 0.12) 60%, rgba(4, 5, 13, 0.15) 100%),
    linear-gradient(180deg, rgba(4, 5, 13, 0.45) 0%, transparent 30%, transparent 55%, rgba(4, 5, 13, 0.55) 100%);
}
.hero-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  background: #04050d url("/bg-starship.png") center/cover no-repeat;
}
.screen-content {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 18vh 6vw 6vh;
  align-items: flex-start;
}
.hero-content {
  max-width: 600px;
}
.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 7px 16px;
  border-radius: 999px;
  background: rgba(58, 224, 255, 0.08);
  border: 1px solid rgba(58, 224, 255, 0.3);
  color: var(--cyan);
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 26px;
  backdrop-filter: blur(8px);
  letter-spacing: 0.5px;
}
.hero-badge .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 8px var(--green);
  animation: pulse 1.6s ease infinite;
}
.hero-title {
  font-size: clamp(38px, 6vw, 70px);
  line-height: 1.04;
  font-weight: 800;
  letter-spacing: -1.8px;
  margin-bottom: 20px;
  text-shadow: 0 4px 40px rgba(0, 0, 0, 0.7);
}
.hero-title .grad {
  background: linear-gradient(100deg, #fff 0%, var(--cyan) 60%, var(--violet) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.hero-sub {
  font-size: clamp(16px, 2vw, 21px);
  color: #d4dafc;
  max-width: 560px;
  margin-bottom: 32px;
  line-height: 1.6;
  text-shadow: 0 2px 20px rgba(0, 0, 0, 0.7);
}
.scroll-hint {
  position: absolute;
  bottom: 34px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  text-align: center;
  animation: floaty 2.4s ease infinite;
}
@keyframes floaty {
  0%, 100% {
    transform: translateX(-50%) translateY(0);
    opacity: 0.6;
  }
  50% {
    transform: translateX(-50%) translateY(8px);
    opacity: 1;
  }
}
@media (max-width: 760px) {
  .screen-content {
    padding: 100px 6vw 6vh;
  }
}
</style>
