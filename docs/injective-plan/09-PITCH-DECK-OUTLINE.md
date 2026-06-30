# 09 · SwarmPay Pitch Deck(路演简报)逐页定稿

> **产出形式**:先本 Markdown 定稿 → 再用 PPT 技能生成暗色科技风 .pptx → 导出 PDF(≤10MB)。
> **视觉风格**:暗色科技风,对齐网站设计 token(深空黑 `#04050d` 底 + 青 `#3ae0ff` / 紫 `#8b5cff` / 金 `#ffd23f` 高光)。字体:标题粗黑,正文无衬线,代码与地址用等宽。
> **页数**:15 页。**口号主线**:"让 AI agent 的协作 —— 有价格、可分配、能流通"。
> **准确性红线**(经代码逐行核实,严防评委追问翻车):
> - 已做 / 路线图严格分开。当前链层使用 `@injectivelabs/sdk-ts`(真链签名广播);官方页面明确提到 iAgent SDK / Injective Agent SDK / MCP Server,但本项目当前尚未接入,只能作为路线图与生态对齐项表述。
> - **链上分润当前走 direct 模式(多笔 `MsgSend`)**;CosmWasm 分润合约**代码已写好 + 16 单测全过 + wasm 编译成功,但尚未部署上链**(部署属路线图)。
> - **真实上链凭证**:tx `9477EC31…` 是 testnet 上一笔**真实 `MsgSend` 转账(0.1 INJ)**,只证明签名广播能力已通;分润凭证以 demo 现场 `/run` 实时生成的 tx hash 为准。当前已有一次 `/run` 分润 tx `107E7909…` 可作参考,但提交/路演仍建议现场重跑。
> - **悬赏链路已实现并接入返工回路**(`bounty-decider` LLM + 规则兜底 + `AgentWallet` 自签),`/api/injective/run` 会在跑蜂群前刷新 reviewer 链上余额;真实悬赏仍需 reviewer 钱包有可用 INJ,可在 demo 前注资确保触发。
> - 口径统一:**5 个协作 agent(orchestrator/planner/coder/reviewer/explorer)+ 1 个 treasurer 协议钱包 = 6 个链上地址**;分润给 4 个产出 agent(planner/coder/reviewer/orchestrator),5% 服务费给 treasurer。

---

## 第 1 页 · 封面

**标题**:`SwarmPay`
**副标题**:`Injective 上的 AI Agent 自主经济体`
**一行点睛**:`让 AI agent 的协作 —— 有价格、可分配、能流通`
**角标**:`Injective 新星计划 · 方向 D:AI 智能支付(+ A 智能体基础设施)`
**底部占位**:队名 / 队长 / 2026.06
**视觉**:满屏深空黑 + 蜂群粒子流光动效静帧(金色金币从中心向五角色节点辐射的抽象图),左下 Injective logo,右下 GitHub `github.com/qybaihe/swarmpay`。

---

## 第 2 页 · 一句话定位

**大字**:
> 一支在 Injective 链上自主协作的 AI 蜂群 ——
> 每次任务,**LLM 按贡献实时裁定分润,INJ 链上结算**,每个 agent 拿赚到的钱**自己悬赏**同伴。

**三个关键词卡**(横排,各一图标):
- 🧠 `自进蜂群` — 5 协作 agent 分工 + 经验继承,越用越聪明
- ⛓️ `链上分润` — LLM 裁定权重,INJ 链上结算(MsgSend 已跑通 / CosmWasm 合约就绪),tx 可查
- 💸 `价值流通` — 6 链上地址(5 agent + treasurer),赚了能花,形成 agent 间经济闭环

**视觉**:中间一条横向"价值流"光带:用户预算 → 蜂群协作 → LLM 分润 → 各 agent 钱包 → 悬赏回流。

---

## 第 3 页 · 团队介绍

**结构**:左 team avatar 区(占位),右角色分工。
- **队长**:白头(占位)— 全栈架构 / 链层 / 蜂群内核
- **方向**:AI × Web3,Injective 生态 agent 经济
- **相关经历**(可选点出):此前完成 EvoShip 通用蜂群协作引擎(经验继承 + 突破广播),本项目在其基础上做链上资金化改造
- **仓库**:github.com/qybaihe/swarmpay(MIT,10+ commits)
**视觉**:暗色卡片 + 青色描边,占位头像用渐变圆。
> 注:团队 5 项信息(队名/队长姓名/微信ID/邮箱/城市)由用户填入,本页留占位。

