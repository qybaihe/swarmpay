# EvoShip Playground 接入真实蜂群交接提示词

> 本文档给一个新线程 agent 使用。目标是专注完成 Playground 的真实蜂群接入:默认编队能真实调用后端蜂群,用户自定义节点和连线也能驱动一套可视化协作流。
> 项目根目录: `/Users/baihe/Documents/evomap`
> 当前基线提交: `1be3942 feat: add Vue playground assets and handoff`

---

## 一句话目标

把 `/playground` 从“纯前端 mock 流转画布”升级成“真实蜂群可视化驾驶舱”:

1. 用户打开 Playground 时有一套默认编队,可以直接输入问题运行真实蜂群。
2. 用户可以切换模型档位,例如 `swarm-lite` / `swarm-heavy` / `swarm-evo`。
3. 用户可以拖拽小人节点、改角色、拉连接线,形成自定义蜂群拓扑。
4. 运行时每个小人节点上方出现对话框,展示它在当前步骤说的话或产出摘要。
5. 消息沿着用户画出的线条传给下一个节点,有粒子/光束/气泡传递效果。
6. 最终输出真实后端答案和 trace,并在画布上重放协作过程。

这项任务不是重新设计 Playground,而是在现有 Vue/Vite/Pinia/Vue Flow 基础上把真实执行链路接通。

---

## 当前项目事实

### 已经完成

- `/playground` 页面已经存在: `web/views/PlaygroundView.vue`
- 小人节点组件已经存在: `web/components/playground/PetNode.vue`
- 左侧角色池已经存在: `web/components/playground/Sidebar.vue`
- 小人帧动画已经存在: `web/components/playground/PetSprite.vue` 和 `web/composables/useSprite.ts`
- Playground 状态 store 已存在: `web/stores/playground.ts`
- mock 消息流转引擎已存在: `web/composables/useFlowRunner.ts`
- 真实蜂群 HTTP 封装已存在: `web/api/swarm.ts`
- 后端真实蜂群入口已存在: `POST /v1/chat/completions`
- 后端 OpenAI 兼容返回里有 `x_swarm_trace`

### 现在的关键缺口

- `useFlowRunner.ts` 目前完全是 mock,不会调用真实蜂群。
- `PlaygroundView.vue` 运行按钮只调用 `run(nodes, edges)`,没有把 `goal/tier/nodes/edges` 交给真实后端。
- Playground 没有默认编队初始化,空画布时用户必须先手动拖节点。
- 画布节点与后端 trace 之间没有映射。
- 用户自定义连线目前只影响 mock 动画,不影响真实执行或真实回放。
- 运行完成后没有展示真实最终答案。

---

## 必读文件

请新线程按顺序读:

```text
docs/handoff-vue-playground.md
docs/HANDOFF.md
package.json
web/views/PlaygroundView.vue
web/composables/useFlowRunner.ts
web/stores/playground.ts
web/components/playground/PetNode.vue
web/components/playground/Sidebar.vue
web/constants/pets.ts
web/api/swarm.ts
src/server.ts
src/swarm.ts
src/orchestration/orchestrator.ts
src/model.ts
src/openai-types.ts
```

注意: `docs/handoff-vue-playground.md` 说 `src/registry.ts` 存在,但当前仓库没有这个文件。真实端点转换不是本任务主线。

---

## 推荐实现范围

这次新线程只聚焦两件事:

### 事件一:默认 Playground 接入真实蜂群

默认模式要求:

- 页面打开后可以一键加载默认编队。
- 推荐默认编队:

```text
orchestrator -> planner -> coder -> reviewer -> orchestrator
```

- 默认节点可用现有角色:
  - orchestrator: Claude
  - planner: 豆包或 Sam Altman
  - coder: 张一鸣或 Musk
  - reviewer: 柯南或 L
  - explorer: Einstein, 可选
- 用户能在底部或顶栏选择模型档位:

```text
swarm-lite
swarm-heavy
swarm-evo
```

