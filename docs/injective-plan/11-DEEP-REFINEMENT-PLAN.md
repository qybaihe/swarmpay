# 11 · 深度融合改造实施计划 (SwarmPay 全站重塑 + Agent 经济体)

> 基于 3 份调研报告(Playground/credits/swarm 内核)写成。所有文件路径、行号、函数名均经核实。
> 决策已定:废除 credits 全用 INJ · LLM 决策悬赏 · 全站重塑 SwarmPay · 深度3 per-archetype 钱包。

---

## 0. 总目标

从"EvoShip + 贴链上皮"变成**真正的 SwarmPay agent 经济体**:
- 全站品牌/页面/叙事统一为 SwarmPay
- credits 废除,全用链上 INJ 付费
- Playground 画布实时显示金钱流动(节点地址+余额,边 INJ 流转,完成时金色分润箭头)
- 注册登录绑定 Injective 地址
- **深度3**:agent 持有自己钱包私钥,赚到 INJ 后由 LLM 决策悬赏其他 agent,真上链

---

## 1. 改造分四期(按依赖排序)

| 期 | 内容 | 依赖 | 风险 |
|---|---|---|---|
| **期1** | 品牌全站重塑 + 注册绑地址 + credits 废除改 INJ | 无(纯改现有代码) | 代签付费架构决策(见 §3) |
| **期2** | Playground 金钱流动可视化 | 期1(品牌)+ 后端 swarm/run 附带 payment | markRaw 响应式坑 |
| **期3** | LLM 动态 reward_split + agent 余额上链 | 期1 | LLM 输出稳定性 |
| **期4** | 深度3:per-archetype 钱包 + LLM 悬赏 | 期3 + pipeline 改造 | 改动最大,链上交易多 |

> 期1+期2 是"看得见的融合"(品牌+可视化),优先做完拍 demo。
> 期3+期4 是"AI×链上深度耦合"的技术亮点,做完 pitch deck 才硬。

---

## 2. 期1:品牌重塑 + 注册绑地址 + credits 废除

### 2.1 品牌全站重塑(EvoShip → SwarmPay)
散落 16+ 文件。统一替换:
- 项目名/标题/导航/footer:`EvoShip`→`SwarmPay`,`evo-bee`→`swarm-bee`(或保留 instanceId 前缀,只改展示文案)
- 首页 Hero(`web/components/HeroSection.vue`):叙事从"OpenAI 兼容端点"→"Injective 上的 AI agent 经济体"
- `package.json` name `swarm-endpoint`→`swarmpay`
- 文件:`web/components/{NavBar,HeroSection,DemoSection,AuthCard,SiteFooter,FleetPicker}.vue`、`web/views/{LoginView,ChatView,CommunityView,CommunityFleetView,PricingView}.vue`、`web/api/{endpoints,swarm}.ts`、`web/composables/useFlowRunner.ts`、`web/stores/transform.ts`

### 2.2 注册登录绑定 Injective 地址
- `src/auth.ts:107-113` users 建表加 `injective_address TEXT` 列
- `src/auth.ts:137-140` 迁移:把"补 credits 列"改成"补 injective_address 列"
- `src/auth.ts:13-19` AuthUser 接口:删 credits,加 `injective_address?: string`
- `src/auth.ts:143-159` createUser:注册时收集地址写入(前端 register body 加 `injective_address`)
- `web/api/auth.ts:47-60` registerAccount body 加 `injective_address`
- `web/components/AuthCard.vue:37-61` 注册表单加"Injective 地址"输入框(可粘贴或连 Keplr)
- 登录后 NavBar 显示链上地址 + INJ 余额(复用 `web/stores/injective.ts` 的 fetchBalance)

### 2.3 废除 credits 改链上 INJ 付费
**后端**:
- `src/auth.ts:200-232` 删 getCredits/deductCredits/addCredits/listTransactions;`credit_transactions` 表删或改 INJ 流水
- `src/auth.ts:126-134` 删 credit_transactions 建表
- `src/server.ts:319-324` `/v1/chat/completions` 余额校验:从 getCredits 改 `chain.getBalance(user.injective_address, "inj")`,402 type 改 `insufficient_balance`
- `src/server.ts:335` 扣减:从 deductCredits 改链上分润(调 SplitExecutor,后扣模式,复用 /api/injective/run 逻辑)
- `src/server.ts:402-419` `/api/playground/swarm/run` 同样改造
- `src/config.ts:61-62` signupCredits/callCostCredits → `callCostInj`(如 "50000000000000000" = 0.05 INJ)

