# EvoShip 全栈重构 · 完整交接提示词

> **本文档是给一个全新独立线程的 agent 使用的，从零开始也能做完。**
> 目标：把 EvoShip 从"端点转换是假的"升级为"真·端点转换器产品"，并配套大气的前端。
> 分两部分：**Part A 后端改造**（让上传端点→拿新端点→真接入变真）+ **Part B 前端重构**（大气的产品官网 + 真交互）。
> 技术栈：Node 20 / Express / TypeScript / 单文件 HTML（无构建链）。

---

## 📌 第 0 节：先读这些（5 分钟建立全局认知）

新线程 agent 必须先读以下文件，**不要跳过**，否则会改错地方：

```
项目根：/Users/baihe/Documents/evomap

必读文件（按顺序）：
1. README.md                    ← 项目定位、四档模型、工作流
2. src/server.ts                ← 当前 4 个路由（要改的入口）
3. src/config.ts                ← 全局配置（改造的关键障碍在这里）
4. src/model.ts                 ← 模型调用（改造的核心：单例→动态）
5. src/swarm.ts                 ← 蜂群编排入口
6. src/orchestration/orchestrator.ts  ← 异构分工流水线
7. src/openai-types.ts          ← x_swarm_trace 数据契约（前端可视化用）
8. public/index.html            ← 现有前端（要重构）
9. AGENTS.md + agents/*/AGENTS.md    ← 5 个 agent 角色定义
10. src/agents/registry.ts      ← 角色-颜色映射的事实来源
```

**一键读全部源码：**
```bash
cat src/server.ts src/config.ts src/model.ts src/swarm.ts src/openai-types.ts
```

---

## Part A：后端改造 —— 让"端点转换"变成真产品

### A.1 现状诊断（为什么现在是假的）

**核心问题：用户端点是全局单例，不是动态绑定。**

当前数据流：
```
.env 里的 OPENAI_BASE_URL / OPENAI_API_KEY
        ↓ 启动时读一次
   src/config.ts（全局常量）
        ↓
   src/model.ts 第 22 行：const realClient = new OpenAI({...})  ← 模块级单例！
        ↓
   所有请求都走这一个客户端
```

前端 `public/index.html` 第 339-369 行的"转换表单"：
```javascript
function genKey(){ ... 生成 sk-evoship-xxxx 假密钥 ... }
// 表单 submit 只是在前端生成一个假 key 展示给用户
// 没有发请求给后端，后端也不存任何用户端点
```

**结论：用户拿到的"蜂群端点 key"插进任意 Agent，根本不能用。**

### A.2 改造目标（产品定义，必须 100% 实现）

**用户旅程：**
1. 用户在官网填表：自己的 base_url + api_key + model_name
2. 点「生成蜂群端点」→ 后端返回：`{ base_url, new_api_key, model }`
3. 用户把这套三元组插入任意 OpenAI 兼容 Agent（Cursor/Cline/LangChain/直接 curl）
4. 该 Agent 发请求 → **后端用该用户存的真实端点跑蜂群** → 返回蜂群增强结果 + `x_swarm_trace`

**关键：返回的 base_url 就是 EvoShip 自己的 `/v1`，new_api_key 是 EvoMap 生成的凭证（绑定了用户的真实端点），model 是 `swarm-*`。**

### A.3 改造方案（精确到代码）

#### 改造点 1：新建端点注册表 `src/registry.ts`（新文件，~50 行）

用内存 Map 存"newKey → 用户端点配置"。MVP 不需要数据库，进程重启清空可接受（黑客松 demo 够用）。

