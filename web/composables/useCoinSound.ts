// 金币音效:用 Web Audio API 程序化合成经典"叮+上扬"金币声,无需音频文件。
// 首次调用时延迟创建 AudioContext(遵守浏览器自动播放策略)。

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    } catch {
      ctx = null;
    }
  }
  return ctx;
}

/** 播一次金币声:两个正弦音叠加(高频"叮" + 上扬尾音),像硬币落袋 */
export function playCoinSound(): void {
  const ac = getCtx();
  if (!ac) return;
  // 浏览器策略:suspended 时尝试 resume
  if (ac.state === "suspended") {
    ac.resume().catch(() => { /* ignore */ });
  }
  const now = ac.currentTime;

  // 主音:高频清脆"叮"(1318Hz ≈ E6,经典金币音)
  const o1 = ac.createOscillator();
  const g1 = ac.createGain();
  o1.type = "square";
  o1.frequency.setValueAtTime(1318, now);
  o1.frequency.exponentialRampToValueAtTime(1568, now + 0.08);
  g1.gain.setValueAtTime(0.0001, now);
  g1.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
  g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
  o1.connect(g1).connect(ac.destination);
  o1.start(now);
  o1.stop(now + 0.3);

  // 副音:低八度,增加厚度(659Hz)
  const o2 = ac.createOscillator();
  const g2 = ac.createGain();
  o2.type = "triangle";
  o2.frequency.setValueAtTime(659, now);
  g2.gain.setValueAtTime(0.0001, now);
  g2.gain.exponentialRampToValueAtTime(0.1, now + 0.015);
  g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  o2.connect(g2).connect(ac.destination);
  o2.start(now);
  o2.stop(now + 0.24);
}

/** 宝箱打开声:低沉的"咔哒"+ 上扬闪光(用于金币飞出/宝箱 pulse) */
export function playTreasureOpenSound(): void {
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume().catch(() => { /* ignore */ });
  const now = ac.currentTime;

  // 咔哒(短促噪声+低频)
  const o1 = ac.createOscillator();
  const g1 = ac.createGain();
  o1.type = "sawtooth";
  o1.frequency.setValueAtTime(180, now);
  o1.frequency.exponentialRampToValueAtTime(90, now + 0.06);
  g1.gain.setValueAtTime(0.0001, now);
  g1.gain.exponentialRampToValueAtTime(0.14, now + 0.008);
  g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  o1.connect(g1).connect(ac.destination);
  o1.start(now);
  o1.stop(now + 0.14);

  // 闪光上扬(延时 80ms)
  const o2 = ac.createOscillator();
  const g2 = ac.createGain();
  o2.type = "sine";
  o2.frequency.setValueAtTime(880, now + 0.08);
  o2.frequency.exponentialRampToValueAtTime(1760, now + 0.22);
  g2.gain.setValueAtTime(0.0001, now + 0.08);
  g2.gain.exponentialRampToValueAtTime(0.12, now + 0.1);
  g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
  o2.connect(g2).connect(ac.destination);
  o2.start(now + 0.08);
  o2.stop(now + 0.34);
}
