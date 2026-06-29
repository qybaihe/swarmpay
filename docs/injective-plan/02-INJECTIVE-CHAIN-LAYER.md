# 02 · Injective 链层 SDK 封装（M1）

> 封装 `@injectivelabs/sdk-ts`，对上层暴露 `IInjectiveChain` 接口（见 `05-API-CONTRACT.md` §1）。
> 设计目标：上层（M3/M4）只依赖接口，**不感知 Cosmos/Injective 细节**；测试网不可达时自动降级 mock。

## 1. 依赖

```jsonc
// package.json 追加（dependencies）
"@injectivelabs/sdk-ts": "^1.x",
"@injectivelabs/ts-types": "^1.x",
"@injectivelabs/networks": "^1.x",
"@injectivelabs/utils": "^1.x"
```

> 实装时以 npm 最新稳定版为准，锁定到 package-lock。

## 2. 配置（src/injective/config.ts，追加到 config.ts 的 config 对象）

```ts
// src/config.ts config 对象内追加（纯加法）
injective: {
  enabled: bool(process.env.INJECTIVE_ENABLED, false),   // 默认关 → 原服务零变化
  network: (process.env.INJECTIVE_NETWORK || "testnet") as "testnet" | "mainnet" | "mock",
  chainId: process.env.INJECTIVE_CHAIN_ID || "dorado-1", // Injective 测试网
  rpc: process.env.INJECTIVE_RPC || "https://sentry.lcd.injective.network",
  rest: process.env.INJECTIVE_REST || "https://sentry.lcd.injective.network",
  denom: process.env.INJECTIVE_DENOM || "inj",
  splitContractAddr: process.env.INJECTIVE_SPLIT_CONTRACT_ADDR || "",  // M2 部署后填
  // 各 archetype 角色的预设钱包地址（测试网用预生成的 5+2 个地址）
  archetypeAddrs: JSON.parse(process.env.INJECTIVE_ARCHETYPE_ADDRS || "{}"),
}
```

## 3. chain.ts 实现要点

```ts
// src/injective/chain.ts
import { getNetworkInfo, Network } from "@injectivelabs/networks";
import { MsgSend, MsgExecuteContract } from "@injectivelabs/sdk-ts";
import type { IInjectiveChain, TxReceipt, SplitMsg, Balance } from "./types.js";

export class InjectiveChain implements IInjectiveChain {
  private networkInfo: Network;
  constructor(cfg) { this.networkInfo = getNetworkInfo(cfg.network); }

  async getBalance(addr, denom): Promise<Balance> {
    // 用 @injectivelabs/sdk-ts 的 ChainGrpcBankApi / index fetch
    // 返回 { amount: smallestUnitString, denom }
  }

  async sendTransfer(from, to, amount, denom): Promise<TxReceipt> {
    // 组 MsgSend → 签名（由 wallet.ts 注入 signer）→ broadcastTx → TxReceipt
  }

  async executeContract(sender, contractAddr, msg: SplitMsg): Promise<TxReceipt> {
    // 组 MsgExecuteContract(cosmwasm)，附带 funds=total → 签名广播
  }
}
```

## 4. wallet.ts —— 签名策略（demo 友好）

Injective 用 Cosmos 签名。两种模式：

| 模式 | 用途 | 实现 |
|---|---|---|
| **后端代签（demo 默认）** | demo/开发不依赖前端钱包 | 后端持有一个测试网私钥（env `INJECTIVE_DEMO_KEY`），chain.ts 直接用 `PrivateKey` 构造 signer。**仅测试网，主网绝不**。 |
| **前端 Keplr 签（P2 加分）** | 真实用户体验 | 前端 Keplr 签名 → 把签名后的 tx bytes POST 给后端 → 后端只 broadcast。私钥不离开浏览器。 |

`wallet.ts` 暴露 `getSigner(mode)`，chain.ts 据此组装交易。MVP 走后端代签，把链路跑通；P2 切 Keplr。

## 5. mock-chain.ts —— 开发/demo 兜底

```ts
// src/injective/mock-chain.ts
export class MockChain implements IInjectiveChain {
  async getBalance(addr, denom) { return { amount: "10000000000000000000", denom }; } // 10 INJ
  async sendTransfer(from, to, amount, denom) {
    await sleep(600);
    return { txHash: `mock_${cryptoRandom()}`, height: 12345, success: true, gasUsed: "200000", rawLog: "mock" };
  }
  async executeContract(sender, addr, msg) { /* 同上，模拟分润回执 */ }
}
```

**工厂**：
```ts
// src/injective/index.ts
export function createChain(): IInjectiveChain {
  if (config.injective.network === "mock") return new MockChain();
  if (!config.injective.enabled) return new MockChain(); // 未启用也降级 mock，保证安全
  return new InjectiveChain(config.injective);
}
```

> 这样即使没配 env、没装测试网钱包，整个链上通道也能以 mock 跑通，demo 不黑屏。

## 6. 验收标准（M1）
- [ ] `IInjectiveChain` 接口 + types 在 `src/injective/types.ts` 落地
- [ ] `MockChain` 实现，单元可测
- [ ] `InjectiveChain` 真链实现（getBalance/sendTransfer/executeContract）
- [ ] `createChain()` 工厂 + 配置项
- [ ] 不改任何原 src 文件（仅 config.ts 追加配置段）
- [ ] 注入新依赖后 `npm install` 成功，原 `npm run dev` / `npm start` 不报错

## 7. 测试网关键参数（Injective）

- 测试网 chain-id：`dorado-1`
- 水龙头：https://injective.tools/faucet （领测试 INJ）
- 浏览器：https://testnet.explorer.injective.network
- 文档：https://docs.injective.network
- 代币精度：INJ 18 decimals