```typescript
// src/registry.ts
// 端点注册表：newKey → 用户的真实端点配置
// MVP 用内存 Map，重启清空（黑客松可接受）

import crypto from "node:crypto";

export interface UserEndpoint {
  userBaseUrl: string;      // 用户原始 base_url
  userApiKey: string;       // 用户原始 api_key
  userModel: string;        // 用户原始 model 名（作为蜂群后端）
  apiKey: string;           // EvoShip 生成的 newKey（sk-evoship-...）
  createdAt: number;
  label?: string;           // 可选备注
}

const store = new Map<string, UserEndpoint>();

/** 生成新 key 并注册用户端点 */
export function registerEndpoint(input: {
  userBaseUrl: string;
  userApiKey: string;
  userModel: string;
  label?: string;
}): UserEndpoint {
  const apiKey = "sk-evoship-" + crypto.randomBytes(20).toString("hex");
  const rec: UserEndpoint = {
    userBaseUrl: input.userBaseUrl.replace(/\/$/, ""),  // 去尾斜杠
    userApiKey: input.userApiKey,
    userModel: input.userModel,
    apiKey,
    createdAt: Date.now(),
    label: input.label,
  };
  store.set(apiKey, rec);
  return rec;
}

/** 按 newKey 查用户端点配置（请求时用） */
export function findByKey(apiKey: string): UserEndpoint | undefined {
  return store.get(apiKey);
}

/** 统计（status/dash 用） */
export function count(): number {
  return store.size;
}
```

#### 改造点 2：`src/model.ts` 单例 → 动态客户端（核心改造）

**问题：** 现在第 22 行的 `realClient` 是模块级常量，用全局 `.env`。要改成"每次调用按传入的 endpoint 配置动态创建"。

**改造方法：** 给 `callReal` / `callAgent` / `aggregate` / `baseline` 都加一个 `upstream` 参数（用户的端点配置）。没有 `upstream` 时回退到 `.env` 全局配置（保持 demo 兼容）。

```typescript
// src/model.ts 改造要点（伪代码，照此改）

import OpenAI from "openai";
import { config } from "./config.js";

// 新增：upstream 类型（用户的端点配置）
export interface Upstream {
  baseUrl: string;
  apiKey: string;
  model: string;
}

// 客户端缓存（同 baseUrl+apiKey 复用，避免每请求 new 一个）
const clientCache = new Map<string, OpenAI>();
function getClient(up: Upstream): OpenAI {
  const cacheKey = `${up.baseUrl}::${up.apiKey.slice(0, 8)}`;
  let c = clientCache.get(cacheKey);
  if (!c) {
    c = new OpenAI({ baseURL: up.baseUrl, apiKey: up.apiKey });
    clientCache.set(cacheKey, c);
  }
  return c;
}

// callReal 加 upstream 参数
async function callReal(
  model: string,          // 注意：动态模式下用 upstream.model
  system: string,
  userContent: string,
  temperature: number,
  timeoutMs: number,
  upstream?: Upstream,    // ← 新增
): Promise<string> {
  if (upstream) {
    // 动态模式：用用户的端点
    const c = getClient(upstream);
    const res = await c.chat.completions.create(
      { model: upstream.model, messages: [{role:"system",content:system},{role:"user",content:userContent}], temperature },
      { signal: AbortSignal.timeout(timeoutMs) },
    );
    return res.choices[0]?.message?.content ?? "";
  }
  // 全局模式：回退到 .env（原逻辑）
  if (config.useMock) { /* 原 mock */ }
  // ... 原 realClient 逻辑
}
```

**所有导出函数的签名都要加 `upstream?: Upstream`：** `callReal`、`runBee`、`aggregate`、`callAgent`、`baseline`。然后一路透传。

**透传链路（必须全部改通，否则断链）：**
```
server.ts (/v1/chat/completions)
  → 从 Authorization header 提取 newKey → registry.findByKey → 得到 upstream
  → runSwarm(input, upstream)
    → swarm.ts: orchestrate({...}, upstream) + baseline(..., upstream)
      → orchestrator.ts: callAgent(..., upstream) + aggregate(..., upstream)
        → pipeline.ts: runAgent → callAgent(..., upstream)
        → model.ts: callReal(..., upstream) ← 最终落地
```

⚠️ **这是最容易漏的地方。** 每一层函数都要把 `upstream` 往下传。改完用 `npm run typecheck` 验证（必须 0 错误）。

