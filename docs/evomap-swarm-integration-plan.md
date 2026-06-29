# EvoMap 蜂群协作接入方案（v2 · 基于官方文档修正）

> 本文基于：官方 `skill.md`、`skill-tasks.md`、`skill-structures.md`、`developers` 仓库
> （`README.md` + `HACKATHON.md` + `examples/quickstart/index.js`）、`openapi.json`（2026-06-17）、
> `Help API` 返回、`llms-full.txt`。v1 的猜测部分已修正。

## 0. 一句话定位

EvoMap 是 **AI 自我进化基础设施**：`gene`（可复用策略，五类 repair/optimize/innovate/regulatory/explore）
+ `capsule`（已验证的修复）+ `EvolutionEvent`（进化审计）三件套永远捆绑发布，外加 `recipe`（多步工作流）
和 `reuse-graph`（复用图谱）。它的**真正卖点**是「经验可检索、可继承、可再进化」。

我们的「蜂群向着同一目标持续努力」——EvoMap **平台本身就原生支持**（Swarm Intelligence）：
大任务自动 `propose-decomposition` → 多 agent 并行求解 → 聚合。奖励按贡献权重自动分配。

## 1. 两条接入路径（必须分清）

| | **A. Developer OAuth（黑客松官方路径）** | **B. A2A 蜂群协议（skill.md）** |
|---|---|---|
| 认证 | OAuth2 + PKCE，用户授权你的 app | Node 注册 + claim_url 绑定，自己就是 agent |
| 面向 | 第三方应用，代表用户操作 | Agent 节点本身 |
| 核心 | `gene/recipe/reuse-graph` 价值网络读写 | `Gene+Capsule+EvolutionEvent` 进化资产 |
| 蜂群 | ❌ 无 swarm 概念 | ✅ **原生 Swarm 全套** |
| 比赛契合 | ⭐⭐⭐⭐⭐ HACKATHON.md 手把手、test_mode 零风险 | ⭐⭐⭐ 能力更强但非比赛主推 |
| **结论** | **参赛主路径（必做）** | **锦上添花 / 演示深度（可选）** |

### B 路径的 Swarm 能力（与我们想法同构）

`POST /a2a/task/propose-decomposition`：
- 认领父任务后，拆成 2–10 个子任务，每个带 `title/signals/weight(0-1)/body`
- solver 权重总和 ≤ 0.85；奖励自动按权重分配（proposer 5% / solvers 85% / aggregator 10%）
- 流转：claim → propose → solver 领子任务 → 各自 publish+complete → 聚合（需 reputation≥60）
- 事件：`swarm_subtask_available` / `swarm_aggregation_available`（经 heartbeat `pending_events`）
- 状态：`GET /a2a/task/swarm/:taskId`

## 2. 飞书参赛手册

`research/feishu.html`（95KB）是**飞书登录壳页面，正文为空**——未登录 curl 抓不到。
但官方 `developers/HACKATHON.md` 已给出比赛意图：**在 EvoMap 上搭东西**，方向：
- 提示词增强器（需求 → 检索 recipe/gene → 拼增强 prompt）
- 「用 EvoMap 登录」应用（OIDC）
- 调用价值网络的 AI agent
- recipe 发布工具 / reuse 图谱可视化

> 需要你在浏览器登录飞书后，把手册正文复制给我，我再补齐赛题/评分/提交格式。

## 3. 技术栈（官方钦定，直接抄）

- **后端**：Node 20.6+ / Express，裸 `fetch`，**无 SDK**（官方 quickstart 即此）
- **OAuth**：S256 PKCE 强制；`/oauth/authorize` → `/oauth/token`；回调 `http://localhost:3000/callback`
- **沙箱**：`test_mode` app（`evm_client_test_…`）全流程零真实副作用，包含发布
- **scopes**：只读自助 `recipe:read gene:read reuse:query`；`recipe:write`（自助）/ `recipe:publish`（申请）
- **检索原语**：`recipes?q=` 全文搜 / `genes?type=` 排行 feed（无 q）/ `reuse?recipe_id=` 关联图谱
- **webhooks**：HMAC `t=<unix>,v1=<hmac>`，事件 `recipe.created` / `recipe.published`

```js
// 调用范式（quickstart 已封装好完整 OAuth + webhook 验签）
const r = await fetch(`https://evomap.ai/developer/oauth/recipes?q=${q}&limit=5`,
  { headers: { Authorization: `Bearer ${token}` } });
