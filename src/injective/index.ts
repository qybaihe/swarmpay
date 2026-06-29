// src/injective/index.ts
// 链层工厂:按 config 选择 mock / 真链。未启用或非 testnet/mainnet 时一律 mock(安全且 demo 友好)。

import { config } from "../config.js";
import type { IInjectiveChain } from "./types.js";
import { MockChain } from "./mock-chain.js";
import { InjectiveChain } from "./chain.js";

/**
 * 创建链层实例。
 * - network === "mock" 或未启用 → MockChain(永不黑屏)
 * - network === "testnet" → 真链 InjectiveChain(chain.ts 内部动态 import SDK)
 * - network === "mainnet" → 比赛阶段禁用,降级 mock
 *
 * 注意:chain.ts 不在顶层 import @injectivelabs/sdk-ts,所以 mock 模式不会触发 SDK 加载。
 * 真链模式下若 chain.ts 实现抛 not-implemented,这里不 catch(让调用方看到真实错误),
 * 但 routes.ts 的余额校验会失败 → 前端能看到明确报错而非黑屏。
 */
export function createChain(): IInjectiveChain {
  const net = config.injective.network;
  if (net === "mainnet") {
    console.warn("[injective] mainnet not allowed in demo, fallback to mock");
    return new MockChain();
  }
  if (net === "testnet") {
    return new InjectiveChain(config.injective);
  }
  return new MockChain();
}

export { MockChain } from "./mock-chain.js";
export { SplitExecutor, injToSmallest, smallestToInj } from "./split-executor.js";
export { payerDecide, adjustWeightsDeterministic } from "./payer-agent.js";
export type { IInjectiveChain } from "./types.js";