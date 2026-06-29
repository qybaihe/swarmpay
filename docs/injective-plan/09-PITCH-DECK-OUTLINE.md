# 09 · Pitch Deck（路演简报）大纲

> 报名要求：上传 PDF 或 PPT，≤10MB。建议含官方列的 7 个核心维度。
> 风格：暗色科技/孟菲斯风（可复用 `~/WPS/EvoShip_路演PDF_暗色科技孟菲斯版.pptx` 模板），10–14 页。

## 页面规划

| 页 | 标题 | 内容 |
|---|---|---|
| 1 | 封面 | SwarmPay · Injective 上的自进蜂群 × 链上分润；队名/队长；Injective 新星计划 |
| 2 | 一句话 | "一支在 Injective 链上自主协作、按贡献链上分润的 AI 蜂群舰队" + 定位图 |
| 3 | 团队介绍 | 队长+成员、角色分工、相关经验（含此前 EvoShip/BoHack 经历可点出） |
| 4 | 痛点 | AI agent 协作的"价值黑箱"：谁贡献多少？怎么结算？无链上凭证、不可审计、无法激励长尾 agent |
| 5 | 解决方案 | SwarmPay：蜂群协作(已有内核) + payer/treasurer agent + CosmWasm 分润合约，贡献→权重→链上分配，原子且可审计 |
| 6 | 产品与解决方案 | 用户下目标→蜂群分工→答案产出+链上分润回执；附产品截图（OnchainRunView） |
| 7 | 技术亮点 ① 蜂群内核 | 5 角色六阶段、handoff、突破广播、经验继承回流；自研框架，非套壳 |
| 8 | 技术亮点 ② 链上层 | Injective iAgent SDK 集成、CosmWasm 分润合约、原子分润、基点精度无损耗 |
| 9 | 技术亮点 ③ Agent 资金化 | payer agent 按 breakthrough 动态调权；agent 持有链上身份与钱包；"越用越值钱" |
| 10 | 市场与竞争分析 | 对比：单 Agent（无协作）vs 普通多 Agent（无链上分润）vs SwarmPay（协作+链上分润）；可延伸到 agent 市场/众包/外包结算 |
| 11 | 应用场景 | AI 任务众包平台、agent-to-agent 服务市场、自动化工作流结算、Injective 生态 agent 激励 |
| 12 | 未来路线图 | 测试网→主网；agent 声誉上链；agent 自主接单+议价；跨链（IBC）分润；与 Injective MCP Server 结合做永续合约 agent 分润 |
| 13 | 生态契合 | 复用 Injective iAgent SDK / CosmWasm / INJ；对齐"AI 智能支付"+"智能体基础设施"双方向；申请 Azure 算力+Injective 技术支持+孵化对接 |
| 14 | 结尾 | GitHub 链接 + Demo 视频链接 + 联系方式 + 致谢 |

## 视觉要点
- 第 6 页放真实产品截图（OnchainRunView 的 Vue Flow + 分润流向图）
- 第 7-9 页各配一张架构/流程小图（可从 `01-ARCHITECTURE.md` 简化）
- 第 10 页放竞品对比表
- 全程突出 Injective 元素（链、INJ、CosmWasm、iAgent SDK），强化生态契合度

## 产出
- 先用 Markdown 定稿内容 → 再导入 PPT 模板 → 导出 PDF（≤10MB）
- 可用 PPT 技能（如 `guizang-ppt-skill` 或 `auto-ppt-image-pdf`）一键生成
