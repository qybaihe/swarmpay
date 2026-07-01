<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";
const { t } = useI18n();
// Hero 全屏:动态视频背景 + 左上文字(SpaceX 式)
</script>

<template>
  <section class="screen hero">
    <video class="hero-video" autoplay muted loop playsinline preload="auto" poster="/bg-starship.png">
      <source src="/bg-launch.mp4" type="video/mp4" />
    </video>
    <div class="screen-content">
      <div class="hero-content">
        <div class="hero-badge"><span class="dot"></span>{{ t('herosection.k1') }}</div>
        <h1 class="hero-title">{{ t('herosection.k2') }}<br /><span class="grad">{{ t('herosection.k3') }}</span></h1>
        <p class="hero-sub"
          >{{ t('herosection.k4') }} <b style="color: #fff">{{ t('herosection.k5') }}</b>{{ t('herosection.k6') }}<b style="color: var(--green)">{{ t('herosection.k7') }}</b>,<b style="color: var(--green)">{{ t('herosection.k8') }}</b>{{ t('herosection.k9') }}<b style="color: #fff">{{ t('herosection.k10') }}</b>{{ t('herosection.k11') }}<b style="color: var(--green)">{{ t('herosection.k12') }}</b>{{ t('herosection.k13') }}
        </p>
        <div class="hero-cta">
          <a href="#transform" class="btn btn-primary">{{ t('herosection.k14') }}</a>
          <RouterLink to="/playground" class="btn btn-ghost">{{ t('herosection.k15') }}</RouterLink>
        </div>
      </div>
    </div>
    <div class="scroll-hint">{{ t('herosection.k16') }}</div>
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
