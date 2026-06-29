// demo-compare.ts
// 对同一提示词,对比"单次基线调用" vs "蜂群",直观展示差异。
// 用法:tsx scripts/demo-compare.ts "你的提示词"
// 不带参数则跑内置示例。

import OpenAI from "openai";

const BASE = process.env.SWARM_ENDPOINT || "http://localhost:4000/v1";
const client = new OpenAI({ baseURL: BASE, apiKey: "demo" });

const PROMPT =
  process.argv[2] ||
  "用 HTML+CSS+JS 做一个炫酷的登录页面,要有玻璃拟态、渐变背景、输入框交互动画。直接给完整代码。";

async function call(model: string) {
  const t0 = Date.now();
  const res = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: PROMPT }],
  });
  const ms = Date.now() - t0;
  const content = res.choices[0]?.message?.content ?? "";
  const trace = (res as OpenAI.Chat.Completions.ChatCompletion & { x_swarm_trace?: unknown }).x_swarm_trace as
    | {
        tier: string;
        swarm_size: number;
        bees: { variant: string; status: string }[];
        breakthroughs_broadcast: number;
        total_latency_ms: number;
        inherited_recipes?: unknown[];
      }
    | undefined;
  return { content, ms, trace };
}

function box(title: string, ms: number, len: number) {
  const line = "─".repeat(56);
  console.log(`\n┌${line}┐`);
  console.log(`│ ${title.padEnd(50)} ${ms}ms`.slice(0, 58).padEnd(58) + "│");
  console.log(`│ 输出长度: ${len} 字符`.padEnd(58) + "│");
  console.log(`└${line}┘`);
}

async function main() {
  console.log("\n" + "═".repeat(58));
  console.log("  🐝 vs 🤖  蜂群 vs 单次基线  对比演示");
  console.log("═".repeat(58));
  console.log(`  提示词: ${PROMPT.slice(0, 80)}${PROMPT.length > 80 ? "…" : ""}`);

  // 1. 基线
  console.log("\n⏳ 调用基线 swarm-baseline(单次)…");
  const base = await call("swarm-baseline");
  box("🤖 swarm-baseline(单 agent 单次)", base.ms, base.content.length);
  console.log(base.content.slice(0, 600) + (base.content.length > 600 ? "\n…[截断]" : ""));

  // 2. 蜂群 heavy
  console.log("\n⏳ 调用 swarm-heavy(蜂群 + 突破传播 + 聚合)…");
  const swarm = await call("swarm-heavy");
  box("🐝 swarm-heavy(蜂群聚合)", swarm.ms, swarm.content.length);
  console.log(swarm.content.slice(0, 600) + (swarm.content.length > 600 ? "\n…[截断]" : ""));

  if (swarm.trace) {
    console.log("\n" + "─".repeat(58));
    console.log("  蜂群过程(trace):");
    console.log("─".repeat(58));
    console.log(`  tier=${swarm.trace.tier}  蜂数=${swarm.trace.swarm_size}  突破广播=${swarm.trace.breakthroughs_broadcast}`);
    console.log(`  蜂状态: ${swarm.trace.bees.map((b) => `${b.variant}(${b.status})`).join(", ")}`);
    console.log(`  总耗时: ${swarm.trace.total_latency_ms}ms`);
  }

  // 3. 蜂群 evo(若配置了 EvoMap)
  console.log("\n⏳ 调用 swarm-evo(蜂群 + EvoMap 继承/回流)…");
  const evo = await call("swarm-evo");
  box("🧬 swarm-evo(蜂群 + EvoMap 继承)", evo.ms, evo.content.length);
  console.log(evo.content.slice(0, 400) + (evo.content.length > 400 ? "\n…[截断]" : ""));
  if (evo.trace?.inherited_recipes?.length) {
    console.log(`  🧬 继承了 ${evo.trace.inherited_recipes.length} 条 EvoMap 经验`);
  }

  console.log("\n" + "═".repeat(58));
  console.log("  接入真实模型后(OPENAI_BASE_URL),对比会更显著。");
  console.log("  把任意 OpenAI 兼容客户端的 base_url 指向本端点即可。");
  console.log("═".repeat(58));
  console.log("");
}

main().catch((e) => {
  console.error("\n❌ 演示失败:", e instanceof Error ? e.message : e);
  console.error("   先确认服务在跑:npm run dev");
  process.exit(1);
});
