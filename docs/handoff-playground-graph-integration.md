# EvoShip Playground 真实蜂群图谱联调交接提示词

项目根目录: `/Users/baihe/Documents/evomap`

你是下一个负责联调的前端/全栈线程。请先读完本文,再动代码。目标是把 Playground 从“调用真实蜂群后按 `bees[]` 近似回放”升级成“按后端返回的真实 `SwarmGraph` 直接渲染真实蜂群拓扑、连线和对话流”。

## 当前最新进展

后端真实蜂群图谱已经完成并推送到远端:

```text
commit: 56e6baf feat: add real swarm graph trace
branch: main
remote: origin/main
```

这次后端提交完成了:

1. `x_swarm_trace.graph` 已新增,并和旧字段兼容共存。
2. `SIMPLE / MEDIUM / HARD` 三档都会返回一致的图谱结构。
3. 每个真实 agent run 都有 `instanceId`,前端可以一只小人对应一个真实 agent instance。
4. HARD 多子任务会返回 `lanes`,每条 lane 里有自己的 planner/coder/reviewer 节点和边。
5. 边不再靠前端猜,后端已返回 `dispatch / handoff / feedback / report / aggregate / broadcast / inherit / backflow`。
6. `events[]` 有全局 `seq` 和 `ts`,可按顺序播放气泡、粒子和连线高亮。
7. 旧的 `bees[] / events[] / handoffs[] / subtasks[] / reward_split[]` 都保留,旧前端不会断。

提交前已验证:

```bash
npm run typecheck
npm run build:web
```

还跑过 mock shape test:

- SIMPLE: `你好` -> `graph.nodes.length === 1`,唯一节点是 `orchestrator`,无边。
- MEDIUM: `解释 7x8 为什么等于 56` -> 有 solver/reviewer/aggregate/report。
- HARD: `做一个带邮箱和密码校验的登录页应用` -> 有 lane,有 planner/coder/reviewer,有 handoff/report/inherit。

## 当前工作区注意事项

当前 `main` 已经和 `origin/main` 对齐,但工作区还有另一个线程留下的未提交改动。不要随手 revert,也不要把无关文件混进你自己的提交。

当前已知未提交/未跟踪文件包括:

```text
 M .gitignore
 M public/index.html
 M src/evomap.ts
 M src/server.ts
 M web/components/AuthCard.vue
 M web/components/DemoSection.vue
 M web/components/NavBar.vue
 M web/components/TransformSection.vue
 M web/router.ts
?? docs/playground-swarm-backend-contract.md
?? public/assets/index-Bgy0gJST.css
?? public/assets/index-CjkcDn_x.js
?? src/auth.ts
?? web/api/auth.ts
?? web/stores/auth.ts
```

这些多半来自 auth/frontend/build 线程,不是这次后端图谱提交的一部分。联调时如需改同一文件,先仔细读 diff,和已有改动一起工作,不要覆盖。

## 必读文件顺序

请按这个顺序读:

```text
docs/handoff-vue-playground.md
docs/handoff-playground-real-swarm.md
docs/playground-swarm-backend-contract.md        # 若存在,它是后端契约说明草稿
web/api/swarm.ts                                # 前端 trace/graph 类型已经更新
web/composables/useFlowRunner.ts                # 当前真实调用 + bees[] 回放逻辑
web/stores/playground.ts                        # Playground 运行态
web/views/PlaygroundView.vue                    # 页面、默认编队、运行栏
web/components/playground/PetNode.vue
web/components/playground/Sidebar.vue
web/constants/pets.ts
src/openai-types.ts                             # 后端 graph 类型源头
src/swarm.ts                                    # buildSwarmGraph() 的真实生成逻辑
src/orchestration/orchestrator.ts
src/orchestration/pipeline.ts
src/orchestration/handoff.ts
src/server.ts
```

注意: `docs/handoff-playground-real-swarm.md` 是旧交接,里面说 `useFlowRunner` 还是 mock,但当前前端已有部分真实调用能力。以本文和实际代码为准。

## 后端接口

Playground 继续调用 OpenAI 兼容入口:

```http
POST /v1/chat/completions
Authorization: Bearer eval
Content-Type: application/json

{
  "model": "swarm-baseline | swarm-lite | swarm-heavy | swarm-evo",
  "messages": [{ "role": "user", "content": "<goal>" }]
}
```

前端封装在:

```text
web/api/swarm.ts -> runSwarm({ goal, tier, apiKey? })
```

