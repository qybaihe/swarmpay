# EvoShip 前端重构 · 完整交接提示词

> 目标：把现有单页官网（`public/index.html`，纯静态、纯展示）升级为一个**有视觉冲击力的科技感产品官网 + 蜂群协作实时可视化 demo**。
> 风格定位：**大气、未来感、赛博朋克 × 生物科技**（蜂群 = 有机智能）。对标 Opencove（蓝药丸大奖）的视觉档次。
> 本提示词可完整移交给前端实现 agent，包含所有数据契约、视觉规范、页面结构、实现要点。

---

## 0. 一句话项目定位（必须传达到）

**EvoShip 是一个 OpenAI 兼容的蜂群推理端点。** 用户把任意 OpenAI 兼容客户端的 `base_url` 换成 EvoShip，每个请求背后就有一群 agent 蜂群分工协作（planner→coder→reviewer），谁突破就把经验广播给全队，聚合出优于单次调用的结果。专为「Beyond the Maze」黑客松 **A2A 蜂群协作赛道（The Forge）** 设计，深度接入 EvoMap 经验继承/回流。

**前端要传递的核心感受（按优先级）：**
1. 🐝 **蜂群协作是真实的、可视的**——不是堆砌卡片，是能看到 agent 之间在通信、分工、突破、纠错
2. 🧬 **接入 EvoMap 经验网络**——越用越聪明，经验会继承和回流
3. ⚡ **接入零门槛**——改一个 base_url，任意客户端即用

---

## 1. 现状盘点（实现前必读）

### 1.1 现有文件
- `public/index.html`（383 行，单文件，内联 CSS+JS）
- 当前内容：静态展示页（hero + 三档模型卡 + 单模型vs蜂群对比表 + 端点转换表单）
- 配色（**已定调，保留**）：深色赛博风
  - 背景 `#05060f` / `#0a0d1f`
  - 主色 cyan `#3ae0ff`、violet `#8b5cff`、green `#3dffb0`、amber `#ffb84d`、pink `#ff5cc8`
  - 文字 `#e8ecff` / muted `#8893bf` / dim `#5a6494`
- 后端：Express 服务在 `src/server.ts`，端点见下节

### 1.2 后端能提供的数据（前端可视化素材来源）
所有可视化数据来自后端 API 响应里的 `x_swarm_trace` 字段。**这是唯一的数据源，前端所有"协作过程"展示都基于它。**

```typescript
// 后端返回结构(POST /v1/chat/completions 的 choices[0] 同级还有 x_swarm_trace)
interface SwarmTrace {
  tier: string;                    // "swarm-heavy" 等
  model: string;
  swarm_size: number;              // 子任务数
  inherited_recipes?: {            // 从 EvoMap 继承的经验
    title: string;
    description?: string;
  }[];
  bees: {                          // ⭐ 核心:每个 agent 的执行记录
    id: string;                    // 如 "planner-plan"
    variant: string;               // planner/coder/reviewer/orchestrator
    status: "ran" | "breakthrough" | "hinted" | "timed_out";
    latency_ms: number;
    snippet: string;               // 前 120 字产出
  }[];
  breakthroughs_broadcast: number; // 突破广播次数
  aggregator: "vote" | "llm";
  evomap_backflow?: {              // 是否回流到 EvoMap
    status: "skipped" | "published";
    title?: string;
  };
  total_latency_ms: number;
}
```

**已知限制（前端必须优雅降级）：**
- 当前后端的 trace **没有** handoffs / rewardSplit / revisionRounds 字段（这些在 `CollaborationTrace` 类型里，但 `swarm.ts` 末尾转 `SwarmTrace` 时没带过去）。
- **前端实现时：基于现有 `bees[]` 数组渲染即可**。如果未来后端补全字段，前端能扩展即可，不要现在依赖缺失字段。
- 不要捏造数据。trace 没有的就别显示，宁可少不可假。

### 1.3 现有 API 端点（前端可调用）
| 方法 | 路径 | 用途 | 前端用法 |
|---|---|---|---|
| GET | `/` | 返回官网页 | 部署时根路径 |
| GET | `/api/status` | 健康检查 | 首页展示"端点在线/离线"状态徽标 |
| GET | `/v1/models` | 列出 4 档模型 | 模型选择器下拉 |
| POST | `/v1/chat/completions` | **核心**：触发蜂群 | demo 里用户输入目标，调这个，拿 `x_swarm_trace` 可视化 |

