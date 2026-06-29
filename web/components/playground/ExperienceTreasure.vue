<script setup lang="ts">
import { computed } from "vue";
import { usePlaygroundStore } from "../../stores/playground";

const store = usePlaygroundStore();
const count = computed(() => store.treasury);
const pulsing = computed(() => store.treasurePulse);
</script>

<template>
  <div class="treasure" :class="{ pulse: pulsing, has: count > 0 }" title="EvoMap 经验宝箱:跑完一轮蜂群,成功路径沉淀为经验金币存入这里;下一轮同类目标从这里继承经验">
    <!-- 宝箱主体 -->
    <div class="chest">
      <div class="chest-lid"></div>
      <div class="chest-body">
        <div class="chest-lock"></div>
        <div class="chest-glow" v-if="count > 0"></div>
      </div>
      <div class="chest-shadow"></div>
    </div>
    <!-- 库存 -->
    <div class="treasure-meta">
      <div class="treasure-label">经验宝箱</div>
      <div class="treasure-count">
        <span class="coin-glyph">🪙</span>
        <span class="count-num" :key="count">{{ count }}</span>
      </div>
    </div>
    <!-- 飞行中的金币 -->
    <div
      v-for="c in store.coins"
      :key="c.id"
      class="coin"
      :class="c.kind"
      :style="{
        left: c.fromX + 'px',
        top: c.fromY + 'px',
        '--tx': (c.toX - c.fromX) + 'px',
        '--ty': (c.toY - c.fromY) + 'px',
      }"
    >
      <span class="coin-face">🪙</span>
    </div>
    <!-- 经验提示条 -->
    <Transition name="hint">
      <div v-if="pulsing" class="treasure-hint">+1 经验入箱</div>
    </Transition>
  </div>
</template>

<style scoped>
.treasure {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 25;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 12px 16px 10px;
  background: linear-gradient(160deg, rgba(43, 30, 8, 0.94), rgba(18, 12, 3, 0.94));
  border: 1.5px solid rgba(255, 210, 63, 0.5);
  border-radius: 16px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 210, 63, 0.18);
  backdrop-filter: blur(8px);
  user-select: none;
}
.treasure.has {
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6), 0 0 28px rgba(255, 184, 0, 0.28), inset 0 1px 0 rgba(255, 210, 63, 0.22);
}
.treasure.pulse {
  animation: chestShake 0.55s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}
@keyframes chestShake {
  0%, 100% { transform: translate(0, 0) rotate(0); }
  20% { transform: translate(-2px, -3px) rotate(-2deg); }
  40% { transform: translate(2px, -1px) rotate(2deg); }
  60% { transform: translate(-1px, -2px) rotate(-1deg); }
  80% { transform: translate(1px, 0) rotate(1deg); }
}

/* 宝箱造型(CSS 绘制) */
.chest {
  position: relative;
  width: 44px;
  height: 38px;
  flex-shrink: 0;
}
.chest-lid {
  position: absolute;
  top: 0; left: 0;
  width: 44px; height: 16px;
  background: linear-gradient(180deg, #d4a017 0%, #8b5a00 100%);
  border-radius: 22px 22px 4px 4px;
  border: 1.5px solid #5c3d00;
  box-shadow: inset 0 2px 3px rgba(255, 230, 120, 0.5), 0 -1px 3px rgba(0, 0, 0, 0.4);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.treasure.pulse .chest-lid {
  transform: translateY(-5px) rotate(-4deg);
}
.chest-body {
  position: absolute;
  bottom: 0; left: 0;
  width: 44px; height: 26px;
  background: linear-gradient(180deg, #b8860b 0%, #5c3d00 100%);
  border-radius: 4px 4px 6px 6px;
  border: 1.5px solid #3d2800;
  box-shadow: inset 0 -2px 4px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}
.chest-lock {
  position: absolute;
  top: 4px; left: 50%;
  transform: translateX(-50%);
  width: 8px; height: 10px;
  background: linear-gradient(180deg, #ffd700, #b8860b);
  border-radius: 2px;
  border: 1px solid #5c3d00;
  box-shadow: 0 0 4px rgba(255, 215, 0, 0.6);
}
.chest-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 30%, rgba(255, 230, 120, 0.5), transparent 60%);
  animation: glowPulse 2s ease-in-out infinite;
}
@keyframes glowPulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.85; }
}
.chest-shadow {
  position: absolute;
  bottom: -4px; left: 50%;
  transform: translateX(-50%);
  width: 40px; height: 5px;
  background: radial-gradient(ellipse, rgba(0, 0, 0, 0.5), transparent 70%);
  border-radius: 50%;
}

/* 文案区 */
.treasure-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 2px;
}
.treasure-label {
  font-size: 10px;
  font-weight: 700;
  color: #ffd23f;
  letter-spacing: 0.6px;
  opacity: 0.9;
}
.treasure-count {
  display: flex;
  align-items: center;
  gap: 4px;
}
.coin-glyph { font-size: 14px; }
.count-num {
  font-size: 20px;
  font-weight: 800;
  color: #ffe066;
  font-family: ui-monospace, "SF Mono", monospace;
  text-shadow: 0 0 10px rgba(255, 210, 63, 0.7), 0 1px 2px rgba(0, 0, 0, 0.5);
  animation: numPop 0.4s ease;
}
@keyframes numPop {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); color: #fff; }
  100% { transform: scale(1); }
}

/* 经验提示 */
.treasure-hint {
  position: absolute;
  bottom: -24px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 700;
  color: #ffd23f;
  background: rgba(43, 30, 8, 0.95);
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 210, 63, 0.5);
  white-space: nowrap;
  text-shadow: 0 0 6px rgba(255, 210, 63, 0.6);
}
.hint-enter-active, .hint-leave-active { transition: all 0.3s ease; }
.hint-enter-from, .hint-leave-to { opacity: 0; transform: translateX(-50%) translateY(-6px); }

/* 飞行金币 */
.coin {
  position: fixed;
  z-index: 60;
  pointer-events: none;
  animation: coinFly 1.2s ease-in forwards;
  filter: drop-shadow(0 0 8px rgba(255, 210, 63, 0.9));
}
.coin-face {
  display: block;
  font-size: 22px;
  animation: coinSpin 1.2s linear;
}
@keyframes coinFly {
  0% { transform: translate(0, 0) scale(0.4); opacity: 0; }
  18% { opacity: 1; transform: translate(calc(var(--tx) * 0.18), calc(var(--ty) * 0.18)) scale(1.3); }
  100% { transform: translate(var(--tx), var(--ty)) scale(0.7); opacity: 0; }
}
@keyframes coinSpin {
  0% { transform: rotateY(0deg) scale(1); }
  50% { transform: rotateY(540deg) scale(1.15); }
  100% { transform: rotateY(1080deg) scale(0.8); }
}

@media (max-width: 760px) {
  .treasure { top: 12px; left: 12px; padding: 9px 12px 8px; }
  .chest { width: 36px; height: 32px; }
  .chest-lid { width: 36px; }
  .chest-body { width: 36px; }
  .count-num { font-size: 17px; }
}
</style>
