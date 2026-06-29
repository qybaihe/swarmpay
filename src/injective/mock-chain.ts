// src/injective/mock-chain.ts
// Mock 链层实现:无测试网/未启用时的兜底,保证 demo 与开发永不黑屏。
// 所有 txHash 形如 mock_<rand>,余额固定 10 INJ。

import { randomUUID } from "node:crypto";
import type { Balance, IInjectiveChain, SplitMsg, TxReceipt } from "./types.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// 10 INJ = 10 * 10^18 最小单位
const MOCK_BALANCE = "10000000000000000000";

function mockTx(): TxReceipt {
  return {
    txHash: `mock_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    height: 12_000_000 + Math.floor(Math.random() * 100_000),
    success: true,
    gasUsed: "180000",
    rawLog: "[mock] distribute executed",
  };
}

export class MockChain implements IInjectiveChain {
  async getBalance(_addr: string, denom: string): Promise<Balance> {
    await sleep(150);
    return { amount: MOCK_BALANCE, denom };
  }

  async sendTransfer(_from: string, _to: string, _amount: string, denom: string): Promise<TxReceipt> {
    await sleep(500);
    return { ...mockTx(), rawLog: `[mock] send ${denom}` };
  }

  async executeContract(_sender: string, _contractAddr: string, msg: SplitMsg): Promise<TxReceipt> {
    await sleep(700);
    // 模拟按权重分发,记录在 rawLog
    const total = BigInt(msg.total);
    const sum = msg.recipients.reduce((a, r) => a + r.weight, 0) || 1;
    const parts = msg.recipients.map((r) => (total * BigInt(Math.round(r.weight * 1_000_000)) / BigInt(sum * 1_000_000)).toString());
    return {
      ...mockTx(),
      rawLog: `[mock] distribute ${msg.denom}: ${parts.join(", ")}`,
    };
  }

  /** mock 模式无代签,沿用调用方地址。 */
  getSignerAddress(): string {
    return "";
  }
}