响应:

```ts
{
  choices: [{ message: { content: string } }],
  x_swarm_trace: SwarmTrace
}
```

当前 `runSwarm()` 已经返回:

```ts
{
  content: d.choices?.[0]?.message?.content || "(空)",
  trace: d.x_swarm_trace || null
}
```

## 新的核心数据契约

`web/api/swarm.ts` 和 `src/openai-types.ts` 已同步新增这些类型。前端联调优先消费 `trace.graph`,旧 `trace.bees` 只作为兜底。

```ts
interface SwarmTrace {
  tier: string;
  model: string;
  difficulty?: "SIMPLE" | "MEDIUM" | "HARD";
  policy?: ExecutionPolicyTrace;
  swarm_size: number;
  inherited_recipes?: { title: string; description?: string }[];
  graph?: SwarmGraph;
  subtasks?: { id: string; title: string; weight: number; status: string }[];
  handoffs?: Array<{
    from: string;
    to: string;
    fromInstanceId?: string;
    toInstanceId?: string;
    taskId: string;
    taskGoal: string;
    feedback?: string;
    revisionRound?: number;
    snippet: string;
  }>;
  reward_split?: { archetype: string; weight: number; contribution: string }[];
  events?: Array<...>;
  bees: SwarmBee[];
  breakthroughs_broadcast: number;
  aggregator: "vote" | "llm";
  evomap_backflow?: { status: "skipped" | "queued" | "published"; title?: string };
  total_latency_ms: number;
}
```

核心新增:

```ts
interface SwarmGraph {
  runId: string;
  difficulty: "SIMPLE" | "MEDIUM" | "HARD";
  tier: "swarm-baseline" | "swarm-lite" | "swarm-heavy" | "swarm-evo";
  policy: ExecutionPolicyTrace;
  nodes: SwarmGraphNode[];
  edges: SwarmGraphEdge[];
  events: SwarmGraphEvent[];
  lanes?: SwarmLane[];
  metrics?: {
    totalLatencyMs: number;
    agentRuns: number;
    handoffs: number;
    broadcasts: number;
    revisions: number;
    subtasks: number;
  };
}
```

节点:

```ts
interface SwarmGraphNode {
  id: string;          // 当前等于 instanceId,可直接作为渲染 key
  instanceId: string;  // evo-bee-coder-02
  archetype: "orchestrator" | "planner" | "coder" | "reviewer" | "explorer" | "evomap" | "system";
  label: string;       // Coder #2
  taskId?: string;
  laneId?: string;
  status: "pending" | "running" | "ran" | "approved" | "rejected" | "timed_out" | "skipped";
  role?: string;
  order: number;
  createdAtSeq: number;
}
```

边:

```ts
interface SwarmGraphEdge {
  id: string;
  source: string; // node id / instanceId
  target: string; // node id / instanceId
  kind: "dispatch" | "handoff" | "feedback" | "report" | "broadcast" | "aggregate" | "inherit" | "backflow";
  taskId?: string;
  laneId?: string;
  revisionRound?: number;
  status?: "sent" | "delivered" | "failed" | "skipped";
  label?: string;
  snippet?: string;
  seq: number;
}
```

事件:

```ts
interface SwarmGraphEvent {
  id: string;
  seq: number;
  ts: string;
  kind:
    | "classify"
    | "policy"
    | "inherit"
    | "decompose"
    | "agent_start"
    | "agent_result"
    | "handoff"
    | "broadcast"
    | "review_verdict"
    | "revision"
    | "report"
    | "aggregate"
    | "backflow";
  nodeId?: string;
  edgeId?: string;
  agent?: string;
  instanceId?: string;
  fromNodeId?: string;
  toNodeId?: string;
  taskId?: string;
  laneId?: string;
  phase?: string;
  status?: string;
  verdict?: "APPROVE" | "REJECT";
  revisionRound?: number;
  text?: string;        // 气泡短句优先用这个
  fullContent?: string; // 详情面板可用,不要塞进小气泡
  latencyMs?: number;
}
```

lane:

```ts
interface SwarmLane {
  id: string;
  taskId: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
  nodeIds: string[];
  edgeIds: string[];
}
```

## 三档图谱预期

### SIMPLE

请求示例: `你好`

预期:

- `difficulty === "SIMPLE"`
- `graph.nodes.length === 1`
- 唯一节点 `archetype === "orchestrator"`
- `graph.edges.length === 0`
- 事件包含 `classify / policy / agent_start / agent_result`

