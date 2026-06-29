# Playground 真实蜂群后端对接契约

> 目的:把 `/playground` 的可视化行为对齐到后端真实执行链路。前端不应只按 `model=tier` 播一段线性动画,而应消费后端的 `difficulty`、`policy`、`bees.phase`、`handoffs`、`subtasks` 等协作事实。

## 入口总览

前端运行按钮调用:

```http
POST /v1/chat/completions
Authorization: Bearer eval
Content-Type: application/json

{
  "model": "swarm-lite | swarm-heavy | swarm-evo | swarm-baseline",
  "messages": [{ "role": "user", "content": "<goal>" }]
}
```

服务端入口:

```text
src/server.ts
  POST /v1/chat/completions
    -> src/swarm.ts runSwarm({ tier, messages })
       -> baseline 或 orchestrate
       -> OpenAI-compatible response + x_swarm_trace
```

响应主体仍是 OpenAI 兼容:

```ts
choices[0].message.content // 最终答案
x_swarm_trace              // Playground 应消费的可视化 trace
```

## 两层路由:Model 档位 × Difficulty 三档

后端不是简单的三档 model。真实决策有两层:

1. `model/tier`:用户选择的运行强度和是否接入 EvoMap。
2. `difficulty`:后端根据目标内容判定 `SIMPLE | MEDIUM | HARD`,决定实际协作流程。

### Model 档位

| tier | 后端含义 | 是否进 orchestrator | 平台副作用 | 继承/回流 |
|---|---|---:|---:|---:|
| `swarm-baseline` | 单模型直通基线 | 否 | 否 | 否 |
| `swarm-lite` | 轻量蜂群,降低 solver/子任务/返工 | 是 | 否,本地/无操作 | 否 |
| `swarm-heavy` | 标准异构蜂群,A2A session + handoff/broadcast/result | 是 | 是 | 否 |
| `swarm-evo` | heavy + HARD 时 EvoMap 经验继承和成功路径回流 | 是 | 是 | HARD 才是 |

### Difficulty 判定

实现位置: `src/orchestration/orchestrator.ts classifyDifficulty()`

判定顺序:

1. 规则判定:
   - `SIMPLE`:短问候/闲聊,如 `你好`、`hi`、`谢谢`。
   - `HARD`:写/做/开发/搭建/实现应用、网站、系统、平台、全栈、工具、自动化、调研等多步骤目标。
   - `MEDIUM`:数学、事实问答、翻译、解释、总结、单一明确问题。
2. 规则未命中时,调用 LLM 分类器,超时 10s。
3. 分类器超时/空响应时,兜底 `MEDIUM`。

## ExecutionPolicy

非 baseline 请求都会生成 `policy` 并返回到 `x_swarm_trace.policy`。

```ts
interface ExecutionPolicy {
  tier: string;
  difficulty: "SIMPLE" | "MEDIUM" | "HARD";
  createSession: boolean;
  useInheritance: boolean;
  publishBackflow: boolean;
  mediumSolverCount: number;
  hardMaxSubtasks: number;
  hardConcurrency: number;
  maxRevisionRounds: number;
}
```

当前策略矩阵:

| difficulty | lite | heavy | evo |
|---|---|---|---|
| SIMPLE | 直通 orchestrator 单次回复; no session | 同左 | 同左 |
| MEDIUM | 2 solver + reviewer verifier; no platform side effects; max 1 revision | 3 solver + reviewer verifier; A2A session/intents/results; max config revision | 同 heavy,但 MEDIUM 不继承/不回流 |
| HARD | 最多 2 子任务; concurrency=1; planner→coder→reviewer; max 1 revision; no platform side effects | 最多 4 子任务; concurrency=2; A2A session + handoff/broadcast/result; max config revision | 同 heavy + 继承 assets/search + 回流 publish queued |

## 三档 Difficulty 的真实链路

### SIMPLE

触发:问候、极简常识、短闲聊。

链路:

```text
classifyDifficulty -> SIMPLE
buildExecutionPolicy
skip inheritance
callAgent(orchestrator)
recordRun(orchestrator)
return finalContent
```

协作特点:

- 不创建 EvoMap A2A session。
- 不拆子任务。
- 不跑 planner/coder/reviewer。
- `trace.stages` 只有一条:

```ts
{
  phase: "aggregate",
  agent: "orchestrator",
  message: "直通回复",
  latencyMs: number
}
```

前端可视化建议:

