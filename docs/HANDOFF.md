# EvoShip 项目完整交接文档

> **最后更新**:2026-06-19  
> **仓库**:https://github.com/qybaihe/EvoShip  
> **本地路径**:/Users/baihe/Documents/evomap  
> **比赛**:Beyond the Maze 黑客松 · EvoMap A2A 赛道

---

## 一、项目是什么

**EvoShip** = 一个 OpenAI 兼容端点 + 蜂群多 Agent 协作系统。用户输入任意目标,蜂群(agent 群)基于 EvoMap 平台协作攻关(继承经验→分工/多解→交叉验证→突破广播→聚合→回流经验),输出比单次调用更好的结果。

**核心卖点**:弱模型蜂群 + EvoMap 经验继承/回流,超越单次强模型调用。任何 OpenAI 兼容客户端(Cursor/Cline/LangChain)只需改 `base_url` 即可接入。

**官方叙事**:"EvoMap 是 AI 经验的可继承价值网络。EvoShip 是它的执行层——每个目标先继承已有经验,再由蜂群分工推进,完成后回流新经验,越用越聪明。"

---

## 二、关键凭证与配置(全部在本地,绝不推送)

### 模型后端(小米 mimo,OpenAI 兼容)
```
OPENAI_BASE_URL = https://api.xiaomimimo.com/v1
OPENAI_API_KEY  = sk-c58wrks8girw7ifliw3x37gnuzmdj2mix2fb1d7vcgtj8eld  (在 .env)
SWARM_MODEL     = mimo-v2.5-pro  (蜂群/聚合/基线都用这个)
```

### EvoMap node 凭证(B 路径,A2A 协议)
```
位置  : ~/.evomap/node_id + ~/.evomap/node_secret (权限 600)
node_id    : node_1935701e9c7f3a7b
node_secret: bac2f34d4c28e5393fd1913a36caaaffaf85eff0054f829819224d4a1fa708bb  (68字节,有效)
状态       : 已绑定用户账号,claimed=True,L3 reputation
⚠️ 注意    : 注册时的初始 secret(c7ad572b...)已失效(403)。现用上面这个。
```

### EvoMap OAuth app(A 路径,开发套件官方)
```
EVOMAP_CLIENT_ID     = evm_client_live_8138cd8d4acc52d90b9ae26092f2da6bf1e2d121ae363d8da337f2ed7db6410e
EVOMAP_CLIENT_SECRET = evm_secret_b9cd34e48ea63332bf0caa23779d1f61ac95baf3a1c45dd3296773f3397000cc  (在 .env)
EVOMAP_REDIRECT_URI  = http://127.0.0.1:4000/oauth/callback
状态 : approved ✅(已通过审批)
scope: recipe:read, recipe:write, gene:read, recipe:publish, reuse:query
⚠️ token 不持久化:每次重启服务需重新访问 /oauth/start 授权。token 在内存里。
```

### 服务启动
```bash
cd /Users/baihe/Documents/evomap
npm run start          # 或 npm run dev(热重载)
# 端口 4000:http://localhost:4000/
# 端点  :http://localhost:4000/v1/chat/completions
```

---

## 三、代码架构(21 个 TS 文件)

```
src/
  server.ts              Express,OpenAI 兼容 /v1/chat/completions + 官网 / + OAuth /oauth/start|callback
  swarm.ts               协调入口。baseline 直通;其余调 orchestrate()
  config.ts              配置 + ~/.evomap 凭证读取 + 三档 tier + OAuth 配置
  model.ts               mimo 调用(callAgent/aggregate/baseline)+ mock 后端
  evomap.ts              深度集成:继承(/a2a/assets/search)+ 回流(/a2a/publish Gene+Capsule)
  oauth.ts               PKCE S256 OAuth 流程(对齐官方 quickstart)
  log.ts                 彩色阶段日志 + 事件总线
  openai-types.ts        OpenAI 兼容类型 + SwarmTrace
  agents/
    types.ts             AgentDef/AgentMessage/Subtask/HandoffContext/CollaborationTrace
    registry.ts          5 角色 persona + systemPrompt 构造 + canHandoff 校验
    identity.ts          state.json 绩效/记忆持久化(.agent-state/,组织进化)
  protocol/
    envelope.ts          GEP-A2A 7字段信封构造/校验
    platform-client.ts   真实平台调用:session/create + session/message + swarm/intent + a2a/fetch + a2a/publish
    adapter.ts           platform/local 适配层 + beginSession + sendMessage/declareIntent/submitResult
  orchestration/
    orchestrator.ts      核心:classifyDifficulty(SIMPLE/MEDIUM/HARD)+ 编排 + 继承阈值
    pipeline.ts          HARD:planner→coder→reviewer 串行 + handoff + 返工回路 + submitResult
    handoff.ts           handoff 逻辑 + context 渲染 + sendMessage
    breakthrough.ts      突破检测 + 广播(relay-to-team/session/message broadcast)
AGENTS.md                团队宪法(master:reward split 5/85/10、六阶段流)
agents/*/AGENTS.md       5 角色身份档案(orchestrator/planner/coder/reviewer/explorer)
public/index.html        EvoShip 科技感官网(端点转换流程)
benchmarks/scripts/aime-eval.ts     AIME 数学正确率对比(baseline vs swarm)
```

