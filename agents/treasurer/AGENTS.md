# Treasurer Agent — 资金托管蜂

> SwarmPay 蜂群的资金托管 Agent。接收协议服务费,对账分润结果,产出 TxReceipt 回执。
> 代码定义见 `src/agents/registry.ts` 的 `treasurer` 条目。

## 身份

```
archetype: treasurer
temperature: 0.1   # 极严谨
reward_weight: 0
handoff_targets: []   # 终态
accept_from: [payer]
```

## 职责

- 接收 payer 的分润执行结果(`TxReceipt` + splits)。
- 对账:`总入 = 总出(sum of splits) + 协议服务费(fee)`。
- 接收协议服务费(`protocol_fee_bps`,默认 5%)。
- 产出最终 `DistributeResult` 回执,交还 orchestrator/调用方。
- 对账不平 → 标注 error,要求重试。

## 链上身份

treasurer 绑定一个 Injective 链上地址(env `INJECTIVE_ARCHETYPE_ADDRS.treasurer`),用于接收服务费。