- 只让 orchestrator 节点说话。
- 若用户画了多节点拓扑,其他节点可以淡化或显示“本轮被策略跳过”。
- 不应强行播放 planner/coder/reviewer,否则会误导。

### MEDIUM

触发:数学/事实/单一明确任务。

链路:

```text
classifyDifficulty -> MEDIUM
buildExecutionPolicy
skip inheritance
optional beginSession(policy.createSession)
divergeOnly:
  solverResults = parallel planner/coder/(explorer) standalone agents
  each solver:
    declareIntent("claim") if platform on
    callAgent(role)
    recordRun(role)
    if breakthrough -> broadcastBreakthrough
  handoff solver group -> reviewer
  reviewer verifies all solver answers
  if disagreement and revision allowed:
    handoff reviewer -> coder with feedback
    coder reruns
aggregate(all accepted solver + verifier results)
optional aggregate breakthrough broadcast
return finalContent
```

角色:

- solver 1: `planner`
- solver 2: `coder`
- solver 3: `explorer` only when `mediumSolverCount >= 3`
- verifier: `reviewer`
- aggregator: `orchestrator`

平台消息:

- heavy/evo: `beginSession`, `swarm/intent`, `session/message` handoff, `swarm/result`, breakthrough broadcast。
- lite:这些平台副作用关闭,只记录本地/跳过。

典型 `trace.stages`:

```text
implement planner   // 独立求解
implement coder     // 独立求解
implement explorer  // heavy/evo 通常有
review reviewer     // 交叉核对
implement coder     // 仅分歧返工时出现
aggregate orchestrator
```

前端可视化建议:

- MEDIUM 不是严格线性 DAG,而是并行 fan-out/fan-in:

```text
orchestrator
  ├─ planner
  ├─ coder
  └─ explorer(optional)
        ↓
reviewer/verifier
        ↓
orchestrator aggregate
```

- 如果用户画自定义拓扑,应优先把同角色节点映射到对应 bee;无对应角色时用拓扑顺序兜底。
- 多个 solver 的粒子应从 orchestrator 或起始节点并行发出,再汇聚到 reviewer。

### HARD

触发:完整应用/多组件/多步骤调研/工程修改/开放复杂任务。

链路:

```text
classifyDifficulty -> HARD
buildExecutionPolicy
if policy.useInheritance:
  evomap.searchRecipes(goal, 4)
  renderInheritance -> 注入 agent system prompt
if policy.createSession:
  beginSession(goal)
decomposeGoal:
  callAgent(orchestrator) -> JSON subtask[]
  parse/limit subtasks
  proposeDecomposition(goal, subtasks)
for each subtask, with mapLimit(concurrency):
  runSubtaskPipeline:
    planner callAgent -> plan
    handoff planner -> coder
    coder callAgent -> implementation
    loop:
      handoff coder -> reviewer
      reviewer callAgent -> verdict
      if APPROVE: report to orchestrator, accept coder output
      if REJECT and rounds remain:
        handoff reviewer -> coder(feedback)
        coder reruns
      else: force accept
aggregate(all accepted coder outputs)
if policy.publishBackflow:
  async evomap.publishRecipeDraft(Gene+Capsule)
return finalContent
```

HARD 的复杂点:

- 子任务数由 LLM 拆解,并受 `hardMaxSubtasks` 限制。
- `swarm-heavy/evo` 下子任务可并发执行,`hardConcurrency=2`。
- 每个子任务内部是 `planner -> coder -> reviewer -> coder? -> reviewer?`。
- reviewer 的输出必须包含 verdict;解析失败默认 APPROVE。
- 回流是异步 queued,不会阻塞主响应。

典型 `trace.stages`:

```text
decompose orchestrator
plan planner
implement coder
review reviewer
implement coder      // optional revision
review reviewer      // optional revision review
plan planner         // 第二个并发子任务可能穿插出现
implement coder
review reviewer
aggregate orchestrator
```

前端可视化建议:

- HARD 不应只画一条线。更准确的画法是:
  - 顶层:orchestrator 拆解出多个 subtask lane。
  - 每条 lane:planner → coder → reviewer,返工时 reviewer → coder 回边。
  - 多 lane 可同时亮起,因为后端 `hardConcurrency` 允许并发。
  - 最后所有 reviewer/coder accepted 输出汇聚到 orchestrator aggregate。
- 若 Playground 当前只支持节点画布,至少要把同一角色的多次 stage 作为同一节点多轮发言,并在日志里保留 phase 顺序。

## Agent 之间的消息

所有 agent 间通信使用 GEP-A2A 信封:

