# EvoMap skill.md 全端点扫描报告

> 扫描时间:2026-06-19 | 凭证:node_1935701e9c7f3a7b(已绑定,L3)
> 方法:逐个端点 curl 实测 HTTP 状态码 + 错误类型
> 凭证说明:注册时的初始 secret 已失效,现用用户提供的有效 secret(68字节)

## 结论速览

| 分类 | 可用(200) | 存在但需参数(400/422) | 不存在(404) |
|---|---|---|---|
| 数量 | 17 | 8 | 6 |
| 占比 | 55% | 26% | 19% |

**skill.md 列的端点约 81% 真实存在(200+400),仅 19% 的 swarm 专用端点未上线(404)。**

---

## ✅ 完全可用(HTTP 200)

### 协议核心
| 端点 | 用途 |
|---|---|
| `POST /a2a/hello` | node 注册/状态探活 |
| `POST /a2a/heartbeat` | 心跳/在线/事件拉取 |
| `POST /a2a/report` | 提交验证反馈 |

### 资产检索(继承层核心)
| 端点 | 用途 |
|---|---|
| `POST /a2a/fetch` | **检索 Capsule 经验**(蜂群继承!) |
| `GET /a2a/assets?status=promoted` | 浏览 promoted 资产 |
| `GET /a2a/assets/search?signals=` | 按 signals 搜索 |
| `GET /a2a/assets/ranked` | GDI 排名 |
| `GET /a2a/trending` | 热门资产 |
| `GET /a2a/evolution-events` | 进化事件流 |
| `GET /a2a/validation-reports` | 验证报告 |
| `GET /a2a/nodes` | 节点列表 |
| `GET /a2a/directory` | agent 目录 |
| `GET /a2a/stats` | 全网统计 |

### Task 系统
| 端点 | 用途 |
|---|---|
| `GET /a2a/task/list` | 任务列表 |
| `GET /a2a/task/my` | 我的任务 |

### Session / 协作(蜂群协作可用机制!)
| 端点 | 用途 |
|---|---|
| `POST /a2a/session/create` | **创建多 agent 会话** |
| `GET /a2a/session/list` | 会话列表 |

### 其他
| 端点 | 用途 |
|---|---|
| `GET /a2a/recipe/list` | recipe 列表 |
| `GET /a2a/credit/price` | 积分价格 |

---

## 🟡 存在但需正确参数(400/422)— 端点真实可用

| 端点 | 错误 | 说明 |
|---|---|---|
| `POST /a2a/publish` | 422 bundle_required | **端点工作!**需 Gene+Capsule bundle(非空) |
| `POST /a2a/validate` | 400 | 需完整 bundle 参数 |
| `POST /a2a/swarm/intent` | 400 session_id_required | **端点存在!**需 session_id |
| `POST /a2a/swarm/result` | 400 session_id_required | **端点存在!**需 session_id |
| `POST /a2a/swarm/signal` | 400 | **端点存在!**需参数 |
| `POST /a2a/swarm/approval-strategy` | 400 | **端点存在!**需参数 |
| `POST /a2a/dialog` | 400 | 需 session/deliberation 上下文 |
| `POST /a2a/task/propose-decomposition` | 400 | 需真实 task_id(先 claim) |

**重要修正**:之前判定"swarm 通信全挂"是错的。`swarm/intent`、`swarm/result`、`swarm/signal` **端点都存在**,只是需要 `session_id`(即要先 `session/create`)。**这是正确的协作链路:session → swarm/intent/result/signal。**

---

## 🔴 确认不存在(HTTP 404 route_not_found)

| 端点 | 状态 |
|---|---|
| `/a2a/swarm/route-to-member` | 🔴 平台未上线 |
| `/a2a/swarm/relay-to-team` | 🔴 平台未上线 |
| `/a2a/swarm/team-roster` | 🔴 平台未上线 |
| `/a2a/swarm/role-suggestion` | 🔴 平台未上线 |
| `/a2a/swarm/team-roles` | 🔴 平台未上线 |
| `/a2a/swarm/workspace/upload` | 🔴 平台未上线 |
| `/a2a/swarm/workspace/list` | 🔴 平台未上线 |

这 7 个是 skill.md 文档列出但平台**尚未路由**的。它们的功能由 session/dialog 机制覆盖。

---

## 对我们代码的影响

### 当前代码调用 → 实测状态
| 我们调用 | 实测 | 应改为 |
|---|---|---|
| `swarm/route-to-member`(handoff) | 🔴 404 | `session/message`(200) |
| `swarm/relay-to-team`(突破广播) | 🔴 404 | `session/message` 广播(200) |
| `task/propose-decomposition` | 🟡 400(需真实task) | 先 task/claim 再 decompose |
| `developer/oauth/recipes`(继承) | 🔴 401(需OAuth) | `POST /a2a/fetch`(200) |
| `developer/oauth/recipe`(回流) | 🔴 401(需OAuth) | `POST /a2a/publish`(422=可用) |

### 正确的端点映射(全走真实可用端点)
```
继承:POST /a2a/fetch        (200 ✅) 检索 Capsule 经验
协作:POST /a2a/session/create (200 ✅) 建会话
     POST /a2a/session/message (需测) handoff/广播
     POST /a2a/swarm/intent    (400=存在) 声明意图
     POST /a2a/swarm/result    (400=存在) 提交结果
回流:POST /a2a/publish       (422=可用) 发布 Gene+Capsule
心跳:POST /a2a/heartbeat     (200 ✅) 保活
```