**请求示例（OpenAI 兼容格式）：**
```javascript
const res = await fetch('/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'swarm-heavy',          // swarm-baseline|swarm-lite|swarm-heavy|swarm-evo
    messages: [{ role: 'user', content: '用户输入的目标' }],
  }),
});
const data = await res.json();
const answer = data.choices[0].message.content;      // 最终答案
const trace = data.x_swarm_trace;                     // ⭐ 蜂群过程(可视化用)
```

---

## 2. 视觉规范（"大气"的具体定义）

### 2.1 风格关键词
**赛博朋克 × 生物科技（Bio-cyberpunk）。** 不是冰冷的代码编辑器风，而是"有机的智能"——蜂群是有生命的网络。

### 2.2 配色系统（在现有基础上扩展为语义化）
```css
:root{
  /* 底色层 */
  --bg:#05060f;          /* 最深 */
  --bg2:#0a0d1f;         /* 次深 */
  --panel:rgba(18,22,44,.55);
  --panel-line:rgba(120,160,255,.14);

  /* 主色(用于强调/CTA/渐变) */
  --cyan:#3ae0ff;        /* 主交互色 */
  --violet:#8b5cff;      /* 次强调 */
  --pink:#ff5cc8;        /* 点缀 */

  /* 语义色(新增,蜂群可视化用) */
  --green:#3dffb0;       /* 成功/通过/APPROVE */
  --amber:#ffb84d;       /* 警告/返工/REJECT */
  --blue:#5ca8ff;        /* 信息/规划 */
  --red:#ff5c7a;         /* 错误/超时 */

  /* 文字 */
  --text:#e8ecff;
  --muted:#8893bf;
  --dim:#5a6494;

  /* 效果 */
  --glow:0 0 24px rgba(58,224,255,.35);
}
```

### 2.3 角色-颜色映射（蜂群可视化的关键规范）
每个 agent archetype 有固定视觉身份，**全站必须一致**：
| 角色 variant | 颜色 | 图标 | 中文 |
|---|---|---|---|
| `orchestrator` | amber `#ffb84d` | 👑 | 蜂后（编排） |
| `planner` | blue `#5ca8ff` | 🗺️ | 规划蜂 |
| `coder` | cyan `#3ae0ff` | ⚡ | 实现蜂 |
| `reviewer` | violet `#8b5cff` | 🔍 | 审查蜂 |
| `explorer` | pink `#ff5cc8` | 💡 | 探索蜂 |

### 2.4 字体与排版
- 正文：`-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`
- 代码/数字/ID：`"SF Mono", Consolas, monospace`
- 标题字重用 800-900，大字号（hero 用 `clamp(40px,6vw,68px)`）
- 字间距：大标题 `-1.5px`（紧凑显大气）

### 2.5 "大气"的 6 个视觉要素（落地清单）
1. **满屏深色背景 + 多层光晕**：左上 violet 径向光 + 右下 cyan 径向光 + 极淡网格线（46px）+ 横向扫描线动画（8s 循环）
2. **玻璃拟态卡片**：`backdrop-filter: blur(14px)` + 半透明背景 + 1px 微光边框
3. **渐变文字**：标题用 `linear-gradient` + `background-clip:text`（cyan→violet→pink）
4. **发光阴影**：CTA 按钮、关键卡片 hover 时 `box-shadow: 0 0 36px rgba(58,224,255,.5)`
5. **微动效**：蜂群轨道旋转（16-34s 不同速度反向转）、按钮 hover 上移、数字 count-up、状态点呼吸
6. **大量留白**：section 之间 `padding: 96px 0`，不要挤

---

## 3. 目标页面结构（7 个区块）

> 保持**单页应用**（SPA，平滑滚动锚点），但内容大幅升级。建议沿用单 HTML 文件或拆成组件均可，实现 agent 自选。

### ① 导航栏（sticky，毛玻璃）
- 左：🐝 logo + **EvoShip**（渐变文字）
- 中：锚点导航（协作原理 / 模型 / 实战演示 / 接入）
- 右：状态徽标（实时调 `/api/status`，绿点=在线）+ CTA「立即体验」

