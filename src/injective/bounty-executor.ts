// src/injective/bounty-executor.ts
// 悬赏执行器:用发起方 agent 自己的钱包签名转账(深度3 核心:agent 自主花钱)。
// 与 SplitExecutor(代签钱包统一分润)的区别:bounty 用 fromArch 自己的私钥签名。

import { config } from "../config.js";
import { AgentWallet } from "./agent-wallet.js";
import type { BountyRequest } from "../agents/types.js";
import type { TxReceipt } from "./types.js";

export interface BountyExecutionResult {
  bounty: BountyRequest;
  receipt: TxReceipt;
  success: boolean;
}

export class BountyExecutor {
  private agentWallet: AgentWallet;

  constructor() {
    this.agentWallet = new AgentWallet();
  }

  /** 执行一个悬赏:fromArch 钱包 → toArch 钱包。 */
  async execute(bounty: BountyRequest): Promise<BountyExecutionResult> {
    // 找 toArch 地址
    const toAddr = config.injective.archetypeAddrs[bounty.toArch];
    if (!toAddr) {
      return { bounty, receipt: { txHash: "", height: 0, success: false, gasUsed: "0", rawLog: `no addr for ${bounty.toArch}` }, success: false };
    }
    if (!this.agentWallet.hasWallet(bounty.fromArch)) {
      return { bounty, receipt: { txHash: "", height: 0, success: false, gasUsed: "0", rawLog: `no wallet for ${bounty.fromArch}` }, success: false };
    }

    try {
      const receipt = await this.agentWallet.sendTransferAs(
        bounty.fromArch,
        toAddr,
        bounty.amountSmallest,
        bounty.denom,
        `swarmpay:bounty ${bounty.fromArch}→${bounty.toArch} ${bounty.reason.slice(0, 40)}`,
      );
      bounty.txHash = receipt.txHash;
      bounty.status = receipt.success ? "executed" : "failed";
      return { bounty, receipt, success: receipt.success };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      bounty.status = "failed";
      return { bounty, receipt: { txHash: "", height: 0, success: false, gasUsed: "0", rawLog: msg }, success: false };
    }
  }

  /** 批量执行 trace 里的所有悬赏。 */
  async executeAll(bounties: BountyRequest[]): Promise<BountyExecutionResult[]> {
    const results: BountyExecutionResult[] = [];
    for (const b of bounties) {
      if (b.status === "executed") continue; // 已执行跳过
      const r = await this.execute(b);
      results.push(r);
      // 串行间隔,避免 sequence 冲突(同 split-executor)
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    return results;
  }
}