// math-eval.ts
// MATH-500 竞赛题正确率对比:swarm-baseline(单次) vs swarm-heavy(蜂群)
// 用法:npx tsx benchmarks/scripts/math-eval.ts [题数,默认20]

import OpenAI from "openai";
import fs from "node:fs";

const BASE = process.env.SWARM_ENDPOINT || "http://localhost:4000/v1";
const client = new OpenAI({ baseURL: BASE, apiKey: "eval" });
const N = parseInt(process.argv[2] || "20", 10);

// 加载 MATH-500,筛选 level 4-5(竞赛级难题)
const raw = fs.readFileSync("/tmp/math500.jsonl", "utf8");
const all = raw
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as {
    problem: string;
    answer: string;
    subject: string;
    level: number;
  });
const hard = all.filter((d) => (d.level ?? 0) >= 4);
// 固定 seed 抽样,保证可复现
const seedRand = (seed: number) => () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};
const rng = seedRand(42);
const shuffled = [...hard].sort(() => rng() - 0.5);
const testSet = shuffled.slice(0, N);

console.log(`\n${"═".repeat(60)}`);
console.log(`  📐 MATH-500 正确率对比(竞赛级 level 4-5)`);
console.log(`  题库: ${hard.length} 道难题,本次测试 ${N} 道`);
console.log(`${"═".repeat(60)}\n`);

// ── 答案归一化判分 ──
function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    // 统一 LaTeX 分数命令:\dfrac/\tfrac/\dfrac → \frac
    .replace(/\\[dt]frac\b/g, "\\frac")
    // 去掉 \boxed{} \text{} \mathrm{} \textbf{}
    .replace(/\\boxed\{([^{}]*)\}/g, "$1")
    .replace(/\\text\{([^{}]*)\}/g, "$1")
    .replace(/\\mathrm\{([^{}]*)\}/g, "$1")
    .replace(/\\textbf\{([^{}]*)\}/g, "$1")
    // 去掉 \left \right(只留括号)
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    // 去掉 \, \! \; 等间距
    .replace(/\\[,!;]/g, "")
    .replace(/\\ /g, "")
    // 去掉 \displaystyle 等无内容命令
    .replace(/\\displaystyle\b/g, "")
    .replace(/\s+/g, "")
    // 去掉美元符号
    .replace(/\$/g, "")
    // 统一度数
    .replace(/\\circ/g, "°")
    .replace(/\^°/g, "°")
    // 去尾随小数点
    .replace(/\.0+$/, "")
    .replace(/(\d)\.0+(?!\d)/g, "$1");
}

// 尝试把分数/小数统一比较
function numericEquiv(a: string, b: string): boolean {
  // \frac{p}{q} → p/q
  const toNum = (s: string): number | null => {
    const m = s.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) {
      const v = Number(m[1]) / Number(m[2]);
      return isFinite(v) ? v : null;
    }
    const n = Number(s);
    return isFinite(n) ? n : null;
  };
  const na = toNum(a);
  const nb = toNum(b);
  if (na !== null && nb !== null) return Math.abs(na - nb) < 1e-6;
  return false;
}

function isCorrect(predicted: string, gold: string): boolean {
  const p = normalize(predicted);
  const g = normalize(gold);
  if (!p) return false;
  if (p === g) return true;
  if (numericEquiv(p, g)) return true;
  // 严格包含:仅当 gold 较长(表达式)且作为完整 token 出现在 predicted 里
  // 避免 "9" 命中 "19";要求 gold 至少 3 字符且非纯数字
  if (g.length >= 3 && !/^\d+$/.test(g)) {
    if (p.includes(g)) return true;
  }
  return false;
}

// 从模型输出里提取 \boxed{} 或最后一个数字
function extractAnswer(output: string): string {
  const m = output.match(/\\boxed\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/);
  if (m) return m[1];
  // 退而求其次:取 "answer is X" 之后的片段
  const m2 = output.match(/(?:answer is|最终答案|答案是)[:：\s]*([^\n。]+)/i);
  if (m2) return m2[1].trim();
  // 最后一个数字
  const nums = output.match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g);
  if (nums && nums.length) return nums[nums.length - 1];
  return output.trim().slice(-40);
}

