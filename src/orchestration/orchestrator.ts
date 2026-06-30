// orchestration/orchestrator.ts
// Orchestrator(蜂后):目标分类 → propose-decomposition → 汇总合成。
// 由 L3 节点担任,真实调用平台 propose-decomposition 端点。

import { config } from "../config.js";
import { AgentRegistry } from "../agents/registry.js";
import { callAgent, aggregate, type BeeResult } from "../model.js";
import { proposeDecomposition, declareIntent, beginSession, submitResult } from "../protocol/adapter.js";
import { runSubtaskPipeline } from "./pipeline.js";
import { handoff } from "./handoff.js";
import { broadcastBreakthrough, isBreakthrough } from "./breakthrough.js";
import { recordRun, onchainBalance } from "../agents/identity.js";
import { decideRewardSplit } from "../injective/reward-decider.js";
import { evomap, renderInheritance, type InheritedRecipe } from "../evomap.js";
import { activeEvolutionMemory } from "../evolution-memory.js";
import { emit } from "../log.js";
import type {
  AgentRunResult,
  CollaborationTrace,
  HandoffContext,
  Subtask,
  CustomSwarmTopology,
} from "../agents/types.js";
import { validateRewardSplit } from "../agents/registry.js";

export interface OrchestratorOutput {
  finalContent: string;
  trace: CollaborationTrace;
  difficulty: "SIMPLE" | "MEDIUM" | "HARD";
  classification: DifficultyDecision;
  inheritanceText: string;  // 实际注入蜂群的经验(仅 HARD 时非空)
  inheritedRecipes: InheritedRecipe[];
  policy: ExecutionPolicy;
  customTopology?: CustomSwarmTopology;
}

/** Orchestrator 前置判断:目标难度三档分流
 *  SIMPLE  → 闲聊/打招呼/极简问答,直接单次回复(不进蜂群)
 *  MEDIUM  → 数学题/事实问答/单一代码片段,N 蜂独立解题 + 聚合
 *  HARD    → 写完整应用/多步调研/多技能组合,拆解 + 分工流水线 */
type Difficulty = "SIMPLE" | "MEDIUM" | "HARD";

export interface DifficultyDecision {
  level: Difficulty;
  reason: string;
  source: "rule" | "llm" | "fallback";
}

export interface ExecutionPolicy {
  tier: string;
  difficulty: Difficulty;
  createSession: boolean;
  useInheritance: boolean;
  publishBackflow: boolean;
  mediumSolverCount: number;
  hardMaxSubtasks: number;
  hardConcurrency: number;
  maxRevisionRounds: number;
}

function classifyByRule(goal: string): DifficultyDecision | null {
  const text = goal.trim();
  const compact = text.replace(/\s+/g, " ");
  const lower = compact.toLowerCase();

  if (
    compact.length <= 24 &&
    /^(你好|您好|hi|hello|hey|在吗|谢谢|感谢|早上好|下午好|晚上好|你是谁|介绍一下)$/.test(lower)
  ) {
    return { level: "SIMPLE", reason: "问候或极简闲聊", source: "rule" };
  }

  const hardSignals = [
    /(^|[\s，。,.])(?:build|create|develop|implement|design|ship|deploy)\b/i,
    /(做|写|开发|搭建|实现|生成|设计).{0,40}(应用|app|网站|网页|系统|平台|dashboard|仪表盘|前端|后端|全栈|插件|小程序|页面|工具|登录页|表单)/i,
    /(登录页|注册页|表单|页面).{0,30}(校验|验证|交互|应用|组件|前端)/i,
    /(完整|多页面|多组件|端到端|全流程|产品化|部署|上线|重构|接入|集成|自动化|工作流|爬取|调研|竞品|市场分析)/i,
    /(根据.*文件|读取.*仓库|修改.*项目|把.*接入|实现.*功能)/i,
  ];
  if (hardSignals.some((re) => re.test(compact))) {
    return { level: "HARD", reason: "多步骤或工程类目标", source: "rule" };
  }

  const mediumSignals = [
    /(?:aime|amc|olympiad|math|数学|几何|代数|概率|方程|证明|计算|求解|答案|整数|质数)/i,
    /(?:translate|翻译|改写|润色|解释|总结|比较|列出|回答|为什么|是什么|怎么算)/i,
    /\d+\s*(?:[+\-*/×÷^=]|mod|%)/i,
  ];
  if (mediumSignals.some((re) => re.test(compact))) {
    return { level: "MEDIUM", reason: "单一明确问题", source: "rule" };
  }

  if (compact.length <= 40 && !/[。！？.!?]\s*\S/.test(compact)) {
    return { level: "MEDIUM", reason: "短目标,无需拆解", source: "rule" };
  }

  return null;
}

