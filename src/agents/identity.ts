// agents/identity.ts
// Agent 持久身份 + 绩效 + 记忆。存到 .agent-state/ 下的 JSON 文件(组织级进化用)
// 跨请求累积,Proposer 据此调整拆分权重

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentState, Archetype } from "./types.js";
import type { IInjectiveChain } from "../injective/types.js";
import { config } from "../config.js";

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
    const parsed = JSON.parse(raw) as Partial<AgentState>;
    // 兼容旧数据:补齐可能缺失的链上余额字段(待 types.ts 加 onchainBalance/walletAddr 后启用)。
    // @ts-ignore — 待主线在 types.ts 的 AgentState 增加 onchainBalance?: string 与 walletAddr?: string 字段
    return {
      archetype: arch,
      instanceId: parsed.instanceId ?? "",
      stats: parsed.stats ?? {
        runs: 0,
        successes: 0,
        breakthroughs: 0,
        avgLatencyMs: 0,
        rewardWeight: 0,
      },
      memory: parsed.memory ?? [],
      // @ts-ignore — 待 types.ts AgentState 增加 onchainBalance/walletAddr 字段后此行生效
      onchainBalance: (parsed as { onchainBalance?: string }).onchainBalance ?? "0",
      // @ts-ignore — 待 types.ts AgentState 增加 walletAddr 字段后此行生效
      walletAddr: (parsed as { walletAddr?: string }).walletAddr ?? "",
    } as AgentState;
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
      // @ts-ignore — 待 types.ts AgentState 增加 onchainBalance/walletAddr 字段后此行生效
      onchainBalance: "0",
      // @ts-ignore — 待 types.ts AgentState 增加 walletAddr 字段后此行生效
      walletAddr: "",
    } as AgentState;
  }
}

/** 取某 archetype 的链上地址(从 config.injective.archetypeAddrs)。 */
function addrOf(archetype: Archetype): string {
  return config.injective.archetypeAddrs[archetype] || "";
}

/** 取某 archetype 持久化的链上 INJ 余额(最小单位字符串;未刷新过返回 "0")。 */
export function onchainBalance(arch: Archetype): string {
  // @ts-ignore — 待 types.ts AgentState 增加 onchainBalance 字段后此行生效
  return (loadState(arch) as { onchainBalance?: string }).onchainBalance ?? "0";
}

/**
 * 刷新某 archetype 的链上 INJ 余额并持久化。
 * 调 chain.getBalance(addrOf(arch), "inj") 更新 identity 里的 onchainBalance。
 * addr 取自 config.injective.archetypeAddrs(未配置则记 "" 且余额保持 0)。
 */
export async function refreshOnchainBalance(
  arch: Archetype,
  chain: IInjectiveChain,
): Promise<string> {
  const state = loadState(arch);
  const addr = addrOf(arch);
  let balance = "0";
  if (addr) {
    try {
      const bal = await chain.getBalance(addr, config.injective.denom || "inj");
      balance = bal?.amount ?? "0";
    } catch {
      /* 链查询失败不阻塞主流程,保持旧值 */
      // @ts-ignore — 待 types.ts AgentState 增加 onchainBalance 字段后此行生效
      return (state as { onchainBalance?: string }).onchainBalance ?? "0";
    }
  }
  // @ts-ignore — 待 types.ts AgentState 增加 onchainBalance/walletAddr 字段后此两行生效
  (state as { onchainBalance?: string }).onchainBalance = balance;
  // @ts-ignore — 待 types.ts AgentState 增加 walletAddr 字段后此行生效
  (state as { walletAddr?: string }).walletAddr = addr;
  try {
    fs.writeFileSync(statePath(arch), JSON.stringify(state, null, 2), { mode: 0o600 });
  } catch {
    /* 持久化失败不阻塞主流程 */
  }
  return balance;
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