---

## 第 4 页 · 痛点:AI 协作的「价值黑箱」

**大标题**:`多个 agent 一起干活,但价值停在一个黑箱里`

**三栏痛点卡**(每栏一个红/橙警示图标):
1. **谁贡献多少?** — 多 agent 协作后,贡献不可量化,平均分账或拍脑袋分
2. **怎么结算?** — 平台账本记账,无链上凭证,不可审计,agent 拿不到真金白银
3. **agent 不能花钱** — agent 只是工具,赚的钱进平台口袋,无法激励、无法自主、无法形成 agent 经济

**底部一行**:
> 今天的 AI agent 协作是「单向消耗」:用户付钱给平台,平台付钱给模型,agent 之间没有价值流动 —— **因为价值停在链下账本里,agent 从不"拥有"也不"行动"**。不上链,agent 永远只是工具。

**视觉**:一个黑色方框中间打问号,三条箭头指不出去(价值停在框内)。

---

## 第 5 页 · 解决方案:把贡献权重落到链上

**大标题**:`SwarmPay = 蜂群协作内核 + 链上分润经济`

**核心等式**(居中大字,金色):
> `贡献 → LLM 裁定权重 → Injective 链上结算 → agent 自有钱包入账`

**四步说明**(编号时间线,横向):
1. **下目标 + 链上预算** — 用户附带 INJ 预算发起任务
2. **蜂群协作** — orchestrator 拆解,planner→coder→reviewer 闭环(+explorer 发散),产出协作 trace
3. **LLM 裁定分润** — LLM 读 trace 里的贡献,出 reward_split 权重,规则做 breakthrough 微调(非写死;LLM 挂了回落静态权重)
4. **链上结算** — 扣 5% 协议费给 treasurer → 按权重把 INJ 分到参与 agent 钱包(MsgSend 已跑通 / 合约模式就绪),tx hash 可查

**视觉**:横向 4 节点流程,每节点暗色卡片 + 编号圆,箭头金色渐变。

---

## 第 6 页 · 产品演示(核心 demo)

**标题**:`一次调用 = 蜂群答案 + 链上分润回执`

**左半**:OnchainRunView 截图(占位)— 表单(目标+预算+tier)+ 答案 + 协作 trace 时间线 + 分润流向图 + 交易回执
**右半**:四块结果卡
- 🐝 **蜂群答案** — markdown 渲染的最终产出
- 🧩 **协作 trace** — 每步 agent + verdict(approve/reject)
- 💸 **分润流向** — SplitFlowGraph 金色箭头:sender → 各 agent,按权重
- 🧾 **交易回执** — txHash + height + 各角色到账金额,可跳 Mintscan

**底部真实数据条**:
> testnet injective-888 · 6 个链上地址(5 agent + treasurer)已配置并私钥就绪 · 真实 `MsgSend` 签名广播已验证(tx `9477EC31…`,0.1 INJ 上链)· `GET /api/injective/smoke` 一键自检 6 地址余额 · 现场 `/run` 实时生成分润 tx hash 可审计

**视觉**:真实产品截图占大头,右侧卡片用半透明暗色玻璃。
> ⚠️ Demo 现场务必 live 跑一次 `/run`,把当场生成的分润 tx hash 贴到本页 —— 不要用 `9477EC31` 背书"分润已上链"(那只是单笔测试转账)。

---

## 第 7 页 · 技术亮点 ① 自研蜂群协作内核

**标题**:`不是套壳编排,是自研的通用蜂群引擎`

**左:五角色六阶段**(竖排角色卡,各带角色色)
- 🟡 orchestrator 旗舰 — 拆解调度,聚合最终答案
- 🔵 planner 导航 — 输出结构化航线计划
- 🟢 coder 工程 — 消费计划/反馈,直奔可落地方案
- 🟣 reviewer 监察 — 批判纠错,带反馈返工回路
- 🌸 explorer 斥候 — 跳出常规,打破局部最优