前端行为:

- 只渲染/高亮一个 orchestrator 小人。
- 不要凭默认编队伪造 planner/coder/reviewer。
- 如果画布上已经有多个用户自定义节点,可以只让映射到 orchestrator 的节点说话,其他节点保持 idle 或淡化。

### MEDIUM

请求示例: `解释 7x8 为什么等于 56`

预期:

- solver fan-out: planner/coder/explorer 取决于 policy。
- verifier: reviewer。
- aggregator: orchestrator。
- 边包含 `dispatch`, solver 到 reviewer 的 `handoff/report`, reviewer 到 orchestrator 的 `report`,以及 accepted output 到 orchestrator 的 `aggregate`。
- 如果分歧,会有 `feedback` 和 `revision`。

前端行为:

- 从 orchestrator 扇出粒子到 solver。
- solver 小人说自己的 `agent_result.text`。
- solver 汇入 reviewer。
- reviewer 说 `review_verdict` 或 `report`。
- 最后汇入 orchestrator 展示聚合。

### HARD

请求示例: `做一个带邮箱和密码校验的登录页应用`

预期:

- 至少一个 `graph.lanes[]`。
- 每条 lane 有独立 planner/coder/reviewer instance。
- `planner -> coder`、`coder -> reviewer` 是 `handoff`。
- reviewer 通过时有 `report` 到 orchestrator。
- accepted 输出会有 `aggregate` 到 orchestrator。
- `swarm-evo + HARD` 会出现 EvoMap 相关:
  - `inherit` event/edge: evomap -> orchestrator
  - `backflow` event/edge: orchestrator -> evomap,如果回流 queued/published/skipped 被记录

前端行为:

- 不要只画一条线。
- 按 `graph.lanes` 分 lane 布局或播放。
- reviewer reject 时,用 `feedback` 边画回边,并在 coder 上显示返工气泡。
- 多 lane 可以交错播放,第一版允许按 `graph.events.seq` 串行播放,但视觉上保留 lane 分组。

## 当前前端状态

当前前端已经有一版“真实调用 + bees 回放”的未提交实现:

```text
web/composables/useFlowRunner.ts
web/stores/playground.ts
web/views/PlaygroundView.vue
web/api/swarm.ts
```

已具备:

- `runSwarm({ goal, tier })` 调 `/v1/chat/completions`。
- `store.tier` 可选择 `swarm-baseline / swarm-lite / swarm-heavy / swarm-evo`。
- `store.mode` 有 `default / custom`。
- `loadDefaultFleet()` 会生成默认编队。
- 运行后展示最终答案。
- 目前按 `trace.bees[]` 映射到画布节点并播放气泡/粒子。
- 自定义拓扑有 topo sort,无边按节点顺序,有环退化为添加顺序。

主要缺口:

1. 还没用 `trace.graph` 自动生成真实节点数量。
2. 还没按 `graph.edges` 高亮真实协作边。
3. 还没按 `graph.events.seq` 精准播放。
4. HARD 多 lane 还没有真实 lane 视图或 lane 布局。
5. SIMPLE 时默认编队仍可能显示多节点,需要避免误导。
6. 自定义拓扑目前只是把真实 trace 映射到用户画布,不是后端按用户拓扑真实执行。这一点要在 UI 文案里讲清楚,不要暗示自定义拓扑已改变后端调度。

## 联调推荐实现方案

### 第一优先级:图谱驱动回放

修改 `web/composables/useFlowRunner.ts`:

1. 保留现有 `run()` 调后端逻辑。
2. 在 `replayTraceOnCanvas()` 里优先判断:

```ts
if (trace?.graph?.nodes?.length && trace.graph.events?.length) {
  await replayGraphOnCanvas(trace.graph, nodes, edges, content, token);
  return;
}
```

3. 旧的 `bees[]` 回放作为 fallback。

建议新增函数:

```ts
function mapGraphNodeToCanvasNode(
  graphNode: SwarmGraphNode,
  canvasNodes: FlowNode[],
  order: string[],
  mode: PlaygroundMode,
): string | null
```

映射规则:

- 默认模式:
  - 更推荐直接用 `graph.nodes` 生成/同步画布节点,保证真实有多少 instance 就画多少小人。
  - SIMPLE 只生成一个 orchestrator。
  - MEDIUM 按 fan-out/fan-in 布局。
  - HARD 按 lanes 布局。
