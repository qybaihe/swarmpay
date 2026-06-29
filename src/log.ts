// 简单的彩色日志 + 事件总线(用于 demo 可视化和 trace)

type EventListener = (event: SwarmEvent) => void;

export interface SwarmEvent {
  ts: number;
  phase:
    | "inherit" // 继承:EvoMap 检索
    | "diverge" // 发散:派出蜂
    | "breakthrough" // 突破:某蜂产出高质量片段
    | "broadcast" // 广播:hint 发给其他蜂
    | "converge" // 收敛:聚合
    | "backflow"; // 回流:沉淀到 EvoMap
  message: string;
  detail?: unknown;
}

const listeners = new Set<EventListener>();

export function onSwarmEvent(fn: EventListener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
};

export function emit(phase: SwarmEvent["phase"], message: string, detail?: unknown) {
  const ev: SwarmEvent = { ts: Date.now(), phase, message, detail };
  const color =
    {
      inherit: C.cyan,
      diverge: C.magenta,
      breakthrough: C.yellow,
      broadcast: C.green,
      converge: C.cyan,
      backflow: C.green,
    }[phase] || C.dim;
  const icon =
    {
      inherit: "🧬",
      diverge: "🐝",
      breakthrough: "✨",
      broadcast: "📡",
      converge: "🎯",
      backflow: "↩️",
    }[phase] || "·";
  // eslint-disable-next-line no-console
  console.log(`${C.dim}${new Date(ev.ts).toISOString().slice(11, 23)}${C.reset} ${icon} ${color}[${phase}]${C.reset} ${message}`);
  for (const l of listeners) {
    try {
      l(ev);
    } catch {
      /* listener errors ignored */
    }
  }
}