---

## 四、三档难度分流(orchestrator.ts:classifyDifficulty)

每个请求先分类,决定走哪条路径:

| 档位 | 识别 | 路径 | 继承? | 回流? | 状态 |
|---|---|---|---|---|---|
| **SIMPLE** | 打招呼/闲聊/极简 | 直通单次回复 | ❌ | ❌ | 已接入 |
| **MEDIUM** | 数学/事实/单一明确 | 3 solver 多解 → verifier 交叉验证 → 纠错 handoff | ❌ | ❌ | 已接入 |
| **HARD** | 完整应用/多组件/多步 | 继承 → 拆解 → planner/coder/reviewer 流水线 + 返工 | ✅ | ✅ | 已接入 |

**⚠️ 分类器不稳定**(已知问题):同一道 AIME 题有时判 MEDIUM 有时判 HARD,因为靠单次 LLM 调用(温度 0.0 但 mimo 输出仍波动)。

---

## 五、EvoMap 集成深度(已完成的)

### 5.1 继承层(B 路径,实测可用)
```
端点: GET /a2a/assets/search?signals=<goal>&limit=4  (HTTP 200)
凭证: node_secret
触发: 仅 HARD 难度
效果: 继承 4 条真实 Capsule 经验,注入蜂群 system prompt
代码: src/evomap.ts → searchRecipes() → 调 /a2a/assets/search
```

### 5.2 协作 session(B 路径,实测可用)
```
端点: POST /a2a/session/create (200) → POST /a2a/session/message (200)
凭证: node_secret
效果: 每个请求创建真实 EvoMap 协作会话,所有 handoff/breakthrough 通过 session/message
代码: src/protocol/platform-client.ts → ensureSession() + routeToMember() + relayToTeam()
```

### 5.3 handoff + 突破广播(B 路径,实测可用)
```
handoff(单播):    session/message msg_type=dialog  (200)
突破广播(群发):   session/message msg_type=broadcast (200)
意图声明:         POST /a2a/swarm/intent (需 session_id + plan ≥5字)
结果提交:         POST /a2a/swarm/result (需 session_id)
代码: src/orchestration/handoff.ts + breakthrough.ts
实测: dashboard 任务 12-15 次 handoff + 7 次突破广播,全 200
```

### 5.4 回流层(B 路径,publish 单独测试通过)
```
端点: POST /a2a/publish  (单独测试 HTTP 200,bundle_id 返回)
凭证: node_secret
schema: Gene+Capsule bundle(对齐 llms-full.txt 1.5.0)
  - Gene: type/schema_version/id/category/signals_match/summary/strategy(每步≥15字)/constraints/validation(node -e 断言,禁echo/;/=>/console.log)
  - Capsule: type/schema_version/trigger/gene/summary/content(≥50字)/confidence/blast_radius/outcome/env_fingerprint
  - asset_id: sha256(递归 deepSort JSON,排除 asset_id 字段)
代码: src/evomap.ts → publishRecipeDraft()
实测: 单独 curl 返回 bundle_d0b79c5e6ab26469,decision=quarantine(安全审查中,正常)
⚠️ 全链路未端到端验证:HARD 任务聚合后被 abort(见卡点#1)
```

### 5.5 OAuth 补充(A 路径,已连接)
```
端点: GET /developer/oauth/recipes + /genes + /reuse + POST /recipe
凭证: OAuth access_token(通过 /oauth/start → PKCE 授权拿)
app: evm_client_live_8138...,approved
代码: src/oauth.ts + src/evomap.ts searchRecipes() 的 A 路径补充
状态: 授权成功过(token 在内存)。重启需重新授权。
```

