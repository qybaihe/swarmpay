# EvoMap 开发套件深度分析 + 接入审计

> 基于 developers 仓库(HACKATHON.md + README + quickstart)+ skill.md + openapi.json + 实测 HTTP 状态

## 一、核心发现:三套接入路径,可用性差异巨大

EvoMap 存在**三套**不同的 API 表面,**不是一套**。这是理解一切的关键:

| 路径 | 文档来源 | 认证 | 定位 | 实测状态 |
|---|---|---|---|---|
| **A 路径 OAuth** | developers 仓库(官方钦定) | OAuth2 + PKCE token | 第三方应用代表用户读写 recipe/gene/reuse | 🟡 端点真实,但需 OAuth token(我们没有) |
| **B 路径 node** | skill.md | node_secret(Bearer) | agent 节点直接接入 A2A 协议 | 🟢 我们有凭证,核心端点 200 |
| **C 路径 swarm** | skill.md 文档列表 | node_secret | swarm 专用通信(route-to-member 等) | 🔴 **端点不存在(404)**,平台未上线 |

### 实测 HTTP 状态(用我们的 node 凭证)

**B 路径真实可用(HTTP 200):**
| 端点 | 用途 | 状态 |
|---|---|---|
| `POST /a2a/heartbeat` | 心跳/在线 | ✅ 200 |
| `POST /a2a/fetch` | 检索 Capsule 经验(继承!) | ✅ 200 |
| `GET /a2a/assets?status=promoted` | 浏览 promoted 资产 | ✅ 200(返回 3 个) |
| `GET /a2a/assets/search?signals=...` | 按 signals 搜索 | ✅ 200 |
| `POST /a2a/publish` | 发布 Gene+Capsule(回流!) | ✅ 端点存在(400=参数校验,非404) |
| `GET /a2a/stats` | 全网统计 | ✅ 200 |
| `GET /a2a/task/list` `/my` | 任务系统 | ✅ 200 |
| `POST /a2a/session/create` | 多 agent 会话(协作!) | ✅ 200 |

**C 路径不存在(HTTP 404 route_not_found):**
| 端点 | 状态 |
|---|---|
| `/a2a/swarm/route-to-member` | 🔴 404 |
| `/a2a/swarm/relay-to-team` | 🔴 404 |
| `/a2a/swarm/team-roster` | 🔴 404 |

**A 路径需 OAuth token(用 node secret 是 401):**
| 端点 | 状态 |
|---|---|
| `/developer/oauth/recipes` | 🟡 401(需 OAuth token,非 node secret) |
| `/developer/oauth/genes` | 🟡 401 |
| `/developer/oauth/recipe`(发布) | 🟡 401 |

## 二、开发套件(developers 仓库)讲了什么

官方黑客松路径**完全是 A 路径 OAuth**,核心就这几件事:

1. **注册 app**:evomap.ai/dev/portal,勾 test_mode,拿 client_id/secret
2. **OAuth2 + PKCE**:授权码流,跑 quickstart 拿 access_token
3. **四个端点**:
   - `GET /developer/oauth/recipes?q=` — 全文搜 recipe(多步工作流)
   - `GET /developer/oauth/genes?type=` — gene 排行(无 q)
   - `GET /developer/oauth/reuse?recipe_id=` — 关联图谱
   - `POST /developer/oauth/recipe` / `/publish` — 发布 recipe
4. **scope**:`recipe:read gene:read reuse:query`(自助)+ `recipe:write`/`publish`
5. **官方 demo 点子**:提示词增强器、EvoMap 登录、调用价值网络的 agent、recipe 发布工具

**关键**:`recipe` 是开发套件的核心数据模型(多步工作流)。skill.md 的核心是 `Gene+Capsule`(进化资产)。两套数据模型不同。

## 三、skill.md 为什么端点不全可用

skill.md 是**完整协议蓝图**(给任意 agent 接入的完整 GEP-A2A 规范),但平台是**渐进上线**:
- B 路径核心(heartbeat/fetch/publish/assets/session)**已上线**
- C 路径 swarm 专用(route-to-member/relay-to-team)**未上线**(只在文档)
- swarm 协作实际通过 **B 路径的 session/dialog** 实现(session/create 是 200)

openapi.json **只包含 A 路径 OAuth 端点**——这印证了开发套件是官方主推。

## 四、我们的现状审计

| 开发套件要求 | 我们现状 | 评级 |
|---|---|---|
| OAuth2 接入 + token | ❌ 没有 OAuth token | 🔴 缺失 |
| recipe 检索(继承) | ❌ 调了但 401(用 node secret 不对) | 🔴 需修 |
| recipe 发布(回流) | ❌ 调了但 401 | 🔴 需修 |
| gene 检索 | ❌ 未实现 | 🔴 缺失 |
| reuse 图谱 | ❌ 未实现 | 🔴 缺失 |
| test_mode 沙箱 | ❌ 未注册 test app | 🔴 缺失 |

| skill.md B 路径 | 我们现状 | 评级 |
|---|---|---|
| node 注册 + heartbeat | ✅ 已注册,L3,heartbeat 200 | 🟢 |
| Capsule 检索(/a2a/fetch) | ❌ 代码里调的是 recipe(401),没调 fetch | 🔴 需修 |
| Gene+Capsule 发布(/a2a/publish) | ❌ 未实现(只调了 recipe) | 🔴 需修 |
| GEP-A2A 信封 | ✅ 格式完全对齐 | 🟢 |
| session 协作 | ❌ 调的是不存在的 route-to-member(404) | 🔴 需修 |

## 五、正确的接入策略(双轨)

### 轨道 1:B 路径 node(我们已有凭证,立即可用)
把继承/回流/协作**全部切到真实 200 的 B 路径端点**:
- 继承:`POST /a2a/fetch`(检索 Capsule)替代 recipe 检索
- 协作:`POST /a2a/session/create` + `session/message` 替代 route-to-member
- 回流:`POST /a2a/publish`(Gene+Capsule bundle)替代 recipe 发布
- 突破广播:`session/message` 广播替代 relay-to-team

### 轨道 2:A 路径 OAuth(官方钦定,需注册)
你去 dev portal 注册 test_mode app 拿 OAuth token,补齐:
- recipe 检索/发布(开发套件核心,评委最认)
- gene 检索、reuse 图谱

**两条轨道都做 = 既符合官方开发套件规范,又有 B 路径的真实 A2A 协作。**
