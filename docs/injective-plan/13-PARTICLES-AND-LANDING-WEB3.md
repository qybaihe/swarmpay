# 13 · Playground 粒子光效 + Landing Web3 叙事重构

> 用户反馈两条:
> 1. "流转的时候可以加一些粒子光效啊什么的" —— Playground 金币/分润流动要有更炫的光效
> 2. "整个 Landing page 不要写那么多巡洋舰这些东西,不要写原来一套协作东西,我们更要讲这个东西跟 Web3 跟链上的结合点"

## A. Playground 粒子光效增强(不破坏现有金币/粒子机制)

现状:`.particles` 用纯色圆点 + `@keyframes fly`(位移+缩放+淡出),`.reward-float` 飘字。
有 `spawnCoins`(`in`/`out`)、`rewardFloat`、`creditFloat` 三套机制。金色流动线在 RewardFlowOverlay(SVG)。

### 要加的光效(全部纯 CSS,不引入库)

1. **金币拖尾发光** —— `.particle` 改为双层:核心亮点 + 外层模糊光晕(box-shadow 多层 + drop-shadow)。已有 `boxShadow: 0 0 12px color`,升级成 `0 0 6px, 0 0 14px, 0 0 24px` 多层径向。
2. **金币本体** —— 现在是纯圆,改成带高光的"金币":径向渐变(亮金中心 → 暗金边缘)+ 内描边,`coinGlow` 类。
3. **拖尾尾迹** —— `::before` 伪元素拉一条沿运动方向的渐变光带(用 `--tx/--ty` 算角度,线性渐变)。
4. **到达迸发星火(burst)** —— 金币到达终点(80%→100%)时分裂出 4-6 个小星点四散。用 `::after` 多个 box-shadow 点 + 二级 keyframe `sparkBurst`。
5. **reward 飘字升级** —— `+X INJ` 加金色脉冲光圈(`ringPulse`)从节点向外扩散一圈。
6. **分润 burst 全屏闪光** —— handleRewardDistributed 触发时,画布顶层闪一道金光(`rewardFlash`)。

### 落点
- `web/views/PlaygroundView.vue`:改 `.particle` / `.reward-float` CSS + 新增 `.particle.coin` / `.reward-ring` / `.reward-flash` 模板与样式
- `particleStyle()` 加 `--angle`(由 atan2 算)供拖尾用
- `handleRewardDistributed` / `handleBounty` 触发时多 spawn 一组"星火迸发"粒子(到达点四周)
- 不改 spawnCoins 签名(向后兼容),只在 coin 上加 `coin` kind 标记或统一升级视觉

### 风险
- `::before/::after` 拖尾用 transform 旋转角度,需要 `--angle`。atan2 在浏览器可用。
- 性能:burst 粒子数量控制在单次 ≤30,1.2s 内清理,已有清理逻辑。

## B. Landing 重构 —— 从"巡洋舰舰队"转向"Web3 链上 Agent 经济"

### 现状痛点
- HeroSection:"旗舰、导航舰、工程舰、监察舰组成的自进蜂群" —— 还是舰队叙事,Web3 只一句"贡献与分润都上链结算"
- PipelineGrid:整段讲 EvoMap 继承/航线闭环/审查蜂 —— 纯协作,无链
- RosterSection:"五艘异构星舰" + ShipIcon —— 巡洋舰味重
- TiersSection:"信标基线/巡逻编队/突击编队/进化旗舰" —— 舰队型号
- SiteFooter:"自进蜂群 × 链上分润" —— 平衡了,但导航文案是"舰队阵容/舰队型号"

### 重构方向:Web3 结合点 = 核心卖点

五个 Web3 结合点(从 deep3 提炼):
1. **agent 自有链上钱包** —— 每个 archetype 持独立 INJ 钱包,赚的钱进自己地址,不是平台记账
2. **LLM 决策分润** —— 不写死权重,reviewer/LLM 按贡献实时决定谁拿多少,链上执行
3. **LLM 决策悬赏** —— reviewer 对 coder 主动发悬赏(深度3),agent 用自己钱包自签转账
4. **INJ 真实结算** —— CosmWasm 分润合约 + MsgSend,链上可验证,tx hash 可查
5. **价值可流通** —— agent 赚的 INJ 可继续花(悬赏别人/调别人),形成 agent 间经济循环

### 逐文件改写

#### HeroSection.vue
- 标题:"让 AI agent 的协作<b>有价格、可分配、能流通</b>"
- 副标题:去掉"旗舰/导航舰",改成"你发一条请求,一支 AI agent 蜂群自动分工。每次协作的<b>贡献与分润由 LLM 实时裁定、INJ 链上结算</b>——每个 agent 持有<b>自己的链上钱包</b>,赚的钱直接进自己地址,还能拿赚来的钱<b>悬赏</b>别的 agent。"
- badge:"Injective · AI agent 自主经济 · LLM 分润 + 自签钱包"
- CTA 不变

#### PipelineGrid.vue → 改名概念"链上协作流"
- 标题:"一条请求,从推理到链上结算"
- 把"进化协作拓扑图"换成"链上金钱流"叙事:拆解→并行攻关→LLM 审查→LLM 分润→INJ 上链→agent 钱包入账→(可选)悬赏循环
- 图保留(已有 topology 图),但 sub 文案改成链上流

#### RosterSection.vue → "Agent 经济角色"
- 去掉 ShipIcon(或保留但弱化),每个角色卡突出:
  - 链上钱包地址(示例 inj1xxx)
  - 分润权重(LLM 动态)
  - 能否发悬赏(reviewer/coder)
- 五角色:orchestrator/planner/coder/reviewer/explorer + 标注 payer/treasurer 链上角色

#### TiersSection.vue → "链上结算模式"
- swarm-baseline:单 agent,基础链上转账
- swarm-lite:轻量并行,聚合后一次分润
- swarm-heavy:异构分工 + LLM 分润 + 返工回路
- swarm-evo:全链路 + 经验继承 + 悬赏经济
- 客户端兼容列表保留(OpenAI SDK 接入)

#### SiteFooter.vue
- 导航文案:"舰队阵容"→"Agent 角色","舰队型号"→"结算模式","协作原理"→"链上协作流"
- tagline 保留"自进蜂群 × 链上分润"(已平衡)

### 执行顺序
1. 粒子光效(我直接改 PlaygroundView)
2. Landing 五文件重写(并行 agent,给出每个文件完整新内容)
3. typecheck + build
4. 重启服务验证
