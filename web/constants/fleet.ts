// 舰队常量:SVG 图标 / 角色映射 / 加载阶段文案 / 表单预设
// 从原 index.html 的 <script> 提取,全站唯一真相

// 舰船 SVG:统一箭头巡洋舰轮廓 + 各舰种舱位符号
export const SHIP_SVG: Record<string, string> = {
  // 旗舰(orchestrator):指挥舰,中央能量核
  flagship:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2 19 20 12 16 5 20z" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 7.5v6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="11" r="1.8" fill="currentColor"/></svg>',
  // 导航舰(planner):雷达十字
  navigator:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2 19 20 12 16 5 20z" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="11" r="3.1" stroke="currentColor" stroke-width="1.2"/><path d="M12 8v6M9 11h6" stroke="currentColor" stroke-width="1"/></svg>',
  // 工程舰(coder):代码符 </> 
  engineer:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2 19 20 12 16 5 20z" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="m10 9-2 2 2 2M14 9l2 2-2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  // 监察舰(reviewer):对勾
  auditor:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2 19 20 12 16 5 20z" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="m9 11 2 2 4-4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  // 斥候舰(explorer):闪电
  scout:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2 19 20 12 16 5 20z" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M13 8 9.5 12h2.8L11 16l3.8-4h-2.8z" fill="currentColor"/></svg>',
};

// logo 用的箭头舰(带能量核)
export const LOGO_SVG =
  '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2 19 20 12 16 5 20z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="11" r="1.7" fill="currentColor"/></svg>';

// 后端 variant → 舰种 + 颜色
export const ROLE: Record<
  string,
  { ship: string; name: string; color: string }
> = {
  orchestrator: { ship: "flagship", name: "旗舰", color: "#ffb84d" },
  planner: { ship: "navigator", name: "导航舰", color: "#5ca8ff" },
  coder: { ship: "engineer", name: "工程舰", color: "#3ae0ff" },
  reviewer: { ship: "auditor", name: "监察舰", color: "#8b5cff" },
  explorer: { ship: "scout", name: "斥候舰", color: "#ff5cc8" },
};

// 加载阶段轮播文案
export const STAGES = [
  "🧬 继承 EvoMap 航图经验…",
  "🧭 旗舰规划拆解航线…",
  "🛰️ 编队分工启航…",
  "🎯 监察舰审查纠错…",
  "📡 突破广播全舰队…",
  "🚀 旗舰聚合最终答案…",
];

// 表单 datalist 预设
export const URL_PRESETS = [
  "https://api.openai.com/v1",
  "https://api.deepseek.com/v1",
  "https://open.bigmodel.cn/api/paas/v4",
  "http://localhost:11434/v1",
];

export const MODEL_PRESETS = [
  "gpt-4o-mini",
  "gpt-4o",
  "deepseek-chat",
  "qwen2.5:7b",
  "llama3:8b",
];

// demo 编队型号
export const TIER_OPTIONS = [
  { value: "swarm-baseline", label: "swarm-baseline · 单舰" },
  { value: "swarm-lite", label: "swarm-lite · 巡逻编队" },
  { value: "swarm-heavy", label: "swarm-heavy · 突击编队" },
  { value: "swarm-evo", label: "swarm-evo · 进化旗舰 ★" },
];
