<script setup lang="ts">
defineProps<{ eyebrow: string; title: string; sub?: string }>();
</script>

<template>
  <div class="sec-head">
    <div class="sec-eyebrow">{{ eyebrow }}</div>
    <h2 class="sec-h2">{{ title }}</h2>
    <p v-if="sub" class="sec-sub">{{ sub }}</p>
  </div>
</template>

<style scoped>
.sec-head {
  margin-bottom: 48px;
}
.sec-eyebrow {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 3px;
  color: var(--cyan);
  text-transform: uppercase;
  margin-bottom: 14px;
  text-align: center;
}
.sec-h2 {
  font-size: clamp(32px, 5vw, 52px);
  font-weight: 800;
  letter-spacing: -1px;
  line-height: 1.1;
  text-align: center;
}
.sec-sub {
  font-size: clamp(16px, 2vw, 19px);
  color: var(--muted);
  max-width: 680px;
  margin: 18px auto 0;
  line-height: 1.55;
  text-align: center;
}
</style>
