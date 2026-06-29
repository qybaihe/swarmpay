<script setup lang="ts">
import { RouterLink } from "vue-router";
import AuthCard from "../components/AuthCard.vue";
import SiteFooter from "../components/SiteFooter.vue";
</script>

<template>
  <video class="bg-video" autoplay muted loop playsinline preload="auto" poster="/bg-starship.png">
    <source src="/bg-launch.mp4" type="video/mp4" />
  </video>
  <div class="bg-overlay"></div>

  <div class="top">
    <RouterLink to="/" class="logo">
      <span class="mark"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2 19 20 12 16 5 20z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="11" r="1.7" fill="currentColor"/></svg></span>
      <b>EvoShip</b>
    </RouterLink>
    <RouterLink to="/" class="back-home">← 返回首页</RouterLink>
  </div>

  <div class="stage">
    <AuthCard />
  </div>

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
    linear-gradient(90deg, rgba(4, 5, 13, 0.55) 0%, rgba(4, 5, 13, 0.4) 50%, rgba(4, 5, 13, 0.55) 100%),
    linear-gradient(180deg, rgba(4, 5, 13, 0.5) 0%, rgba(4, 5, 13, 0.35) 40%, rgba(4, 5, 13, 0.7) 100%);
}
.top {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  padding: 26px 6vw;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.top .logo .mark {
  width: 26px;
  height: 26px;
}
.back-home {
  color: var(--muted);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: 0.2s;
}
.back-home:hover {
  color: #fff;
}
.stage {
  position: relative;
  z-index: 2;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 110px 6vw 60px;
}
.legal {
  position: relative;
  z-index: 2;
  text-align: center;
  color: var(--dim);
  font-size: 12px;
  padding: 0 6vw 36px;
}
@media (max-width: 520px) {
  .stage { padding: 90px 5vw 50px; }
}
</style>
