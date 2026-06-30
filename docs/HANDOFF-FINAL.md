# SwarmPay 项目交接提示词

> 复制下方"=== 交接提示词 ==="之间的全部内容，粘贴到新线程的第一条消息。

## === 交接提示词 ===

我在推进 Injective 新星计划参赛项目 **SwarmPay**（Injective 上的 AI Agent 自主经济体 / 链上蜂群分润协议），今天 6/30 24:00 截止，需要在新线程里把整个项目打磨到可提交状态。下面是完整交接，请先通读再动手。

## 一、项目位置与启动

- 项目根目录：`/Users/baihe/web3比赛1/evoship-injective`
- **启动服务**（三条命令，分别后台跑）：
  - 后端：`cd /Users/baihe/web3比赛1/evoship-injective && npm run dev`（实际是 `tsx watch src/server.ts`，端口 4000，testnet 真链）
  - 前端：`cd /Users/baihe/web3比赛1/evoship-injective && npm run dev:web`（vite，端口 5173）
  - PPT 预览：`cd /Users/baihe/web3比赛1/evoship-injective/docs/ppt-deck && python3 -m http.server 8080`，浏览器开 `http://localhost:8080/index.html`
- **环境**：`.env` 已配置 testnet（`INJECTIVE_NETWORK=testnet`、`INJECTIVE_CHAIN_ID=injective-888`）。6 个链上地址私钥已就绪。LLM 用 `evomap-gpt-5.5`。
- **验证链上接口真实可用**：`curl http://localhost:4000/api/injective/smoke` 应返回 6 地址 ready、reviewer 有真实 INJ 余额；`curl -X POST http://localhost:4000/api/injective/run` 可跑通真实分润（会返回真实 txHash）。

## 二、当前完成度（已验证真实）

代码已扎实完成，最近提交 `d084113`：
- 40 个 TS 文件 9000+ 行、43 个 Vue 组件、CosmWasm 合约（8 个 Rust 文件，16 个单测全过，wasm 已编译 302K）
- 链上接口全部真实可用（commit d084113 修了两个硬伤：reviewer 余额改为读真实链上余额 + 跑蜂群前自动刷新；还修了 transactions ring-buffer 和 official-fleets 的类型 bug）
- 真实链上凭证：tx `107E7909…`（/run 分润，4 agent 按权重分到 INJ + 5% 给 treasurer）、tx `9477EC31…`（单笔测试转账，只证明签名广播能力，**不是分润产物**）

**有未提交的改动**（git status）：
- `web/components/NavBar.vue`、`web/components/PipelineGrid.vue`、`public/index.html`（已改：NavBar 去掉"原理"链接+拉宽防换行；PipelineGrid 去掉图片改成生动的 CSS 价值流时间线）
- `docs/ppt-deck/`、`docs/ppt-screenshots/`（新增：PPT 全套，未跟踪）

## 三、PPT 已完成（核心交付物）

位置：`docs/ppt-deck/`
- `SwarmPay-Pitch-Deck.pdf` —— 15 页，1.3MB，16:9，比赛提交用
- `index.html` —— 可交互演示版（靛蓝瓷主题、Style A 电子杂志风、WebGL 流体背景、← → 翻页、pipeline 页按空格逐步点亮）
- `images/` —— 11 张 1600×900 统一截图 + `14-economy-flow.png`（excalidraw 手绘风 agent 经济价值流全景图）
- `assets/motion.min.js` —— 动效引擎本地副本
- 15 页结构：封面→定位→团队→痛点→方案→demo→蜂群内核→链上分润→Agent资金化→计费对比→竞品→场景→路线图→**价值流全景图(宏大叙事)**→结尾金句

**PPT 导出注意**（已踩坑修复）：导出 PDF 时每页必须调用 `window.__playSlide(i)` 触发动效，否则 motion-ready 状态下带 `data-anim` 的元素 `opacity:0` 会截成空白页。修复后的导出脚本逻辑在本次会话历史里。

## 四、准确性红线（务必守住，评委一查就翻车）

