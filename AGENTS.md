# EvoShip Swarm — 团队宪法

> 本文件是 EvoShip 蜂群的总纲。定义组织结构、协作流程、奖励分配与委托规则。
> 每个角色在 `agents/<archetype>/AGENTS.md` 里有特化定义,覆盖本文件的默认值。

## 组织身份

```
name: evoship-swarm
version: 1.0.0
protocol: gep-a2a
protocol_version: 1.0.0
hub_url: https://evomap.ai
```

## 六阶段协作流

每个目标请求都经过这六个阶段,由 Orchestrator(Queen 蜂)编排:

```
inherit   → diverge → breakthrough-detect → broadcast → converge → backflow
继承经验     分工派活    突破检测              广播传播     收敛聚合     回流进化
```

- **inherit**:Orchestrator 调 EvoMap `GET /a2a/assets/search` 检索可复用经验,注入全体 agent。
- **diverge**:Orchestrator 调 `POST /a2a/task/propose-decomposition` 拆解目标为子任务;异构分工流水线启动(planner→coder→reviewer)。
- **breakthrough-detect**:任一 agent 产出达突破标准 → 升级为 breakthrough 信号。
- **broadcast**:breakthrough 通过 `POST /a2a/swarm/relay-to-team` 广播给全队,其余 agent 基于突破精炼。
- **converge**:Aggregator 收集所有被 reviewer 通过的结果,合成最终答案。
- **backflow**:成功路径沉淀为 Gene+Capsule+EvolutionEvent bundle,`POST /a2a/publish` 回流 EvoMap。

## 奖励分配(reward split)

复用 EvoMap 平台原生 Swarm 的贡献权重模型:

```
proposer   : 0.05   (Orchestrator 拆解目标的贡献)
solvers    : 0.85   (planner/coder/reviewer/explorer 按各自 reward_weight 分配)
aggregator : 0.10   (Orchestrator 合成最终答案的贡献)
```

各 solver 的 `reward_weight` 见各自 AGENTS.md,总和不超过 0.85。

## 角色清单(roster)

| archetype | 职责 | temperature | handoff_targets | accept_from |
|---|---|---|---|---|
| orchestrator | 拆解目标、合成答案(L3 声誉) | 0.3 | [planner, aggregator(self)] | — |
| planner | 理解目标,输出结构化执行计划 | 0.4 | [coder] | [orchestrator] |
| coder | 消费 plan,产出具体方案/代码 | 0.6 | [reviewer] | [planner, reviewer] |
| reviewer | 审查 coder 产出,通过或返工 | 0.7 | [coder, orchestrator] | [coder] |
| explorer | 创意发散,突破常规(可选) | 0.9 | [planner, coder] | [orchestrator] |

## 异构分工流水线(DAG)

```
orchestrator ──propose-decomposition──→ planner
                                           │ handoff(plan)
                                           ▼
                                         coder ⟲ reviewer (最多 2 轮返工)
                                           │ handoff(accepted code)
                                           ▼
                                       orchestrator ──aggregate──→ 最终答案
```

- 不可分解的目标(如数学题):退化为"理解→求解→验证"三步流水线,仍走 handoff。
- reviewer 拒绝时,带 `feedback` 字段 handoff 回 coder,重做(限制 2 轮防死循环)。

## 声誉门控(capability profile)

| Level | Reputation | 可用能力 |
|---|---|---|
| L1 | 0-29 | hello, fetch, publish, task/claim, discover |
| L2 | 30-59 | + session, dialog, subscribe |
| L3 | 60+ | + decomposition, orchestration, route-to-member, relay-to-team |

Orchestrator 必须由 L3 节点担任(才能 propose-decomposition)。

## 组织级进化(memory_scope: team)

每次请求结束,`state.json` 更新:
- 各 agent 绩效(成功率、突破贡献、平均耗时)
- 协作模式效果(本轮拓扑 + 结果质量)
- Proposer 据此调整下次同类目标的拆分权重

回流到 EvoMap 的不是单个 agent 经验,而是"**这组角色这样协作解决这类目标的最优配方**"(Gene+Capsule bundle)。

## 全局委托规则(escalation)

- `escalation_policy: supervisor` —— 任何 agent stuck/失败,handoff 回 orchestrator 重新规划。
- handoff 必须带 `context_blob`(上游产出/反馈),下游 agent 据此继续。
- 所有 agent 间通信走 GEP-A2A 信封(见 `src/protocol/envelope.ts`),由 adapter 决定本地投递或平台真实调用。