function buildExecutionPolicy(tier: string, difficulty: Difficulty): ExecutionPolicy {
  const isLite = tier === "swarm-lite";
  const isEvo = tier === "swarm-evo";
  return {
    tier,
    difficulty,
    createSession: difficulty !== "SIMPLE" && !isLite,
    useInheritance: difficulty === "HARD" && isEvo,
    publishBackflow: difficulty === "HARD" && isEvo,
    mediumSolverCount: Math.max(1, Math.min(config.swarmSize, isLite ? 2 : 3)),
    hardMaxSubtasks: isLite ? 2 : 6,
    hardConcurrency: isLite ? 1 : 3,
    maxRevisionRounds: Math.max(0, Math.min(config.maxRevisionRounds, isLite ? 1 : config.maxRevisionRounds)),
  };
}

async function classifyDifficulty(goal: string): Promise<DifficultyDecision> {
  const ruled = classifyByRule(goal);
  if (ruled) {
    emit("diverge", `🔎 分类:${ruled.level}(${ruled.reason},rule)`);
    return ruled;
  }

  const t0 = Date.now();
  // 轻量分类调用:低温度、只回一个词
  const res = await callAgent(
    config.aggregatorModel,
    "你是任务难度分类器。把用户目标分到三档之一:\n" +
      "SIMPLE:打招呼、闲聊、客套、极简常识问答(如'你好''谢谢''今天天气好吗')。\n" +
      "MEDIUM:数学计算、事实问答、单一代码片段、翻译、改写、单一明确问题(有确定答案或明确产出)。\n" +
      "HARD:写完整应用、多步骤调研、需要多种专业技能组合的复杂任务(多文件/多阶段/开放式)。\n" +
      "只输出 SIMPLE、MEDIUM 或 HARD,不要解释。",
    `目标:${goal}`,
    0.0,
    "orchestrator",
    Math.min(config.beeTimeoutMs, 10000),
  );

  if (res.status !== "ran" || !res.content.trim()) {
    emit("diverge", `🔎 分类:MEDIUM(分类超时/空响应,兜底,${Date.now() - t0}ms)`);
    return { level: "MEDIUM", reason: "分类兜底", source: "fallback" };
  }

  const out = res.content.trim().toUpperCase();
  let level: Difficulty = "MEDIUM"; // 默认中等(安全,进蜂群但不拆解)
  if (out.includes("SIMPLE")) level = "SIMPLE";
  else if (out.includes("HARD")) level = "HARD";
  else if (out.includes("MEDIUM")) level = "MEDIUM";
  const reason = { SIMPLE: "极简问题,直接回复", MEDIUM: "单一目标,蜂群解题", HARD: "复杂任务,拆解分工" }[level];
  emit("diverge", `🔎 分类:${level}(${reason},llm,${Date.now() - t0}ms)`);
  return { level, reason, source: "llm" };
}

/** Orchestrator 用 LLM 把目标拆成子任务(调平台 propose-decomposition) */
async function decomposeGoal(
  goal: string,
  inheritanceText: string,
  trace: CollaborationTrace["stages"],
  maxSubtasks: number,
  platformSideEffects: boolean,
): Promise<Subtask[]> {
  const instanceId = AgentRegistry.newInstanceId("orchestrator");
  const system = AgentRegistry.systemPrompt("orchestrator", inheritanceText);
  const t0 = Date.now();

  emit("diverge", `👑 Orchestrator(${instanceId}) 分析目标,提议分解`);

  const res = await callAgent(
    config.aggregatorModel,
    system,
    `用户目标:${goal}\n\n请把这个目标拆解为 2-${maxSubtasks} 个可分工的子任务。输出 JSON 数组。`,
    0.3,
    "orchestrator",
    config.beeTimeoutMs,
  );

  trace.push({
    phase: "decompose",
    agent: "orchestrator",
    instanceId,
    message: traceText(res.content),
    fullContent: res.content,
    status: res.status,
    latencyMs: Date.now() - t0,
  });

  // 解析 JSON 子任务(容错:解析失败则用单任务兜底)
  let subtasks: Subtask[] = [];
  try {
    const jsonMatch = res.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{ title: string; body?: string; signals?: string; weight?: number }>;
      subtasks = parsed.slice(0, maxSubtasks).map((s, i) => ({
        id: `sub-${i + 1}`,
        title: s.title || `子任务${i + 1}`,
        body: s.body || s.title || goal,
        signals: s.signals || "",
        weight: Math.min(s.weight ?? (0.85 / parsed.length), 0.85),
      }));
    }
  } catch {
    emit("diverge", `⚠️ 分解解析失败,退化为单任务`);
  }

  // 兜底:解析失败或过少 → 至少两条 lane,保证 HARD 有真实多智能体协作。
  if (subtasks.length < 2) {
    const fallbackTitles = [
      "需求拆解与体验约束",
      "核心实现与数据流",
      "质量审查与集成风险",
      "交付验收与演进回流",
    ];
    const fallbackCount = Math.max(2, Math.min(maxSubtasks, fallbackTitles.length));
    subtasks = Array.from({ length: fallbackCount }, (_, i) => ({
      id: `sub-${i + 1}`,
      title: fallbackTitles[i],
      body: `${goal}\n\n请聚焦:${fallbackTitles[i]}。`,
      signals: fallbackTitles[i],
      weight: 0.85 / fallbackCount,
    }));
  }

  await proposeDecomposition(goal, subtasks, { platform: platformSideEffects });
  emit("diverge", `📋 分解为 ${subtasks.length} 个子任务:${subtasks.map((s) => s.title).join(" / ")}`);

  const split = validateRewardSplit();
  if (!split.ok) emit("diverge", `⚠️ solver 权重总和 ${split.solversTotal} 超 0.85`);

  return subtasks;
}