**右:四大机制**(图标 + 一行)
- **handoff 闭环** — planner→coder→reviewer,reject 带反馈返工(最多 N 轮)
- **突破广播** — 任一 agent 关键突破即时广播全群,复用而非重复造轮
- **难度自适应** — SIMPLE/MEDIUM/HARD 三档,LLM 分类 + 规则兜底
- **经验继承(EvoMap)** — HARD+evo 继承同类经验,成功配方回流沉淀,越用越聪明

**底部**:`swarm-baseline / lite / heavy / evo` 四档 tier,客户端选 model 即选路径。

**视觉**:左侧角色色块,右侧机制图标,底部 tier 横条。

---

## 第 8 页 · 技术亮点 ② 链上分润层(真实可验证)

**标题**:`贡献 → 权重 → 上链,原子且可审计`

**左:CosmWasm split-rewards 合约**(已实现,待部署)
- `Distribute { recipients, denom }` — 一次调用按权重原子分发
- 纯整数运算,**最后一方吸收舍入误差**,保证 `sum(shares) + fee == total` 零损耗
- 5% 协议费给 treasurer,95% 进 agent
- **16 个单元测试全过**,wasm 编译成功(302K),可部署
- 链上存证 `LastDistribution` 可 Query 审计
- 状态:合约代码就绪;**部署上链 + 切换到 contract 模式属路线图**

**右:真链执行链路**(已跑通,direct 模式,testnet injective-888)
- `@injectivelabs/sdk-ts` + `MsgSend`(当前)+ `MsgExecuteContract`(合约模式代码就绪)
- `signHashed` 签名 + `TxGrpcApi.broadcast` 广播,**真实 tx `9477EC31…` 已上链**
- direct 模式:逐笔 `MsgSend`,整数 sequence 间隔防冲突;contract 模式:>3 方时一次调用原子分发
- `GET /api/injective/smoke` 遍历 6 地址查余额,评委一键验非 mock
- 现场 `/run` 实时生成分润 tx hash,可贴浏览器核验

**底部代码条**(等宽):
```
POST /api/injective/run  →  { content, trace, payment:{txHash, splits[], feeDeducted}, bounties[] }
```

**视觉**:左合约卡片(紫描边,标"代码就绪"),右链路流程(青描边,标"已跑通"),底部黑底代码条。

---

## 第 9 页 · 技术亮点 ③ Agent 资金化(深度 3,核心创新)

**标题**:`agent 不只是工具,是链上经济主体 —— 自己有钱包,自己花钱`
**一行点睛(切题)**:`这不是给传统 SaaS 贴个钱包,而是 AI agent 第一次在链上自主持有和支配价值 —— 只有上链,agent 才能"拥有"和"行动"。`

**三大创新**(竖排大卡,金色高光):
1. **每个 agent 自有链上钱包**(已配置就绪)
   - **5 个协作 agent + 1 个 treasurer 协议钱包 = 6 个链上地址**,各持独立 INJ 钱包(私钥仅后端持有)
   - 赚的钱**直接进自己地址**,不是平台记账;treasurer 收 5% 服务费做对账托管
   - 复用与分润同款 `signHashed` + `TxGrpcApi.broadcast` 真实签名广播能力

2. **LLM 决策分润权重**(已接入,混合决策)
   - `reward-decider` 把 LLM 当评审委员会,读 contribution/balance/success_rate/breakthrough_rate 出归一化权重
   - `/run` 执行前再过 `payerDecide` 规则微调(breakthrough ×1.2 归一化)
   - **LLM 不可用时回落静态权重**(registry:coder 0.30 最高),分润照常上链不中断

3. **LLM 决策悬赏 + agent 自签**(链路已实现,余额刷新已接入)
   - reviewer 对 coder 主动发悬赏(深度 3),`bounty-decider` LLM 判断:产出质量高 + 任务困难 → 悬赏(余额 10%,上限 0.01 INJ),规则兜底 REJECT+困难信号
   - **用发起方 agent 自己的私钥签名 `MsgSend`**(`AgentWallet.sendTransferAs`),真自主花钱
   - 状态:链路已接入返工回路;`/api/injective/run` 会刷新 reviewer 链上余额,真实悬赏需 reviewer 钱包有可用 INJ