const INSTRUCTION =
  "Solve the problem step by step. Put your final answer in \\boxed{}. " +
  "Only the answer inside \\boxed{} will be graded.";

async function callModel(model: string, problem: string): Promise<{ output: string; ms: number }> {
  const t0 = Date.now();
  try {
    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: INSTRUCTION },
        { role: "user", content: problem },
      ],
    });
    return { output: res.choices[0]?.message?.content ?? "", ms: Date.now() - t0 };
  } catch (e) {
    return { output: "", ms: Date.now() - t0 };
  }
}

function fmt(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s.padEnd(n);
}

async function run() {
  const results: {
    i: number;
    subject: string;
    level: number;
    gold: string;
    baseAns: string;
    baseOk: boolean;
    baseMs: number;
    swarmAns: string;
    swarmOk: boolean;
    swarmMs: number;
  }[] = [];

  for (let i = 0; i < testSet.length; i++) {
    const q = testSet[i];
    const prob = q.problem;
    const gold = q.answer;

    process.stdout.write(`[${i + 1}/${N}] [L${q.level} ${q.subject.slice(0, 10)}] 基线…`);
    const base = await callModel("swarm-baseline", prob);
    process.stdout.write(` 蜂群…`);
    const swarm = await callModel("swarm-heavy", prob);

    const baseAns = extractAnswer(base.output);
    const swarmAns = extractAnswer(swarm.output);
    const baseOk = isCorrect(baseAns, gold);
    const swarmOk = isCorrect(swarmAns, gold);

    const mark = (ok: boolean) => (ok ? "✅" : "❌");
    console.log(
      ` ${mark(baseOk)}${baseMs(base.ms)} | ${mark(swarmOk)}${baseMs(swarm.ms)}`,
    );
    console.log(
      `        题目: ${fmt(prob.replace(/\n/g, " "), 56)}` +
        ` | 标答: ${fmt(gold, 16)}`,
    );
    console.log(
      `        基线答: ${fmt(baseAns, 22)} | 蜂群答: ${fmt(swarmAns, 22)}`,
    );

    results.push({
      i,
      subject: q.subject,
      level: q.level,
      gold,
      baseAns,
      baseOk,
      baseMs: base.ms,
      swarmAns,
      swarmOk,
      swarmMs: swarm.ms,
    });
  }

  function baseMs(ms: number) {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  // ── 汇总 ──
  const baseCorrect = results.filter((r) => r.baseOk).length;
  const swarmCorrect = results.filter((r) => r.swarmOk).length;
  const baseRate = ((baseCorrect / N) * 100).toFixed(1);
  const swarmRate = ((swarmCorrect / N) * 100).toFixed(1);
  const avgBaseMs = (results.reduce((s, r) => s + r.baseMs, 0) / N / 1000).toFixed(1);
  const avgSwarmMs = (results.reduce((s, r) => s + r.swarmMs, 0) / N / 1000).toFixed(1);

  // 蜂群"翻盘"统计:基线错但蜂群对
  const flipped = results.filter((r) => !r.baseOk && r.swarmOk).length;
  // 蜂群"翻车":基线对但蜂群错
  const lost = results.filter((r) => r.baseOk && !r.swarmOk).length;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  📊 结果汇总(MATH-500 level 4-5,${N} 题)`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  🤖 swarm-baseline(单次): ${baseCorrect}/${N} = ${baseRate}%  平均 ${avgBaseMs}s`);
  console.log(`  🐝 swarm-heavy(蜂群) : ${swarmCorrect}/${N} = ${swarmRate}%  平均 ${avgSwarmMs}s`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  ✨ 蜂群翻盘(基线错→蜂群对): ${flipped} 题`);
  console.log(`  ⚠️  蜂群翻车(基线对→蜂群错): ${lost} 题`);
  console.log(`  净增益: ${flipped - lost > 0 ? "+" : ""}${flipped - lost} 题`);
  console.log(`${"═".repeat(60)}\n`);
}

run().catch((e) => {
  console.error("\n❌ 测试失败:", e instanceof Error ? e.message : e);
  console.error("   确认 EvoShip 服务在跑:npm run dev");
  process.exit(1);
});