const { recipes, pagination } = await r.json();  // 跟 pagination.next_cursor 翻页
```

## 4. 产品形态：Swarm Goal Engine（蜂群目标引擎）

**一句话**：用户输入目标 → 蜂群围绕同一目标：检索继承经验 → 拆解 → 并行执行 → 复盘 → 沉淀回流 EvoMap。

### 融入 EvoMap 的三个层次

**轻量（必做，demo 核心）**：`/api/enhance` 后端调 `recipes?q=<goal>`，把检索到的可复用经验拼进 system prompt。
体现「不是从零开始，而是继承价值网络」。

**中度（差异化）**：每只蜂执行前都拿到：当前目标 + EvoMap 检索的 recipes + 推荐 genes + reuse 关联经验。
agent「继承已有经验后再行动」。

**深度（路演加分）**：任务完成自动生成 Gene+Capsule bundle（满足 `outcome.score≥0.7`、`blast_radius>0`），
或沉淀为 recipe 草稿（test mode 零风险发布），让下一次蜂群更聪明。

### 视觉（契合"蜂群向同一目标"）

- 中央目标球/蜂巢；多个 agent 节点环绕，状态 `searching/planning/executing/reviewing/done`
- 右侧：EvoMap 召回的 recipes + reuse graph
- 下方：实时事件流（每蜂的行动、证据、产出）
- 终态：「沉淀为 EvoMap Recipe/Gene+Capsule」卡片

### 角色映射（我们 vs 平台 Swarm）

| 我们的蜂 | 平台 Swarm 角色 | 职责 |
|---|---|---|
| 蜂后/Orchestrator | Proposer | 目标拆解、提交 decomposition |
| 研究蜂/实现蜂/验证蜂 | Solvers | 领子任务、publish+complete |
| 复盘蜂/Queen | Aggregator | 聚合所有结果、沉淀 recipe/capsule |

## 5. 蜂群"向同一目标持续努力"的关键设计

这是你最在意的效果。实现要点：

1. **目标是单一焦点**：用户输入一个目标字符串，所有 agent 的 system prompt 都注入这个目标 + 检索到的经验。视觉上目标始终居中。
2. **持续 = 迭代循环**：不是一次跑完，而是 critic 判断「目标是否达成」，未达成就再拆一轮子任务（新一轮 swarm decomposition）。
3. **努力有据可循**：每轮都从 EvoMap 拉取最新相关 recipe/gene，体现「越跑越聪明」。
4. **贡献可见**：复用平台 Swarm 的 reward split 语义，前端展示每只蜂的贡献权重和产出。

### 架构（A 路径 MVP）

```text
swarm-evomap/
  app/
    page.tsx                      # 目标输入 + 蜂群可视化
    api/
      evomap/oauth/start/route.ts # PKCE 起跳
      evomap/oauth/callback/route.ts
      swarm/start/route.ts        # 输入目标 → 触发编排
      swarm/events/route.ts       # SSE 推送蜂群进度
      recipe/draft/route.ts       # 沉淀为 recipe（test mode 发布）
  lib/
    evomap.ts                     # OAuth + recipes/genes/reuse 封装
    pkce.ts
    swarm/
      orchestrator.ts             # 目标 → 拆解 → 调度（复用平台 swarm 语义）
      planner.ts                  # LLM 拆解目标为子任务
      worker.ts                   # 单蜂执行：检索→生成→证据
      critic.ts                   # 判断目标是否达成，决定迭代
      event-bus.ts                # 实时事件
  prisma/schema.prisma            # SQLite 起步
  .env.example                    # CLIENT_ID/CLIENT_SECRET/EVOMAP_BASE
```

`lib/evomap.ts` 封装：
- `searchRecipes(query, limit)` / `listGenes(type, limit)` / `getReuseGraph({recipeId})`
- `createRecipeDraft(input, idempotencyKey)` / `publishRecipe(input, idempotencyKey)`
- 统一：`Authorization: Bearer <token>`、超时、非 JSON 兜底、`Idempotency-Key`

## 6. 可选：B 路径（真正接入平台蜂群）演示加分

若想在 demo 里展示「真正的跨 agent 蜂群」（而非自建模拟）：
1. `POST /a2a/hello` 注册一个 agent node，拿到 claim_url，你浏览器绑定
2. 配合 platform 发布一个带 bounty 的任务（`POST /bounty/create`）
3. 我们的 Orchestrator 调 `POST /a2a/task/propose-decomposition` 真实拆解
4. 经 heartbeat 收 `swarm_subtask_available` 事件，前端展示真实蜂群进度

> 注意：B 路径需要 node 绑定 + 可能消耗额度，且聚合角色需 reputation≥60（新号达不到）。
> 建议 **demo 以 A 路径为主、B 路径作为「我们的蜂群最终会接入全球进化网络」的叙事延伸**。

## 7. 比赛 Demo 叙事

> EvoMap 是 AI 经验的可继承价值网络。我们的 Swarm Goal Engine 是它的执行层：
> 每个目标先从 EvoMap 继承已有 recipe/gene，再由蜂群分工推进，持续迭代直到达成；
> 完成后把成功路径沉淀为 Gene+Capsule / recipe 回流 EvoMap，让下一次蜂群更聪明。
> 平台原生支持 swarm decomposition——我们的产品就是这个机制的直观执行与可视化。

## 8. 下一步（按优先级）

1. **【需你配合】** 登录飞书复制参赛手册正文给我，补齐赛题/评分/提交格式
2. **【需你操作】** 去 `evomap.ai/dev/portal` 注册 `test_mode` app，拿 `CLIENT_ID/CLIENT_SECRET`
3. 跑官方 quickstart 拿 access_token，验证 `recipes?q=` 能返回数据
4. 搭 Next.js MVP：目标输入 → EvoMap 检索（轻量融入）→ 蜂群事件流（SSE）→ recipe 草稿
5. 加蜂群可视化（中央目标 + 环绕 agent + 实时状态）
6. 接 LLM 实现 planner/critic，形成「持续迭代直到目标达成」的循环
7. （可选）接入 B 路径真实 swarm，演示跨 agent 协作
