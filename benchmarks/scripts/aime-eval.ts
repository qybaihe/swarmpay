// aime-eval.ts
// AIME 竞赛题正确率对比:swarm-baseline(单次) vs swarm-heavy(蜂群)
// AIME 答案恒为 0-999 整数,判分零歧义。
// 并发跑题(速度不管,并发加速)。用法:npx tsx benchmarks/scripts/aime-eval.ts [题数 默认90] [并发数 默认5]

import OpenAI from "openai";
import fs from "node:fs";

const BASE = process.env.SWARM_ENDPOINT || "http://localhost:4000/v1";
const client = new OpenAI({ baseURL: BASE, apiKey: "eval" });
const N = parseInt(process.argv[2] || "90", 10);
const CONCURRENCY = parseInt(process.argv[3] || "5", 10);

// 加载 AIME
const raw = fs.readFileSync("/tmp/aime90.jsonl", "utf8");
const all = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as {
  id: number; problem: string; answer: string; url: string;
});
const testSet = all.slice(0, N);

const INSTRUCTION =
  "You are solving an AIME competition math problem. " +
  "The answer is an integer between 0 and 999. " +
  "Reason step by step, then end with: \\boxed{ANSWER} where ANSWER is the integer.";

async function callModel(model: string, problem: string): Promise<{ output: string; ms: number; err?: string }> {
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
    return { output: "", ms: Date.now() - t0, err: e instanceof Error ? e.message : String(e) };
  }
}

// 从输出提取整数答案
function extractInt(output: string): number | null {
  // 优先 \boxed{N}
  const boxed = output.match(/\\boxed\{\s*(\d+)\s*\}/);
  if (boxed) return parseInt(boxed[1], 10);
  // "answer is N" / "答案是N"
  const m = output.match(/(?:answer is|final answer is|the answer is|答案是|答案为)[:\s]*(\d{1,3})/i);
  if (m) return parseInt(m[1], 10);
  // 最后一个 1-3 位数字
  const nums = output.match(/\b(\d{1,3})\b/g);
  if (nums && nums.length) return parseInt(nums[nums.length - 1], 10);
  return null;
}

interface QResult {
  id: number;
  gold: number;
  url: string;
  basePred: number | null;
  baseOk: boolean;
  baseMs: number;
  baseErr?: string;
  swarmPred: number | null;
  swarmOk: boolean;
  swarmMs: number;
  swarmErr?: string;
}

async function evalOne(q: { id: number; problem: string; answer: string; url: string }): Promise<QResult> {
  const gold = parseInt(q.answer, 10);
  // baseline 和 swarm 并发(各自是独立请求)
  const [base, swarm] = await Promise.all([
    callModel("swarm-baseline", q.problem),
    callModel("swarm-heavy", q.problem),
  ]);
  const basePred = extractInt(base.output);
  const swarmPred = extractInt(swarm.output);
  return {
    id: q.id,
    gold,
    url: q.url,
    basePred, baseOk: basePred === gold, baseMs: base.ms, baseErr: base.err,
    swarmPred, swarmOk: swarmPred === gold, swarmMs: swarm.ms, swarmErr: swarm.err,
  };
}

// 并发池
async function runPool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>, onDone?: (r: R, i: number) => void): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await fn(items[cur], cur);
      done++;
      if (onDone) onDone(results[cur], cur);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const t0 = Date.now();
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  📐 AIME 竞赛题正确率对比(答案 0-999 整数,零歧义判分)`);
  console.log(`  题目: ${N} 道 | 并发: ${CONCURRENCY}`);
  console.log(`  对比: 🤖 swarm-baseline(单次) vs 🐝 swarm-heavy(蜂群)`);
  console.log(`${"═".repeat(64)}\n`);

  const results = await runPool(
    testSet,
    CONCURRENCY,
    evalOne,
    (r, i) => {
      const b = r.baseOk ? "✅" : "❌";
      const s = r.swarmOk ? "✅" : "❌";
      const tag = (r.baseOk === r.swarmOk) ? "  "
        : (!r.baseOk && r.swarmOk) ? " ✨翻盘"
        : " ⚠️翻车";
      console.log(
        `[${String(i + 1).padStart(2)}/${N}] 题${String(r.id).padStart(2)} | 标答${String(r.gold).padStart(3)} | ` +
        `基线${b}${String(r.basePred ?? "?").padStart(3)}(${(r.baseMs / 1000).toFixed(0)}s) ` +
        `蜂群${s}${String(r.swarmPred ?? "?").padStart(3)}(${(r.swarmMs / 1000).toFixed(0)}s)${tag}`,
      );
    },
  );

  const baseCorrect = results.filter((r) => r.baseOk).length;
  const swarmCorrect = results.filter((r) => r.swarmOk).length;
  const flipped = results.filter((r) => !r.baseOk && r.swarmOk);
  const lost = results.filter((r) => r.baseOk && !r.swarmOk);
  const baseErrs = results.filter((r) => r.baseErr).length;
  const swarmErrs = results.filter((r) => r.swarmErr).length;
  const totalMin = ((Date.now() - t0) / 60000).toFixed(1);

  console.log(`\n${"═".repeat(64)}`);
  console.log(`  📊 AIME 结果汇总(${N} 道竞赛题,耗时 ${totalMin} 分钟)`);
  console.log(`${"═".repeat(64)}`);
  console.log(`  🤖 swarm-baseline(单次): ${baseCorrect}/${N} = ${((baseCorrect / N) * 100).toFixed(1)}%${baseErrs ? ` (${baseErrs}次错误)` : ""}`);
  console.log(`  🐝 swarm-heavy (蜂群) : ${swarmCorrect}/${N} = ${((swarmCorrect / N) * 100).toFixed(1)}%${swarmErrs ? ` (${swarmErrs}次错误)` : ""}`);
  console.log(`  ${"─".repeat(60)}`);
  console.log(`  ✨ 蜂群翻盘(基线错→蜂群对): ${flipped.length} 题  → 题号 ${flipped.map((r) => r.id).join(",") || "无"}`);
  console.log(`  ⚠️  蜂群翻车(基线对→蜂群错): ${lost.length} 题    → 题号 ${lost.map((r) => r.id).join(",") || "无"}`);
  console.log(`  📈 净增益: ${flipped.length - lost.length >= 0 ? "+" : ""}${flipped.length - lost.length} 题 (${(((swarmCorrect - baseCorrect) / N) * 100).toFixed(1)}%)`);
  console.log(`${"═".repeat(64)}\n`);

  // 保存明细
  fs.writeFileSync("/tmp/aime_results.json", JSON.stringify(results, null, 2));
  console.log("  明细已存 /tmp/aime_results.json\n");
}

main().catch((e) => {
  console.error("\n❌ 失败:", e instanceof Error ? e.message : e);
  console.error("   确认 EvoShip 在跑:npm run dev");
  process.exit(1);
});