---

## 六、EvoMap 端点可用性(实测扫描,详见 docs/endpoint-scan-report.md)

| 端点 | 状态 | 用途 |
|---|---|---|
| `POST /a2a/hello` | ✅ 200 | node 注册 |
| `POST /a2a/heartbeat` | ✅ 200 | 心跳 |
| `GET /a2a/assets/search` | ✅ 200 | **经验继承** |
| `GET /a2a/assets?status=promoted` | ✅ 200 | 浏览资产 |
| `POST /a2a/fetch` | ✅ 200(空 payload) | Capsule 检索(不支持 signals 参数) |
| `POST /a2a/publish` | ✅ 200(正确 schema 时) | **经验回流** |
| `POST /a2a/session/create` | ✅ 200 | **创建协作会话** |
| `POST /a2a/session/message` | ✅ 200 | **handoff/广播** |
| `POST /a2a/swarm/intent` | ✅ 200(需 session_id+plan) | 意图声明 |
| `POST /a2a/swarm/result` | ✅ 200(需 session_id) | 结果提交 |
| `POST /a2a/task/propose-decomposition` | 🟡 400(需真实 task_id) | 任务分解 |
| `/a2a/swarm/route-to-member` | 🔴 404 | **不存在**(用 session/message 替代) |
| `/a2a/swarm/relay-to-team` | 🔴 404 | **不存在**(用 session/message 替代) |
| `/a2a/swarm/team-roster` | 🔴 404 | 不存在 |

---

## 七、已完成的工作(按时间线)

1. ✅ **项目初始化**:OpenAI 兼容端点骨架 + mock 后端 + 四档 model(swarm-baseline/lite/heavy/evo)
2. ✅ **EvoShip 官网**:科技感单页 + 端点转换流程(public/index.html)
3. ✅ **GitHub 仓库绑定**:https://github.com/qybaihe/EvoShip,所有改动自动推送
4. ✅ **接入真实模型**:小米 mimo-v2.5-pro(OpenAI 兼容)
5. ✅ **AIME benchmark 基础**:90 题数据集 + 判分脚本(benchmarks/scripts/aime-eval.ts)
6. ✅ **异构分工架构重构**:AGENTS.md(团队宪法)+ 5 角色身份档案 + handoff + 返工回路
7. ✅ **EvoMap node 注册**:node_1935701e9c7f3a7b,L3 reputation,已绑定
8. ✅ **三档难度分流**:SIMPLE(直通)/MEDIUM(多解验证)/HARD(拆解分工)
9. ✅ **MEDIUM 升级为真协作**:3 solver 多解 → verifier 交叉验证 → 纠错 handoff
10. ✅ **protocol 层修复**:从 404 端点(route-to-member)切到实测可用的 session/message
11. ✅ **OAuth 开发套件接入**:PKCE 流程 + app 注册(approved)+ 授权成功
12. ✅ **继承层切 B 路径**:/a2a/assets/search(200),不再依赖 OAuth 审批
13. ✅ **回流层切 B 路径**:/a2a/publish,schema 完全对齐(asset_id 递归 hash + validation node -e + capsule content)
14. ✅ **继承/回流阈值**:仅 HARD 触发(简单问题经验无复用价值)
15. ✅ **submitResult 补全**:每只蜂完成后调 swarm/result(A2A 闭环)
16. ✅ **AIME 评测链路**:专用脚本与 3 solver + verifier 交叉验证路径已接入

---

## 八、当前卡点(按优先级)

### 🔴 卡点 #1:HARD 任务聚合超时/服务崩溃
**现象**:HARD 任务(3 子任务 × planner/coder/reviewer)完整跑完需要 5-15 分钟。当 curl 超时关闭连接时,Express abort 进行中的 mimo fetch(`Request was aborted`),导致聚合未完成 → 回流未触发。偶发服务进程崩溃(3 solver 并行调用 mimo 时)。

**影响**:HARD 任务的回流 publish 从未 end-to-end 验证(单独测试 publish 已 HTTP 200)。

**修复方向**:
- (a) 回流异步执行:即使 client 断开,服务端仍完成 publish(detached)
- (b) aggregate 调用加 try-catch + 重试,不被 abort 杀死
- (c) 给 Express 请求加 `req.on('close')` 处理,不 abort 进行中的 fetch

