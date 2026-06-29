import OpenAI from "openai";
import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "./config.js";

// ── 统一的"单次模型调用"接口 ──
// 真实模式:OpenAI 兼容 SDK;mock 模式:生成可区分的确定性回答(便于看蜂群效果)

export interface BeeRole {
  id: string;
  variant: string; // 蜂的策略标签
  system: string; // 注入的 system prompt
  temperature: number;
}

export interface BeeResult {
  id: string;
  variant: string;
  content: string;
  latencyMs: number;
  status: "ran" | "timed_out";
}

export interface ModelProvider {
  baseUrl: string;
  apiKey: string;
  model: string;
  label?: string;
}

const providerContext = new AsyncLocalStorage<ModelProvider>();
const mockContext = new AsyncLocalStorage<boolean>();

const realClient = config.useMock
  ? null
  : new OpenAI({
      baseURL: config.openaiBaseUrl,
      apiKey: config.openaiApiKey || "mock",
    });

export function isMock(): boolean {
  return mockContext.getStore() === true || (!providerContext.getStore() && config.useMock);
}

export function activeModelName(fallback: string): string {
  return providerContext.getStore()?.model || fallback;
}

export function activeProviderLabel(): string {
  const provider = providerContext.getStore();
  return provider?.label || provider?.baseUrl || (config.useMock ? "mock" : config.openaiBaseUrl);
}

export async function withModelProvider<T>(provider: ModelProvider | undefined, fn: () => Promise<T>): Promise<T> {
  if (!provider) return fn();
  return providerContext.run(provider, fn);
}

export async function withMockModel<T>(fn: () => Promise<T>): Promise<T> {
  return mockContext.run(true, fn);
}

/** 真实模型调用 */
async function callReal(
  model: string,
  system: string,
  userContent: string,
  temperature: number,
  timeoutMs: number,
): Promise<string> {
  const provider = providerContext.getStore();
  const client = provider
    ? new OpenAI({ baseURL: provider.baseUrl, apiKey: provider.apiKey || "mock" })
    : realClient;
  if (!client) throw new Error("real model client is not configured");
  const t0 = Date.now();
  const res = await (client.chat.completions.create(
    {
      model: provider?.model || model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      temperature,
    },
    { signal: AbortSignal.timeout(timeoutMs) },
  ) as Promise<OpenAI.Chat.Completions.ChatCompletion>);
  void t0;
  return res.choices[0]?.message?.content ?? "";
}

/** Mock 模型调用:根据 variant 生成风格不同的回答(让蜂群差异肉眼可见) */
function callMock(
  model: string,
  system: string,
  userContent: string,
  variant: string,
): string {
  // 模拟延迟,让"突破"现象更真实(蜂之间有快慢)
  return `[mock:${model} | variant=${variant}]\n\n针对你的需求,我(${variant}蜂)的方案:\n\n${summarize(userContent)}\n\n${
    system.includes("EvoMap") ? "🧬 (已继承 EvoMap 经验)" : ""
  }`;
}

function summarize(s: string): string {
  const clean = s.trim().replace(/\s+/g, " ");
  return clean.length > 200 ? clean.slice(0, 200) + "…" : clean;
}

/** 统一入口:单只蜂执行 */
export async function runBee(
  role: BeeRole,
  model: string,
  userContent: string,
  timeoutMs: number,
): Promise<BeeResult> {
  const t0 = Date.now();
  try {
    const content = isMock()
      ? callMock(model, role.system, userContent, role.variant)
      : await callReal(model, role.system, userContent, role.temperature, timeoutMs);
    // mock 加一点伪延迟以体现蜂间差异(真实模式不加)
    if (isMock()) await fakeLatency(role.variant);
    return {
      id: role.id,
      variant: role.variant,
      content,
      latencyMs: Date.now() - t0,
      status: "ran",
    };
  } catch (e) {
    console.warn(`[model] bee ${role.variant} failed: ${e instanceof Error ? e.message : String(e)}`);
    return {
      id: role.id,
      variant: role.variant,
      content: "",
      latencyMs: Date.now() - t0,
      status: "timed_out",
    };
  }
}