#### 改造点 3：`src/server.ts` 加注册路由 + 请求认证

```typescript
// src/server.ts 新增（在现有路由基础上）

import { registerEndpoint, findByKey } from "./registry.js";
import type { Upstream } from "./model.js";

// 新增：注册端点
app.post("/api/endpoints/register", (req, res) => {
  const { user_base_url, user_api_key, user_model, label } = req.body || {};
  if (!user_base_url || !user_api_key || !user_model) {
    return res.status(400).json({ error: { message: "user_base_url, user_api_key, user_model 必填" } });
  }
  const rec = registerEndpoint({
    userBaseUrl: user_base_url,
    userApiKey: user_api_key,
    userModel: user_model,
    label,
  });
  res.json({
    base_url: `${req.protocol}://${req.get("host")}/v1`,
    api_key: rec.apiKey,
    model: "swarm-evo",        // 默认推荐进化档（也可给 4 档任选）
    created_at: rec.createdAt,
    note: "把以上三项配置到任意 OpenAI 兼容客户端即可使用蜂群推理",
  });
});

// 改造：/v1/chat/completions 从 header 提取用户端点
app.post("/v1/chat/completions", async (req, res) => {
  const body = req.body as ChatCompletionRequest;
  if (!body?.messages?.length) {
    return res.status(400).json({ error: { message: "messages[] required" } });
  }

  // ★ 新增：解析用户端点
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const rec = findByKey(token);
  let upstream: Upstream | undefined;
  if (rec) {
    upstream = { baseUrl: rec.userBaseUrl, apiKey: rec.userApiKey, model: rec.userModel };
  } else if (!token || token === "any" || token === "eval") {
    // 没注册的 key：回退全局 .env 配置（demo/eval 兼容，保持现有行为）
    upstream = undefined;
  } else {
    // 提供了 key 但查不到：友好报错（提示重新生成）
    return res.status(401).json({
      error: { message: "api_key 无效或已过期，请重新生成蜂群端点", type: "invalid_key" }
    });
  }

  const requested = String(body.model || "swarm-evo");
  const tier = (Object.keys(MODEL_TIERS) as Tier[]).includes(requested as Tier)
    ? (requested as Tier) : "swarm-evo";

  try {
    const out = await runSwarm({ tier, messages: body.messages }, upstream);  // ← 透传
    // ... 原有响应构造（含 x_swarm_trace）保持不变
  } catch (e) { /* ... */ }
});
```

#### 改造点 4：`/api/status` 加注册表信息

```typescript
// src/server.ts 的 /api/status 加一行
import { count as endpointCount } from "./registry.js";

app.get("/api/status", (_req, res) => {
  res.type("json").send({
    service: "evoship",
    status: "ok",
    backend: isMock() ? "MOCK" : "real",
    endpoints_registered: endpointCount(),   // ← 新增
    // ...
  });
});
```

### A.4 后端验收（改完必须跑通）

```bash
# 1. 类型检查（必须 0 错误）
npm run typecheck

# 2. 启动
npm run dev   # http://localhost:4000

# 3. 注册一个端点（用真实可用的端点测试）
curl -X POST http://localhost:4000/api/endpoints/register \
  -H "Content-Type: application/json" \
  -d '{"user_base_url":"https://api.openai.com/v1","user_api_key":"sk-xxx","user_model":"gpt-4o-mini"}'
# 期望返回: { base_url, api_key: "sk-evoship-...", model: "swarm-evo" }

# 4. 用返回的 api_key 调蜂群（必须用用户的 gpt-4o-mini 跑，不是 .env 的 mimo）
curl -X POST http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer sk-evoship-刚才返回的key" \
  -H "Content-Type: application/json" \
  -d '{"model":"swarm-evo","messages":[{"role":"user","content":"你好"}]}'
# 期望: 正常返回答案 + x_swarm_trace