### ② Hero（首屏，必须有冲击力）
- 顶部 badge：`● EvoMap A2A 赛道 · 蜂群协作推理引擎`（绿点呼吸）
- 大标题：`一群 Agent，<渐变>替你把活干漂亮</渐变>`
- 副标题：一句话讲清接入价值（改 base_url 即用）
- 双 CTA：`⚡ 立即体验蜂群` + `了解协作原理`
- **首屏视觉锚点**：中央蜂巢图标 + 多层轨道环绕的蜜蜂（不同速度旋转），保留并强化现有的 `swarm-vis` 动画
- 首屏底部加一行"跑分数据条"（如果后端有 benchmark 结果，则展示；没有则留占位，**不要造假数据**）

### ③ 协作原理（六阶段流程图，核心叙事）
把 README 的六阶段做成**横向流程图 + 动画**：
```
继承 → 发散 → 突破检测 → 广播 → 收敛 → 回流
inherit   diverge   breakthrough   broadcast   converge   backflow
```
- 每个阶段一个卡片，带图标 + 一句话 + 简短说明
- 卡片间有流动的连接线（箭头 + 流光动画）
- 配合角色-颜色映射（如突破检测用 amber，收敛用 cyan）
- **这是讲清赛道契合度的关键区块**——要让人一眼看懂"经验怎么继承、怎么回流"

### ④ 蜂群角色阵容（5 个角色卡片）
基于 `agents/*/AGENTS.md` 和 `src/agents/registry.ts`：
- orchestrator / planner / coder / reviewer / explorer 五张卡
- 每张卡：角色图标（角色-颜色映射）+ 中文名 + 一句 focus + 关键属性（temperature / handoff_targets / reward_weight）
- 卡片之间用细线连出 handoff 关系图（planner→coder→reviewer→返工回环）

### ⑤ ⭐ 实战演示（最强的 demo 区块，必须有）
**这是前端最有价值的部分——让评委亲眼看到蜂群协作过程。**

交互流程：
1. 用户在输入框输入一个目标（预填示例："用 HTML 写一个登录页面"）
2. 可选模型档（swarm-baseline / swarm-lite / swarm-heavy / swarm-evo，下拉，默认 swarm-heavy）
3. 点击「派出蜂群」
4. 前端 POST `/v1/chat/completions`
5. **加载态**：展示一个简化的蜂群协作动画（agent 节点依次亮起、连线流动），表示正在分工
6. **结果展示**（拿到 `x_swarm_trace` 后）：
   - **最终答案**：`choices[0].message.content`（markdown 渲染）
   - **协作过程可视化**（基于 `trace.bees[]`）：
     - 每个 bee 一个节点，按 `variant` 上色（角色-颜色映射）
     - `status: breakthrough` 的节点加发光高亮 + ⚡ 图标
     - 节点旁显示 `latency_ms`、`snippet`（点击展开看完整 snippet）
     - 用连线表示执行顺序（按 bees 数组顺序）
   - **关键指标条**：子任务数（swarm_size）、突破广播次数（breakthroughs_broadcast）、总耗时（total_latency_ms）、聚合方式（aggregator）
   - **EvoMap 联动**：如果有 `inherited_recipes`，显示"已继承 N 条经验"；如果 `evomap_backflow.status === 'published'`，显示"已回流进化网络 ✅"
7. **降级处理**：如果后端没跑通（fetch 失败/超时），展示一个友好的"演示模式"提示，并提供一段**预录制的 mock trace JSON**（见 §5）让前端可视化照常演示

**⚠️ 重要：这个区块要做"即使后端挂了也能演"的降级。** 黑客松现场网络不稳，必须有一份本地 mock 数据兜底。

### ⑥ 模型档位（4 档卡片，保留现有，优化样式）
swarm-baseline / swarm-lite / swarm-heavy / swarm-evo，沿用现有设计但：
- 每张卡加上"适合场景"
- swarm-heavy 和 swarm-evo 标记为"★ 推荐"
- 可点击切换演示区（⑤）的默认模型

### ⑦ 接入（端点转换器，保留现有表单）
现有的"上传 endpoint/key/model → 获取蜂群端点"表单保留，优化视觉：
- 结果展示用复制按钮 + 代码示例高亮
- 加一个"支持客户端"的 logo 墙（Cursor / Cline / Aider / LangChain / Continue，文字 logo 即可）

