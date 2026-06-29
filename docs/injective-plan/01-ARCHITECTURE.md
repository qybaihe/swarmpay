# 01 · 架构设计

## 1. 双通道架构（核心：不破坏原服务）

EvoShip 原有"积分通道"完全保留，新增"Injective 链上通道"与之并行。由 `INJECTIVE_ENABLED` 开关切换，默认关闭 → 原服务行为零变化。

```
                     ┌──────────────────────────┐
   OpenAI 兼容客户端 ──→│ POST /v1/chat/completions │──→ credits 闭环(原，不动)
                     └──────────────────────────┘

                     ┌──────────────────────────┐
   Injective 用户   ──→│ POST /api/injective/run  │──→ 链上闭环(新)
   (连 Keplr)        │  (新路由)                │
                     └──────────────────────────┘
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
        链上余额校验      runSwarm()         链上分润
        (chain.getBalance) (原内核，不改)   (split-executor)
                                              │
                                   ┌──────────┴──────────┐
                                   ▼                     ▼
                             CosmWasm 合约         payer agent
                             (split-rewards)      (新角色)
```

## 2. 模块边界与依赖

```
src/injective/          ← 新增，全部链上逻辑隔离于此
  config.ts             Injective 配置（network/chainId/rpc/contractAddr）
  types.ts              IInjectiveChain / TxReceipt / SplitMsg / DistributeResult
  chain.ts              [M1] SDK 封装：getBalance/sendTransfer/executeContract
  wallet.ts             [M1] 钱包会话管理（Keplr/Cosmos 钱包签名委托）
  split-executor.ts     [M3] 消费 trace.rewardSplit → 调 chain + 合约
  payer-agent.ts        [M3] payer/treasurer 角色逻辑
  routes.ts             [M4] Express Router，挂 /api/injective/*
  mock-chain.ts         [M1] mock 实现，无测试网时兜底（demo/开发用）

contracts/              ← 新增
  split-rewards/        [M2] CosmWasm 合约
    src/lib.rs
    Cargo.toml
    schema/*.json
    README.md

web/views/injective/    ← 新增前端
  WalletView.vue        [M5] Keplr 连接 + 余额
  OnchainRunView.vue    [M5] 链上版蜂群运行 + 交易回执 timeline
web/stores/injective.ts [M5] 钱包状态

docs/injective-plan/    ← 本文档集
```

**依赖方向（单向，无环）**：
```
M4(routes) → M3(split-executor/payer) → M1(chain) → @injectivelabs/sdk-ts
M4(routes) → 原 swarm.ts (runSwarm)        ← 只读调用，不改 swarm
M3 → M2(contract，通过 chain.executeContract 间接触发)
M5(frontend) → M4(routes，HTTP)
```

## 3. 数据流：一次链上蜂群调用

```
1. 前端 OnchainRunView：用户连 Keplr，输入 goal + 预算(如 5 INJ)
2. POST /api/injective/run { goal, budgetAmount:"5", budgetDenom:"inj", senderAddr, tier }
3. routes.ts:
   a. chain.getBalance(senderAddr) → 余额 < 预算？ 402 (同构于原 credits 检查)
   b. runSwarm({ tier, messages }) → { content, trace }   ← 原内核零改动
   c. splitExecutor.distribute(trace, budgetAmount, denom):
      - 按 trace.rewardSplit 计算各 archetype 应得份额
      - payer agent 决策：直接多对多转账 OR 调分润合约
      - chain.executeContract / sendTransfer → txHash
   d. 返回 { content, trace, payment: DistributeResult }
4. 前端渲染：答案 + 协作 trace(Vue Flow) + 链上交易 timeline + 分润流向图
```

## 4. 为什么这样切分能并行

- M1 只依赖 `@injectivelabs/sdk-ts`（外部包）+ 自定 `types.ts`，可独立开发并配 mock。
- M2 只依赖 CosmWasm 工具链（`cargo`/`daemon` 或 `archwayd`），与 TS 代码完全隔离，可独立编译。
- M3 依赖 M1 的 `IInjectiveChain` 接口（§5 契约），不读 M1 实现 —— M1 用 mock 时 M3 也能跑。
- M4 依赖 M3 的 `ISplitExecutor` 接口 + 原项目 `runSwarm`，纯组合。
- M5 依赖 M4 的 HTTP 契约，纯前端，可先用 mock 数据开发。
- M6 文档独立。

**唯一会触原文件的 4 处**（均为纯追加，详见 `00-OVERVIEW.md` §2）：
`types.ts`(Archetype+)、`registry.ts`(DEFS+)、`server.ts`(挂路由)、`config.ts`(配置段)。

## 5. 错误与回退策略

| 场景 | 处理 |
|---|---|
| 测试网不可达 | chain.ts 自动降级到 mock-chain，demo 不中断 |
| 分润交易失败 | 仍返回蜂群答案 content + trace，payment.success=false，前端标注"待重试" |
| 用户未连钱包 | 路由返回 401，前端引导连钱包 |
| 预算为 0 | 跳过分润，只跑蜂群（免费模式），payment=null |

> 关键：**蜂群答案永远返回**，链上分润是"增强"而非"前置必需"——保证 demo 永不黑屏。