# 5. 用假 key 应返回 401
curl -X POST http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer sk-fake" \
  -H "Content-Type: application/json" \
  -d '{"model":"swarm-evo","messages":[{"role":"user","content":"hi"}]}'
# 期望: 401 invalid_key
```

**⚠️ 边界情况处理：**
- 用户填的端点不可达/401 → 蜂群调用会 timeout，catch 后返回友好错误（提示"你的端点可能无效"）
- `upstream` 缓存不要无限增长（Map 会内存泄漏，但 demo 可接受；想严谨可加 LRU）
- 进程重启后注册表清空 → 首页应提示"端点为会话级，重启需重新生成"（或后续接 SQLite）

---

## Part B：前端重构 —— 大气的产品官网 + 真交互

### B.1 视觉规范（"大气"的落地定义）

**风格：赛博朋克 × 生物科技（蜂群 = 有机智能网络）。** 对标 Opencove 视觉档次。

**配色系统（保留现有 DNA，语义化扩展）：**
```css
:root{
  --bg:#05060f; --bg2:#0a0d1f;
  --panel:rgba(18,22,44,.55); --panel-line:rgba(120,160,255,.14);
  --cyan:#3ae0ff; --violet:#8b5cff; --pink:#ff5cc8;
  --green:#3dffb0; --amber:#ffb84d; --blue:#5ca8ff; --red:#ff5c7a;
  --text:#e8ecff; --muted:#8893bf; --dim:#5a6494;
  --glow:0 0 24px rgba(58,224,255,.35);
}
```

**角色-颜色映射（全站必须一致，蜂群可视化用）：**
| variant | 颜色 | 图标 | 中文 |
|---|---|---|---|
| orchestrator | `#ffb84d` amber | 👑 | 蜂后（编排） |
| planner | `#5ca8ff` blue | 🗺️ | 规划蜂 |
| coder | `#3ae0ff` cyan | ⚡ | 实现蜂 |
| reviewer | `#8b5cff` violet | 🔍 | 审查蜂 |
| explorer | `#ff5cc8` pink | 💡 | 探索蜂 |

**"大气"的 6 个视觉要素：**
1. 满屏深色 + 多层径向光晕（左上 violet + 右下 cyan）+ 极淡网格 + 横向扫描线动画
2. 玻璃拟态卡片：`backdrop-filter: blur(14px)` + 半透明 + 微光边框
3. 渐变文字：标题 `linear-gradient` + `background-clip:text`
4. 发光阴影：CTA / hover `box-shadow:0 0 36px rgba(58,224,255,.5)`
5. 微动效：蜂群轨道旋转（16-34s 反向）、按钮 hover 上移、数字 count-up、状态点呼吸
6. 大量留白：section `padding:96px 0`

### B.2 页面结构（7 个区块，核心是 ③ 端点转换）

#### ① 导航栏（sticky 毛玻璃）
logo `🐝 EvoShip` + 锚点（原理 / 端点转换 / 实战演示 / 模型）+ 状态徽标（调 `/api/status` 显示绿点在线）+ CTA「立即转换」

#### ② Hero 首屏
- badge：`● EvoMap A2A 赛道 · 蜂群协作推理引擎`
- 大标题（渐变）：`一个蜂群端点，<渐变>让你的 Agent 联网进化</渐变>`
- 副标题：改一个 base_url，任意 OpenAI 兼容客户端即获蜂群推理 + EvoMap 经验继承
- 双 CTA：`⚡ 立即转换你的端点` + `看蜂群怎么协作`
- 蜂群轨道动画（中央蜂巢 + 多层旋转轨道蜜蜂）

#### ③ ⭐ 端点转换器（产品核心，页面的真正主线）
**这是最重要的一块。必须做成真交互（对接 Part A 的 `/api/endpoints/register`）。**

表单字段：
- 你的模型端点 Base URL（如 `https://api.openai.com/v1`）
- API 密钥（`sk-...`，password 类型）
- 使用的模型名（如 `gpt-4o-mini`，可给常见选项 datalist）
- 可选：备注 label

