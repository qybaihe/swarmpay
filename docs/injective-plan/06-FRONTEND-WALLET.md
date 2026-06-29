# 06 · 前端钱包与链上可视化（M5）

> 新增独立页面，不改原 PlaygroundView/ChatView。原 Vue Flow 编排可视化可复用为组件。

## 1. 新增文件
```
web/views/injective/
  WalletView.vue        Keplr 连接 + 余额展示 + 网络切换
  OnchainRunView.vue    链上版蜂群运行：输入 goal+预算 → 展示答案+trace+分润流向+交易回执
web/components/injective/
  SplitFlowGraph.vue    分润流向图（Sankey 或箭头列表）
  TxTimelineCard.vue    链上交易回执卡片（txHash + 浏览器链接 + 状态）
web/stores/injective.ts Pinia store：{ connected, address, balance, chainId }
web/router 追加路由     /wallet → WalletView，/onchain → OnchainRunView
导航入口                App 导航栏加"链上蜂群"入口
```

## 2. Keplr 集成

Injective 支持 Keplr 钱包。前端注入：
```ts
// web/stores/injective.ts
async connect() {
  await window.keplr.enable("dorado-1");
  const signer = window.getOfflineSigner("dorado-1");
  const accounts = await signer.getAccounts();
  this.address = accounts[0].address;
  this.connected = true;
  // 查余额：GET /api/injective/balance?addr=...&denom=inj
}
```

> MVP 阶段后端代签时，前端 Keplr 仅用于"展示用户地址"（可手动粘贴测试网地址），不强求签名。
> P2 切真 Keplr 签名流。

## 3. OnchainRunView 交互流

```
[ 连接钱包 / 粘贴测试网地址 ]      ← WalletView
         │
         ▼
[ 输入目标 goal ] [ 选 tier ] [ 预算: 5 INJ ]
         │   POST /api/injective/run
         ▼
┌────────────┬──────────────┬───────────────┐
│ 蜂群答案    │ 协作 trace   │ 分润流向图    │
│ (markdown) │ (Vue Flow    │ (SplitFlow    │
│            │  复用)       │  Graph)       │
└────────────┴──────────────┴───────────────┘
         │
         ▼
[ 交易回执 timeline ]  ← TxTimelineCard
  ✓ 余额校验  ✓ 蜂群执行  ✓ 链上分润 txHash:0x.. [浏览器查看]
```

## 4. 可视化亮点（评分"产品体验"维度）

- **分润流向图**：左中右三栏，左=用户预算，中=各 agent 节点（按权重粗细），右=各钱包。流动动画体现"资金按贡献分配"。
- **协作 trace 复用**：直接嵌入原 PlaygroundView 的 Vue Flow 画布，展示 planner→coder→reviewer 的 handoff 流。
- **交易回执卡片**：txHash 可点击跳 Injective 浏览器，增强可信度。
- **双视图对照**：可并排展示"积分模式 vs 链上模式"，直观体现升级。

## 5. 与后端契约
见 `05-API-CONTRACT.md` §3、§5。store 持有钱包态，OnchainRunView 发 `OnchainRunRequest`。

## 6. 验收标准（M5）
- [ ] WalletView 能连 Keplr（或粘贴地址）并显示余额
- [ ] OnchainRunView 能提交并渲染 OnchainRunResponse
- [ ] SplitFlowGraph 按 splits 渲染流向
- [ ] TxTimelineCard 展示 txHash + 浏览器链接
- [ ] 不改原 PlaygroundView/ChatView，`npm run build:web` 通过
- [ ] 后端用 mock 时前端也能完整走完流程（demo 不黑屏）
