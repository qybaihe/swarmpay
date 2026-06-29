# 12 · Playground 深度融合蜂群+链上 方案

> 目标:让 Playground 画布成为 SwarmPay 的主舞台 —— agent 节点带链上身份与余额、
> handoff 边实时标注 INJ 流转、任务完成时金色分润箭头从付款方流向各 agent、
> 悬赏发生时 reviewer→coder 画出 bounty 边。让"协作即结算"在画布上一眼可见。

## 现状(已建但未通)

| 已有 | 状态 | 缺口 |
|---|---|---|
| PetNode 能读 nodeChainState 显示地址/余额/earned | ✅ 组件就绪 | ❌ 没人正确写入(映射失败) |
| RewardFlowOverlay 金色箭头 | ✅ 组件就绪 | ❌ 用固定 LAYOUT 坐标,对不上画布节点 |
| onRewardDistributed 钩子 | ✅ 接通 | ❌ 只在回放结束触发,且 node↔archetype 找不到 |
| playground store nodeChainState | ✅ 就绪 | ❌ 运行前没初始化(节点创建时不带地址) |
| handoff 边 label | ✅ 有 kind | ❌ 没有 INJ 金额标注 |

## 核心缺口诊断

### 缺口1:节点↔archetype 映射失败
`useFlowRunner.ts:567` 用 `n?.data?.role === s.archetype || n?.id?.includes(s.archetype)` 找节点。
但画布节点 id = `pet-${seq}`(不含 archetype),`data.role` = petId(如 "claude")不是 archetype。
**结果**:payment.splits 写不进任何节点,PetNode 永远不显示链上信息。

**修复**:建立 archetype→canvasNodeId 的可靠映射。来源:后端 trace.graph.nodes 里有 `{archetype, instanceId}`,前端 `mapGraphNodesToCanvas` 已建 `graphNodeId→canvasId`。加一层 `archetype→canvasId`。

### 缺口2:RewardFlowOverlay 坐标不对
现用固定 `LAYOUT = {leftX:80, midX:250, rightX:470}`(抄 SplitFlowGraph 的独立三栏)。
但 Playground 是 Vue Flow 画布,节点位置是流式坐标。**金色箭头画在 overlay 里,对不上画布节点**。

**修复**:Overlay 改成读画布节点真实屏幕坐标(`document.querySelector('.vue-flow__node[data-id=...]')` 的 getBoundingClientRect,相对画布容器)。sender 锚点用画布左上角悬浮"🏦 付款方"。参考现有 `handleExperienceFlow` 的坐标取法(PlaygroundView.vue:1204)。

### 缺口3:handoff 边无金额
现在边 label = `edge.kind`(如 "handoff"/"report")。协作中看不到"这条流转值多少 INJ"。

**修复**:回放时,对 report/aggregate 类边(产出被采纳的)标注预估分润金额 `+X INJ`(按 reward_split 权重 × 预算算)。bounty 边标注悬赏金额。

### 缺口4:节点创建时不带链上身份
节点拖入/预设时 `makePetNode` 不写地址。运行前节点是"裸"的,看不到链上身份。

**修复**:`makePetNode` 按 role→archetype 映射,从 config(前端 injective store 或预设表)取地址写入 nodeChainState。运行前就能看到"这是 planner,地址 inj1xxx,余额 X"。

### 缺口5:悬赏(bounty)不可视
深度3 的 reviewer→coder 悬赏,trace 里有 `bounties[]`,但画布不画。

**修复**:trace.bounties 非空时,画一条 reviewer→coder 的金色虚线 bounty 边,标注悬赏金额 +理由。

## 改造方案(5 步)

### 步骤1:archetype↔canvasNode 可靠映射
- `web/composables/useFlowRunner.ts`:在 `mapGraphNodesToCanvas` 里同时建 `archetypeToCanvasId: Map<string,string>`
- 回放结束时用它写 nodeChainState(替代失败的 find)
- 暴露给 PlaygroundView 用

### 步骤2:节点创建时初始化链上身份
- `web/views/PlaygroundView.vue` `makePetNode`:按 role 推 archetype,调 `store.setNodeChainState(nodeId, {addr})` 写预设地址
- 前端预设地址表:从 `/api/injective/status` 或硬编码 6 个角色地址
- 运行前节点就显示"🔗 inj1xxx"(余额可运行时刷新)

### 步骤3:运行时刷新各节点链上余额
- 回放开始前,并发 fetch 各 archetype 地址余额,写 `nodeChainState[id].balance`
- 复用 `injective store.fetchBalance` 或直接 GET /api/injective/balance
- 余额显示在 PetNode(已有 `balanceInj` computed)

### 步骤4:RewardFlowOverlay 改用动态节点坐标
- `web/components/playground/RewardFlowOverlay.vue`:删固定 LAYOUT,改 props 接收 `{archetype, x, y}[]`(各 agent 节点屏幕坐标)
- PlaygroundView 在触发时算各节点坐标传入(用 getBoundingClientRect 相对画布)
- sender 锚点:画布左上角悬浮"🏦 付款方 {addr}"
- 金色箭头从 sender → 各 agent 节点中心,带金额标签

### 步骤5:handoff 边金额标注 + bounty 边
- `useFlowRunner.ts` 回放时:report/aggregate 边 label 加 `+X INJ`(按权重×预算)
- trace.bounties 非空时:画 reviewer→coder bounty 边(金色虚线 + 悬赏金额)
- 边的金额用 `baseUnitsToInj` 格式化

## 执行顺序

1. 步骤1+2(映射+初始化)→ 节点能显示链上身份 ← 最关键,先做
2. 步骤3(余额刷新)→ 节点显示真实余额
3. 步骤4(overlay 动态坐标)→ 金色箭头对齐节点
4. 步骤5(边金额+bounty)→ 协作过程可见金钱流转

每步做完 build:web 验证,最后跑一次真实任务看画布效果。

## 文件改动

| 文件 | 改动 |
|---|---|
| web/composables/useFlowRunner.ts | archetypeToCanvasId 映射 + 边金额标注 + bounty 边 |
| web/views/PlaygroundView.vue | makePetNode 初始化链上身份 + 余额刷新 + 算节点坐标传 overlay |
| web/components/playground/RewardFlowOverlay.vue | 改动态坐标 props |
| web/stores/playground.ts | (已就绪,可能加 archetypeToCanvasId 缓存) |