- 自定义模式:
  - 优先匹配 `node.data.role === graphNode.archetype`。
  - 同角色多节点按拓扑顺序轮转。
  - `evomap` 可以映射到一个临时系统节点,或者在画布边缘显示 EvoMap badge。
  - 找不到角色时,按拓扑顺序兜底。

### 第二优先级:默认模式自动用 graph 重建画布

当前 `loadDefaultFleet()` 是固定 4 节点:

```text
orchestrator -> planner -> coder -> reviewer
```

但真实后端已经能告诉前端节点和边,所以默认模式运行后应根据 `trace.graph` 重建为真实图:

```ts
function syncDefaultCanvasFromGraph(graph: SwarmGraph): void
```

推荐布局:

- SIMPLE:
  - 一个 orchestrator 居中。
- MEDIUM:
  - orchestrator 左侧。
  - planner/coder/explorer 中间上/中/下。
  - reviewer 右中。
  - aggregate orchestrator 可以复用 orchestrator 节点或放到右侧 Queen,第一版复用也可以。
- HARD:
  - orchestrator 左侧。
  - 每个 `lane` 一行。
  - lane 内节点按 `createdAtSeq/order` 排列。
  - evomap 放最左上或右上。
  - backflow 边从 orchestrator 到 evomap。

宠物角色映射建议:

```ts
const ROLE_TO_DEFAULT_PET = {
  orchestrator: "claude",
  planner: "doubao",
  coder: "musk",
  reviewer: "conan",
  explorer: "einstein",
  evomap: "sam",     // 如果没有 evomap 专属节点,可先用 badge
  system: "claude",
};
```

不要把 Vue Flow 的 `Node`/`Edge` 泛型直接引入类型注解,旧文档里提过会触发 TS2589。继续用本地宽松接口或 `any[]`。

### 第三优先级:真实边播放

新增:

```ts
function getCanvasEdgeForGraphEdge(edge: SwarmGraphEdge): FlowEdge | undefined
```

播放事件时:

- `agent_start`:节点进入 active,气泡可以是 `${agent} start ${phase}`。
- `agent_result`:节点气泡显示 `event.text`,详情可放 `event.fullContent`。
- `handoff/report/aggregate/broadcast/revision/backflow/inherit`:根据 `event.edgeId` 找 graph edge,再映射到 canvas source/target,发粒子并高亮边。
- `review_verdict`:reviewer 气泡显示 `APPROVE/REJECT`,REJECT 用 error 或 warning 样式。

边颜色建议:

```text
dispatch  #3ae0ff
handoff   #5eead4
feedback  #ff5c7a
report    #a78bfa
aggregate #facc15
broadcast #ffb84d
inherit   #22c55e
backflow  #14b8a6
```

### 第四优先级:日志与答案面板

当前页面已有:

- `store.finalAnswer`
- `store.errorMsg`
- `store.lastTrace`
- `visibleTraceBees`
- trace stats
- policy chips

需要增强:

- 如果有 `trace.graph.metrics`,在面板显示:
  - agentRuns
  - handoffs
  - broadcasts
  - revisions
  - subtasks
- 如果有 `trace.graph.lanes`,展示 lane 数和每条 lane title。
- mini trace 不要只显示 `bees[]`,改为显示 `graph.events` 前几条。

## 后端实现细节,方便排查

后端核心文件:

```text
src/swarm.ts
  buildSwarmGraph()
  runSwarm()

src/openai-types.ts
  SwarmGraph / SwarmGraphNode / SwarmGraphEdge / SwarmGraphEvent / SwarmLane

src/orchestration/orchestrator.ts
  classifyDifficulty()
  decomposeGoal()
  divergeOnly()
  aggregate()

src/orchestration/pipeline.ts
  runSubtaskPipeline()
  planner -> coder -> reviewer -> feedback loop

src/orchestration/handoff.ts
  HandoffContext now has fromInstanceId/toInstanceId
```

重要行为:

- `runSwarm()` 构造 `trace.graph` 后,再把 `graph.events` 映射回旧 `trace.events`。
- `trace.swarm_size` 现在按 graph 中非 evomap/system 节点数算。
- `bees[]` 仍由 `visibleStages` 生成,所以它是兼容层,不是最完整拓扑。
- `MEDIUM` 当前会有一条 solver group handoff 到 reviewer,同时也会生成 dispatch/aggregate/report 边。
- `HARD` 的 local mock 分解可能退化为 1 个子任务,真实模型下通常会有更多 lane。