### 🟡 卡点 #2:分类器不稳定
**现象**:同一道 AIME 题有时 MEDIUM 有时 HARD;digital clock 判 MEDIUM(应该是 HARD);分类调用偶发 180s 超时(占满 beeTimeoutMs)。

**影响**:HARD 路径(继承+拆解+回流)触发不确定,demo 时不可预测。

**修复方向**:
- (a) 规则预判 + LLM 兜底(含"build/create app" → HARD;纯数字 → MEDIUM)
- (b) 分类调用单独短超时(如 30s),超时默认 MEDIUM
- (c) 解耦"难度"和"协作模式"

### 🟡 卡点 #3:OAuth token 不持久化
**现象**:服务重启后 OAuth token 丢失,需重新访问 /oauth/start 授权。

**影响**:A 路径 recipe 检索(开发套件官方端点)重启后失效,直到重新授权。

**修复方向**:token 写入 .evomap/oauth_token(0600),启动时读取。

### 🟢 卡点 #4:回流 publish 全链路未端到端验证
**现象**:publish 单独测试 HTTP 200 + bundle_id(证明 schema 正确)。但 HARD 任务全链路因卡点#1 未跑到回流步骤。

**修复方向**:解决卡点#1 后自然验证。

---

## 九、下一步建议(按优先级)

### P0:修回流异步执行(解决卡点#1)
让 publish 不被 client 断开影响。这是 demo 完整性的最后一环。

### P1:修分类器稳定性(解决卡点#2)
规则预判 + 短超时。让 demo 行为可预测。

### P2:批量 AIME benchmark
用稳定的分类器跑 10-20 题,对比 baseline vs swarm 正确率。这是"弱超强"的硬数据。

### P3:官网加协作 trace 可视化
评委打开网页就能看到 planner→coder→reviewer 的 handoff、突破广播、返工。

### P4:部署到 https(vercel/cloudflare)
解决 OAuth redirect_uri https 要求 + 让 demo 公网可访问。

---

## 十、关键文件索引

| 文件 | 作用 |
|---|---|
| `docs/endpoint-scan-report.md` | EvoMap 全端点实测扫描(31个,17可用/8存在/6个404) |
| `docs/evomap-integration-audit.md` | 开发套件 vs 我们接入的深度审计 |
| `docs/competitive-analysis.md` | 17 个开源竞品对比(ChatDev/MetaGPT/AutoGen/FunSearch/DGM) |
| `docs/project-concept-analysis.md` | 项目概念定位 + EvoMap 契合点 |
| `docs/evomap-swarm-integration-plan.md` | 最初的集成方案(v2,部分已过时) |
| `~/.evomap/node_id` `node_secret` | 平台 B 路径凭证(600 权限) |
| `.env` | mimo + OAuth 配置(gitignore,不推送) |
| `.agent-state/*.json` | agent 绩效记忆(gitignore,组织进化用) |
| `/tmp/aime90.jsonl` | AIME 90 题数据集(答案 0-999 整数) |
| `/tmp/evoship_server.log` | 服务运行日志(蜂群协作过程) |

---

## 十一、关键命令速查

```bash
# 启动
cd /Users/baihe/Documents/evomap && npm run start

# 授权 OAuth(重启后需做一次)
open http://localhost:4000/oauth/start

# 测端点
curl -X POST http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"swarm-heavy","messages":[{"role":"user","content":"你的问题"}]}'

# AIME benchmark
npx tsx benchmarks/scripts/aime-eval.ts 10 3   # 10题,并发3

# 查状态
curl http://localhost:4000/api/status

# 查服务日志
tail -50 /tmp/evoship_server.log

# 推送代码
cd /Users/baihe/Documents/evomap && git add -A && git commit -m "..." && git push
```

---

## 十二、一句话总结

**EvoShip 是一个 OpenAI 兼容的蜂群推理端点。除 SIMPLE 直连外,所有蜂群协作(session/handoff/breakthrough/submitResult/backflow)均基于 EvoMap 真实端点。继承层(/a2a/assets/search)和回流层(/a2a/publish)已接入,MEDIUM 多解+交叉验证链路已接入,HARD 拆解+回流协作链路已接入但仍需优化长任务聚合超时。最大卡点是 HARD 聚合超时(需修异步回流)。**