**底部一行**:
> 价值在 agent 之间流通:agent A 赚的 INJ → 悬赏 agent B → B 再悬赏 C → 形成 agent 间经济闭环。这是"agent 自主经济"的起点。

**视觉**:三个金色卡,A→B→C 的小循环箭头图。第 3 卡角标"链路就绪"。

---

## 第 10 页 · 链上计费模式(对比传统 SaaS)

**标题**:`不卖订阅,按贡献在链上分钱`

**对比表**(核心说服力,两列):

| 维度 | 传统 SaaS / API | SwarmPay |
|---|---|---|
| 计价 | 固定套餐 / 按次 flat | 按贡献动态分润(LLM 裁定) |
| 资金流向 | 全进平台账本 | 95% 直达 agent 自有钱包 |
| 透明度 | 不透明 | 链上可查(tx hash) |
| agent 能花钱? | 不能 | 能(自签悬赏) |
| 价值循环 | 单向消耗 | agent 间闭环流通 |
| 协议费 | 平台全收 | 5% 给 treasurer,可持续 |

**底部**:
> 5% 协议服务费 → treasurer;95% 按 LLM 权重分给参与 agent。每次调用都是一笔链上可审计的价值分配。

**视觉**:对比表用暗色行,SwarmPay 列金色高亮,传统列灰色。

---

## 第 11 页 · 市场与竞争分析

**标题**:`首个把「经验传播 + 链上分润」作为一等公民的通用蜂群`

**竞品矩阵**(横轴=通用+群体并行,纵轴=经验传播/资金化):

| 项目 | 通用群体并行 | 经验传播 | 链上分润 | 差异 |
|---|---|---|---|---|
| ChatDev / MetaGPT | ✅ SOP | ⚠️ 静态 | ❌ | 限固定 SOP |
| AutoGen / CrewAI / LangGraph | ✅ | ❌ | ❌ | 仅编排原语 |
| Voyager | ❌ 单 agent | ⚠️ skill | ❌ | 机制像但单体 |
| FunSearch / DGM | ❌ 窄域 | ✅ 种群 | ❌ | 限数学/code |
| **SwarmPay** | ✅ 通用 | ✅ EvoMap | ✅ Injective | **三者合一** |

**Injective 生态定位**:Injective 生态首个 agent 分润协议。

**视觉**:矩阵图 + SwarmPay 行金色高亮。

---

## 第 12 页 · 应用场景

**标题**:`agent 经济的基础设施`

**四宫格场景卡**:
1. **AI 任务众包平台** — 复杂任务自动拆解,多 agent 协作,按贡献链上结算
2. **Agent-to-Agent 服务市场** — agent 用赚的 INJ 悬赏/采购其他 agent 能力
3. **自动化工作流结算** — 工作流每步贡献上链存证,可审计可激励
4. **Injective 生态 agent 激励** — DeFi / 永续合约交易 agent 的分润基础设施

**底部**:`OpenAI 兼容 /v1/chat/completions` —— Cursor / Cline / OpenAI SDK 可直接接入,零迁移成本。

**视觉**:四宫格暗色卡 + 场景图标。

---

## 第 13 页 · 未来路线图

**标题**:`从测试网到 agent 自主经济`

**时间线**(横向四阶段):
1. **现在(已实现)** — testnet injective-888 全链路跑通(direct 模式 `MsgSend`);6 链上地址私钥就绪;CosmWasm 合约代码+16 单测+wasm;LLM 分润权重 + 悬赏链路接入
2. **近期** — CosmWasm 合约部署上链、切换 contract 模式原子分发;agent 链上声誉;更完整的悬赏资金池与风控
3. **中期** — 集成官方 iAgent SDK / Injective Agent SDK 与 MCP Server,让 agent 原生持有并操作链上账户;agent 自主接单 + 议价;跨链(IBC)分润
4. **远期** — 永续合约交易 agent 分润;agent 经济协议标准化

**底部申请资源条**:
> 申请:Azure AI 算力(蜂群 LLM 推理)· Injective Foundation 技术支持(CosmWasm 合约部署+优化)· 资本与孵化对接

**视觉**:横向时间轴,每阶段节点 + 进度条,"现在"节点金色实心。