### ⑧ Footer
- logo + 一句话
- 链接：EvoMap / 协作原理 / 模型 / 接入
- 底部标语：`Beyond the Maze · A2A 蜂群协作 · 蜂群推理 × EvoMap 经验进化`

---

## 4. 蜂群可视化组件的技术要求（重点）

这是 §⑤ 的核心，单独详述。

### 4.1 数据 → 视觉映射规则
```
trace.bees[] (有序数组) → 顺序节点链
  每个 bee:
    variant      → 节点颜色 + 图标 (角色-颜色映射表)
    status       → 节点状态样式
                   ran        → 实心节点
                   breakthrough → 实心 + 外圈光晕 + ⚡
                   hinted     → 半透明 + 虚线边框
                   timed_out  → 灰色 + ✕
    latency_ms   → 节点旁小字 "{ms}ms"
    snippet      → 点击节点弹出详情卡

trace.breakthroughs_broadcast → 流光动画触发次数
trace.swarm_size              → 顶部指标 "N 个子任务"
trace.total_latency_ms        → 顶部指标 "总耗时 {s}s"
trace.inherited_recipes       → 顶部 badge "🧬 继承 N 条 EvoMap 经验"
trace.evomap_backflow         → 结尾状态 "✅ 已回流进化网络"
```

### 4.2 推荐实现方式（实现 agent 自选其一）
- **方案 A（纯 CSS/SVG，推荐省事）**：flex 横向排列节点，节点间用 SVG `path` + `stroke-dasharray` 动画做流动连线。状态切换用 CSS class。
- **方案 B（Canvas 粒子，最炫）**：用 canvas 画动态蜂群粒子，节点间连线实时流动。视觉最好但开发量大。
- **方案 C（D3 force graph）**：力导向图布局，适合展示复杂拓扑。但当前 bees 是有序链，不一定需要。

**建议方案 A**，性价比最高，且 trace 是线性序列，不需要复杂拓扑。

### 4.3 加载态动画（请求中展示）
后端真实模型下一题可能要 30-90s。加载态必须让人不无聊：
- 蜂巢图标居中，蜜蜂粒子从四周汇聚
- 显示当前阶段文字轮播："🧬 继承经验…" → "🗺️ 规划拆解…" → "⚡ 分工实现…" → "🔍 审查纠错…" → "👑 聚合结果…"
- 一个不确定进度的进度条（呼吸式，非线性）
- 已耗时计时器

---

## 5. Mock 数据兜底（现场演示必须用）

当后端不可达或用户不想等待时，前端用这份预置 trace 演示可视化：

```json
{
  "tier": "swarm-heavy",
  "model": "mimo-v2.5-pro",
  "swarm_size": 3,
  "inherited_recipes": [
    { "title": "登录页面最佳实践", "description": "表单验证、无障碍、响应式布局" }
  ],
  "bees": [
    { "id": "orchestrator-decompose", "variant": "orchestrator", "status": "ran", "latency_ms": 1400, "snippet": "分解为 3 个子任务：结构设计 / 样式实现 / 表单验证" },
    { "id": "planner-plan", "variant": "planner", "status": "breakthrough", "latency_ms": 16000, "snippet": "## 执行计划\n1. 语义化 HTML 结构（form/input/button）\n2. CSS Grid 居中布局 + 输入框 focus 态\n3. 前端表单校验（必填、邮箱格式）" },
    { "id": "coder-implement", "variant": "coder", "status": "ran", "latency_ms": 13000, "snippet": "```html\n<form class=\"login\">\n  <input type=\"email\" required />\n  <button>登录</button>\n</form>\n```" },
    { "id": "reviewer-review", "variant": "reviewer", "status": "ran", "latency_ms": 12000, "snippet": "## 审查结论\nverdict: APPROVE\n- 优点：结构语义化、含表单验证" }
  ],
  "breakthroughs_broadcast": 1,
  "aggregator": "llm",
  "evomap_backflow": { "status": "published", "title": "登录页面工作流" },
  "total_latency_ms": 42400
}
```

**最终答案兜底文本（同上场景）：**
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>登录</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0d1f;color:#e8ecff;font-family:sans-serif}
  .login{display:flex;flex-direction:column;gap:12px;padding:32px;background:rgba(18,22,44,.6);border:1px solid rgba(58,224,255,.2);border-radius:16px;width:320px}
  .login input{padding:12px;border-radius:8px;border:1px solid rgba(58,224,255,.2);background:rgba(0,0,0,.3);color:#e8ecff}
  .login button{padding:12px;border:0;border-radius:8px;background:linear-gradient(90deg,#3ae0ff,#8b5cff);color:#05060f;font-weight:700;cursor:pointer}
</style></head>
<body>
<form class="login" onsubmit="return validate()">
  <h2 style="margin:0;text-align:center">登录</h2>
  <input type="email" id="email" placeholder="邮箱" required>
  <input type="password" id="pwd" placeholder="密码" required>
  <button type="submit">登录</button>
</form>
<script>
function validate(){
  const e=document.getElementById('email').value;
  if(!/^[^@]+@[^@]+\.[^@]+$/.test(e)){alert('邮箱格式错误');return false;}
  return true;
}
</script>
</body>
</html>
```

