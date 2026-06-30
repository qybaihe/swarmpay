# EvoShip × Injective 改造方案文档索引

> 本目录是「把 EvoShip 蜂群 Agent 协作引擎改造为 Injective 新星计划参赛项目」的完整方案。
> 设计原则：**加法式改造，不破坏原蜂群能力**；模块化、可多 agent 并行、按接口契约解耦。当前提交事实边界以 [09-PITCH-DECK-OUTLINE](09-PITCH-DECK-OUTLINE.md) 顶部准确性红线为准。

## 文档清单

| # | 文档 | 内容 | 作用 |
|---|---|---|---|
| 00 | [OVERVIEW](00-OVERVIEW.md) | 总纲：定位、基线、原则、模块划分、执行顺序、评分对齐 | 全局入口 |
| 01 | [ARCHITECTURE](01-ARCHITECTURE.md) | 双通道架构、模块边界、数据流、并行性论证、回退策略 | 架构 |
| 02 | [INJECTIVE-CHAIN-LAYER](02-INJECTIVE-CHAIN-LAYER.md) | SDK 封装、配置、签名策略、mock 兜底、测试网参数 | M1 |
| 03 | [SPLIT-REWARDS-CONTRACT](03-SPLIT-REWARDS-CONTRACT.md) | CosmWasm 分润合约设计、消息、精度、编译测试、部署 | M2 |
| 04 | [PAYER-AGENT](04-PAYER-AGENT.md) | payer/treasurer 角色定义、分润执行、动态调权、服务费 | M3 |
| 05 | [API-CONTRACT](05-API-CONTRACT.md) | IInjectiveChain / ISplitExecutor / HTTP 路由 / 前端契约 | M3·M4·M5 |
| 06 | [FRONTEND-WALLET](06-FRONTEND-WALLET.md) | Keplr 连接、链上可视化、分润流向图、交易 timeline | M5 |
| 07 | [DEPLOYMENT](07-DEPLOYMENT.md) | env 配置、三种运行模式、测试网钱包、回归验证 | 运维 |
| 08 | [DEMO-SCRIPT](08-DEMO-SCRIPT.md) | ≤3 分钟 demo 视频分镜表、录制要点 | 交付物 |
| 09 | [PITCH-DECK-OUTLINE](09-PITCH-DECK-OUTLINE.md) | 路演简报 15 页大纲（7 维度全覆盖） | 交付物 |
| 10 | [SUBMISSION-COPY](10-SUBMISSION-COPY.md) | 报名表单 17 项必填文案草稿，可直接粘贴 | 交付物 |
| 11 | [DEEP-REFINEMENT-PLAN](11-DEEP-REFINEMENT-PLAN.md) | 深度 3 打磨计划：INJ 计费、悬赏、per-archetype 钱包 | 规划 |
| 12 | [PLAYGROUND-DEEP-FUSION](12-PLAYGROUND-DEEP-FUSION.md) | Playground 与链上经济深度融合方案 | 规划 |
| 13 | [PARTICLES-AND-LANDING-WEB3](13-PARTICLES-AND-LANDING-WEB3.md) | 视觉、粒子动效与 Web3 首页打磨方案 | 规划 |
| 14 | [NOVA-SUBMISSION-CHECKLIST](14-NOVA-SUBMISSION-CHECKLIST.md) | 官方 Nova 要求逐项核对、缺口与提交前 checklist | 提交验收 |

## 并行任务（M1–M6）速查

| 模块 | 目录 | 改原文件？ | 依赖 | 验收 |
|---|---|---|---|---|
| M1 链层 | `src/injective/` | 仅 `config.ts` 追加 | `@injectivelabs/sdk-ts` | mock+真链双实现 |
| M2 合约 | `contracts/split-rewards/` | 否 | CosmWasm 工具链 | 单测过+wasm 产出 |
| M3 分润执行 | `src/injective/split-executor.ts`、`payer-agent.ts` | `types.ts`/`registry.ts` 追加 | M1 接口 | MockChain 跑通 |
| M4 路由 | `src/injective/routes.ts` | `server.ts` 追加 1 行 | M3 + 原 runSwarm | /api/injective/run 闭环 |
| M5 前端 | `web/views/injective/` | 否 | M4 HTTP 契约 | 钱包页+流向图 |
| M6 文档 | `docs/injective-plan/` | 否 | — | 本文档集 |

## 截止倒排（6/30 24:00 报名截止）
- **P0**：M6 文档 + M1 mock + M2 合约编译 → 可拍 demo、可提交
- **P1**：M4 + M3（接 mock）+ M5 → 闭环可演示
- **P2**：M1 接 testnet 真链 → 已跑通 direct `MsgSend` 分润；CosmWasm 部署仍属路线图

## 评分维度对齐（见 00 §8）
创新性 / 技术实现 / 应用价值 / 产品体验 / 生态契合度 —— 五维均有对应设计。
