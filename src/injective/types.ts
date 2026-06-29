// src/injective/types.ts
// Injective 链层类型与接口契约。所有上层模块（split-executor / routes / 前端）只依赖这里的接口，
// 不直接依赖 @injectivelabs/sdk-ts，以便 mock 与真链可互换。

import type { Tier } from "../config.js";

// ── Injective 网络模式(与 config.ts 内联类型一致)──
export type InjectiveNetwork = "mock" | "testnet" | "mainnet";

// ── 链上基础类型 ──

/** 金额一律用最小单位字符串（避免 JS number 精度丢失）。INJ = 18 decimals。 */
export interface Balance {
  amount: string; // 最小单位字符串，如 "5000000000000000000" 表示 5 INJ
  denom: string; // "inj" / "peggy0x..." 等
}

/** 链上交易回执 */
export interface TxReceipt {
  txHash: string;
  height: number;
  success: boolean;
  gasUsed: string;
  rawLog?: string;
}

/** 分润合约的 Execute 消息 */
export interface SplitMsg {
  /** 权重归一化到总和 1 的接收方列表 */
  recipients: { addr: string; weight: number }[];
  total: string; // 最小单位字符串，调用时附带 funds 应等于此值
  denom: string;
}

// ── 链层接口（M1 出，M3/M4 入）──

export interface IInjectiveChain {
  /** 查询某地址某 denom 余额 */
  getBalance(addr: string, denom: string): Promise<Balance>;
  /** 原生代币转账（INJ 等），from 为签名方地址 */
  sendTransfer(from: string, to: string, amount: string, denom: string): Promise<TxReceipt>;
  /** 执行 CosmWasm 合约（分润合约），sender 为签名方，附带 funds=total */
  executeContract(sender: string, contractAddr: string, msg: SplitMsg): Promise<TxReceipt>;
}

// ── 分润相关：对齐真实 SwarmTrace(openai-types.ts) 的 snake_case 结构 ──

/** 真实 trace.reward_split 的元素结构。archetype 在 trace 里是 string。 */
export interface RewardSplitEntry {
  archetype: string;
  weight: number;
  contribution: string;
}

/** 简化的 trace 视图:只取分润所需字段,避免上层依赖完整 SwarmTrace。 */
export interface TraceSplitView {
  reward_split?: RewardSplitEntry[];
  breakthroughs_broadcast?: number;
}

export interface SplitShare {
  archetype: string;
  addr: string; // 该角色对应的钱包地址
  amount: string; // 实际分得（最小单位）
  weight: number; // 原始权重
}

export interface DistributeResult {
  txHash: string; // 分润交易 hash
  mode: "contract" | "direct"; // 走合约 or 多笔直接转账
  splits: SplitShare[];
  totalDistributed: string; // 最小单位
  feeDeducted: string; // 协议服务费（最小单位）
  success: boolean;
  error?: string;
}

export interface ISplitExecutor {
  distribute(
    trace: TraceSplitView,
    totalAmount: string,
    denom: string,
    senderAddr: string,
  ): Promise<DistributeResult>;
}

// ── HTTP 请求/响应（M4 路由）──

export interface OnchainRunRequest {
  goal: string;
  tier?: Tier;
  budgetAmount: string; // 最小单位
  budgetDenom: string;
  senderAddr: string;
  topology?: unknown; // ChatCompletionRequest["x_playground_topology"]，宽松类型避免循环依赖
}

export interface OnchainRunResponse {
  content: string;
  trace: unknown; // 完整 SwarmTrace，透传给前端
  payment: DistributeResult | null; // budgetAmount=0 时 null
}

// ── 钱包会话（M1 wallet.ts）──

export type SignerMode = "backend-demo" | "keplr";

// InjectiveConfig 已在 config.ts 定义为 config.injective,此处不再 re-export,避免循环。
