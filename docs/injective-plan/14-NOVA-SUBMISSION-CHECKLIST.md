# 14 · Injective Nova 提交要求核对表

> 官方来源：https://injective.com/zh/blog/injective-nova-program-cn
> 核对日期：2026-06-30
> 本表只用于提交前验收。事实边界仍以 `09-PITCH-DECK-OUTLINE.md` 顶部准确性红线为准。

---

## 1. 项目方向匹配

| 官方方向/标准 | SwarmPay 对应情况 | 状态 |
|---|---|---|
| 需要集成 Injective 主网或测试网 | 已集成 Injective testnet `injective-888`，后端使用 `@injectivelabs/sdk-ts` 查余额、签名、广播 `MsgSend` | 已满足 |
| AI 智能支付 | 任务预算由 payer agent 按 LLM 权重分配给 agent 钱包，当前 direct `MsgSend` 真链分润 | 已满足 |
| 智能体基础设施 | 复用 EvoShip 蜂群协作内核，新增 agent 钱包、分润、悬赏与链上回执 | 已满足 |
| iAgent SDK / Injective Agent SDK / MCP Server | 官方页面明确提到相关工具链；本项目当前未集成，只作为中期路线图 | 待后续 |

建议报名方向：**D · AI 智能支付**（主），并在文案中说明也契合 **A · 智能体基础设施**。

---

## 2. 官方提交材料

| 官方要求 | 当前材料 | 是否可提交 | 提交前动作 |
|---|---|---|---|
| 公开 GitHub 仓库 | `https://github.com/qybaihe/swarmpay`，本地 remote 已配置 | 基本满足 | 本地仍有未提交改动，提交并 push 后再填表 |
| 完整 README | `README.md` 已覆盖定位、运行、架构、验证、评分维度 | 基本满足 | push 前再确认 README 与最新 PDF/checklist 一致 |
| Demo 视频，≤3 分钟 | `08-DEMO-SCRIPT.md` 已有分镜脚本 | 未满足 | 必须录屏、上传 YouTube/Google Drive/可公开访问链接，再填报名表 |
| Pitch Deck | `docs/ppt-deck/SwarmPay-Pitch-Deck.pdf`，15 页，PDF 小于 10MB | 已满足 | 修改 PPT HTML 后需重新导出 PDF 并检查页数/大小 |
| 线下 Demo Day | `10-SUBMISSION-COPY.md` 已写可参加 | 材料满足 | 报名表按实际情况确认 |
| 社交平台宣传（可选） | `10-SUBMISSION-COPY.md` 留有推文链接位置 | 可选未完成 | 如有时间，在 X 发布并标注 `@injective` 与 `@NinjaLabsHQ` |

**当前硬缺口**：Demo 视频链接、公开仓库最终 push、团队真实信息（队名/姓名/微信/邮箱/城市）、报名表最终提交。

---

## 3. 评分标准对照

| 官方评估维度 | SwarmPay 可强调的点 | 证据位置 |
|---|---|---|
| 创新性 | 蜂群协作 + LLM 贡献权重 + Injective 链上分润 + agent 自主悬赏 | `09-PITCH-DECK-OUTLINE.md` 第 2/5/9 页 |
| 技术实现 | `@injectivelabs/sdk-ts`、testnet `injective-888`、direct `MsgSend` 真链、CosmWasm 合约代码/16 单测/wasm 就绪 | `02-INJECTIVE-CHAIN-LAYER.md`、`03-SPLIT-REWARDS-CONTRACT.md` |
| 应用价值 | 解决多 agent 协作价值黑箱，扩展到 agent 市场、众包、自动化工作流结算 | `09-PITCH-DECK-OUTLINE.md` 第 4/12 页 |
| 产品体验 | Vue 前端、Onchain Run、分润流向图、交易 timeline、PPT 可交互版 | `06-FRONTEND-WALLET.md`、`docs/ppt-deck/` |
| 生态契合度 | INJ 结算、Injective testnet、CosmWasm 路线、sdk-ts；iAgent SDK/Agent SDK/MCP 为后续生态对齐 | `README.md`、`09-PITCH-DECK-OUTLINE.md` |

---

## 4. 准确性红线

提交材料必须坚持以下说法：

- **当前链层使用 `@injectivelabs/sdk-ts`；iAgent SDK / Agent SDK / MCP Server 尚未接入。**
- **CosmWasm 合约未部署上链。** 当前 `contractAddr:null`，`/api/injective/run` 走 direct 多笔 `MsgSend`。
- **tx `9477EC31…` 只证明单笔测试转账能力。** 分润请用现场 `/run` 生成的新 tx hash，历史参考可写 `107E7909…`。
- **6 个链上地址口径**：5 个协作 agent + 1 个 treasurer；分润给 planner/coder/reviewer/orchestrator，5% 给 treasurer。
- **悬赏链路已实现，但真实触发依赖 reviewer 钱包余额和 LLM/规则判断。** Demo 前先注资再跑。

---

## 5. 提交前 6 步 Checklist

1. 运行 `npm run typecheck`，确认 TypeScript 通过。
2. 运行 `npm run build:web`，确认前端可构建；注意不要提交指向未入库 hashed assets 的 `public/index.html`。
3. 运行 `curl http://localhost:4000/api/injective/status` 与 `curl http://localhost:4000/api/injective/smoke`，确认 `chainId:injective-888`、6 地址 ready、`contractAddr:null`。
4. Live 跑一次 `POST /api/injective/run`，保存当场生成的分润 tx hash，用于 Demo 视频和表单。
5. 重新导出 `docs/ppt-deck/SwarmPay-Pitch-Deck.pdf`，检查 15 页且小于 10MB。
6. 录制 ≤3 分钟 Demo 视频，上传后把链接填入 `10-SUBMISSION-COPY.md` 和报名表。

---

## 6. 最终结论

截至本核对表创建时，SwarmPay 的**代码实现、链上测试网集成、Pitch Deck 和提交文案主体已经达到可提交水位**；但还不是完整闭环提交包。

**必须补齐后才算完整提交**：
- Demo 视频链接；
- 本地改动 commit 并 push 到公开 GitHub；
- 团队真实信息；
- 表单最终提交；
- PPT PDF 在最后一次 HTML 修改后重新导出。
