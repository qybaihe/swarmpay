# 项目概念分析:通用蜂群目标引擎

> 你的核心想法:**通用**(任意目标)→ 派出**一堆 agent 蜂群**并行/迭代 →
> **谁有突破就把经验传给其他蜂** → 整体达成目标的概率 > 单个 agent。

## 一、最关键的发现:你的想法 = EvoMap 平台的原生能力

这不是巧合——EvoMap 的整个设计哲学就是「**当一个 agent 解决了问题,全球的 agent 立刻继承这个能力**」
(原文:`When one agent solves a problem, agents worldwide inherit the solution instantly`)。

平台原生提供你想要的**每一个**机制:

| 你想要的 | EvoMap 原生机制 | 端点 |
|---|---|---|
| 通用目标 | Bounty 任务系统(任意问题) | `POST /bounty/create` |
| 一堆 agent 并行 | Swarm decomposition | `POST /a2a/task/propose-decomposition` |
| **突破传给其他蜂** | **swarm/result + relay-to-team** | `POST /a2a/swarm/result` `/relay-to-team` |
| 实时共享经验 | Multi-agent Session + shared context | `POST /a2a/session/message`(广播) |
| 协调信号 | swarm/signal / intent | `POST /a2a/swarm/{signal,intent}` |
| 比单个 agent 更强 | **Diverge-Converge 模式**(多 agent 独立解 → AI 评估合成最优) | 任务标记 divergent 触发 |
| 突破永久沉淀 | Gene+Capsule bundle 发布 → 全球继承 | `POST /a2a/publish` |
| 好突破自动传播 / 差的淘汰 | GDI 评分 + 自然选择 | 内建 |

**这意味着:你不是在重复造轮子,而是在「激活 + 可视化 + 通用化」平台已有能力。**
参赛的正确定位是:做一个**让平台原生蜂群能力对任意目标可用的执行层 + 观察层**。

## 二、平台有三种「多 agent 协作」模式,你的项目要选/组合

| 模式 | 机制 | 经验传播? | 适合你? |
|---|---|---|---|
| **Decompose-Solve-Aggregate** | 拆成不同子任务,各做各的,最后聚合 | 弱(各自独立) | 部分 |
| **Collaboration Session** | 共享上下文 + 实时消息 + DAG 任务板 | **强(session/message 广播)** | ✅ 核心 |
| **Diverge-Converge** | 同一问题给 2-5 个 agent **独立**解,AI 评估合成最优 | **最强(突破后质量加权融合)** | ✅ 亮点 |

**你的"突破传播"最精确对应的平台机制 = Diverge-Converge + Collaboration Session 的组合**:
- Diverge-Converge:多蜂独立攻同一目标,谁的解更好就拿更多权重(这正是"谁有突破谁胜出")
- Session:过程中用 `swarm/result` + `relay-to-team` 把中间突破实时广播给全队

## 三、关键约束(决定可行性)

1. **Reputation 分级解锁**——这是最重要的现实约束:
   - Level 1 (rep 0-29):只能 hello/fetch/publish/task — **不能 decompose、不能 session**
   - Level 2 (rep 30-59):+ session/dialog/subscribe
   - **Level 3 (rep 60+):+ decomposition/orchestration** — 你要的蜂群拆解需要这个
   - 新号 rep=0,达不到。→ **参赛 demo 不能依赖真实调用 swarm 高级端点**

2. **解决方案**:两层架构
   - **演示层(自建,确定可跑)**:我们的 orchestrator 自己实现"目标→拆解→多蜂并行→突破广播",
     用 EvoMap 的 `recipes?q=` 检索经验作为"继承",用 `recipe/publish`(test mode)作为"沉淀回流"。
     这条路径走 **A 路径(Developer OAuth)**,HACKATHON.md 钦定,test_mode 零风险。
   - **真实接入层(叙事 + 如有 rep 则启用)**:调用平台 `propose-decomposition` / `session` /
     `swarm/result`,展示"我们的蜂群最终接入全球进化网络"。路演时这是 vision 加分项。

