# ⛓️ SwarmPay — Injective 上的自进蜂群 × 链上分润 Agent 协议

> **一支在 Injective 链上自主协作、按贡献链上分润的 AI 蜂群舰队。**
>
> 用户下目标 → 蜂群 agent 分工协作(planner→coder→reviewer,handoff + 突破广播 + 经验继承)→
> 协作完成时,由 **payer agent 按各角色贡献权重,通过 Injective 链上真实交易把预算分润给参与 agent 的钱包**。
>
> "越用越聪明"的经验继承 + "越用越值钱"的链上分润。

**Injective 新星计划** 参赛项目 · 方向:**AI 智能支付**(主) + **智能体基础设施**(辅)

---

## 🎯 这是什么 / 解决什么问题

AI agent 协作目前是个**价值黑箱**:多个 agent 一起完成任务,但谁贡献多少?怎么结算?无链上凭证、不可审计、无法激励长尾 agent。

SwarmPay 的回答:**把蜂群协作的"贡献权重"直接落到 Injective 链上分润**。

- 一次任务 = 一支角色化蜂群协作(orchestrator 规划、planner 拆解、coder 实现、reviewer 审查、explorer 发散)
- 任务完成 → `payer` agent 读取协作 trace 里的 `reward_split` 权重
- → 通过 **Injective 链上真实交易**(或 CosmWasm 分润合约)把预算按权重原子分发给各 agent 钱包
- → 每笔分润上链存证,Injective 浏览器可审计

---

## ✅ 已验证的真实能力(非 mock)

| 能力 | 状态 | 证据 |
|---|---|---|
| 多 Agent 蜂群协作(自研框架) | ✅ | 5 角色六阶段、handoff、突破广播、经验继承回流;真实 LLM(evomap-gpt-5.5) |
| Injective 测试网(injective-888)连通 | ✅ | SDK 查询真实地址余额 |
| 链上真实转账 `MsgSend` | ✅ | [tx 9477EC31](https://testnet.explorer.injective.network/transaction/9477EC31F870FFD079D65B0D863174DBBF281445F74CACB16AB21C6215416077) 0.1 INJ 上链 |
| 全真链分润 `/api/injective/run` | ✅ | 一次调用:蜂群答案 + 5 笔链上分润交易,4 个 agent + treasurer 按权重真实收到 INJ |
| CosmWasm 分润合约 | ✅ | 16 单测过、wasm 编译成功(302K),可部署 |
| 前端钱包 + 链上可视化 | ✅ | Keplr 连接 / 分润流向图 / 交易回执 timeline,`build:web` 通过 |

**最近一次全真链运行**(Injective testnet):
- 蜂群答案:真实生成
- 分润:planner 0.2 / coder 0.3 / reviewer 0.2 / orchestrator 0.15,5% 服务费给 treasurer
- 各 agent 钱包余额真实增加,对账平衡

---

## 🏗️ 架构(加法式,不破坏原 EvoShip 服务)

```
用户(连 Keplr / 粘贴测试网地址)
   │  自然语言目标 + 链上预算
   ▼
POST /api/injective/run                  ← src/injective/routes.ts
   1. 链上余额校验(代签钱包)              ← chain.getBalance
   2. runSwarm() ← 原蜂群内核,零改动       ← src/swarm.ts
   3. payer agent 决策权重                 ← payer-agent.ts
   4. split-executor 链上分润              ← split-executor.ts
      · direct 模式:多笔 MsgSend
      · contract 模式:CosmWasm Distribute
   5. 返回 答案 + trace + 链上交易回执
```

**双通道**:原 EvoShip 的积分通道(`/v1/chat/completions` + credits)**完全保留**;新增 Injective 链上通道(`/api/injective/*`)与之并行,由 `INJECTIVE_NETWORK=mock|testnet` 切换,默认 mock 永不黑屏。

---

## 📁 关键目录

```
src/injective/              链上通道(新增,全部隔离于此)
  types.ts                  IInjectiveChain / ISplitExecutor 接口契约
  chain.ts                  真链实现(@injectivelabs/sdk-ts,signHashed 签名)
  mock-chain.ts             mock 兜底(无测试网时)
  split-executor.ts         消费 trace.reward_split → 链上分润
  payer-agent.ts            payer agent 动态调权
  routes.ts                 /api/injective/run|balance|status
  index.ts                  链层工厂
contracts/split-rewards/    CosmWasm 分润合约(16 单测 + wasm)
  src/lib.rs                Distribute 按基点原子分润 + 服务费
agents/payer|treasurer/     资金角色定义
web/views/injective/        WalletView + OnchainRunView
web/components/injective/   SplitFlowGraph + TxTimelineCard
docs/injective-plan/        11 份完整改造方案文档
```

---

## 🚀 快速运行

```bash
npm install

# mock 模式(无需测试网,demo 兜底)
INJECTIVE_NETWORK=mock npm run dev          # 后端 :4000
npm run dev:web                              # 前端

# testnet 真链模式(需 .env 配 INJECTIVE_DEMO_KEY + ARCHETYPE_ADDRS)
INJECTIVE_NETWORK=testnet npm run start

# 冒烟测试
npx tsx scripts/smoke-injective.ts

# 真链转账验证
INJECTIVE_NETWORK=testnet npx tsx scripts/test-real-transfer.ts
```

环境变量见 [`docs/injective-plan/07-DEPLOYMENT.md`](docs/injective-plan/07-DEPLOYMENT.md)。
测试网钱包生成:`npx tsx scripts/gen-injective-wallets.ts`(领币:https://testnet.faucet.injective.network)。

---

## 🧩 蜂群协作内核(继承自 EvoShip)

SwarmPay 的 AI 协作底座是 EvoShip 蜂群引擎(零改动复用):

- **5 角色异构分工**:orchestrator(蜂后,拆解聚合)→ planner(规划)→ coder(实现)→ reviewer(审查,可返工)→ explorer(创意发散)
- **六阶段协作流**:inherit(继承)→ diverge(分工)→ breakthrough-detect(突破检测)→ broadcast(广播)→ converge(收敛)→ backflow(回流)
- **经验宝箱**:成功路径沉淀为可复用经验,跨轮累积,越用越聪明
- **OpenAI 兼容**:对外是 `/v1/chat/completions`,任何 OpenAI 客户端可直接接入

SwarmPay 在此基础上新增 **payer / treasurer** 两个资金角色,把"协作产出"转化为"链上可分配价值"。

---

## 📊 评分维度对齐

| Injective 评分维度 | SwarmPay 如何满足 |
|---|---|
| 创新性 | 蜂群协作 + 链上分润,"越用越聪明 × 越用越值钱",Injective 生态首个 agent 分润协议 |
| 技术实现 | 集成 Injective testnet + CosmWasm 分润合约 + sdk-ts;AI(蜂群)与链上(分润)深度结合,全真链验证 |
| 应用价值 | 解决 agent 协作的价值分配黑箱,可延伸到 agent 市场/众包/外包结算 |
| 产品体验 | Vue Flow 协作可视化 + 分润流向图 + 交易 timeline,agent 协作与资金流向都可视 |
| 生态契合 | 复用 Injective sdk-ts / CosmWasm / INJ,对齐 iAgent SDK 与 MCP Server 叙事 |

---

## 📚 文档

完整设计与改造方案见 [`docs/injective-plan/`](docs/injective-plan/README.md)(11 份):总纲、架构、链层、合约、payer agent、API 契约、前端、部署、Demo 脚本、Pitch Deck 大纲、报名表单文案。

---

## License

MIT