```ts
interface AgentMessage {
  protocol: "gep-a2a";
  protocol_version: "1.0.0";
  message_type: "dialog" | "report" | "decision";
  message_id: string;
  sender_id: string;
  timestamp: string;
  payload: {
    intent: "claim" | "handoff" | "breakthrough" | "report" | "escalate" | "vote" | "approval";
    to?: string;
    task?: TaskRef;
    context_blob?: string;
    feedback?: string;
    verdict?: "APPROVE" | "REJECT";
    hint?: string;
  };
}
```

当前内部 trace 记录:

- `CollaborationTrace.handoffs[]`:保存 `from/to/task/blob/feedback/revisionRound`。
- `CollaborationTrace.stages[]`:保存可播放阶段摘要。
- `x_swarm_trace.bees[]`:由 `stages[]` 映射出来,是目前前端可直接消费的主要事件流。

已暴露给前端:

- `x_swarm_trace.subtasks[]`
- `x_swarm_trace.handoffs[]`
- `x_swarm_trace.reward_split[]`
- `x_swarm_trace.events[]`

注意:

- `events[]` 已包含 stage events 和 handoff events,但 handoff 与 stage 的精确时间 interleave 仍是粗粒度;若要做毫秒级重放,后续应在 `CollaborationTrace` 内记录统一 `ts/seq`。

## 当前 x_swarm_trace 结构

```ts
interface SwarmTrace {
  tier: string;
  model: string;
  difficulty?: "SIMPLE" | "MEDIUM" | "HARD";
  policy?: ExecutionPolicy;
  swarm_size: number;
  inherited_recipes?: { title: string; description?: string }[];
  bees: Array<{
    id: string;
    variant: "orchestrator" | "planner" | "coder" | "reviewer" | "explorer" | string;
    agent?: string;
    phase?: "decompose" | "plan" | "implement" | "review" | "aggregate" | string;
    status: "ran" | "breakthrough" | "hinted" | "timed_out";
    latency_ms: number;
    snippet: string;
  }>;
  breakthroughs_broadcast: number;
  aggregator: "vote" | "llm";
  evomap_backflow?: { status: "skipped" | "queued" | "published"; title?: string };
  total_latency_ms: number;
}
```

## 前端对接原则

1. 先按 `trace.difficulty` 选择播放模板。
2. 再按 `trace.policy` 调整展示:
   - `createSession`:显示 A2A session/平台副作用是否开启。
   - `useInheritance`:显示继承经验节点或 badge。
   - `publishBackflow`:显示回流 queued/published。
   - `mediumSolverCount`:MEDIUM solver 扇出数量。
   - `hardMaxSubtasks/hardConcurrency`:HARD lane 数与并发提示。
   - `maxRevisionRounds`:允许 reviewer→coder 回边次数。
3. 节点映射优先级:
   - `bee.variant`/`bee.agent` 匹配 `node.data.role`。
   - 同角色多节点时按拓扑顺序轮转。
   - 无匹配时按当前用户拓扑兜底。
4. 连线播放:
   - SIMPLE:active orchestrator only。
   - MEDIUM:orchestrator fan-out -> solver nodes -> reviewer -> orchestrator。
   - HARD:decompose -> subtask lanes -> reviewer approval/rework -> aggregate。
5. 气泡内容:
   - 使用 `bee.snippet`。
   - 显示 phase label,例如 `规划`、`实现`、`审查`、`聚合`。
   - `timed_out` 显示“这一步超时,跳过”。

## 已实现后端增强:暴露完整事件流

为了让 Playground 真正重放复杂连接,`x_swarm_trace` 已扩展为:

```ts
interface SwarmTrace {
  // existing...
  subtasks?: Array<{ id: string; title: string; weight: number; status: string }>;
  handoffs?: Array<{
    from: string;
    to: string;
    taskId: string;
    feedback?: string;
    revisionRound?: number;
    snippet: string;
  }>;
  reward_split?: Array<{ archetype: string; weight: number; contribution: string }>;
  events?: Array<{
    id: string;
    kind: "classify" | "inherit" | "decompose" | "agent_run" | "handoff" | "broadcast" | "review_verdict" | "aggregate" | "backflow";
    phase: string;
    agent?: string;
    from?: string;
    to?: string;
    taskId?: string;
    status?: string;
    text?: string;
    latencyMs?: number;
  }>;
}
```

这样前端不需要从 `bees[]` 猜连接,可以直接按 `events[]` 画复杂流。