提交逻辑：
```javascript
const res = await fetch('/api/endpoints/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_base_url, user_api_key, user_model, label
  }),
});
const data = await res.json();
// data = { base_url, api_key: "sk-evoship-...", model, created_at }
```

成功后展示结果卡（带复制按钮）：
- Base URL（复制按钮）
- 新 API Key（复制按钮，部分隐藏 `sk-evoship-••••`）
- 模型名（复制按钮）
- 代码示例（Python + curl 两 tab，自动填入返回值）：
  ```python
  from openai import OpenAI
  client = OpenAI(
      base_url="<返回的 base_url>",
      api_key="<返回的 api_key>",
  )
  res = client.chat.completions.create(
      model="swarm-evo",
      messages=[{"role":"user","content":"你的提示词"}],
  )
  print(res.choices[0].message.content)
  print(res.model_dump()["x_swarm_trace"])  # 蜂群过程
  ```
- 「立即试一下」按钮 → 跳转到 ④ 用刚生成的端点跑一次

**视觉：** 表单本身要玻璃拟态 + 发光聚焦态。结果卡用 green 边框 + fadeUp 动画。

#### ④ ⭐ 实战演示（用转换后的端点看蜂群内部）
**这块是"透视蜂群端点背后发生了什么"。** 两种入口：
- 入口 A：从 ③ 转换成功后点「立即试一下」（自动带上新 key）
- 入口 B：独立输入框 + 可选填 api_key（默认用全局 demo 配置）

交互：
1. 输入目标（预填"用 HTML 写一个登录页面"）
2. 模型档下拉（swarm-baseline / lite / heavy / evo，默认 heavy）
3. 点「派出蜂群」→ `POST /v1/chat/completions`
4. **加载态**（真实模型 30-90s，必须做好）：
   - 蜂巢居中 + 蜜蜂粒子汇聚
   - 阶段文字轮播：`🧬 继承经验…` → `🗺️ 规划拆解…` → `⚡ 分工实现…` → `🔍 审查纠错…` → `👑 聚合结果…`
   - 呼吸式进度条 + 已耗时计时器
5. **结果展示**（解析 `x_swarm_trace`）：
   - 最终答案：`choices[0].message.content`（markdown 渲染）
   - 蜂群节点链可视化：`trace.bees[]` 每个一个节点，按 variant 上色，breakthrough 高亮 + ⚡
   - 指标条：子任务数（swarm_size）/ 突破广播数 / 总耗时 / 聚合方式
   - EvoMap 联动：有 `inherited_recipes` 显示「🧬 继承 N 条经验」；`evomap_backflow.status==='published'` 显示「✅ 已回流进化网络」

**数据契约（`x_swarm_trace` 全字段，前端唯一数据源）：**
```typescript
interface SwarmTrace {
  tier: string;
  model: string;
  swarm_size: number;
  inherited_recipes?: { title: string; description?: string }[];
  bees: {
    id: string; variant: string;
    status: "ran" | "breakthrough" | "hinted" | "timed_out";
    latency_ms: number; snippet: string;
  }[];
  breakthroughs_broadcast: number;
  aggregator: "vote" | "llm";
  evomap_backflow?: { status: "skipped" | "published"; title?: string };
  total_latency_ms: number;
}
```
**已知限制：** trace 目前没有 handoffs/rewardSplit 字段，前端只渲染 bees[]，不要造数据。

**⚠️ 必须有降级兜底**（现场断网/后端慢）：
- 「演示模式」按钮：直接载入下面的 mock trace，不调后端
- fetch 失败/超时：友好提示 + 引导用演示模式

#### ⑤ 协作原理（六阶段流程图）
横向流程图 + 流光连线：`继承 inherit → 发散 diverge → 突破检测 breakthrough → 广播 broadcast → 收敛 converge → 回流 backflow`。每阶段卡片带图标 + 一句话。

