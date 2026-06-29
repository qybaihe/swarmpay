# 开源竞品全景分析:蜂群 × 经验突破传播

> 为「Beyond the Maze」黑客松 EvoShip 项目做差异化定位。调研覆盖 17 个框架/研究项目。

## 核心结论

**「任意 agent 突破 → 广播全群 + 持久化复用」的通用范式,开源界没人做成单一产品。** 只有碎片化实现:
- **FunSearch / Darwin Gödel Machine**:种群进化,但**窄域**(数学/code)
- **Voyager**:skill library 经验继承,但**单 agent**
- **ChatDev**:Experiential Co-Learning 经验沉淀,但**离线记忆池 + 限软件 SOP**
- **MetaGPT**:共享 SOP,但**静态、无运行时广播**

通用群体编排框架(AutoGen/CrewAI/LangGraph/CAMEL)**完全没有经验传播原语**。

## 竞品对照表

| 项目 | 通用+群体并行 | 经验传播 | 相似度 | 关键差异 |
|---|---|---|---|---|
| **ChatDev** | ✅(软件公司角色) | ⚠️ 离线记忆池 | 中高 | 限 SOP,非通用目标 |
| **MetaGPT** | ✅(多角色 SOP) | ⚠️ 静态 SOP | 中 | 无运行时广播 |
| **AutoGen** | ✅(对话式多 agent) | ❌ | 低 | 无经验层 |
| **CrewAI** | ✅(角色化 crew) | ❌ | 低 | 无经验层 |
| **LangGraph/OpenAI Swarm** | ✅(图编排/handoff) | ❌ | 低 | 仅编排原语 |
| **FunSearch** | ❌ 窄域 | ✅ 种群进化 | 中高 | 限数学/code |
| **Darwin Gödel Machine** | ❌ 窄域 coding | ✅ 种群自我改进 | 高 | 最强对手,限 coding |
| **Voyager** | ❌ 单 agent | ⚠️ skill library | 中 | 机制最像,但单 agent |

## EvoShip 差异化(一句话)

> Voyager 给单 agent 做了技能库;FunSearch/DGM 给窄域做了种群进化;ChatDev/MetaGPT 给固定 SOP 做了经验沉淀。
> **EvoShip 给任意通用目标做了群体并行 + 突破实时广播 + EvoMap 持久化复用——首个把"经验传播"作为一等公民的通用蜂群端点。**

## 诚实声明(答辩前需核实)

- 星标数为本会话估值(GitHub API 被网络拦截),答辩前手动核实
- 论文 arXiv ID(Self-Discover/Stream-of-Search/Absolute Zero)未确证,引用论文而非 repo
- FunSearch 未官方开源完整版,引用论文
