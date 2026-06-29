# 03 · 链上分润合约设计（CosmWasm）

> Injective 原生支持 CosmWasm（Wasmvm）。合约用 Rust 写，编译成 `.wasm`，部署到 Injective 测试网。
> 这是本项目"AI 智能支付"方向的核心技术亮点：**一次链上调用，按权重原子分润给多个 agent 钱包**。

## 1. 为什么需要合约（而非多笔直接转账）

| 方式 | 优点 | 缺点 |
|---|---|---|
| 多笔 `sendTransfer` | 简单 | 非原子（中途失败会部分到账）；gas 高 |
| **CosmWasm 分润合约** | **原子性**（全成或全回滚）；单次 gas；可审计；可扩展（加质押/解锁/claim） | 需写+部署合约 |

demo 阶段两种都支持（`DistributeResult.mode`），合约路径为亮点展示。

## 2. 合约接口

### Instantiate
```rust
#[derive(Serialize, Deserialize)]
pub struct InstantiateMsg {
    pub protocol_fee_bps: u16,   // 协议服务费，基点，如 500 = 5%
    pub protocol_addr: String,   // 服务费接收地址（treasurer）
}
```

### Execute
```rust
pub enum ExecuteMsg {
    // 核心：按权重把 total 原子分发给 recipients
    Distribute {
        recipients: Vec<WeightRecipient>,  // [{addr, weight_bps}]，权重用基点，总和 10000
        denom: String,
    },
}
pub struct WeightRecipient {
    pub addr: String,
    pub weight_bps: u32,   // 0..=10000
}
// 调用时合约已持有 total（通过附带的 funds）；按 weight_bps 切分，扣 protocol_fee，逐个 transfer
```

### Query
```rust
pub enum QueryMsg {
    Config {},              // → { protocol_fee_bps, protocol_addr }
    LastDistribution {},    // → 最近一次分润记录（审计用）
}
```

## 3. 关键逻辑（伪代码）

```rust
fn execute_distribute(recipients, denom, info) {
    let total = info.funds.amount;          // 调用附带的总金额
    let cfg = CONFIG.load();
    let fee = total * cfg.protocol_fee_bps / 10000;
    send(fee → cfg.protocol_addr);          // 服务费给 treasurer

    let remainder = total - fee;
    for r in recipients {
        let share = remainder * r.weight_bps / 10000;
        send(share → r.addr);
    }
    // 最后一笔吃余数，避免精度损失：last += remainder - sum(已分)
    save LastDistribution { tx, recipients, amounts, ts };
}
```

**精度处理**：用基点（整数）而非浮点；最后一方吸收舍入误差，保证 `sum == remainder`。

## 4. 消费方（M3 split-executor）

```ts
// 把 trace.rewardSplit 的 weight(0-1 float) 转成 weight_bps(0-10000 int)
const recipients = trace.rewardSplit
  .filter(r => r.weight > 0)
  .map(r => ({ addr: ARCHETYPE_ADDR_MAP[r.archetype], weight_bps: Math.round(r.weight * 10000) }));

await chain.executeContract(senderAddr, SPLIT_CONTRACT_ADDR, {
  recipients, denom
});
// 调用时 sender 附带 budgetAmount 的 coins（由 chain 层组装 MsgExecuteContract + funds）
```

## 5. 目录结构
```
contracts/split-rewards/
  Cargo.toml
  src/lib.rs              合约主体
  src/state.rs            CONFIG / LAST_DISTRIBUTION 状态
  src/msg.rs              InstantiateMsg/ExecuteMsg/QueryMsg
  schema/                 JSON schema（cargo schema 生成）
  README.md               部署 + 测试说明
  scripts/
    deploy.sh             用 injectived 部署到测试网
    instantiate.sh
```

## 6. 本地编译与测试（M2 验收）

```bash
# 工具链（需装）
rustup target add wasm32-unknown-unknown
cargo install cargo-run-script

# 编译
cd contracts/split-rewards
cargo unit-test                  # 单测：分润数学、边界（0 权重、权重溢出、空列表）
cargo build --release --target wasm32-unknown-unknown
# 产物：target/wasm32-unknown-unknown/release/split_rewards.wasm
```

**验收标准**：
- [ ] `cargo unit-test` 全过
- [ ] 编译出 `.wasm`
- [ ] 单测覆盖：正常分润 / 服务费扣除 / 权重和=10000 / 空列表拒绝 / 精度无损耗
- [ ] README 写清部署到 Injective 测试网的命令

## 7. 测试网部署（P2，真链加分项）

```bash
# Injective 测试网 (dorado-1) 部署
injectived tx wasm store split_rewards.wasm --from $WALLET --chain-id dorado-1 --gas auto
# 拿到 code_id → 实例化 → 拿 contract_addr → 写入 .env: INJECTIVE_SPLIT_CONTRACT_ADDR
```

> MVP 不要求真部署：合约本地编译通过 + 单测通过即可作为技术亮点展示。
> 真链部署是 P2 加分项，时间够再做。
