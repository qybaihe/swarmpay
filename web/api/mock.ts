// 演示模式预置数据(演示模式 / 后端不可达时兜底)
import type { SwarmTrace } from "./swarm";

export function mockTrace(goal: string, tier: string): SwarmTrace {
  return {
    tier: tier || "swarm-heavy",
    model: "gpt-4o-mini",
    swarm_size: 3,
    inherited_recipes:
      tier === "swarm-evo"
        ? [{ title: "登录页面最佳实践", description: "表单验证、无障碍、响应式" }]
        : [],
    bees: [
      { id: "orchestrator-decompose", variant: "orchestrator", status: "ran", latency_ms: 1400,
        snippet: "旗舰分解为 3 条航线:页面结构 / 样式美化 / 表单校验" },
      { id: "planner-plan", variant: "planner", status: "breakthrough", latency_ms: 16000,
        snippet: "## 航线计划\n1. 语义化 HTML\n2. CSS Grid 居中\n3. 前端表单校验" },
      { id: "coder-implement", variant: "coder", status: "ran", latency_ms: 13000,
        snippet: '<form class="login"><input type="email" required><button>登录</button></form>' },
      { id: "reviewer-review", variant: "reviewer", status: "ran", latency_ms: 12000,
        snippet: "verdict: APPROVE\n优点:语义化、含校验\n建议:加无障碍 label" },
    ],
    breakthroughs_broadcast: 1,
    aggregator: "llm",
    evomap_backflow:
      tier === "swarm-evo"
        ? { status: "published", title: "登录页面航线" }
        : { status: "skipped" },
    total_latency_ms: 42400,
  };
}

export function mockAnswer(goal: string): string {
  return `## 旗舰聚合结果

针对「${goal}」,舰队综合 4 艘舰的产出:

\`\`\`html
<form class="login" role="form">
  <h2>登录</h2>
  <label>邮箱 <input type="email" required placeholder="you@example.com" /></label>
  <label>密码 <input type="password" required minlength="6" /></label>
  <button type="submit">登录</button>
</form>
\`\`\`

**亮点:** 语义化标签 + 前端校验 + 无障碍 label。监察舰已 APPROVE。`;
}