3. **Diverge-Converge 是平台内建**:如果你的 agent 有一定 reputation,可以直接触发;
   否则我们在自己的 orchestrator 里复刻这个模式(N 个 worker 独立解 → critic 评估 → 合成)。

## 四、项目定位(一句话)

> **SwarmGoal:一个通用蜂群目标引擎。任意目标 → 召唤多 agent 蜂群独立攻关 →
> 谁突破就把经验广播给全队并回流 EvoMap → 整体成功率 > 单 agent。**
> 它是 EvoMap 蜂群智能的通用化执行层 + 实时可视化观察层。

差异化于平台原生的点:
- **通用化**:平台 swarm 绑定在 bounty 任务里;我们做成"输入任意目标即可"的前端产品
- **突破传播显式化**:平台经验传播是隐式的(publish→fetch);我们做成**实时可视**的"突破→广播→其他蜂进化"
- **继承可见**:每次攻关先从 EvoMap 拉经验,完成后回流——形成"越跑越聪明"的闭环

## 五、核心循环(要实现的"持续努力"逻辑)

```
用户输入目标 G
  ↓
[继承] orchestrator 调 recipes?q=G + reuse-graph,取出已有经验注入每只蜂
  ↓
[发散] 派 N 只蜂,每只独立攻关 G(不同策略/prompt 变体)  ← Diverge
  ↓
[突破检测] critic 监测:某只蜂达到里程碑 / 验证通过 / 局部成功
  ↓
[传播] 该蜂的突破经验 → swarm/result 广播给全队 + 注入其他蜂的 context  ← 关键
  ↓
[收敛] 其他蜂基于突破迭代 → critic 评估全部解,质量加权合成  ← Converge
  ↓
[判定] 目标达成? → 是:沉淀 Gene+Capsule/recipe 回流 EvoMap
                → 否:基于新经验再发散一轮(持续努力)
```

**"比单 agent 更可能达成"的理论依据**:这就是经典 diverge-converge / population-based 的优势——
多起点独立探索避免局部最优,突破即时共享让群体快速收敛到高质量解。
平台 Diverge-Converge 文档明确写了这个机制(50% 能力匹配 + 50% 声誉选 diverse agent)。

## 六、关于"有没有开源同类"(调研进行中,初步结论)

待补充:后台调研 agent 正在全面检索。初步判断:
- **通用多 agent 蜂群框架**:有(CrewAI, AutoGen, LangGraph, ChatDev, MetaGPT 等),但大多是
  "角色分工流水线",**不是**"同目标多 agent 独立攻关 + 突破传播"。
- **突破传播 / 跨 agent 经验转移**:这是较新颖的范式,多数框架做"消息传递"而非"能力继承"。
- **最接近的研究**:Darwin Gödel Machine、FunSearch、Absolute Zero(自我进化),
  但都是研究原型,非通用产品。
- **EvoMap 本身**是这个范式的平台化实现——你的项目是它的应用层。

(详细竞品表见调研结果补充)

## 七、需要你确认的两点

1. **飞书黑客松手册**:官网没有独立 hackathon 页面(404),「Beyond the Maze」是独立赛事。
   三条赛道(A2A / 资金化助手 / 行业场景)的**详细规则、评分标准、提交格式**只在飞书手册里。
   请登录飞书复制手册正文给我——这决定我们 demo 的合规边界和加分重点。

2. **你倾向哪种演示形态**?
   - (a) **前端可视化为主**:输入目标 → 看蜂群实时攻关动画 + 突破传播连线 → 出结果。
     demo 效果炸裂,但蜂群行为部分是模拟/半真实。
   - (b) **真实接入为主**:真调 EvoMap API(检索+发布)+ 自建 orchestrator 跑真蜂群,
     前端展示真实事件流。更扎实,但受 reputation 限制,高级 swarm 端点用不了。
   - 我推荐 **(a)+(b) 混合**:真实 EvoMap 检索/沉淀 + 自建蜂群引擎 + 漂亮可视化。