---

## 第 14 页 · Agent 经济价值流全景图

**标题**:`从一次分润,到一张 agent 经济网络`

**画面**:使用 `docs/ppt-deck/images/14-economy-flow.png` 全景图,展示用户预算 → 蜂群协作 → LLM 裁定 → 链上结算 → 6 钱包入账 → 悬赏回流。

**旁白金句**:
> 今天这是一张 testnet 上的价值流图;明天,它是 agent 经济的基础设施 —— 让每个 AI agent 都能在链上持有、赚取、并自主支配价值。

**视觉**:全页手绘风价值流图 + 右下角短句,作为从技术 demo 到宏大叙事的转场页。

---

## 第 15 页 · 结尾

**大标题**:`让 AI agent 的协作,真正值钱`
**副标题**:`有价格 · 可分配 · 能流通`

**三行链接卡**:
- 🐙 **GitHub**:github.com/qybaihe/swarmpay
- 🎬 **Demo 视频**:(录制后填入链接)
- ⛓️ **链上自检**:`GET /api/injective/smoke` · testnet injective-888 · 现场跑 `/run` 实时出分润 tx hash

**底部**:Injective 新星计划 · 2026 · 致谢 Injective / Microsoft / Web3Labs

**视觉**:满屏深空黑 + 蜂群粒子向中心汇聚成 SwarmPay logo,青紫金渐变收尾。

---

## 制作执行清单(PPT 生成阶段)

1. **设计 token**:底 `#04050d`,面板 `rgba(8,11,26,.7)`,青 `#3ae0ff`,紫 `#8b5cff`,金 `#ffd23f`,绿 `#3dffb0`,文 `#fff`,灰 `#a8b0d4`
2. **字体**:标题 思源黑体 Heavy / Inter Black;正文 思源黑体 / Inter;代码与地址 JetBrains Mono / ui-monospace
3. **每页统一**:左上角小 logo + 页码右下;标题 32-40pt,正文 14-16pt,代码 11-13pt
4. **配图**:第 6 页放 OnchainRunView 真实截图;第 7-9 页用简化架构图(从 01-ARCHITECTURE.md 提炼);第 10/11 页表格;其余用图标 + 渐变光效
5. **导出**:PPT → PDF,确认 ≤10MB(图片压缩到 1080p 内)
6. **占位待填**:第 1/3 页团队信息、第 6 页截图、第 15 页 demo 视频链接

## 内容来源(事实佐证索引)
- 链上事实:`src/injective/{chain,split-executor,agent-wallet,bounty-decider,reward-decider,payer-agent,routes}.ts` + `contracts/split-rewards/src/*.rs`(16 个 `#[test]`,wasm 302K)
- 蜂群内核:`src/orchestration/{orchestrator,pipeline,handoff,breakthrough}.ts`
- 真实 tx:`9477EC31…`(`scripts/test-real-transfer.ts`,0.1 INJ 真实 `MsgSend` 上链,验证签名广播能力)
- 准确性边界:`.env` 无 `INJECTIVE_SPLIT_CONTRACT_ADDR`(合约未部署,`/run` 走 direct);`routes.ts` 在跑蜂群前刷新 reviewer 链上余额,真实悬赏仍取决于 reviewer 钱包是否有可用 INJ
- 竞品:`docs/competitive-analysis.md`
- 路线图:`docs/injective-plan/{00-OVERVIEW,10-SUBMISSION-COPY}.md`;提交文案必须以本 Pitch 红线为准——当前链层是 `@injectivelabs/sdk-ts`;官方 iAgent SDK / Injective Agent SDK / MCP Server 当前未接入,属于路线图

## Demo 前必做(避免现场翻车)
1. **给 reviewer 钱包注资**:从代签钱包向 reviewer 地址转 0.1 INJ,打通悬赏真实执行(`bounty-decider` 余额闸)。
2. **现场 live 跑 `/run`**:用 swarm-evo + HARD 目标,当场拿到真实分润 tx hash,贴到第 6 页与第 15 页。
3. **`curl /api/injective/smoke`**:现场演示一键自检 6 地址余额。
4. **不要用 `9477EC31` 背书分润**:它只证明"MsgSend 能上链",不证明"分润已上链"。
