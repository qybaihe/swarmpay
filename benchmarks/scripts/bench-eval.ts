// Generic EvoShip benchmark runner.
// Compares swarm-baseline vs swarm-heavy/evo on normalized JSONL evalsets.
//
// Examples:
//   npx tsx benchmarks/scripts/bench-eval.ts aime --n 10 --concurrency 1
//   npx tsx benchmarks/scripts/bench-eval.ts gpqa_diamond --n 20 --shuffle
//   npx tsx benchmarks/scripts/bench-eval.ts mbpp --n 10 --unsafe-code

import OpenAI from "openai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type BenchType =
  | "mcq"
  | "math_int"
  | "math_number"
  | "math_expr"
  | "boolean"
  | "short_exact"
  | "qa_exact"
  | "code_python";

interface BenchChoice {
  label: string;
  text: string;
}

interface BenchItem {
  id: string;
  suite: string;
  subset: string;
  type: BenchType;
  question: string;
  choices?: BenchChoice[] | null;
  answer: string;
  aliases?: string[];
  tests?: string[];
  test?: string | null;
  entry_point?: string | null;
  metadata?: Record<string, unknown>;
}

interface ModelResult {
  output: string;
  prediction: string;
  ok: boolean;
  ms: number;
  error?: string;
  note?: string;
}

interface PairResult {
  index: number;
  item: BenchItem;
  baseline: ModelResult;
  swarm: ModelResult;
}

interface BenchSummary {
  suite: string;
  n: number;
  baselineModel: string;
  swarmModel: string;
  baselineCorrect: number;
  swarmCorrect: number;
  baselineRate: string;
  swarmRate: string;
  netGain: number;
  flips: number;
  regressions: number;
  bothWrong: number;
  baselineAvgMs: number;
  swarmAvgMs: number;
}

interface Options {
  suite: string;
  n: number;
  concurrency: number;
  baselineModel: string;
  swarmModel: string;
  endpoint: string;
  apiKey: string;
  seed: number;
  shuffle: boolean;
  subset?: string;
  outDir: string;
  unsafeCode: boolean;
  timeoutMs: number;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    suite: argv[0] || "",
    n: 20,
    concurrency: 1,
    baselineModel: "swarm-baseline",
    swarmModel: "swarm-heavy",
    endpoint: process.env.SWARM_ENDPOINT || "http://localhost:4000/v1",
    apiKey: process.env.SWARM_API_KEY || "eval",
    seed: 42,
    shuffle: false,
    subset: undefined,
    outDir: "benchmarks/results",
    unsafeCode: false,
    timeoutMs: Number(process.env.BENCH_TIMEOUT_MS || 180000),
  };

  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--n") opts.n = Number(next());
    else if (a === "--concurrency") opts.concurrency = Number(next());
    else if (a === "--baseline") opts.baselineModel = next();
    else if (a === "--swarm") opts.swarmModel = next();
    else if (a === "--endpoint") opts.endpoint = next();
    else if (a === "--api-key") opts.apiKey = next();
    else if (a === "--seed") opts.seed = Number(next());
    else if (a === "--shuffle") opts.shuffle = true;
    else if (a === "--subset") opts.subset = next();
    else if (a === "--out-dir") opts.outDir = next();
    else if (a === "--unsafe-code") opts.unsafeCode = true;
    else if (a === "--timeout-ms") opts.timeoutMs = Number(next());
    else if (a === "--help" || a === "-h") usage(0);
    else throw new Error(`Unknown argument: ${a}`);
  }

  if (!opts.suite) usage(1);
  if (!Number.isFinite(opts.n) || opts.n <= 0) throw new Error("--n must be positive");
  if (!Number.isFinite(opts.concurrency) || opts.concurrency <= 0) throw new Error("--concurrency must be positive");
  return opts;
}

