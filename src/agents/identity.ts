// agents/identity.ts
// Agent 持久身份 + 绩效 + 记忆。存到 .agent-state/ 下的 JSON 文件(组织级进化用)
// 跨请求累积,Proposer 据此调整拆分权重

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentState, Archetype } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(__dirname, "..", "..", ".agent-state");

// 确保目录存在(gitignore 已排除)
function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  }
}

function statePath(arch: Archetype): string {
  return path.join(STATE_DIR, `${arch}.json`);
}

/** 读取某 archetype 的持久状态(不存在则返回初始态) */
export function loadState(arch: Archetype): AgentState {
  ensureDir();
  try {
    const raw = fs.readFileSync(statePath(arch), "utf8");
    return JSON.parse(raw) as AgentState;
  } catch {
    return {
      archetype: arch,
      instanceId: "",
      stats: {
        runs: 0,
        successes: 0,
        breakthroughs: 0,
        avgLatencyMs: 0,
        rewardWeight: 0,
      },
      memory: [],
    };
  }
}

/** 记录一次 agent 执行结果,更新绩效 + 记忆(组织级进化) */
export function recordRun(
  arch: Archetype,
  result: {
    success: boolean;
    breakthrough: boolean;
    latencyMs: number;
    goal: string;
    contribution: string;
  },
): void {
  const state = loadState(arch);
  const s = state.stats;
  // 滚动平均
  s.avgLatencyMs = (s.avgLatencyMs * s.runs + result.latencyMs) / (s.runs + 1);
  s.runs += 1;
  if (result.success) s.successes += 1;
  if (result.breakthrough) s.breakthroughs += 1;
  // 记忆:保留最近 8 条
  state.memory.push({
    goal: result.goal.slice(0, 120),
    contribution: result.contribution.slice(0, 200),
    ts: Date.now(),
  });
  if (state.memory.length > 8) state.memory = state.memory.slice(-8);
  try {
    fs.writeFileSync(statePath(arch), JSON.stringify(state, null, 2), { mode: 0o600 });
  } catch {
    /* 持久化失败不阻塞主流程 */
  }
}

/** 取某 archetype 的成功率(组织进化:Proposer 据此加权) */
export function successRate(arch: Archetype): number {
  const s = loadState(arch).stats;
  return s.runs > 0 ? s.successes / s.runs : 0.5;
}

/** 取某 archetype 的突破率(用于 explorer 触发决策) */
export function breakthroughRate(arch: Archetype): number {
  const s = loadState(arch).stats;
  return s.runs > 0 ? s.breakthroughs / s.runs : 0;
}

/** 输出全团队绩效摘要(demo 可见,展示组织进化) */
export function teamRoster(): Record<Archetype, AgentState["stats"]> {
  const archs: Archetype[] = ["orchestrator", "planner", "coder", "reviewer", "explorer"];
  const out = {} as Record<Archetype, AgentState["stats"]>;
  for (const a of archs) out[a] = loadState(a).stats;
  return out;
}