- 默认选择 `swarm-heavy`,但要允许用户改。
- 点击运行时调用 `web/api/swarm.ts` 的 `runSwarm({ goal, tier })`。
- 后端返回后,用 `x_swarm_trace.bees[]` 驱动画布回放。
- 对话气泡显示真实 trace 中的 `snippet`,不是角色 catchphrase。
- 最终答案要在 Playground 内展示,不要只写在 log。

### 事件二:用户自定义蜂群拓扑跑通

用户自定义要求:

- 用户可以拖小人到画布,改角色,拉连接线。
- 点击运行后,系统根据用户的节点和连接线播放协作过程。
- 每个节点上方有对话气泡,内容来自真实执行结果或真实后端 trace 映射。
- 消息沿连接线传递,也就是从 source 节点飞到 target 节点。
- 如果用户没有连线,按节点添加顺序串行播放。
- 如果用户连线形成 DAG,按拓扑排序播放。
- 如果用户连线有环,不要崩溃,给提示并退化为节点添加顺序。

推荐分两层完成:

1. 第一层:真实后端执行仍调用 `/v1/chat/completions`,自定义拓扑用于真实 trace 的可视化映射和回放。
2. 第二层:如时间允许,新增 `/api/playground/run` 后端端点,按用户拓扑逐节点调用真实模型,形成真正的自定义蜂群执行。

第一层必须完成。第二层可作为增强,但文档和代码中要把当前能力边界写清楚。

---

## 前端建议改法

### 1. 扩展 Playground 状态

修改 `web/stores/playground.ts`,建议新增:

```ts
export type PlaygroundMode = "default" | "custom";

const mode = ref<PlaygroundMode>("default");
const tier = ref("swarm-heavy");
const finalAnswer = ref("");
const errorMsg = ref("");
const playbackStatus = ref<"idle" | "calling" | "replaying" | "done" | "error">("idle");
```

并新增方法:

```ts
function setBubble(nodeId: string, text: string, status?: NodeStatus): void
function setFinalAnswer(text: string): void
function setError(text: string): void
function resetRunState(): void
```

注意: 不要把节点本身放进 Pinia store,仍由 Vue Flow 的 `nodes/edges` 管。

### 2. 把 `useFlowRunner` 拆成“播放引擎”和“真实运行器”

当前 `useFlowRunner.ts` 同时做拓扑排序、气泡、粒子、配音和 mock 文案。建议重构成:

```text
web/composables/useFlowPlayback.ts
web/composables/useRealFlowRunner.ts
```

或者保持一个文件,但拆出清晰函数:

```ts
topoOrder(nodes, edges)
spawnParticle(from, to, kind)
playNodeSpeech(nodeId, text, status)
replayTraceOnCanvas(trace, nodes, edges)
runRealSwarmOnCanvas({ goal, tier, nodes, edges })
```

核心原则:

- `runRealSwarmOnCanvas` 负责调用后端。
- `replayTraceOnCanvas` 负责把真实 trace 映射到小人节点并播放。
- `spawnParticle` 继续负责沿线传递效果。

### 3. trace 到小人节点的映射规则

后端 trace 的 bee 长这样:

```ts
interface SwarmBee {
  id: string;
  variant: "orchestrator" | "planner" | "coder" | "reviewer" | "explorer" | string;
  status: "ran" | "breakthrough" | "hinted" | "timed_out";
  latency_ms: number;
  snippet: string;
}
```

画布节点数据:

```ts
interface PetNodeData {
  petId: string;
  role: string;
}
```

映射推荐:

1. 优先找 `node.data.role === bee.variant` 且还没被本次 bee 占用的节点。
2. 如果多个节点同角色,按拓扑顺序轮流分配。
3. 如果找不到对应角色节点,用当前拓扑序下一个节点兜底。
4. 如果画布为空,自动加载默认编队后再运行。
5. 如果 trace.bees 比节点多,允许同一个节点多次说话。