#### ⑥ 蜂群角色阵容（5 卡）
orchestrator/planner/coder/reviewer/explorer，每卡：角色色 + 图标 + 中文名 + focus + 关键属性（temperature/handoff_targets/reward_weight）。卡片间画 handoff 关系（planner→coder→reviewer→返工回环）。

#### ⑦ 模型档位 4 卡 + 接入
4 档（baseline/lite/heavy/evo），推荐标记。客户端 logo 墙（Cursor/Cline/Aider/LangChain/Continue 文字 logo）。

#### Footer
logo + 链接 + `Beyond the Maze · A2A 蜂群协作 · 蜂群推理 × EvoMap 经验进化`

### B.3 蜂群可视化实现建议

trace.bees[] 是有序数组 → 用横向节点链 + SVG 连线。
- 方案 A（推荐，CSS+SVG）：flex 排列节点，节点间 SVG path + `stroke-dasharray` 流光动画
- 状态样式：`ran` 实心 / `breakthrough` 实心+光晕+⚡ / `hinted` 半透明虚线 / `timed_out` 灰+✕
- 节点点击展开 snippet 详情

### B.4 Mock 数据兜底（现场必须用）

当后端不可达或用户不想等，用这份预置 trace 演示：
```json
{
  "tier": "swarm-heavy", "model": "gpt-4o-mini", "swarm_size": 3,
  "inherited_recipes": [{ "title": "登录页面最佳实践", "description": "表单验证、无障碍、响应式" }],
  "bees": [
    { "id": "orchestrator-decompose", "variant": "orchestrator", "status": "ran", "latency_ms": 1400, "snippet": "分解为 3 子任务：结构 / 样式 / 验证" },
    { "id": "planner-plan", "variant": "planner", "status": "breakthrough", "latency_ms": 16000, "snippet": "## 执行计划\n1. 语义化 HTML\n2. CSS Grid 居中\n3. 前端表单校验" },
    { "id": "coder-implement", "variant": "coder", "status": "ran", "latency_ms": 13000, "snippet": "<form class=\"login\"><input type=\"email\" required><button>登录</button></form>" },
    { "id": "reviewer-review", "variant": "reviewer", "status": "ran", "latency_ms": 12000, "snippet": "verdict: APPROVE\n优点：语义化、含校验" }
  ],
  "breakthroughs_broadcast": 1, "aggregator": "llm",
  "evomap_backflow": { "status": "published", "title": "登录页面工作流" },
  "total_latency_ms": 42400
}
```

---

## Part C：API 端点全清单（前后端联调用）

| 方法 | 路径 | 用途 | 请求 | 响应 |
|---|---|---|---|---|
| GET | `/` | 官网页 | - | HTML |
| GET | `/api/status` | 健康+注册数 | - | `{status, backend, endpoints_registered}` |
| GET | `/v1/models` | 4 档模型 | - | OpenAI models list |
| **POST** | **`/api/endpoints/register`** | **★ 注册用户端点** | `{user_base_url, user_api_key, user_model, label?}` | `{base_url, api_key, model, created_at}` |
| **POST** | `/v1/chat/completions` | **★ 蜂群推理** | OpenAI 格式 + `Authorization: Bearer <newKey>` | OpenAI 格式 + `x_swarm_trace` |

**chat/completions 认证逻辑：**
- `Bearer sk-evoship-...` → 查 registry → 用用户端点跑
- `Bearer any/eval` 或无 → 回退全局 `.env`（demo 兼容）
- 其他 key → 401

---

## Part D：技术约束

- 后端：Node 20.6+ / Express / 裸 `fetch` / openai SDK / TypeScript（`tsx` 运行）
- 前端：**单文件 HTML（内联 CSS+JS），不引 React/Vue 构建链**，emoji + 内联 SVG 图标
- `npm run typecheck` 必须 0 错误
- `npm run dev` 启动在 http://localhost:4000

---

## Part E：验收 Checklist（全栈）