## 本地联调命令

安装依赖已存在时:

```bash
npm run typecheck
npm run build:web
```

启动本地服务:

```bash
OPENAI_BASE_URL= OPENAI_API_KEY= ADAPTER_MODE=local EVOMAP_PUBLISH_BACKFLOW=false PORT=4012 npm run start
```

直接 curl 看 graph:

```bash
curl -s http://localhost:4012/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer eval' \
  -d '{"model":"swarm-evo","messages":[{"role":"user","content":"做一个带邮箱和密码校验的登录页应用"}]}' \
| node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); const t=j.x_swarm_trace; console.log(JSON.stringify({difficulty:t.difficulty, policy:t.policy, graph:t.graph}, null, 2));})'
```

快速 shape test:

```bash
OPENAI_BASE_URL= OPENAI_API_KEY= ADAPTER_MODE=local EVOMAP_PUBLISH_BACKFLOW=false npx tsx -e "import assert from 'node:assert/strict'; import { runSwarm } from './src/swarm.ts'; (async () => { const simple = (await runSwarm({ tier: 'swarm-heavy', messages: [{ role: 'user', content: '你好' }] })).trace; assert.equal(simple.difficulty, 'SIMPLE'); assert.equal(simple.graph?.nodes.length, 1); assert.equal(simple.graph?.edges.length, 0); const medium = (await runSwarm({ tier: 'swarm-heavy', messages: [{ role: 'user', content: '解释 7x8 为什么等于 56' }] })).trace; assert.equal(medium.difficulty, 'MEDIUM'); assert.ok(medium.graph?.nodes.some(n => n.archetype === 'reviewer')); assert.ok(medium.graph?.edges.some(e => e.kind === 'report')); const hard = (await runSwarm({ tier: 'swarm-evo', messages: [{ role: 'user', content: '做一个带邮箱和密码校验的登录页应用' }] })).trace; assert.equal(hard.difficulty, 'HARD'); assert.ok((hard.graph?.lanes?.length || 0) >= 1); assert.ok(hard.graph?.edges.some(e => e.kind === 'handoff')); assert.ok(hard.graph?.edges.some(e => e.kind === 'report')); assert.ok(hard.graph?.events.some(e => e.kind === 'inherit')); console.log('graph shape ok'); })();"
```

## 验收标准

后续线程完成后至少验证:

1. `/playground` 打开后有默认编队。
2. SIMPLE 请求 `你好`:
   - 后端返回 1 个 orchestrator 节点。
   - 前端不要播放 planner/coder/reviewer。
3. MEDIUM 请求 `解释 7x8 为什么等于 56`:
   - 前端能看到 solver fan-out、reviewer、report/aggregate 汇入。
4. HARD 请求 `做一个带邮箱和密码校验的登录页应用`:
   - 前端能看到 lane,planner/coder/reviewer,并沿真实 handoff 边传递。
5. `swarm-evo + HARD`:
   - 能显示 inherit/backflow 的节点或 badge/边/日志。
6. 自定义模式:
   - 用户拖节点/连线后,仍然调用真实后端。
   - 回放优先把 graph node 映射到用户自定义节点。
   - UI 明确表达“自定义拓扑用于可视化映射”,除非你真的实现了后端按拓扑执行。
7. 最终答案在页面内可见。
8. `npm run typecheck` 通过。
9. `npm run build:web` 通过。

## 建议提交边界

建议你的提交只包含 Playground 联调相关:

```text
web/composables/useFlowRunner.ts
web/views/PlaygroundView.vue
web/stores/playground.ts
web/api/swarm.ts              # 如只补类型/使用 graph
web/components/playground/*   # 如需要边/气泡状态小改
docs/handoff-playground-graph-integration.md
```

不要把 auth、NavBar、TransformSection、public build hash 等无关改动混进同一个提交。若 `npm run build:web` 改了 `public/index.html` 和 hash assets,先确认这些 build 产物是否应该提交;当前仓库已有未提交 build 产物,很容易混入别的线程工作。

## 最重要的一句话

后端现在已经能返回真实蜂群运行图谱。下一步不是再让前端从 `bees[]` 猜拓扑,而是把 Playground 的小人、连线、气泡、lane 和日志全部改成优先消费 `x_swarm_trace.graph.nodes / graph.edges / graph.events / graph.lanes`。`bees[]` 只保留为旧兼容 fallback。

