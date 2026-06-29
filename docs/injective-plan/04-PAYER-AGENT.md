# 04 · Payer / Treasurer Agent 与分润执行（M3）

> 在原 5 角色基础上新增 2 个资金角色，并实现 `ISplitExecutor`（消费蜂群 trace，发起链上分润）。

## 1. 新增角色定义（追加，不改原 5 角色）

### 改动点 1：`src/agents/types.ts`
```ts
// 原：export type Archetype = "orchestrator" | "planner" | "coder" | "reviewer" | "explorer";
// 改为（纯追加两个联合成员）：
export type Archetype =
  | "orchestrator" | "planner" | "coder" | "reviewer" | "explorer"
  | "payer"      // 新增：发起链上支付/分润
  | "treasurer"; // 新增：资金托管、对账、协议服务费接收
```

### 改动点 2：`src/agents/registry.ts` `ARCHETYPE_DEFS` 追加 2 条
```ts
payer: {
  archetype: "payer",
  temperature: 0.2,              // 严谨，涉及资金
  rewardWeight: 0,               // 不参与答案分润
  handoffTargets: ["treasurer"],
  acceptFrom: ["orchestrator"],  // orchestrator 把 trace 交给它结算
  escalationPolicy: "supervisor",
  focus: "根据协作 trace 计算 agent 贡献权重并发起链上分润",
  persona: [
    "你是 SwarmPay 的付款 Agent。",
    "你接收 orchestrator 交来的协作 trace 与本次调用预算。",
    "你的职责：把预算按 rewardSplit 权重分配给参与 agent 的链上地址，",
    "决策走 CosmWasm 分润合约还是多笔直接转账，并产出可上链的分润指令。",
    "你不产出自然语言答案，只产出结构化 SplitInstruction。",
  ].join(""),
},
treasurer: {
  archetype: "treasurer",
  temperature: 0.1,
  rewardWeight: 0,
  handoffTargets: [],            // 终态：对账完成
  acceptFrom: ["payer"],
  escalationPolicy: "supervisor",
  focus: "接收协议服务费，对账分润结果，产出 TxReceipt 回执",
  persona: [
    "你是 SwarmPay 的资金托管 Agent。",
    "你接收 payer 的分润指令执行结果（TxReceipt），对账总入=总出+服务费，",
    "产出最终 DistributeResult 回执，交还 orchestrator。",
  ].join(""),
},
```

> 注意：`validateRewardSplit()`（registry.ts:130）原本校验 solvers 权重和 ≤ 0.85。
> payer/treasurer 的 rewardWeight=0，不影响该校验——确认追加后单测仍过。

## 2. 角色地址映射（ARCHETYPE_ADDR_MAP）

每个角色对应一个预设 Injective 测试网地址（env `INJECTIVE_ARCHETYPE_ADDRS` 注入）：
```json
{
  "orchestrator": "inj1...",
  "planner": "inj1...",
  "coder": "inj1...",
  "reviewer": "inj1...",
  "explorer": "inj1...",
  "treasurer": "inj1..."
}
```
> payer 不在分润接收方里（它只付款，不收自己），所以无 addr 或用 treasurer 兜底。

## 3. split-executor.ts —— ISplitExecutor 实现

```ts
// src/injective/split-executor.ts
export class SplitExecutor implements ISplitExecutor {
  constructor(private chain: IInjectiveChain, private cfg) {}

  async distribute(trace, totalAmount, denom, senderAddr): Promise<DistributeResult> {
    // 1. 取有效分润方（weight>0 且有地址）
    const splits = trace.rewardSplit
      .filter(r => r.weight > 0 && ARCHETYPE_ADDR_MAP[r.archetype])
      .map(r => ({
        archetype: r.archetype,
        addr: ARCHETYPE_ADDR_MAP[r.archetype],
        weight: r.weight,
        amount: floor(totalAmount * r.weight),   // 整数运算
      }));

    // 2. payer agent 决策 mode
    const mode = splits.length > 3 ? "contract" : "direct";

    // 3. 执行
    let receipt: TxReceipt;
    if (mode === "contract") {
      receipt = await this.chain.executeContract(senderAddr, this.cfg.splitContractAddr, {
        recipients: splits.map(s => ({ addr: s.addr, weight_bps: Math.round(s.weight * 10000) })),
        denom,
      });
    } else {
      // direct：逐笔 sendTransfer（demo 简化，实际可聚合）
      for (const s of splits) {
        await this.chain.sendTransfer(senderAddr, s.addr, s.amount, denom);
      }
      receipt = { txHash: `direct_${Date.now()}`, height: 0, success: true, gasUsed: "0", rawLog: "multi-transfer" };
    }

    return {
      txHash: receipt.txHash,
      mode, splits,
      totalDistributed: splits.reduce((a, s) => a + BigInt(s.amount), 0n).toString(),
      success: receipt.success,
      error: receipt.success ? undefined : receipt.rawLog,
    };
  }
}
```

## 4. payer-agent.ts —— 用 LLM 决策（可选增强）

`SplitExecutor` 是确定性逻辑。`payer-agent.ts` 增强点：让 payer 调一次 LLM，根据 trace 上下文**调整**权重（例如某 agent 触发了 breakthrough，权重上浮）——体现"AI agent 自主资金决策"。

```ts
// 简化：默认走确定性权重；payer agent 可对 breakthrough agent 加权
const adjusted = trace.rewardSplit.map(r => ({
  ...r,
  weight: r.weight * (wasBreakthrough(r.archetype, trace) ? 1.2 : 1.0),
}));
// 重新归一化使和=1
```

> MVP 可跳过 LLM 调用，纯确定性；Pitch Deck 里把"payer agent 可按贡献动态调权"作为进阶能力讲。

## 5. 协议服务费

总预算切出 `protocol_fee_bps`（默认 5%）给 treasurer，余下按 rewardSplit 分。合约版在合约里扣；direct 版在 split-executor 里先 `sendTransfer(fee → treasurer)`。

## 6. 验收标准（M3）
- [ ] `Archetype` 扩展后 `tsc --noEmit` 通过，原 `validateRewardSplit()` 仍过
- [ ] `SplitExecutor` 用 `MockChain` 跑通 distribute，返回合理 DistributeResult
- [ ] direct 模式与 contract 模式都能调（contract 模式 mock 返回假 txHash）
- [ ] payer/treasurer 的 AGENTS.md（`agents/payer/AGENTS.md`、`agents/treasurer/AGENTS.md`）写好