/** 聚合器:用更强模型/同模型把多蜂结果合成一个最优答案 */
export async function aggregate(
  model: string,
  results: BeeResult[],
  userContent: string,
  timeoutMs: number,
): Promise<string> {
  const pieces = results
    .filter((r) => r.status === "ran" && r.content)
    .map((r, i) => `--- 方案 ${i + 1}(${r.variant}蜂) ---\n${r.content}`)
    .join("\n\n");

  const system = [
    "你是蜂群聚合器(Queen)。下面是 N 只蜜蜂针对同一目标各自产出的方案。",
    "请综合它们的最佳部分,产出一个**优于任何单个方案**的最终答案。",
    "不要罗列,直接给出合并后的高质量结果。",
  ].join("\n");

  if (isMock()) {
    await fakeLatency("aggregator");
    const n = results.filter((r) => r.status === "ran").length;
    return `[mock:聚合器 | 融合 ${n} 只蜂的最优部分]\n\n这是蜂群综合产出(优于任意单蜂):\n针对「${summarize(
      userContent,
    )}」,我融合了 ${n} 只蜜蜂各自的突破点,得到最终方案。\n\n✅ 质量 > 单次调用(mock 模式仅作骨架演示,接入真实模型后效果显著)。`;
  }

  if (!pieces.trim()) {
    return callReal(
      model,
      system,
      `本轮蜂群没有可用产出。请基于用户原始需求直接给出一个保守、可执行的答案。\n\n用户原始需求:${userContent}`,
      0.3,
      timeoutMs,
    );
  }

  return callReal(model, system, pieces + `\n\n用户原始需求:${userContent}`, 0.3, timeoutMs);
}

/** 通用 agent 调用:按 archetype 的 temperature + system prompt 调模型 */
export async function callAgent(
  model: string,
  system: string,
  userContent: string,
  temperature: number,
  variant: string,
  timeoutMs: number,
): Promise<{ content: string; latencyMs: number; status: "ran" | "timed_out" }> {
  const t0 = Date.now();
  try {
    if (isMock()) {
      await fakeLatency(variant);
      const tag = variant === "orchestrator" ? "分解" : variant === "reviewer" ? "裁决" : variant;
      return {
        content: `[mock:${model} | ${tag}]\n\n针对「${summarize(userContent)}」,我(${variant}蜂)的产出:\n\n${mockProduce(variant, userContent)}`,
        latencyMs: Date.now() - t0,
        status: "ran",
      };
    }
    const content = await callReal(model, system, userContent, temperature, timeoutMs);
    return { content, latencyMs: Date.now() - t0, status: "ran" };
  } catch (e) {
    console.warn(`[model] agent ${variant} failed: ${e instanceof Error ? e.message : String(e)}`);
    return { content: "", latencyMs: Date.now() - t0, status: "timed_out" };
  }
}

// mock 模式下各角色的模拟产出(让流水线差异可见)
function mockProduce(variant: string, goal: string): string {
  const g = summarize(goal);
  switch (variant) {
    case "orchestrator":
      return `[{"title":"分析需求","body":"理解:${g}","signals":"分析","weight":0.3},{"title":"实现方案","body":"产出:${g}","signals":"实现","weight":0.4},{"title":"验证检查","body":"校验:${g}","signals":"验证","weight":0.15}]`;
    case "planner":
      return `## 执行计划\n1. 拆解「${g}」的核心要求\n2. 确定实现路径\n- 关键约束: 准确性\n- 潜在风险: 边界情况`;
    case "coder":
      return `基于计划,实现如下:\n\`\`\`\n// 针对「${g}」的具体方案\nfunction solve() { /* ... */ }\n\`\`\``;
    case "reviewer":
      return `## 审查结论\nverdict: APPROVE\n- 优点: 方案完整\n- 问题: 无`;
    case "explorer":
      return `非常规思路:换个角度看「${g}」,或许可以用 XX 方法突破常规。`;
    default:
      return g;
  }
}

/** 基线:直通单次调用(对比用) */
export async function baseline(
  model: string,
  system: string,
  userContent: string,
  timeoutMs: number,
): Promise<string> {
  if (isMock()) {
    await fakeLatency("baseline");
    return `[mock:${model} | 单次调用基线]\n\n${summarize(userContent)}\n\n⚠️ 这是单 agent 单次调用的结果(用于和蜂群对比)。`;
  }
  return callReal(model, system, userContent, 0.7, timeoutMs);
}

// 让 mock 有真实感的伪延迟
const delays: Record<string, number> = {
  planner: 400,
  coder: 900,
  reviewer: 700,
  explorer: 1200,
  aggregator: 600,
  baseline: 200,
};
async function fakeLatency(variant: string) {
  const base = delays[variant] ?? 600;
  const jitter = Math.random() * 400;
  await new Promise((r) => setTimeout(r, base + jitter));
}