实现时把这份数据存成前端常量（如 `MOCK_TRACE`、`MOCK_ANSWER`），demo 区提供一个「▶ 演示模式」按钮直接载入，不调后端。

---

## 6. 技术栈选择

- **强烈建议：保持单文件 HTML（内联 CSS/JS）**，与现有 `public/index.html` 一致，部署零配置（Express 直接 `sendFile`）。
- 如果复杂度需要，可用原生 ES module + 一个轻量状态管理，**不引入 React/Vue 构建链**（增加部署复杂度，黑客松不值）。
- 图标：优先 emoji + 内联 SVG，不引图标库。
- 动画：CSS keyframes 为主，复杂蜂群动画用少量 JS/canvas。

---

## 7. 实现验收标准（Checklist）

实现 agent 完成后请逐项自检：

- [ ] 视觉：深色赛博风，玻璃拟态卡片，渐变文字，发光阴影，微动效
- [ ] 首屏 Hero：标题渐变 + 蜂群轨道动画 + 双 CTA + 状态徽标（调 `/api/status`）
- [ ] 协作原理：六阶段流程图（继承→发散→突破→广播→收敛→回流），卡片间流光连线
- [ ] 角色阵容：5 个角色卡（角色-颜色映射一致），handoff 关系可视化
- [ ] **实战演示区**（最重要）：
  - [ ] 输入框 + 模型选择 + 「派出蜂群」按钮
  - [ ] 调 POST `/v1/chat/completions`，解析 `x_swarm_trace`
  - [ ] 蜂群节点链可视化（颜色按 variant，breakthrough 高亮）
  - [ ] 关键指标条（子任务数/突破数/耗时/聚合方式）
  - [ ] EvoMap 联动展示（继承经验/回流状态）
  - [ ] **加载态**动画（阶段文字轮播 + 计时）
  - [ ] **降级兜底**：演示模式按钮，载入 §5 mock 数据
- [ ] 模型档位：4 档卡片，推荐档标记
- [ ] 接入区：端点转换表单 + 客户端 logo 墙
- [ ] 响应式：移动端布局可用（导航折叠、栅格变单列）
- [ ] 不造假数据：benchmark 没有就不显示跑分条，留占位

---

## 8. 参考对标

- **Opencove**（北京场蓝药丸大奖）——视觉档次和"未来工作台"叙事感的目标
- **EvoCorp**（红药丸大奖）——A2A 协作话术（一句话开公司/Agent 团队）
- 现有 `public/index.html` 的配色和基础结构（保留 DNA，升级质感）

---

## 9. 给实现 agent 的开场指令（可直接用）

```
我要重构 /Users/baihe/Documents/evomap/public/index.html 这个前端页面。
请先读 docs/frontend-handoff-prompt.md（完整交接文档）和现有 public/index.html。

任务：把现有单页官网升级为"大气、未来感"的蜂群协作产品官网 + 实时可视化 demo。
核心要求见 docs/frontend-handoff-prompt.md 的 §3 页面结构和 §4 蜂群可视化组件。
技术栈保持单文件 HTML（内联 CSS/JS），不引构建链。

先从 Hero 区和六阶段流程图开始，让我看效果，再继续实战演示区。
```