**前端**:
- `web/views/CreditsView.vue` 整页改成"链上 INJ 钱包"页(或删,统一用 `/wallet`)
- `web/views/PricingView.vue` 套餐 credits 字段改 INJ 计价
- `web/components/NavBar.vue:91,103` 余额显示从 `auth.user.credits` 改 `useInjectiveStore().balance`
- `web/stores/playground.ts:80-94,295` + `PlaygroundView.vue:1132-1147` 飘字"积分 -50"→"INJ -x"
- `web/views/{ApiKeyView,DocsView}.vue` 文案"积分"→"INJ"
- `web/api/auth.ts` 删 CreditTransaction/CreditsInfo/fetchCredits

---

## 3. ⚠️ 期1 核心架构决策:付费签名模式

**问题**:现 `chain.ts` 是后端单一代签钱包(`INJECTIVE_DEMO_KEY`)。废除 credits 后,`/v1/chat/completions` 走链上付费,钱从哪出?

**三选一**(需用户拍板):

| 方案 | 说明 | 优缺 |
|---|---|---|
| **A. 后端代签(用户先充值)** | 用户向后端 demo 钱包充值,调用时代签扣 | 简单,但"用户的钱在后端钱包"不纯粹,demo 要先充值 |
| **B. 前端 Keplr 签名** | 用户连 Keplr,前端签名→后端 broadcast | 真正"用户自付",但 demo 要装 Keplr + 领测试币到用户地址 |
| **C. 混合(推荐)** | 注册绑地址;demo 默认后端代签(用后端钱包 gas);真链模式切 Keplr | demo 友好 + 真链可选 |

> **推荐 C**:demo 走后端代签(评委无需装钱包就能看),Pitch Deck 说明"生产用 Keplr 自签"。这与现有 `/api/injective/run` 的代签逻辑一致,改动最小。

---

## 4. 期2:Playground 金钱流动可视化

### 4.1 后端:swarm/run 响应附带 payment
- `src/server.ts:402-419` `/api/playground/swarm/run`:跑完 runSwarm 后,若用户有 injective_address 且配置了预算,追加调 SplitExecutor.distribute,响应加 `payment: {splits, txHash, ...}`
- `web/api/swarm.ts:199-202` SwarmResponse 加 `payment?: DistributeResult`
- 这样 Playground 拿到的 trace 自带真实分润数据(addr+amount),不用再发一次 /api/injective/run

### 4.2 前端:PetNode 节点显示链上信息
- `web/components/playground/PetNode.vue:8-21` PetNodeData 加 `injAddr?/injBalance?/earnedInj?`
- ⚠️ markRaw 坑:不存 node.data,改存 `store.nodeChainState[id]`(类似现有 `store.nodeState[id]`),PetNode 从 store 读,完全响应式
- `web/stores/playground.ts` 加 `nodeChainState: Record<nodeId, {addr, balance, earned}>`
- PetNode 模板(`:135` 后)加 `.onchain-bar`:显示 `shortAddr(addr)` + `X INJ` + `+earned`

### 4.3 前端:handoff 边显示 INJ 流转
- `web/views/PlaygroundView.vue:904-916` makeGraphEdge:分润类边(report/aggregate)label 改 `+X INJ`,金色 `#ffd23f`
- 或回放时 `useFlowRunner.ts:275-283` pulseCanvasEdge 临时改 label

### 4.4 前端:金色分润流向箭头 overlay(核心视觉)
- 新建 `web/components/playground/RewardFlowOverlay.vue`,抄 `SplitFlowGraph.vue:128-183` 的金色渐变+animateMotion 粒子
- 数据源:`payment.splits`;坐标:用 `document.querySelector('.vue-flow__node[data-id=...]')` 取节点屏幕坐标(现有 `handleExperienceFlow` 范式)
- 挂到 `PlaygroundView.vue:1393` ExperienceTreasure 旁
- 触发:`useFlowRunner.ts:551` 回放完后调新钩子 `onRewardDistributed(payment)`

---

## 5. 期3:LLM 动态 reward_split + agent 余额上链

### 5.1 agent 链上余额入身份
- `src/agents/types.ts:67-73` AgentState.stats 加 `onchainBalance?: string` + `walletAddr?: string`
- `src/agents/identity.ts:25-44` loadState 补默认值;`recordRun` 时刷新余额(调 chain.getBalance)
- 余额来源:`chain.getBalance(addrOf(arch), "inj")`(addrOf 在 split-executor.ts:40)

### 5.2 LLM 动态 reward_split
- `src/orchestration/orchestrator.ts:865-876` buildRewardSplit:从读 registry 静态权重 → 改调 LLM
- LLM 输入:各 agent 的 contribution + 余额 + successRate/breakthroughRate(identity.ts:79)
- LLM 输出:JSON 权重数组
- `src/injective/payer-agent.ts` payerDecide 保留为后置归一化兜底
- 复用现有 EvoMap 上游模型(evomap-gpt-5.5,已验证可用)

---

## 6. 期4:深度3 — per-archetype 钱包 + LLM 悬赏

