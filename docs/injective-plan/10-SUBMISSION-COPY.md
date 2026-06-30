# 10 · 报名表单必填文案草稿

> 报名表单共 17 项（详见调研报告）。以下是核心必填文案草稿，可直接粘贴使用，再按实情微调。
> ⚠️ 6/30 24:00 截止，先用本占坑提交。

---

## 项目名称
```
SwarmPay
```
（副标题/全称：SwarmPay — Injective 上的自进蜂群 × 链上分润 Agent 协议）

## 项目简介（突出主要特点和目的）*
```
SwarmPay 是一个构建在 Injective 上的 AI 蜂群协作与链上分润协议。它把一次 AI 任务交给一支角色化的智能体蜂群（orchestrator 调度、planner 拆解、coder 实现、reviewer 审查、explorer 发散）分工协作完成，并在协作结束后由 payer agent 依据各角色的贡献权重，通过 Injective 测试网真实交易把用户设定的链上预算分配给参与 agent 的钱包地址。

当前 demo 已跑通 direct 模式：按贡献权重发起多笔 `MsgSend`，4 个产出 agent 获得分润，treasurer 收取 5% 协议服务费；CosmWasm `split-rewards` 分润合约已完成代码、16 个单元测试和 wasm 编译，但尚未部署上链，部署合约并切换为 contract 原子分发属于下一步路线图。

核心特点：
1. 真正的多 Agent 协作内核——异构分工、handoff 交接、突破广播、交叉验证纠错、经验继承回流，越用越聪明；
2. AI Agent 自主资金化——5 个协作 agent + 1 个 treasurer 协议钱包均持有独立 Injective 地址，payer agent 自主决策并发起链上分润，实现"协作即结算"；
3. 链上可信分润——当前 direct `MsgSend` 分润已真实跑通、tx 可审计；CosmWasm 合约原子分发路径已代码就绪，将在部署后切换使用。

目的：解决 AI agent 协作的"价值黑箱"问题，让多 agent 协作的价值分配可信、可激励、可流通，为 Injective 生态的 agent 经济提供基础设施。
```

## 请描述您的项目是如何集成 Injective 网络（部署合约，读取区块数据等等）*
```
SwarmPay 与 Injective 网络的集成贯穿"链上身份—链上支付—链上分润"三个层面：

1. SDK 集成：后端引入 @injectivelabs/sdk-ts 与 @injectivelabs/networks，封装统一的链层接口（查余额、发起转账、执行合约），通过 Injective 测试网（injective-888）的 gRPC/REST 节点读取账户余额与广播交易。

2. 链上身份：蜂群中每个协作角色（orchestrator/planner/coder/reviewer/explorer）以及 treasurer 协议钱包均绑定一个 Injective 链上地址，作为其接收分润、发起悬赏与积累链上声誉的身份。

3. 链上支付与分润：当前 demo 使用 direct 模式，用户下任务时附带链上预算（INJ），任务完成后由 payer agent 读取协作 trace 与 `reward_split` 权重，扣除 5% 协议服务费给 treasurer，再通过多笔 `MsgSend` 把剩余预算分发给 planner/coder/reviewer/orchestrator 等产出 agent。每次分润返回 txHash 与分配明细，可在 Injective 浏览器审计。

4. CosmWasm 路线：`contracts/split-rewards` 已实现 `Distribute { recipients, denom }` 分润合约，16 个 Rust 单元测试通过并已编译 wasm；当前尚未部署上链，部署后可把 direct 模式切换为 contract 模式，由一次合约调用完成原子分发。

5. 交易读取与回执：前端通过链层读取交易回执（txHash、height、gas），并在分润流向图与交易 timeline 中可视化展示，用户可点击跳转 Injective 浏览器核实。`GET /api/injective/smoke` 可一键自检 6 个链上地址余额，`POST /api/injective/run` 可现场生成真实分润 tx hash。

后续将集成官方页面提到的 iAgent SDK / Injective Agent SDK 与 MCP Server，让 agent 更原生地持有并操作链上账户，并把分润能力扩展到永续合约交易 agent。当前已经集成的是 `@injectivelabs/sdk-ts`，不要把 iAgent/Agent SDK/MCP 写成已集成能力。
```

## 项目开发方向（6 选 1）*
```
选 D：AI 智能支付——实现 AI 代理在 Web3 环境下的自主支付、分润与资产管理。
（同时高度契合 A 智能体基础设施：本项目本身就是一套 Agent 开发与协作框架。）
```

## 项目阶段（2 选 1）*
```
A. Demo 阶段：已完成核心功能原型与演示
```

## 线下路演意愿确认*
```
A. 若入围决赛，团队成员确认可以前往线下参与 Demo Day 展示。
```

## 资源申请（可多选）*
```
建议全选：
A. 微软 Azure AI 算力支持（Azure OpenAI 接口及全球云算力 Credits）——用于蜂群 LLM 推理
B. Injective Foundation 技术支持（高性能执行层架构指导）——CosmWasm 合约与链上分润优化
C. 资本与孵化对接（与导师 1-On-1 交流）——agent 经济商业化
```

## 项目 Demo 宣传推文链接（选填）
```
（录完 demo 后在 X 发推 @injective @NinjaLabsHQ，把链接填这里；暂无可留空）
```

## 社区来源
```
按你实际来源选（如无对应选「其它」）
```

---

## 团队信息（5 项，按实填）
- 团队名称 / 队长姓名 / 队长微信ID / 队长邮箱 / 队长所在城市
> 这 5 项只有你知道，请自行填入。

## 项目材料（3 项，提交前必须准备好）
- **GitHub 开源仓库**：建议把 `evoship-injective` 推到一个公开 GitHub 仓库，README 引用 `docs/injective-plan/` 文档
- **Demo 视频**：按 `08-DEMO-SCRIPT.md` 录制，≤3 分钟，上传 YouTube/Google Drive
- **路演简报**：按 `09-PITCH-DECK-OUTLINE.md` 制作 PDF/PPT，≤10MB