function traceText(content: string, max = 260): string {
  const clean = content.trim().replace(/\s+/g, " ");
  if (!clean) return "(空产出)";
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** MEDIUM 协作路径:同题多解 + 交叉验证 + 纠错 handoff(真正的 A2A 协作)
 *
 *  流程(数学题/事实问答专用,区别于 HARD 的"拆成不同活"):
 *  1. N 只 solver 蜂并行,各自独立求解同一题(多视角,保证多样性)
 *  2. 突破检测:某蜂先出 \boxed{} 答案 → 广播 hint 给还在跑的蜂
 *  3. verifier 蜂交叉核对所有 solver 的答案:
 *     - 答案一致 → 直接采纳(高置信)
 *     - 答案分歧 → handoff 回 solver,指出分歧点让其复核(纠错回路)
 *  4. 聚合器融合
 *
 *  这才是 benchmark 有意义的蜂群:不是"调 N 次取最好",而是"多解交叉验证"。
 */
async function divergeOnly(params: {
  goal: string;
  inheritanceText: string;
  trace: CollaborationTrace["stages"];
  handoffs: HandoffContext[];
  solverCount: number;
  maxRevisionRounds: number;
  platformSideEffects: boolean;
}): Promise<{ accepted: AgentRunResult[]; breakthroughs: number; revisions: number }> {
  const { goal, inheritanceText, trace, handoffs, solverCount, maxRevisionRounds, platformSideEffects } = params;
  const taskRef = { id: `medium-${Date.now()}`, goal, weight: 0.85, signals: "" };
  const n = Math.max(1, solverCount);
  emit("diverge", `🐝 MEDIUM 协作:派 ${n} 只 solver 蜂并行多解 + verifier 交叉验证`);

  // ── 1. N solver 蜂并行独立解题 ──
  const solverResults = await Promise.all(
    Array.from({ length: n }, (_, i) => {
      const arch: AgentRunResult["archetype"] = i === 0 ? "planner" : i === 1 ? "coder" : "explorer";
      return runStandaloneAgent({ arch, taskRef, userContent: goal, inheritanceText, platformSideEffects });
    }),
  );
  let breakthroughs = 0;
  for (const r of solverResults) {
    trace.push({
      phase: "implement",
      agent: r.archetype,
      instanceId: r.instanceId,
      taskId: taskRef.id,
      laneId: `lane-${taskRef.id}`,
      message: traceText(r.content),
      fullContent: r.content,
      status: r.status,
      latencyMs: r.latencyMs,
    });
    if (r.isBreakthrough) {
      breakthroughs += 1;
      await broadcastBreakthrough({ senderId: r.instanceId, hint: r.content.slice(0, 200), taskRef, platformSideEffects });
    }
  }

  // ── 2. verifier 蜂交叉核对 ──
  const solverAnswers = solverResults
    .filter((r) => r.status === "ran" && r.content)
    .map((r) => `--- ${r.archetype}蜂的解答 ---\n${r.content}`)
    .join("\n\n");

  const verifierInstanceId = AgentRegistry.newInstanceId("reviewer");
  // handoff: solver 群 → verifier(把所有解交给它核对)
  const verifyHandoff = await handoff({
    fromInstanceId: solverResults[0]?.instanceId ?? "solvers",
    fromArch: solverResults[0]?.archetype ?? "coder",
    toArch: "reviewer",
    toInstanceId: verifierInstanceId,
    task: taskRef,
    blob: solverAnswers,
    platformSideEffects,
  });
  handoffs.push(verifyHandoff);

  const verifierSystem = AgentRegistry.systemPrompt("reviewer", inheritanceText) +
    "\n你是数学验证蜂。下面是多只 solver 蜂对同一题的独立解答。请交叉核对:\n" +
    "1. 各解答的最终答案是否一致?\n2. 若一致,确认正确答案。若不一致,指出哪个解答的推理有误。\n" +
    "输出格式:\n## 验证结论\nconsensus: CONSISTENT | DISAGREEMENT\nfinal_answer: <你判定的正确答案>\n" +
    "reasoning: <核对依据>\nflawed_solver: <有误的解答及原因,DISAGREEMENT 时必填>";
  const verifierDef = AgentRegistry.getDef("reviewer");
  const t0v = Date.now();
  const verifierPrompt = [
    `原题:\n${goal}`,
    solverAnswers ? `多只 solver 蜂的独立解答:\n${solverAnswers}` : "所有 solver 均未给出有效解答,请直接给出保守结论并说明原因。",
  ].join("\n\n");
  const verifierRes = await callAgent(config.aggregatorModel, verifierSystem, verifierPrompt, verifierDef.temperature, "reviewer", config.beeTimeoutMs);
  const verifierRun: AgentRunResult = {
    archetype: "reviewer",
    instanceId: verifierInstanceId,
    content: verifierRes.content,
    latencyMs: Date.now() - t0v,
    status: verifierRes.status,
    isBreakthrough: false,
    messages: [],
  };
  const consensus = parseConsensus(verifierRes.content);
  trace.push({
    phase: "review",
    agent: "reviewer",
    instanceId: verifierInstanceId,
    taskId: taskRef.id,
    laneId: `lane-${taskRef.id}`,
    message: traceText(verifierRes.content),
    fullContent: verifierRes.content,
    status: consensus.disagreement ? "rejected" : verifierRes.status,
    verdict: consensus.disagreement ? "REJECT" : "APPROVE",
    latencyMs: verifierRun.latencyMs,
  });

  let revisions = 0;

  // ── 3. 若分歧 → handoff 回 solver 纠错(最多1轮,数学题不宜反复)──
  if (consensus.disagreement && maxRevisionRounds >= 1) {
    revisions += 1;
    emit("converge", `🔁 verifier 检出分歧 → handoff 回 solver 纠错`);
    const reworkHandoff = await handoff({
      fromInstanceId: verifierInstanceId,
      fromArch: "reviewer",
      toArch: "coder",
      toInstanceId: AgentRegistry.newInstanceId("coder"),
      task: taskRef,
      blob: solverAnswers,
      feedback: consensus.flawedSolver || "多解不一致,请仔细复核推理步骤",
      revisionRound: 1,
      platformSideEffects,
    });
    handoffs.push(reworkHandoff);
    // 重派一只 solver 基于反馈重解
    const reworked = await runStandaloneAgent({
      arch: "coder",
      taskRef,
      userContent: `${goal}\n\n【验证蜂反馈:多解不一致,可能有误。${consensus.flawedSolver || ""}】请独立重新求解,格外仔细。`,
      inheritanceText,
      platformSideEffects,
    });
    trace.push({
      phase: "implement",
      agent: "coder",
      instanceId: reworked.instanceId,
      taskId: taskRef.id,
      laneId: `lane-${taskRef.id}`,
      message: traceText(reworked.content),
      fullContent: reworked.content,
      status: reworked.status,
      revisionRound: 1,
      latencyMs: reworked.latencyMs,
    });
    if (reworked.isBreakthrough) {
      breakthroughs += 1;
      await broadcastBreakthrough({ senderId: reworked.instanceId, hint: reworked.content.slice(0, 200), taskRef, platformSideEffects });
    }
    solverResults.push(reworked);
  } else {
    emit("converge", consensus.disagreement ? `⚠️ 分歧但已达返工上限` : `✅ 多解一致,高置信采纳`);
  }

  recordRun("reviewer", { success: verifierRes.status === "ran", breakthrough: false, latencyMs: verifierRun.latencyMs, goal, contribution: verifierRes.content.slice(0, 200) });
  return { accepted: [...solverResults, verifierRun], breakthroughs, revisions };
}

/** 从 verifier 输出解析交叉核对结论 */
function parseConsensus(content: string): { disagreement: boolean; finalAnswer?: string; flawedSolver?: string } {
  const upper = content.toUpperCase();
  const disagreement = /DISAGREEMENT|不一致|分歧/.test(upper);
  const ansMatch = content.match(/final_answer[:：]\s*([^\n]+)/i) || content.match(/正确答案[:：]\s*([^\n]+)/i);
  const flawMatch = content.match(/flawed_solver[:：]\s*([\s\S]{10,300})/i) || content.match(/有误[:：]\s*([\s\S]{10,300})/i);
  return {
    disagreement,
    finalAnswer: ansMatch?.[1]?.trim(),
    flawedSolver: flawMatch?.[1]?.trim().slice(0, 300),
  };
}

/** 单独运行一只 agent(不走 handoff,直接解题)——复用 pipeline 的 runAgent 逻辑 */
async function runStandaloneAgent(params: {
  arch: AgentRunResult["archetype"];
  taskRef: { id: string; goal: string; weight: number; signals: string };
  userContent: string;
  inheritanceText: string;
  platformSideEffects: boolean;
}): Promise<AgentRunResult> {
  const { arch, taskRef, userContent, inheritanceText, platformSideEffects } = params;
  const instanceId = AgentRegistry.newInstanceId(arch);
  const def = AgentRegistry.getDef(arch);
  await declareIntent(instanceId, "claim", `${arch} 独立解题:${taskRef.goal.slice(0, 40)}`, { platform: platformSideEffects });
  const system = AgentRegistry.systemPrompt(arch, inheritanceText);
  const t0 = Date.now();
  const res = await callAgent(config.swarmModel, system, userContent, def.temperature, arch, config.beeTimeoutMs);
  const brokeThrough = res.status === "ran" && isBreakthrough(res.content);
  const result: AgentRunResult = {
    archetype: arch, instanceId, content: res.content, latencyMs: Date.now() - t0,
    status: res.status, isBreakthrough: brokeThrough, messages: [],
  };
  recordRun(arch, { success: res.status === "ran", breakthrough: brokeThrough, latencyMs: result.latencyMs, goal: taskRef.goal, contribution: res.content.slice(0, 200) });
  return result;
}

function normalizeCustomTopology(input: CustomSwarmTopology | undefined): CustomSwarmTopology | undefined {
  if (!input || input.mode !== "custom" || !Array.isArray(input.nodes) || input.nodes.length === 0) return undefined;
  const validRoles: AgentRunResult["archetype"][] = ["orchestrator", "planner", "coder", "reviewer", "explorer"];
  const nodes = input.nodes
    .filter((node) => node?.id && validRoles.includes(node.role))
    .slice(0, 16)
    .map((node, index) => ({
      id: String(node.id),
      role: node.role,
      label: node.label || `${node.role} ${index + 1}`,
      petId: node.petId,
      // 用户保存舰队时由 beautifyTopology 注入的自定义人设;存在则覆盖 registry 默认
      persona: typeof node.persona === "string" && node.persona.trim() ? node.persona : undefined,
      focus: typeof node.focus === "string" && node.focus.trim() ? node.focus : undefined,
      temperature: typeof node.temperature === "number" && node.temperature >= 0 && node.temperature <= 2 ? node.temperature : undefined,
    }));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = (input.edges || [])
    .filter((edge) => edge?.id && ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target)
    .slice(0, 32)
    .map((edge) => ({
      id: String(edge.id),
      source: String(edge.source),
      target: String(edge.target),
      kind: edge.kind,
      label: edge.label,
    }));
  return nodes.length ? { mode: "custom", nodes, edges } : undefined;
}

function topoCustom(topology: CustomSwarmTopology): string[] {
  const indeg = new Map(topology.nodes.map((node) => [node.id, 0]));
  const adj = new Map(topology.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of topology.edges) {
    if (!indeg.has(edge.source) || !indeg.has(edge.target)) continue;
    indeg.set(edge.target, (indeg.get(edge.target) || 0) + 1);
    adj.get(edge.source)!.push(edge.target);
  }
  const queue = topology.nodes.filter((node) => (indeg.get(node.id) || 0) === 0).map((node) => node.id);
  const order: string[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    for (const next of adj.get(id) || []) {
      indeg.set(next, (indeg.get(next) || 0) - 1);
      if ((indeg.get(next) || 0) === 0) queue.push(next);
    }
  }
  if (order.length < topology.nodes.length) {
    return topology.nodes.map((node) => node.id);
  }
  return order;
}

function phaseForCustom(role: AgentRunResult["archetype"], isTerminal: boolean): CollaborationTrace["stages"][number]["phase"] {
  if (role === "planner") return "plan";
  if (role === "reviewer") return "review";
  if (role === "orchestrator") return isTerminal ? "aggregate" : "decompose";
  return "implement";
}

function parseCustomReviewerVerdict(content: string): "APPROVE" | "REJECT" {
  const upper = content.toUpperCase();
  if (/REJECT|拒绝|返工|不通过/.test(upper)) return "REJECT";
  return "APPROVE";
}

async function runCustomTopology(params: {
  goal: string;
  topology: CustomSwarmTopology;
  inheritanceText: string;
  trace: CollaborationTrace["stages"];
  handoffs: HandoffContext[];
  platformSideEffects: boolean;
}): Promise<{ accepted: AgentRunResult[]; revisions: number }> {
  const { goal, topology, inheritanceText, trace, handoffs, platformSideEffects } = params;
  const order = topoCustom(topology);
  const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));
  const incoming = new Map(topology.nodes.map((node) => [node.id, [] as CustomSwarmTopology["edges"]]));
  const outgoing = new Map(topology.nodes.map((node) => [node.id, [] as CustomSwarmTopology["edges"]]));
  for (const edge of topology.edges) {
    incoming.get(edge.target)?.push(edge);
    outgoing.get(edge.source)?.push(edge);
  }

  const instanceByNode = new Map<string, string>();
  for (const node of topology.nodes) {
    instanceByNode.set(node.id, AgentRegistry.newInstanceId(node.role));
  }

  const taskRef = { id: `custom-${Date.now()}`, goal, weight: 0.85, signals: "playground-custom-topology" };
  const results = new Map<string, AgentRunResult>();
  let revisions = 0;

  emit("diverge", `🧩 自定义拓扑执行:${topology.nodes.length} 节点 / ${topology.edges.length} 边`);

  for (const nodeId of order) {
    const node = nodeById.get(nodeId);
    if (!node) continue;
    const instanceId = instanceByNode.get(node.id)!;
    const upstreamEdges = incoming.get(node.id) || [];
    const upstreamResults = upstreamEdges
      .map((edge) => ({ edge, result: results.get(edge.source), source: nodeById.get(edge.source) }))
      .filter((item) => item.result);

    const upstreamBlob = upstreamResults.length
      ? upstreamResults
        .map(({ edge, result, source }) => `--- ${source?.label || source?.role || edge.source} -> ${node.label || node.role} (${edge.label || edge.kind || "handoff"}) ---\n${result!.content}`)
        .join("\n\n")
      : "";

    let firstHandoff: HandoffContext | undefined;
    for (const { edge, result, source } of upstreamResults) {
      if (!result || !source) continue;
      const sourceInstanceId = result.instanceId;
      const handoffCtx = await handoff({
        fromInstanceId: sourceInstanceId,
        fromArch: source.role,
        toArch: node.role,
        toInstanceId: instanceId,
        task: taskRef,
        blob: result.content,
        platformSideEffects,
      });
      handoffs.push(handoffCtx);
      if (!firstHandoff) firstHandoff = handoffCtx;
      if (edge.kind === "feedback") revisions += 1;
    }

    await declareIntent(instanceId, "claim", `${node.role} 自定义拓扑节点:${node.label || node.id}`, { platform: platformSideEffects });
    // 节点若带 AI 美化的自定义人设(persona/focus/temperature)则用之,否则回落 registry 默认
    const system = buildCustomNodeSystemPrompt(node, inheritanceText, firstHandoff ? renderCustomHandoff(upstreamBlob || firstHandoff.blob) : undefined);
    const userContent = [
      `用户目标:${goal}`,
      `当前节点:${node.label || node.id} (${node.role})`,
      upstreamBlob ? `上游节点产出:\n${upstreamBlob}` : "这是拓扑入口节点,请根据用户目标启动你的职责。",
      outgoing.get(node.id)?.length ? `下游节点:${(outgoing.get(node.id) || []).map((edge) => nodeById.get(edge.target)?.label || edge.target).join(" / ")}` : "这是终端节点,请产出可用于最终交付的结论。",
    ].join("\n\n");
    const def = AgentRegistry.getDef(node.role);
    const temperature = typeof node.temperature === "number" ? node.temperature : def.temperature;
    const t0 = Date.now();
    const res = await callAgent(config.swarmModel, system, userContent, temperature, node.role, config.beeTimeoutMs);
    const brokeThrough = res.status === "ran" && isBreakthrough(res.content);
    const run: AgentRunResult = {
      archetype: node.role,
      instanceId,
      content: res.content,
      latencyMs: Date.now() - t0,
      status: res.status,
      isBreakthrough: brokeThrough,
      messages: [],
    };
    results.set(node.id, run);
    recordRun(node.role, {
      success: res.status === "ran",
      breakthrough: brokeThrough,
      latencyMs: run.latencyMs,
      goal,
      contribution: res.content.slice(0, 200),
    });
    if (res.status === "ran" && res.content) {
      await submitResult(instanceId, `[custom:${node.role}] ${goal.slice(0, 60)}\n${res.content.slice(0, 800)}`, { platform: platformSideEffects });
    }
    if (brokeThrough) {
      await broadcastBreakthrough({ senderId: instanceId, hint: res.content.slice(0, 200), taskRef, platformSideEffects });
    }

    const isTerminal = (outgoing.get(node.id) || []).length === 0;
    const phase = phaseForCustom(node.role, isTerminal);
    const verdict = node.role === "reviewer" ? parseCustomReviewerVerdict(res.content) : undefined;
    trace.push({
      phase,
      agent: node.role,
      instanceId,
      clientNodeId: node.id,
      label: node.label,
      taskId: taskRef.id,
      laneId: "lane-custom",
      message: traceText(res.content),
      fullContent: res.content,
      status: verdict === "REJECT" ? "rejected" : verdict === "APPROVE" ? "approved" : res.status,
      verdict,
      latencyMs: run.latencyMs,
    });
  }

  return { accepted: [...results.values()].filter((result) => result.status === "ran"), revisions };
}