function usage(code: number): never {
  console.log(`Usage: npx tsx benchmarks/scripts/bench-eval.ts <suite|path.jsonl> [options]

Options:
  --n <number>              Number of examples to run (default 20)
  --concurrency <number>    Outer concurrency; each item sends 2 requests (default 1)
  --baseline <model>        Baseline model name (default swarm-baseline)
  --swarm <model>           Swarm model name (default swarm-heavy)
  --endpoint <url>          OpenAI-compatible endpoint (default SWARM_ENDPOINT or localhost)
  --api-key <key>           API key (default SWARM_API_KEY or eval)
  --subset <name[,name]>    Keep only subsets/tasks
  --shuffle                 Deterministic shuffle before slicing
  --seed <number>           Shuffle seed (default 42)
  --unsafe-code             Execute generated Python code for HumanEval/MBPP
  --timeout-ms <number>     Request timeout (default 180000)

Suites are read from benchmarks/evalsets/<suite>.jsonl.
`);
  process.exit(code);
}

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function shuffle<T>(items: T[], seed: number): T[] {
  const rng = seededRandom(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function loadItems(opts: Options): BenchItem[] {
  const candidate = opts.suite.endsWith(".jsonl")
    ? path.resolve(opts.suite)
    : path.resolve("benchmarks", "evalsets", `${opts.suite}.jsonl`);
  const raw = fs.readFileSync(candidate, "utf8");
  let items = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as BenchItem);

  if (opts.subset) {
    const allowed = new Set(opts.subset.split(",").map((s) => s.trim()).filter(Boolean));
    items = items.filter((item) => allowed.has(item.subset));
  }
  if (opts.shuffle) items = shuffle(items, opts.seed);
  return items.slice(0, opts.n);
}

function systemInstruction(type: BenchType): string {
  if (type === "mcq") return "Choose exactly one option. Reason briefly, then end with \\boxed{LETTER}.";
  if (type === "boolean") return "Answer the yes/no question. Reason briefly, then end with \\boxed{yes} or \\boxed{no}.";
  if (type === "math_int") return "Solve step by step. The answer is an integer. End with \\boxed{ANSWER}.";
  if (type === "math_number") return "Solve step by step. End with the final numeric answer in \\boxed{}.";
  if (type === "math_expr") return "Solve step by step. Put only the final mathematical answer in \\boxed{}.";
  if (type === "code_python") return "Write a correct Python solution. Return only code, no Markdown or explanation.";
  return "Answer carefully. End with the final answer in \\boxed{}.";
}

function userPrompt(item: BenchItem): string {
  if (item.type === "code_python") {
    return `${item.question}\n\nReturn a complete Python implementation.`;
  }
  return item.question;
}

async function callModel(client: OpenAI, model: string, item: BenchItem, opts: Options): Promise<{ output: string; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemInstruction(item.type) },
        { role: "user", content: userPrompt(item) },
      ],
    }, { timeout: opts.timeoutMs });
    return { output: res.choices[0]?.message?.content || "", ms: Date.now() - t0 };
  } catch (e) {
    return { output: "", ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

function firstBoxed(output: string): string | null {
  const m = output.match(/\\boxed\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/);
  return m ? m[1].trim() : null;
}

function extractPrediction(output: string, item: BenchItem): string {
  const type = item.type;
  const boxed = firstBoxed(output);
  if (type === "code_python") return extractCode(output);
  if (type === "mcq") {
    const source = boxed || output;
    const explicit = [...source.matchAll(/(?:answer|final|答案|最终|结论)[^\n]{0,60}\b([A-J])\b/gi)].at(-1);
    if (explicit) return explicit[1].toUpperCase();
    const m = source.match(/\b([A-J])\b/i);
    return m ? m[1].toUpperCase() : source.trim().slice(0, 20);
  }
  if (type === "boolean") {
    const source = (boxed || output).toLowerCase();
    if (/\byes\b|true/.test(source)) return "yes";
    if (/\bno\b|false/.test(source)) return "no";
    const chinese = output.replace(/\s+/g, "");
    const asksImpossible = /\b(impossible|unable|cannot|can't|can not|not possible)\b/i.test(item.question);
    if (/^(不|否)[，,。.!！：:]|并非|并不|不是|不属于|不适合|不能算|不完全是/.test(chinese)) return "no";
    if (/不可能|无法|不能|不可行|做不到/.test(chinese)) return asksImpossible ? "yes" : "no";
    if (/最终的判断是[：:](是|可以|可能)|结论是[：:]?(是|可以|可能)|完全可以|可以/.test(chinese)) return "yes";
    return source.trim().slice(0, 20);
  }
  if (type === "math_int") {
    const source = boxed || output;
    const nums = source.match(/-?\d{1,6}/g);
    return nums?.at(-1) || source.trim().slice(0, 40);
  }
  if (type === "math_number") {
    const source = boxed || output;
    const nums = source.match(/-?\d+(?:,\d{3})*(?:\.\d+)?(?:\/\d+)?/g);
    return (nums?.at(-1) || source.trim().slice(0, 40)).replace(/,/g, "");
  }
  if (type === "short_exact" && /^-?\d+(?:\.\d+)?$/.test(String(item.answer).trim())) {
    const source = boxed || output;
    const nums = source.match(/-?\d+(?:\.\d+)?/g);
    return nums?.at(-1) || source.trim().slice(0, 40);
  }
  return (boxed || output).trim().split(/\n/).at(-1)?.trim() || "";
}

function extractCode(output: string): string {
  const fenced = output.match(/```(?:python)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : output).trim();
}

function normalizeMath(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\\[dt]frac\b/g, "\\frac")
    .replace(/\\boxed\{([^{}]*)\}/g, "$1")
    .replace(/\\text\{([^{}]*)\}/g, "$1")
    .replace(/\\mathrm\{([^{}]*)\}/g, "$1")
    .replace(/\\left|\\right/g, "")
    .replace(/\\[,!;]/g, "")
    .replace(/\\ /g, "")
    .replace(/\\displaystyle\b/g, "")
    .replace(/\$/g, "")
    .replace(/\s+/g, "")
    .replace(/\.0+$/g, "");
}

function normalizeLoose(s: string): string {
  return s
    .toLowerCase()
    .replace(/\\boxed\{([^{}]*)\}/g, "$1")
    .replace(/[^a-z0-9.\-\/ ]+/g, " ")
    .replace(/\b(a|an|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numericValue(s: string): number | null {
  const clean = s.replace(/,/g, "").trim();
  const frac = clean.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (frac) {
    const denom = Number(frac[2]);
    if (denom === 0) return null;
    return Number(frac[1]) / denom;
  }
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function gradeText(item: BenchItem, prediction: string): boolean {
  const golds = [item.answer, ...(item.aliases || [])].filter((x) => x !== undefined && x !== null).map(String);
  if (item.type === "mcq") return prediction.trim().toUpperCase() === item.answer.trim().toUpperCase();
  if (item.type === "boolean") return prediction.trim().toLowerCase() === item.answer.trim().toLowerCase();
  if (item.type === "math_int") return Number.parseInt(prediction, 10) === Number.parseInt(item.answer, 10);
  if (item.type === "math_number") {
    const pred = numericValue(prediction);
    return golds.some((gold) => {
      const g = numericValue(gold);
      return pred !== null && g !== null && Math.abs(pred - g) < 1e-6;
    });
  }
  if (item.type === "math_expr") {
    const pred = normalizeMath(prediction);
    return golds.some((gold) => pred === normalizeMath(gold));
  }
  const pred = normalizeLoose(prediction);
  return golds.some((gold) => pred === normalizeLoose(gold));
}

async function gradeCode(item: BenchItem, prediction: string, opts: Options): Promise<{ ok: boolean; note?: string }> {
  if (!opts.unsafeCode) {
    throw new Error(`${item.suite} is a code benchmark; rerun with --unsafe-code to execute generated Python tests.`);
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evoship-codebench-"));
  const file = path.join(dir, "candidate_test.py");
  let content = prediction + "\n\n";
  if (item.test && item.entry_point) {
    content += `${item.test}\n\ncheck(${item.entry_point})\n`;
  } else if (item.tests?.length) {
    content += `${item.tests.join("\n")}\n`;
  } else {
    return { ok: false, note: "no tests" };
  }
  fs.writeFileSync(file, content, "utf8");

  try {
    await execFileAsync("python3", [file], { timeout: 10000, maxBuffer: 1024 * 1024 });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, note: msg.slice(0, 300) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function grade(item: BenchItem, output: string, opts: Options): Promise<{ prediction: string; ok: boolean; note?: string }> {
  const prediction = extractPrediction(output, item);
  if (item.type === "code_python") {
    const code = await gradeCode(item, prediction, opts);
    return { prediction: prediction.slice(0, 8000), ok: code.ok, note: code.note };
  }
  return { prediction, ok: gradeText(item, prediction) };
}

async function evalModel(client: OpenAI, model: string, item: BenchItem, opts: Options): Promise<ModelResult> {
  const called = await callModel(client, model, item, opts);
  if (called.error) {
    return { output: called.output, prediction: "", ok: false, ms: called.ms, error: called.error };
  }
  try {
    const graded = await grade(item, called.output, opts);
    return { output: called.output, prediction: graded.prediction, ok: graded.ok, ms: called.ms, note: graded.note };
  } catch (e) {
    return { output: called.output, prediction: "", ok: false, ms: called.ms, error: e instanceof Error ? e.message : String(e) };
  }
}

async function runPool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>, onDone: (result: R, i: number) => void): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current], current);
      onDone(results[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

function pct(n: number, d: number): string {
  return d ? `${((n / d) * 100).toFixed(1)}%` : "0.0%";
}

function avgMs(results: PairResult[], key: "baseline" | "swarm"): number {
  if (!results.length) return 0;
  return Math.round(results.reduce((sum, r) => sum + r[key].ms, 0) / results.length);
}

function outputPaths(opts: Options, startedAt: string): { suiteDir: string; stamp: string; jsonPath: string; mdPath: string; partialPath: string } {
  const suiteDir = path.join(opts.outDir, opts.suite.replace(/[^\w.-]+/g, "_"));
  const stamp = startedAt.replace(/[:.]/g, "-");
  return {
    suiteDir,
    stamp,
    jsonPath: path.join(suiteDir, `${stamp}.json`),
    mdPath: path.join(suiteDir, `${stamp}.summary.md`),
    partialPath: path.join(suiteDir, `${stamp}.partial.json`),
  };
}

function summarize(opts: Options, results: PairResult[]): BenchSummary {
  const baseOk = results.filter((r) => r.baseline.ok).length;
  const swarmOk = results.filter((r) => r.swarm.ok).length;
  const flips = results.filter((r) => !r.baseline.ok && r.swarm.ok);
  const regressions = results.filter((r) => r.baseline.ok && !r.swarm.ok);
  const bothWrong = results.filter((r) => !r.baseline.ok && !r.swarm.ok).length;
  return {
    suite: opts.suite,
    n: results.length,
    baselineModel: opts.baselineModel,
    swarmModel: opts.swarmModel,
    baselineCorrect: baseOk,
    swarmCorrect: swarmOk,
    baselineRate: pct(baseOk, results.length),
    swarmRate: pct(swarmOk, results.length),
    netGain: swarmOk - baseOk,
    flips: flips.length,
    regressions: regressions.length,
    bothWrong,
    baselineAvgMs: avgMs(results, "baseline"),
    swarmAvgMs: avgMs(results, "swarm"),
  };
}

function writePartial(opts: Options, results: PairResult[], startedAt: string): string {
  const paths = outputPaths(opts, startedAt);
  fs.mkdirSync(paths.suiteDir, { recursive: true });
  const sorted = [...results].sort((a, b) => a.index - b.index);
  fs.writeFileSync(
    paths.partialPath,
    JSON.stringify({ partial: true, startedAt, updatedAt: new Date().toISOString(), summary: summarize(opts, sorted), results: sorted }, null, 2),
    "utf8",
  );
  return paths.partialPath;
}

function writeOutputs(opts: Options, results: PairResult[], startedAt: string): { jsonPath: string; mdPath: string } {
  const paths = outputPaths(opts, startedAt);
  fs.mkdirSync(paths.suiteDir, { recursive: true });
  const summary = summarize(opts, results);
  const flips = results.filter((r) => !r.baseline.ok && r.swarm.ok);
  const regressions = results.filter((r) => r.baseline.ok && !r.swarm.ok);

  fs.writeFileSync(paths.jsonPath, JSON.stringify({ summary, results }, null, 2), "utf8");
  const lines = [
    `# ${opts.suite} benchmark summary`,
    "",
    `- Started: ${startedAt}`,
    `- N: ${results.length}`,
    `- Baseline: ${opts.baselineModel} = ${summary.baselineCorrect}/${results.length} (${summary.baselineRate})`,
    `- Swarm: ${opts.swarmModel} = ${summary.swarmCorrect}/${results.length} (${summary.swarmRate})`,
    `- Net gain: ${summary.netGain >= 0 ? "+" : ""}${summary.netGain}`,
    `- Flips: ${flips.length}`,
    `- Regressions: ${regressions.length}`,
    `- Avg latency: baseline ${(summary.baselineAvgMs / 1000).toFixed(1)}s, swarm ${(summary.swarmAvgMs / 1000).toFixed(1)}s`,
    "",
    "## Flip cases",
    ...flips.map((r) => `- ${r.item.id}: gold=${r.item.answer}, baseline=${r.baseline.prediction || r.baseline.error}, swarm=${r.swarm.prediction}`),
    "",
    "## Regression cases",
    ...regressions.map((r) => `- ${r.item.id}: gold=${r.item.answer}, baseline=${r.baseline.prediction}, swarm=${r.swarm.prediction || r.swarm.error}`),
    "",
  ];
  fs.writeFileSync(paths.mdPath, lines.join("\n"), "utf8");
  if (fs.existsSync(paths.partialPath)) fs.rmSync(paths.partialPath, { force: true });
  return { jsonPath: paths.jsonPath, mdPath: paths.mdPath };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const items = loadItems(opts);
  const startedAt = new Date().toISOString();
  if (!items.length) throw new Error(`No items loaded for ${opts.suite}`);
  if (items.some((item) => item.type === "code_python") && !opts.unsafeCode) {
    throw new Error("This selection contains code_python items. Add --unsafe-code to execute local Python tests.");
  }

  const client = new OpenAI({ baseURL: opts.endpoint, apiKey: opts.apiKey });
  console.log("\n" + "═".repeat(72));
  console.log(`Benchmark: ${opts.suite} | N=${items.length} | concurrency=${opts.concurrency}`);
  console.log(`Endpoint: ${opts.endpoint}`);
  console.log(`Compare: ${opts.baselineModel} vs ${opts.swarmModel}`);
  console.log("═".repeat(72) + "\n");

  const completed: PairResult[] = [];
  const results = await runPool(
    items,
    opts.concurrency,
    async (item, index): Promise<PairResult> => {
      const [baseline, swarm] = await Promise.all([
        evalModel(client, opts.baselineModel, item, opts),
        evalModel(client, opts.swarmModel, item, opts),
      ]);
      return { index, item, baseline, swarm };
    },
    (r, i) => {
      completed.push(r);
      const partialPath = writePartial(opts, completed, startedAt);
      const b = r.baseline.ok ? "OK" : "NO";
      const s = r.swarm.ok ? "OK" : "NO";
      const tag = r.baseline.ok === r.swarm.ok ? "" : (!r.baseline.ok && r.swarm.ok ? " FLIP" : " REGRESS");
      console.log(
        `[${String(i + 1).padStart(3)}/${items.length}] ${r.item.id} gold=${r.item.answer} ` +
        `base=${b}:${r.baseline.prediction || r.baseline.error || "?"}(${(r.baseline.ms / 1000).toFixed(0)}s) ` +
        `swarm=${s}:${r.swarm.prediction || r.swarm.error || "?"}(${(r.swarm.ms / 1000).toFixed(0)}s)${tag} partial=${partialPath}`,
      );
    },
  );

  const baseOk = results.filter((r) => r.baseline.ok).length;
  const swarmOk = results.filter((r) => r.swarm.ok).length;
  const flips = results.filter((r) => !r.baseline.ok && r.swarm.ok).length;
  const regressions = results.filter((r) => r.baseline.ok && !r.swarm.ok).length;
  const out = writeOutputs(opts, results, startedAt);

  console.log("\n" + "═".repeat(72));
  console.log(`Baseline: ${baseOk}/${results.length} = ${pct(baseOk, results.length)} avg ${(avgMs(results, "baseline") / 1000).toFixed(1)}s`);
  console.log(`Swarm   : ${swarmOk}/${results.length} = ${pct(swarmOk, results.length)} avg ${(avgMs(results, "swarm") / 1000).toFixed(1)}s`);
  console.log(`Flips=${flips} Regressions=${regressions} Net=${swarmOk - baseOk >= 0 ? "+" : ""}${swarmOk - baseOk}`);
  console.log(`Saved: ${out.jsonPath}`);
  console.log(`Summary: ${out.mdPath}`);
  console.log("═".repeat(72) + "\n");
}

main().catch((e) => {
  console.error("\nBenchmark failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