### 4. 对话气泡规则

每一步回放:

```text
节点进入 active/speaking 状态
显示 bubble = bee.snippet 的短句
log 追加 "角色名: snippet"
如果 bee.status 是 breakthrough,节点进入 breakthrough 状态并触发广播粒子
等待 900-1400ms
沿连接线把消息传给下游节点
下游节点短暂显示 "收到上游上下文" 或真实下一条 snippet
```

气泡文案不要太长。建议:

```ts
function shortSpeech(text: string): string {
  return text.replace(/\s+/g, " ").slice(0, 70);
}
```

如果是 `timed_out`,气泡显示:

```text
这一步超时,跳过。
```

### 5. 消息沿线传递规则

已有 `spawnParticle(from, to, kind)` 可以复用,但当前只在 mock 里按 `outEdges(id)` 发。真实回放里也要做到:

- 当前 bee 映射到 `currentNode`
- 下一 bee 映射到 `nextNode`
- 如果存在 `currentNode -> nextNode` 连接,沿这条线发青色消息粒子。
- 如果没有直接连接:
  - 若当前节点有出边,沿所有出边发粒子。
  - 否则直接对下一节点发一条虚拟粒子,不要阻断回放。

突破广播:

- 如果 `bee.status === "breakthrough"` 或 trace 中 `breakthroughs_broadcast > 0`,用金色粒子从当前节点广播到所有其他节点。
- 其他节点短暂显示:

```text
收到突破提示
```

### 6. 默认编队创建

在 `PlaygroundView.vue` 里新增:

```ts
function loadDefaultFleet(): void
```

建议布局:

```text
orchestrator  x=80, y=180
planner       x=300, y=110
coder         x=520, y=180
reviewer      x=740, y=110
orchestrator2 x=960, y=180
explorer      x=300, y=300, optional edge to coder
```

但为了不重复两个 orchestrator 节点,也可以:

```text
orchestrator -> planner -> coder -> reviewer
reviewer -> orchestrator  // 回到同一个 orchestrator 会形成环,Vue Flow 可显示,但播放拓扑要处理
```

为了实现简单,推荐不画回环,只用四节点线性默认编队:

```text
Claude(orchestrator) -> Doubao(planner) -> Musk(coder) -> Conan(reviewer)
```

最终答案在画布右下方或底部 answer panel 展示。

### 7. 顶栏/运行栏 UI

在 `PlaygroundView.vue` 顶栏或底部运行栏增加:

```text
模式: 默认编队 / 自定义编队
模型档位: swarm-lite / swarm-heavy / swarm-evo
按钮: 加载默认编队
按钮: 派出真实蜂群
```

文案要清楚:

- 默认编队: 适合快速演示真实蜂群。
- 自定义编队: 按当前画布连线回放协作过程。

不要让用户误会当前已经实现了真实“任意拓扑后端执行”。如果第一阶段只是“真实蜂群结果 + 自定义可视化回放”,UI 里可以写:

```text
自定义编队用于可视化回放,真实推理由 EvoShip 蜂群端点执行。
```

如果完成了 `/api/playground/run`,再改成:

```text
自定义编队将按画布拓扑逐节点调用真实模型。
```

---

## 后端增强方案,可选但推荐

如果要让用户自定义连线真的影响执行,新增:

```text
POST /api/playground/run
```

请求体:

```ts
interface PlaygroundRunRequest {
  goal: string;
  tier: "swarm-lite" | "swarm-heavy" | "swarm-evo";
  mode: "default" | "custom";
  nodes: Array<{
    id: string;
    petId: string;
    role: "orchestrator" | "planner" | "coder" | "reviewer" | "explorer";
    label?: string;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}
```

响应体:

```ts
interface PlaygroundRunResponse {
  content: string;
  trace: SwarmTrace | null;
  events: Array<{
    nodeId: string;
    role: string;
    status: "ran" | "breakthrough" | "timed_out";
    speech: string;
    fullContent?: string;
    latencyMs?: number;
    toNodeIds?: string[];
  }>;
}
```