function renderCustomHandoff(blob: string): string {
  return blob.trim().slice(0, 4000);
}

/** 构造自定义拓扑节点的 system prompt:节点带美化 persona/focus 时覆盖默认,否则回落 registry */
function buildCustomNodeSystemPrompt(
  node: CustomSwarmTopology["nodes"][number],
  inheritanceText: string,
  handoffContext?: string,
): string {
  if (!node.persona && !node.focus) {
    // 无自定义人设,走 registry 默认
    return AgentRegistry.systemPrompt(node.role, inheritanceText, handoffContext);
  }
  const def = AgentRegistry.getDef(node.role);
  const persona = node.persona || def.persona;
  const focus = node.focus || def.focus;
  const parts = [persona];
  if (inheritanceText) parts.push(`\n【EvoMap 继承的可复用经验】\n${inheritanceText}`);
  if (handoffContext) {
    parts.push(`\n【上游 handoff 上下文】\n${handoffContext}\n请基于以上上游产出继续,不要无视。`);
  }
  parts.push(`\n你的角色定位:${focus}`);
  return parts.filter(Boolean).join("\n\n");
}

/** 主入口:对目标执行完整编排 */
export async function orchestrate(params: {
  goal: string;
  inheritanceText: string;
  tier: string;
  customTopology?: CustomSwarmTopology;
}): Promise<OrchestratorOutput> {
  const { goal, inheritanceText, tier } = params;
  const customTopology = normalizeCustomTopology(params.customTopology);
  const t0 = Date.now();
  const trace: CollaborationTrace["stages"] = [];
  const handoffs: HandoffContext[] = [];
  let breakthroughsBroadcast = 0;
  let totalRevisionRounds = 0;

  // ── 0. 三档难度分流 ──
  const decision = await classifyDifficulty(goal);
  const policy = buildExecutionPolicy(tier, customTopology ? "HARD" : decision.level);
  emit(
    "diverge",
    `🧭 执行策略:tier=${policy.tier} difficulty=${policy.difficulty}${customTopology ? " custom-topology=on" : ""} session=${policy.createSession ? "on" : "off"} inheritance=${policy.useInheritance ? "on" : "off"} backflow=${policy.publishBackflow ? "on" : "off"}`,
  );

  if (policy.createSession) {
    await beginSession(goal.slice(0, 60));
  }

  // 继承阈值:只有 HARD 才从 EvoMap 继承经验(简单问题无复用价值)
  let effectiveInheritance = inheritanceText;
  let inheritedRecipes: InheritedRecipe[] = [];
  if (policy.useInheritance) {
    emit("inherit", `检索 EvoMap 经验 | /a2a/assets/search "${goal.slice(0, 40)}…"`);
    const localInherited = activeEvolutionMemory().searchRecipes(goal, 4);
    if (localInherited.length) {
      emit("inherit", `本地进化记忆命中 ${localInherited.length} 条:${localInherited.map((r) => `${r.title}(G${r.generation || 1})`).join(" / ")}`);
    }
    const remoteLimit = Math.max(1, 4 - localInherited.length);
    const remoteInherited = await evomap.searchRecipes(goal, remoteLimit);
    const inherited = [...localInherited, ...remoteInherited].slice(0, 6);
    inheritedRecipes = inherited;
    effectiveInheritance = renderInheritance(inherited);
    emit(
      "inherit",
      inherited.length
        ? `继承 ${inherited.length} 条经验:${inherited.map((r) => `[${r.source}]${r.title}`).join(" / ")}`
        : "无直接命中经验(本轮将为平台贡献新经验)",
    );
  } else {
    effectiveInheritance = "";  // SIMPLE/MEDIUM 不继承
    emit("inherit", `${decision.level} 难度或非 evo 型号,跳过继承`);
  }

  // ── SIMPLE:极简问题,直接单次回复,不进蜂群 ──
  if (!customTopology && decision.level === "SIMPLE") {
    emit("converge", `⚡ SIMPLE 直通:单次回复,跳过蜂群`);
    const simpleId = AgentRegistry.newInstanceId("orchestrator");
    const direct = await callAgent(
      config.swarmModel,
      AgentRegistry.systemPrompt("orchestrator", effectiveInheritance),
      goal,
      0.5,
      "orchestrator",
      config.beeTimeoutMs,
    );
    trace.push({
      phase: "aggregate",
      agent: "orchestrator",
      instanceId: simpleId,
      message: traceText(direct.content),
      fullContent: direct.content,
      status: direct.status,
      latencyMs: direct.latencyMs,
    });
    recordRun("orchestrator", { success: direct.status === "ran", breakthrough: false, latencyMs: direct.latencyMs, goal, contribution: direct.content.slice(0, 200) });
    return {
      finalContent: direct.content,
      difficulty: "SIMPLE",
      classification: decision,
      inheritanceText: "",
      trace: {
        goal, subtasks: [], stages: trace, handoffs: [],
        breakthroughsBroadcast: 0, revisionRounds: 0,
        rewardSplit: [{ archetype: "orchestrator", weight: 1.0, contribution: "直通" }],
        totalLatencyMs: Date.now() - t0,
      },
      inheritedRecipes: [],
      policy,
    };
  }

  const allAccepted: AgentRunResult[] = [];
  let subtasks: Subtask[] = [];
  const bounties: import("../agents/types.js").BountyRequest[] = [];

  if (customTopology) {
    const custom = await runCustomTopology({
      goal,
      topology: customTopology,
      inheritanceText: effectiveInheritance,
      trace,
      handoffs,
      platformSideEffects: policy.createSession,
    });
    allAccepted.push(...custom.accepted);
    breakthroughsBroadcast += custom.accepted.filter((r) => r.isBreakthrough).length;
    totalRevisionRounds += custom.revisions;
    subtasks = [{ id: `custom-${Date.now()}`, title: "Playground 自定义拓扑", body: goal, signals: "custom", weight: 0.85 }];
  } else if (decision.level === "HARD") {
    // ── HARD:复杂任务 → 继承经验 + 拆解 + 分工流水线 ──
    subtasks = await decomposeGoal(goal, effectiveInheritance, trace, policy.hardMaxSubtasks, policy.createSession);
    const pipes = await mapLimit(subtasks, policy.hardConcurrency, async (subtask) => {
      emit("diverge", `──── 子任务:${subtask.title} ────`);
      return runSubtaskPipeline({
        subtask,
        inheritanceText: effectiveInheritance,
        trace,
        handoffs,
        bounties,
        // reviewer 链上余额(最小单位):从 agent identity 持久化值读取。
        // /api/injective/run 在跑蜂群前会调 refreshOnchainBalance("reviewer") 刷新此值,
        // 因此 HARD 任务的悬赏决策用真实余额,reviewer 钱包有币就能真实发悬赏。
        reviewerBalanceInj: onchainBalance("reviewer"),
        maxRevisionRounds: policy.maxRevisionRounds,
        platformSideEffects: policy.createSession,
      });
    });
    for (const pipe of pipes) {
      allAccepted.push(...pipe.accepted);
      breakthroughsBroadcast += pipe.accepted.filter((r) => r.isBreakthrough).length;
      totalRevisionRounds += pipe.revisionRounds;
    }
  } else {
    // ── MEDIUM:单一目标 → 同题多解 + 交叉验证 + 纠错 handoff(不继承)──
    const div = await divergeOnly({
      goal,
      inheritanceText: effectiveInheritance,
      trace,
      handoffs,
      solverCount: policy.mediumSolverCount,
      maxRevisionRounds: policy.maxRevisionRounds,
      platformSideEffects: policy.createSession,
    });
    allAccepted.push(...div.accepted);
    breakthroughsBroadcast += div.breakthroughs;
    totalRevisionRounds += div.revisions;
  }

  // ── 聚合(Orchestrator 作为 Aggregator)──
  emit("converge", `👑 Orchestrator 聚合 ${allAccepted.length} 个被接受的产出`);
  const aggId = AgentRegistry.newInstanceId("orchestrator");
  const acceptedResults: BeeResult[] = allAccepted.map((r) => ({
    id: r.instanceId,
    variant: r.archetype,
    content: r.content,
    latencyMs: r.latencyMs,
    status: r.status === "ran" ? "ran" : "timed_out",
  }));
  const finalContent = await aggregate(config.aggregatorModel, acceptedResults, goal, config.beeTimeoutMs);
  trace.push({
    phase: "aggregate",
    agent: "orchestrator",
    instanceId: aggId,
    message: traceText(finalContent),
    fullContent: finalContent,
    status: "ran",
    latencyMs: Date.now() - t0,
  });

  // 聚合结果若突破,再广播一次
  if (isBreakthrough(finalContent)) {
    await broadcastBreakthrough({ senderId: aggId, hint: finalContent.slice(0, 200), platformSideEffects: policy.createSession });
  }

  recordRun("orchestrator", {
    success: true,
    breakthrough: isBreakthrough(finalContent),
    latencyMs: Date.now() - t0,
    goal,
    contribution: finalContent.slice(0, 200),
  });

  // ── 4. 构造完整协作 trace ──
  const collaborationTrace: CollaborationTrace = {
    goal,
    subtasks: subtasks.map((s) => ({ id: s.id, title: s.title, weight: s.weight, status: "completed" })),
    stages: trace,
    handoffs,
    breakthroughsBroadcast,
    revisionRounds: totalRevisionRounds,
    rewardSplit: await buildRewardSplit(allAccepted, totalRevisionRounds),
    bounties: bounties.length > 0 ? bounties : undefined,
    totalLatencyMs: Date.now() - t0,
  };

  return {
    finalContent,
    trace: collaborationTrace,
    difficulty: policy.difficulty,
    classification: customTopology ? { ...decision, level: "HARD", reason: `${decision.reason}; Playground 自定义拓扑强制进入协作`, source: decision.source } : decision,
    inheritanceText: effectiveInheritance,
    inheritedRecipes,
    policy,
    customTopology,
  };
}

/**
 * 构造 reward 分配:改用 LLM 动态决策(像评审委员会一样根据贡献+余额+绩效评定权重)。
 * LLM 不可用/失败时,回落 registry 的静态 rewardWeight(reward-decider 内部已兜底)。
 */
async function buildRewardSplit(
  results: AgentRunResult[],
  revisions: number,
): Promise<CollaborationTrace["rewardSplit"]> {
  const archs = ["planner", "coder", "reviewer", "orchestrator"] as const;
  const contribution = (arch: string, count: number) => {
    if (arch === "coder") return `${count} 次产出${revisions ? `(含${revisions}轮返工)` : ""}`;
    return `${count} 次产出`;
  };
  const inputs = archs.map((a) => {
    const count = results.filter((r) => r.archetype === a).length;
    return {
      archetype: a,
      contribution: contribution(a, count),
      // 链上余额从 identity 读取(未配置链上地址/未刷新过则为 "0")
      balance: onchainBalance(a),
    };
  });
  const decided = await decideRewardSplit(inputs);
  return decided.map((d) => ({
    archetype: d.archetype,
    weight: d.weight,
    contribution: d.contribution,
  }));
}