**后端：**
- [ ] `src/registry.ts` 新建（registerEndpoint/findByKey/count）
- [ ] `src/model.ts` 单例 → 动态 `upstream` 透传（callReal/runBee/aggregate/callAgent/baseline 全加参数）
- [ ] `src/server.ts` 新增 `POST /api/endpoints/register`
- [ ] `src/server.ts` `/v1/chat/completions` 从 header 提取 newKey → 用用户端点
- [ ] 透传链路打通：server→swarm→orchestrate→pipeline→model
- [ ] `npm run typecheck` 0 错误
- [ ] 真实端点测试通过（注册→用 newKey 调通→假 key 返回 401）

**前端：**
- [ ] 视觉：深色赛博 + 玻璃拟态 + 渐变文字 + 发光阴影 + 微动效
- [ ] Hero：渐变标题 + 蜂群轨道 + 双 CTA + 状态徽标
- [ ] **端点转换器**（核心）：表单 → POST register → 结果卡（复制+代码示例）
- [ ] 实战演示：输入+模型选择+调 chat/completions+`x_swarm_trace` 可视化
- [ ] 加载态：阶段文字轮播 + 计时
- [ ] **演示模式兜底**：Mock trace 按钮
- [ ] 六阶段流程图 + 5 角色卡
- [ ] 响应式 + 不造假数据

---

## Part F：给新线程 agent 的开场指令（直接复制）

```
项目根目录：/Users/baihe/Documents/evomap

请先读 docs/handoff-fullstack.md（本文档）了解全局，然后按顺序读：
  src/server.ts src/config.ts src/model.ts src/swarm.ts src/openai-types.ts
  public/index.html AGENTS.md src/agents/registry.ts

任务分两部分，都要完成：

【Part A 后端】让"端点转换"变成真产品（按文档 A.3 节）：
  1. 新建 src/registry.ts（端点注册表，内存 Map）
  2. 改 src/model.ts：realClient 单例 → 动态 upstream 透传（所有调用函数加 upstream 参数）
  3. 改 src/server.ts：加 POST /api/endpoints/register + /v1/chat/completions 从 header 提取 newKey
  4. 透传链路打通（server→swarm→orchestrate→pipeline→model）
  5. npm run typecheck 必须 0 错误
  6. 用真实端点跑通：注册→用 newKey 调通→假 key 返回 401

【Part B 前端】重构 public/index.html 为大气产品官网（按文档 Part B）：
  1. 保持单文件 HTML（内联 CSS+JS），不引构建链
  2. 核心：端点转换器表单对接 /api/endpoints/register（真交互）
  3. 实战演示区：调 /v1/chat/completions + x_swarm_trace 可视化 + 演示模式兜底
  4. 视觉规范严格按 B.1（配色、角色-颜色映射、6 个大气要素）
  5. 完成后 npm run dev，浏览器打开 http://localhost:4000 验证

先做后端（Part A），typecheck 过了再做前端（Part B）。
每完成一步告诉我进度。
```

---

## 附：关键文件行号速查（改的时候定位用）

| 文件 | 行号 | 内容 |
|---|---|---|
| `src/model.ts` | 22-27 | `realClient` 单例（要改的核心） |
| `src/model.ts` | 34-55 | `callReal`（加 upstream） |
| `src/model.ts` | 76-105 | `runBee`（加 upstream） |
| `src/model.ts` | 108-134 | `aggregate`（加 upstream） |
| `src/model.ts` | 137-161 | `callAgent`（加 upstream） |
| `src/model.ts` | 183-194 | `baseline`（加 upstream） |
| `src/server.ts` | 57-104 | `/v1/chat/completions`（加认证+透传） |
| `src/swarm.ts` | 35-122 | `runSwarm`（加 upstream 参数+透传） |
| `src/orchestration/orchestrator.ts` | 92-156 | `orchestrate`（加 upstream） |
| `src/orchestration/pipeline.ts` | 33-83 | `runAgent`（加 upstream） |
| `public/index.html` | 339-369 | 假的 genKey（要改成真 register 调用） |
```
