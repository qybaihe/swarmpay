# EvoShip × Injective 改造总纲

> 把 EvoShip 蜂群 Agent 协作引擎改造为 **Injective 新星计划** 参赛项目。
> 原则：**加法式改造，不破坏原服务**。所有新代码在新模块/新路由下，原 `/v1/chat/completions`、credits、蜂群编排零改动可继续独立运行。

---

## 0. 一句话定位

**SwarmPay —— 一支在 Injective 链上自主协作、按贡献链上分润的 AI 蜂群舰队。**

用户用自然语言下目标 → 蜂群 agent 分工协作（planner→coder→reviewer，已有）→
协作完成时，由 **payer agent 自主发起 Injective 链上支付**，按 reward_split 权重 **链上分润** 给参与 agent 的钱包。
"越用越聪明"的经验继承（已有）+ "越用越值钱"的链上分润（新增）。

比赛方向：**AI 智能支付**（主）+ **智能体基础设施**（辅）。

---

## 1. 改造前的基线（已确认的真实代码结构）

| 模块 | 文件 | 现状 | 改造角色 |
|---|---|---|---|
| credits 扣减闭环 | `src/auth.ts` `deductCredits/addCredits/getCredits` + `credit_transactions` 表 | SQLite 原子扣减 + 流水 | **链上支付的对照物，新增 Injective 支付层并行** |
| 蜂群编排 | `src/swarm.ts` `runSwarm()`、`src/orchestration/*` | 5 角色六阶段协作，返回 `out.trace` 含 `rewardSplit` | **不改内核，在 trace 消费侧加分润** |
| 角色注册 | `src/agents/registry.ts` `ARCHETYPE_DEFS`、`types.ts` `Archetype` 联合类型 | 5 角色 | **新增 `payer`/`treasurer` 角色** |
| 核心入口 | `src/server.ts` `/v1/chat/completions` L315-331 | 余额检查→runSwarm→扣分 | **新增 `/api/injective/*` 路由，原路由保留** |
| A2A 信封 | `src/protocol/envelope.ts` `AgentMessage.payload` | 7 种 intent | **新增 `payment`/`split` intent** |
| 配置 | `src/config.ts` | env 驱动 | **新增 Injective 配置段** |
| 前端 | `web/views/PlaygroundView.vue`、`ChatView.vue` | Vue3 + Vue Flow 编排可视化 | **加钱包连接页 + 链上交易回执可视化** |

**关键事实（来自核对）**：
- `rewardSplit: { archetype, weight, contribution }[]` 已在 `CollaborationTrace`（types.ts:163），分润合约可直接消费。
- `deductCredits(userId, amount, reason)` 返回 `{ok, balance}`，结构与"链上校验→交易→回执"同构。
- 原服务用 SQLite（`node:sqlite`）、Express、OpenAI 兼容 SDK。**无任何链依赖**，引入 `@injectivelabs/sdk-ts` 不冲突。

---

## 2. 改造原则（不破坏原服务）

1. **加法，不替换**：原 credits 体系、原 `/v1/chat/completions`、原蜂群编排 **全部保留**。新增 Injective 支付作为**并行通道**，由配置开关 `INJECTIVE_ENABLED` 控制，默认关 → 原服务行为零变化。
2. **新代码新目录**：所有 Injective 相关代码进 `src/injective/`、`web/views/injective/`、合约进 `contracts/`，不散落到原文件。
3. **唯一改动原文件的地方**：`src/agents/types.ts`（`Archetype` 联合类型加成员）、`src/agents/registry.ts`（`ARCHETYPE_DEFS` 加条目）、`src/server.ts`（挂载新路由 `app.use('/api/injective', injectiveRouter)`）、`src/config.ts`（加配置段）。这 4 处为**纯追加**，不删不改原有行。
4. **可独立验证**：每个并行模块有独立入口和测试，不依赖其他模块即可跑。

---

## 3. 架构总览

```
用户（连 Keplr 钱包）
   │  自然语言目标 + 链上预算
   ▼
┌─────────────────────────────────────────────┐
│  新增 /api/injective/run  (链上版蜂群入口)    │  ← src/injective/routes.ts
│  1. 校验链上余额（替代 credits 检查）          │
│  2. runSwarm() ← 原蜂群内核，零改动            │
│  3. 拿 out.trace.rewardSplit                  │
│  4. payer agent 发起 Injective 支付/分润交易   │
│  5. 返回答案 + 链上交易回执                    │
└─────────────────────────────────────────────┘
        │                          │
        ▼                          ▼
  原蜂群内核(不改)           新增 Injective 链层
  src/swarm.ts               src/injective/chain.ts
                             contracts/split_rewards.sol/.rs
```

---

## 4. 新增模块清单（并行任务划分）

> 每个模块 = 一个可并行 agent 任务，模块间通过 **接口契约**（见第 5 节）解耦，互不写同一文件。

### M1. Injective 链层 SDK 封装
- 目录：`src/injective/`
- 文件：`chain.ts`（SDK 封装）、`wallet.ts`（钱包会话）、`config.ts`（Injective 配置）、`types.ts`
- 职责：封装 `@injectivelabs/sdk-ts`，提供 `getBalance()`/`sendTransfer()`/`broadcastTx()`，屏蔽 Cosmos 细节
- 出参接口：见 §5 `IInjectiveChain`

### M2. 链上分润合约
- 目录：`contracts/`
- 文件：`split-rewards.rs`（CosmWasm，Injective 原生支持）+ `README.md` + 部署脚本
- 职责：接收总报酬 + 权重列表，按权重原子分发到各 agent 钱包地址
- 接口：`distribute(recipients: [(addr, weight)], total)` → 链上多笔转账
- 评估价值：这是"AI 智能支付"方向的核心技术亮点