### 6.1 数据结构
- `src/agents/types.ts` MessageIntent 加 `"bounty"`
- 新增 `BountyRequest` 接口(fromArch/toArch/amountSmallest/reason/difficultySignal/txHash/status)
- HandoffContext(`types.ts:126`)加 `bounty?: BountyRequest`
- AgentMessage.payload(`types.ts:97`)加 `bounty?`
- CollaborationTrace(`types.ts:149`)加 `bounties?: BountyRequest[]`
- `src/openai-types.ts:97` SwarmGraphEdge.kind 加 `"bounty"`(画布画悬赏边)

### 6.2 per-archetype 钱包(核心)
- `src/config.ts:104` archetypeAddrs 升级为 `archetypeWallets: Record<Archetype, {addr, keyHex}>`(私钥从 scripts/.swarmpay-wallets.json 注入 env)
- 新建 `src/injective/agent-wallet.ts`:封装 per-archetype signer,复用 chain.ts 的 signAndBroadcast 逻辑但 signer 按 arch 取
- `src/injective/types.ts` IInjectiveChain 加 `sendTransferFrom(arch, to, amount, denom)` 或新增 IAgentWallet 接口
- `src/injective/mock-chain.ts` 加 sendTransferFrom 返回 mockTx
- **关键**:分润(distribute)仍用代签钱包统一出钱;**悬赏(bounty)用发起方 agent 自己钱包签名**——这是 per-archetype 钱包的真正用途

### 6.3 LLM 悬赏决策
- 嵌入点:`src/orchestration/pipeline.ts:224` parseVerdict 后、REJECT 返工前
- 新建 `decideBounty(reviewerRes, coderRes, taskRef, reviewerBalance)`:轻量 LLM 调用(类似 orchestrator.ts:115 classifyDifficulty 模式)
- 输入:reviewer 审查内容 + coder 产出 + reviewer 当前链上余额
- 输出:`{shouldBounty, amount, reason, difficultySignal}`
- 若 shouldBounty,把 BountyRequest 挂到 `pipeline.ts:264-275` 的 reworkHandoff(复用 handoff 通道)

### 6.4 悬赏执行
- trace 收集 `bounties[]`,延后到 `src/injective/routes.ts` 分润阶段
- 新建 `BountyExecutor.execute(bounty)`:用 `agentWallets[bounty.fromArch]` 签名转账给 toArch 地址
- 前端画布画 bounty 边(金色虚线,标悬赏金额)

### 6.5 demo 演示闭环
跑一次任务 → 蜂群分润(agent 各自赚到 INJ)→ 下次任务 reviewer 觉得难 → LLM 决策悬赏 → reviewer 用自己赚的 INJ 悬赏 coder → 链上真实转账 → 闭环 agent 经济体

---

## 7. 执行顺序与时间预估(6/30 截止倒排)

| 顺序 | 期 | 预估 | 产出 |
|---|---|---|---|
| 1 | 期1 品牌重塑 | 2-3h | 全站 SwarmPay |
| 2 | 期1 credits 废除+注册绑地址 | 2-3h | 链上付费通 |
| 3 | 期2 Playground 金钱流动 | 3-4h | 画布看得到钱 |
| — | **里程碑:可拍 demo** | | 期1+期2 完即可拍基础 demo |
| 4 | 期3 LLM 动态分润 | 2h | AI 决策权重 |
| 5 | 期4 per-archetype 钱包 | 3-4h | agent 持钱包 |
| 6 | 期4 LLM 悬赏 | 3-4h | agent 自主花钱 |
| 7 | Demo 录制+Pitch Deck+表单 | 2h | 交付物 |

> 总计 ~20h。今天(6/29)通宵可完成期1-4 + 交付物,6/30 提交。

---

## 8. 风险与回退

| 风险 | 回退方案 |
|---|---|
| per-archetype 钱包改动大、链上交易多(gas 耗尽) | 期4 降级:悬赏仍走代签统一付款(期1 模式),只保留 LLM 决策 + trace 暴露 |
| LLM 权重输出不稳定 | buildRewardSplit 保留静态权重兜底,LLM 失败用 registry 默认 |
| Playground markRaw 响应式 | 用 store.nodeChainState 而非 node.data |
| 代签钱包 INJ 耗尽 | demo 前领足测试币;mock 模式兜底 |
| 真链 sendTransfer sequence 冲突 | 已有 3s 间隔方案(期2 沿用) |

---

## 9. 待用户最终确认

1. **§3 付费签名模式**:A/B/C 三选一(推荐 C 混合)
2. **期4 是否全做**:per-archetype 钱包改动最大,若时间紧可只做"LLM 悬赏决策+代签执行"(期4 降级版),仍能讲"agent 自主花钱"叙事
3. **执行节奏**:确认按 §7 顺序推进,还是调整优先级

> 确认后我按期1→期4 顺序开干,每期完成给你看进度。
