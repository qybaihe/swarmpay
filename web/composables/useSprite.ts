// 帧动画 composable:按 action 循环播放 sprite 00→07
// 用 requestAnimationFrame 节流到 ~8fps(像素动画不需要 60fps)
import { ref, watch, onUnmounted, type Ref } from "vue";
import { spritePath, type Action } from "../constants/pets";

const FRAME_COUNT = 8;
const FRAME_INTERVAL = 130; // ms/帧 ≈ 7.7fps,像素动画质感

export function useSprite(spritePrefix: Ref<string>, action: Ref<Action>) {
  const frame = ref(0);
  const src = ref("");
  let raf = 0;
  let last = 0;

  function tick(now: number) {
    if (now - last >= FRAME_INTERVAL) {
      frame.value = (frame.value + 1) % FRAME_COUNT;
      src.value = spritePath(spritePrefix.value, action.value, frame.value);
      last = now;
    }
    raf = requestAnimationFrame(tick);
  }

  function start() {
    cancelAnimationFrame(raf);
    src.value = spritePath(spritePrefix.value, action.value, 0);
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  // sprite/action 变化时重置到第 0 帧并继续
  watch([spritePrefix, action], () => {
    frame.value = 0;
    src.value = spritePath(spritePrefix.value, action.value, 0);
  });

  start();
  onUnmounted(() => cancelAnimationFrame(raf));

  return { src, frame };
}
