<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import { STAGES } from "../constants/fleet";

const props = defineProps<{ active: boolean }>();
const emit = defineEmits<{ tick: [seconds: number] }>();

const stageIdx = ref(0);
const elapsed = ref(0);
let stageTimer: ReturnType<typeof setInterval> | undefined;
let secTimer: ReturnType<typeof setInterval> | undefined;

function start() {
  stageIdx.value = 0;
  elapsed.value = 0;
  const t0 = Date.now();
  secTimer = setInterval(() => {
    elapsed.value = (Date.now() - t0) / 1000;
    emit("tick", elapsed.value);
  }, 100);
  stageTimer = setInterval(() => {
    stageIdx.value = (stageIdx.value + 1) % STAGES.length;
  }, 4200);
}
function stop() {
  clearInterval(stageTimer);
  clearInterval(secTimer);
}

watch(
  () => props.active,
  (v) => {
    if (v) start();
    else stop();
  },
);

onUnmounted(stop);
</script>

<template>
  <div class="demo-loading" v-show="active">
    <div class="load-core">
      <div class="ring r1"></div>
      <div class="ring r2"></div>
      <div class="ms">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 2 19 20 12 16 5 20z" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
          <path d="M12 7.5v6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          <circle cx="12" cy="11" r="1.8" fill="currentColor" />
        </svg>
      </div>
    </div>
    <div class="load-stage">{{ STAGES[stageIdx] }}</div>
    <div class="load-timer">跃迁充能 {{ elapsed.toFixed(1) }}s</div>
    <div class="load-bar"><div class="fill"></div></div>
  </div>
</template>

<style scoped>
.demo-loading {
  margin-top: 28px;
  text-align: center;
  padding: 24px;
}
.load-core {
  position: relative;
  width: 150px;
  height: 150px;
  margin: 0 auto 20px;
}
.load-core .ms {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 60px;
  height: 60px;
  color: var(--amber);
  filter: drop-shadow(0 0 22px rgba(255, 184, 77, 0.7));
}
.load-core .ms svg { width: 100%; height: 100%; }
.load-core .ring {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 2px solid transparent;
}
.load-core .ring.r1 {
  width: 92px;
  height: 92px;
  border-top-color: var(--cyan);
  animation: spinLoad 1.2s linear infinite;
}
.load-core .ring.r2 {
  width: 132px;
  height: 132px;
  border-top-color: var(--violet);
  animation: spinLoad 1.8s linear infinite reverse;
}
@keyframes spinLoad {
  to { transform: translate(-50%, -50%) rotate(360deg); }
}
.load-stage {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 8px;
  min-height: 24px;
}
.load-timer {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 14px;
}
.load-bar {
  width: 100%;
  max-width: 340px;
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  margin: 0 auto;
  overflow: hidden;
}
.load-bar .fill {
  height: 100%;
  width: 8%;
  background: linear-gradient(90deg, var(--cyan), var(--violet), var(--pink));
  animation: breathe 1.6s ease infinite;
}
@keyframes breathe {
  0%, 100% { width: 8%; }
  50% { width: 82%; }
}
</style>
