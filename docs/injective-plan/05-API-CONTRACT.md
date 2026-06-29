# 05 · API 与接口契约

> 本文件是并行模块间的"合同"。各模块按此实现，无需互读代码。
> TypeScript 接口定义同时落在 `src/injective/types.ts`（M1 负责）。

---

## 1. `IInjectiveChain` —— M1 出，M3/M4 入

```ts
// src/injective/types.ts

export interface Balance {
  amount: string;   // 最小单位字符串，避免精度丢失
  denom: string;    // "inj" / "peggy0x..." 等
}

export interface TxReceipt {
  txHash: string;
  height: number;
  success: boolean;
  gasUsed: string;
  rawLog?: string;
}

export interface SplitMsg {
  recipients: { addr: string; weight: number }[];  // weight 归一化到总和 1
  total: string;   // 最小单位字符串
  denom: string;
}

export interface IInjectiveChain {
  /** 查询某地址某 denom 余额 */
  getBalance(addr: string, denom: string): Promise<Balance>;
  /** 原生代币转账（INJ 等） */
  sendTransfer(from: string, to: string, amount: string, denom: string): Promise<TxReceipt>;
  /** 执行 CosmWasm 合约（分润合约） */
  executeContract(sender: string, contractAddr: string, msg: SplitMsg): Promise<TxReceipt>;
}
```

**实现**：`src/injective/chain.ts`（真链，用 `@injectivelabs/sdk-ts`）
**Mock**：`src/injective/mock-chain.ts`（返回假 txHash `mock_<rand>`，sleep 模拟延迟）

---

## 2. `ISplitExecutor` —— M3 出，M4 入

```ts
export interface SplitShare {
  archetype: Archetype;       // 扩展后含 payer/treasurer
  addr: string;               // 该角色对应的钱包地址（预设映射）
  amount: string;             // 实际分得（最小单位）
  weight: number;             // 原始权重
}

export interface DistributeResult {
  txHash: string;             // 分润交易 hash（合约执行或聚合转账）
  mode: "contract" | "direct"; // 走合约 or 多笔直接转账
  splits: SplitShare[];
  totalDistributed: string;
  success: boolean;
  error?: string;
}

export interface ISplitExecutor {
  distribute(
    trace: CollaborationTrace,   // 复用原 types.ts 的 trace
    totalAmount: string,
    denom: string,
    senderAddr: string
  ): Promise<DistributeResult>;
}
```

**实现**：`src/injective/split-executor.ts`
逻辑：
1. 从 `trace.rewardSplit` 取 `{archetype, weight}` 列表
2. 查 `ARCHETYPE_ADDR_MAP`（每个角色预设一个 Injective 测试网地址）得 addr
3. 权重归一化，`amount = total * weight`
4. payer agent 决策 mode：参与者 ≤3 → direct 多笔；>3 → contract 一次执行
5. 调 `IInjectiveChain` 执行，组装 `DistributeResult`

---

## 3. HTTP 路由 —— M4

挂在 `server.ts`：`app.use("/api/injective", injectiveRouter)`（纯追加一行）

### `POST /api/injective/run`
```ts
// 请求
interface OnchainRunRequest {
  goal: string;
  tier?: Tier;              // 默认 "swarm-evo"
  budgetAmount: string;     // 最小单位，如 "5000000000000000000" (5 INJ)
  budgetDenom: string;      // "inj"
  senderAddr: string;       // 用户 Injective 地址
  topology?: ChatCompletionRequest["x_playground_topology"]; // 可选自定义拓扑
}

// 200 响应
interface OnchainRunResponse {
  content: string;          // 蜂群最终答案
  trace: CollaborationTrace;
  payment: DistributeResult | null;  // budgetAmount=0 时 null
}

// 402 余额不足
{ error: { type: "insufficient_balance", have: string, need: string } }
// 401 未连钱包/签名失败
{ error: { type: "unauthorized", message: string } }
```

### `GET /api/injective/balance?addr=...&denom=inj`
```ts
{ amount: string; denom: string; }
```

### `GET /api/injective/status`
```ts
{ enabled: boolean; network: "testnet"|"mainnet"|"mock"; contractAddr: string|null; chainId: string; }
```

---

## 4. 原项目复用契约（只读，不改）

M4 调用原项目时遵守的现有签名（已核对）：

```ts
// src/swarm.ts —— 已有，零改动
runSwarm(opts: { tier: Tier; messages: ChatMessage[]; customTopology?: ... })
  : Promise<{ content: string; trace: CollaborationTrace }>

// src/auth.ts —— 已有，零改动（链上通道不复用，但对照其结构）
authStore.deductCredits(userId, amount, reason): { ok: boolean; balance: number }

// src/agents/types.ts —— 仅追加 Archetype 成员
type Archetype = "orchestrator"|"planner"|"coder"|"reviewer"|"explorer"
               | "payer" | "treasurer";   // ← 新增

// src/agents/registry.ts —— 仅追加 ARCHETYPE_DEFS 条目
// payer: rewardWeight 0, handoffTargets ["treasurer"], acceptFrom ["orchestrator"]
// treasurer: rewardWeight 0, handoffTargets [], acceptFrom ["payer"]
// （资金角色不参与答案贡献分润，其"报酬"由调用预算的服务费单独定义）
```

> 注：payer/treasurer 的 `rewardWeight` 设为 0，因为它们不参与"答案质量"分润；
> 它们的收益来自调用预算中预留的 **协议服务费**（如总预算的 5%），在 split-executor 里单独切出。

---

## 5. 前端 ↔ 后端契约 —— M5 ↔ M4

前端 `web/stores/injective.ts` 持有：
```ts
{ connected: boolean; address: string|null; balance: Balance|null; chainId: string|null }
```
`OnchainRunView` 提交 `OnchainRunRequest`，渲染 `OnchainRunResponse`：
- `trace` → 复用原 PlaygroundView 的 Vue Flow 渲染（抽公共组件或 iframe 复用）
- `payment.splits` → 新增"分润流向图"（Sankey 或箭头列表）
- `payment.txHash` → 链上交易 timeline 卡片 + 浏览器跳转链接