后端实现建议:

1. 新建 `src/playground-runner.ts`。
2. 复用 `AgentRegistry.systemPrompt(role, inheritanceText, handoffContext)`。
3. 复用 `callAgent` 和 `aggregate`。
4. 拓扑排序 `nodes/edges`。
5. 每个节点输入:
   - 无上游: `goal`
   - 有上游: `goal + 上游节点产出摘要`
6. 每个节点输出加入 `events`。
7. 最后对叶子节点输出调用 `aggregate` 得到最终答案。

注意:

- 这条可选后端路径可以先不接 EvoMap A2A session,避免扩大风险。
- 如果要复用 EvoMap session/handoff,后续再接 `handoff.ts` 和 `breakthrough.ts`。
- 第一版只要“真实模型调用 + 画布拓扑执行 + 可视化事件返回”即可。

---

## 错误和降级策略

必须处理这些情况:

- 后端没启动: 显示错误,保留画布,不要清空用户编队。
- 真实调用超时: 展示“后端调用超时,可改用 swarm-lite 或演示模式”。
- `trace` 为空: 仍展示最终答案,并用当前画布拓扑播放“最终答案摘要”。
- 用户没有节点: 自动加载默认编队再运行。
- 用户有节点但没有边: 按节点添加顺序串行播放。
- 用户画了环: 提示“检测到回环,本次按节点顺序回放”。
- `stop()` 被点击: 停止回放动画;如果请求已经发出,至少忽略后续回放结果。可进一步用 `AbortController`。

---

## 验收标准

新线程完成后必须满足:

1. `npm run typecheck` 通过。
2. `npm run build:web` 通过。
3. `/playground` 打开后能一键加载默认编队。
4. 默认编队下输入问题,点击运行,会真实调用 `/v1/chat/completions`。
5. 真实返回后,每个小人上方会出现对应的真实输出气泡。
6. 气泡之间有沿连线传递的视觉效果。
7. 如果 trace 中有 breakthrough,能看到广播到其他节点的效果。
8. 最终答案在 Playground 页面内可见。
9. 切换 `swarm-lite` / `swarm-heavy` / `swarm-evo` 会影响真实请求里的 `model`。
10. 用户自定义节点和连线后,回放顺序遵循用户画出的拓扑。
11. 后端错误时页面不崩,用户能继续修改画布再试。

---

## 推荐测试用例

### 快速默认真实调用

```text
目标: 用 HTML 写一个带邮箱和密码校验的登录页
模式: 默认编队
模型: swarm-lite 或 swarm-heavy
预期: 有真实 answer,小人气泡显示真实 snippet,最终答案 panel 出现 HTML/CSS/说明
```

### 自定义编队回放

```text
节点: Claude(orchestrator) -> Einstein(explorer) -> Musk(coder) -> L(reviewer)
目标: 设计一个更有创意的待办事项 App
预期: 回放按这条线走,Einstein 和 Musk 的气泡依次出现,消息粒子沿线传递
```

### 无边场景

```text
节点: 任意三个
连线: 无
目标: 解释 7x8
预期: 按节点添加顺序回放,不报错
```

### 环场景

```text
节点: A -> B -> C -> A
目标: 任意
预期: 提示检测到回环,按节点顺序回放
```

---

## 不要做的事

- 不要重写整个 Playground。
- 不要删除现有角色素材和声音。
- 不要把 `.env` 或任何密钥写入文档或代码。
- 不要把 mock 文案当真实结果展示。
- 不要为了“自定义拓扑”大改现有 orchestrator 主链路,除非先完成默认真实接入。
- 不要引入新的大型 UI 框架。

---

## 建议提交信息

完成第一阶段可提交:

```text
feat: connect playground to real swarm trace
```

若同时完成后端自定义拓扑:

```text
feat: run custom playground swarm topology
```