这些边界已在大纲里白纸黑字写清，任何材料都不准逾越：
1. **CosmWasm 合约未部署上链** —— 代码+16单测+wasm 就绪 ✅，部署属路线图 ❌。当前 `/run` 走 direct 模式（多笔 MsgSend），不是合约原子分发。
2. **tx 9477EC31 只是单笔测试转账**（0.1 INJ），只证明签名广播能力，不能背书"分润已上链"。分润 tx 是 `107E7909…`，且现场 /run 实时生成。
3. **悬赏链路已实现并接入返工回路**，reviewer 余额已修为读真实值（reviewer 钱包有 0.0357 INJ，悬赏决策能真实触发）；但合约部署、官方 iAgent SDK / Injective Agent SDK / MCP Server 集成属路线图。
4. **口径统一**：5 协作 agent（orchestrator/planner/coder/reviewer/explorer）+ 1 treasurer 协议钱包 = 6 链上地址；分润给 4 个产出 agent，5% 给 treasurer。
5. **Injective 官方 Nova 页面明确提到 iAgent SDK / Injective Agent SDK / MCP Server**，但本项目当前尚未集成；提交材料只能写成路线图/生态对齐项，不能写成已集成能力。

## 五、⚠️ 必须修的问题（提交前最高优先级）

**`docs/injective-plan/10-SUBMISSION-COPY.md` 有早期残留的不准确表述**，与 09 大纲的准确性红线冲突，必须同步修正后才能用于提交：
- 该文档第 4 点原本会让读者误以为 CosmWasm 已经在链上运行。实际**合约未部署**，当前走 direct MsgSend。需改为"合约代码就绪，当前走 direct 模式，合约部署属路线图"。
- 该文档末尾涉及 Injective iAgent SDK 时，需改为"官方 iAgent SDK / Injective Agent SDK 与 MCP Server 属路线图；当前已集成的是 @injectivelabs/sdk-ts"。
- 核对全文，把所有"已部署/已集成合约"的暗示改成"代码就绪/direct 模式已跑通"。

**09-PITCH-DECK-OUTLINE.md 是准确性基准**，10 号文档和任何提交文案都要对齐它顶部的"准确性红线"。

## 六、提交材料清单

`docs/injective-plan/` 下有 00-14 共 15 份规划文档：
- `10-SUBMISSION-COPY.md` —— 报名表单必填文案草稿（17 项），**修正上述准确性问题后可直接粘贴提交**
- `09-PITCH-DECK-OUTLINE.md` —— PPT 大纲定稿（含准确性红线 + Demo 前必做清单）
- `00-OVERVIEW.md` —— 已修正为当前链层使用 sdk-ts、官方 iAgent SDK / Agent SDK / MCP Server 属路线图，**仍以 09 红线为准**
- 其余 01-08 是架构/链层/合约/payer/API/前端/部署/演示脚本的技术文档

**比赛信息**：Injective 新星计划，方向 D（AI 智能支付，主）+ A（智能体基础设施，辅）。GitHub 仓库 `github.com/qybaihe/swarmpay`（MIT）。

## 七、Demo 前必做（避免现场翻车）

1. 给 reviewer 钱包注资（从代签钱包转 0.1 INJ，打通悬赏真实执行）
2. 现场 live 跑 `/run`，当场拿真实分润 tx hash 贴到 PPT 第 6 页和第 15 页
3. `curl /api/injective/smoke` 现场演示一键自检 6 地址余额
4. 不要用 `9477EC31` 背书分润，它只证明 MsgSend 能上链

## 八、需要你做的

1. **先修 10-SUBMISSION-COPY.md 的准确性问题**（最高优先级）
2. 通读 09 大纲红线 + PPT（`docs/ppt-deck/index.html` 或 PDF），确认所有表述经得起评委追问
3. 检查 README.md 是否还有夸大 Agent SDK/MCP 集成状态或 CosmWasm 上链状态的残留表述，一并修正
4. 把未提交的改动（NavBar/PipelineGrid/public + ppt-deck）整理后提交
5. 按比赛报名表单要求，把 10 号文档 + PPT PDF + GitHub 链接整理成最终提交包
6. 任何"已实现 vs 路线图"的边界都要白纸黑字分开，宁可保守也不要夸大

动手前先通读 `docs/injective-plan/09-PITCH-DECK-OUTLINE.md` 顶部的准确性红线，那是整个项目事实边界的唯一基准。

## === 交接提示词结束 ===