### M3. payer / treasurer 角色与支付编排
- 目录：`src/injective/payer-agent.ts`、`src/injective/split-executor.ts`
- 改动原文件：`types.ts`（Archetype 加 `payer`/`treasurer`）、`registry.ts`（加 2 条 ARCHETYPE_DEFS）
- 职责：消费 `CollaborationTrace.rewardSplit`，调用 M1 链层 + M2 合约完成分润
- 接口：见 §5 `ISplitExecutor`

### M4. Injective 路由与链上版蜂群入口
- 目录：`src/injective/routes.ts`
- 改动原文件：`server.ts`（追加 `app.use('/api/injective', injectiveRouter)` 一行）
- 职责：`POST /api/injective/run` = 余额校验 → runSwarm → 分润 → 返回 trace+txHash
- 接口：见 §5 `/api/injective/run` 请求/响应

### M5. 前端钱包与链上可视化
- 目录：`web/views/injective/`（`WalletView.vue`、`OnchainRunView.vue`）、`web/stores/injective.ts`
- 职责：Keplr 连接、链上余额展示、交易回执 timeline、分润流向图
- 不改原 PlaygroundView/ChatView，新建独立页面 + 导航入口

### M6. 技术文档与交付物
- 目录：`docs/injective-plan/`
- 文件：见第 7 节文档清单
- 职责：README、架构、API 契约、合约说明、部署、Demo 脚本、Pitch Deck 大纲、表单文案

---

## 5. 接口契约（并行模块间的"合同"）

> 各 agent 按此契约实现，无需互相读代码。

### `IInjectiveChain`（M1 出，M3/M4 入）
```ts
interface IInjectiveChain {
  getBalance(addr: string): Promise<{ amount: string; denom: string }>;
  sendTransfer(from: string, to: string, amount: string, denom: string): Promise<TxReceipt>;
  executeContract(sender: string, contractAddr: string, msg: SplitMsg): Promise<TxReceipt>;
}
interface TxReceipt { txHash: string; height: number; success: boolean; gasUsed: string; }
```

### `ISplitExecutor`（M3 出，M4 入）
```ts
interface ISplitExecutor {
  distribute(trace: CollaborationTrace, totalAmount: string, denom: string): Promise<DistributeResult>;
}
interface DistributeResult {
  txHash: string;
  splits: { archetype: Archetype; addr: string; amount: string; weight: number }[];
  totalDistributed: string;
}
```

### `POST /api/injective/run`（M4）
```ts
// 请求
{ goal: string; tier?: Tier; budgetAmount: string; budgetDenom: string; senderAddr: string; }
// 响应
{ content: string; trace: CollaborationTrace; payment: DistributeResult; }
```

---

## 6. 执行顺序（按 6/30 截止倒排）

| 优先级 | 模块 | 理由 |
|---|---|---|
| P0 | M6 文档 + M1 链层封装（mock 模式先行） | 文档先占坑提交用；M1 是所有链上功能的底座 |
| P0 | M2 分润合约（本地编译通过） | 技术亮点，Pitch Deck 要讲 |
| P1 | M4 路由 + M3 分润执行（接 M1 mock） | 串通主链路，能出 demo |
| P1 | M5 前端钱包页（连测试网） | demo 视频要拍 |
| P2 | M1 接 Injective 测试网真链 | 真链验证，加分项 |

**MVP 截止线**：P0+P1 跑通 = 有可演示的"链上分润蜂群"demo。
**6/30 提交所需**：GitHub 仓库（已有）+ Demo 视频（P0+P1 即可拍）+ Pitch Deck（M6）。

---

## 7. 新增技术文档清单

| 文档 | 内容 | 对应模块 |
|---|---|---|
| `00-OVERVIEW.md` | 本文件，总纲 | 全局 |
| `01-ARCHITECTURE.md` | 详细架构图 + 数据流 + 模块边界 | 全局 |
| `02-INJECTIVE-CHAIN-LAYER.md` | SDK 封装设计、测试网配置、mock 策略 | M1 |
| `03-SPLIT-REWARDS-CONTRACT.md` | CosmWasm 合约设计、消息、部署、测试 | M2 |
| `04-PAYER-AGENT.md` | payer/treasurer 角色定义、分润执行流程 | M3 |
| `05-API-CONTRACT.md` | 所有新增 API/接口契约（§5 详化） | M4 |
| `06-FRONTEND-WALLET.md` | 钱包连接、链上可视化设计 | M5 |
| `07-DEPLOYMENT.md` | 测试网部署、env 配置、运行步骤 | 全局 |
| `08-DEMO-SCRIPT.md` | ≤3 分钟 demo 视频分镜脚本 | 全局 |
| `09-PITCH-DECK-OUTLINE.md` | 路演简报大纲（7 维度） | 交付物 |
| `10-SUBMISSION-COPY.md` | 报名表单必填文案草稿 | 交付物 |

---

## 8. 与 Injective 评分维度的对齐

| 评分维度 | 本项目如何满足 |
|---|---|
| 创新性 | 蜂群协作 + 链上分润，"越用越聪明 × 越用越值钱"，Injective 生态首个 agent 分润协议 |
| 技术实现 | 集成 Injective 测试网 + CosmWasm 分润合约 + iAgent SDK；AI（蜂群）与链上（分润）深度结合 |
| 应用价值 | 解决 AI agent 协作的价值分配问题，可延伸到 agent 市场/外包/众包 |
| 产品体验 | 原有 Vue Flow 可视化 + 链上交易 timeline，agent 协作与资金流向都可视 |
| 生态契合度 | 复用 Injective iAgent SDK、CosmWasm、INJ 代币，天然契合 Injective 支付/agent 叙事 |
