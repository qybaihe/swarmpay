# 交接:API Key 创建与端点转换解耦 + 剩余链路打通

> 本文档交接"用户注册→拿 API Key→调用扣积分"体系的收尾工作。
> 重点是:把"创建 API Key"和"端点转换(上传自己的模型)"解耦成两件独立的事。

---

## 一、核心逻辑(必须理解)

当前体系有**两个独立概念**,必须解耦:

### 1. API Key(每个用户有,注册自动发)
- 注册时自动生成一个 `sk-evoship-xxx` key
- 这个 key **绑定内置默认模型**(`api.evomap.ai` / `evomap-gpt-5.5`,在 `src/config.ts` 的 `config.defaultProvider`)
- 用户拿这个 key **立刻就能调用**,不需要任何额外操作
- key 在 **API Key 管理页**(`/api-keys`)查看、重新生成
- 这就是用户"自己的 API Key"

### 2. 端点转换(可选,高级功能)
- 用户如果想用**自己的上游模型**(如 OpenAI、mimo、本地模型),才去端点转换页上传自己的 `base_url + api_key + model`
- 端点转换后会**更新该用户 key 绑定的上游 provider**(从内置默认模型换成用户自己的)
- **但 key 本身不变** — 用户继续用同一个 `sk-evoship-xxx`,只是底层调的上游换了
- 这是独立的高级功能,新用户不需要碰

### 关键区别(当前代码的问题)
- ❌ 现在 API Key 管理页(`/api/views/ApiKeyView.vue`)在无端点时显示"还没有端点。去端点转换注册" — **这是错的**,应该显示"你的 API Key 已就绪"(因为注册就自动发了)
- ❌ 端点转换页(`web/components/TransformSection.vue`)现在逻辑是"注册端点 → 拿新 key" — 应该改成"注册端点 → 更新现有 key 的上游"(key 不变)
- ✅ 后端已经支持:注册时自动发 key(`src/auth.ts` register 路由的 `onUserCreated` 回调),绑定的就是 `config.defaultProvider`

---

## 二、已完成的工作(当前代码状态)

### 后端(已实现 + curl 测通)
- ✅ `src/config.ts` — `config.defaultProvider`(内置模型 api.evomap.ai)+ `signupCredits: 1000` + `callCostCredits: 50`
- ✅ `src/auth.ts` — users 表加 `credits` 列(幂等 ALTER 迁移);`AuthStore` 加 `getCredits/deductCredits/addCredits/listTransactions`;注册路由 `onUserCreated` 回调自动发 key(调 `endpointStore.register` 绑定 defaultProvider,`skipHealthCheck: true`);`/api/credits` 路由
- ✅ `src/server.ts` — `/v1/chat/completions` 和 `/api/playground/swarm/run` 强制要 endpoint(无 key 401)+ 积分检查(余额<50 返回 402)+ 成功后扣 50
- ✅ `src/endpoints.ts` — `register` 加 `skipHealthCheck` 选项

### 前端(已实现,typecheck 通过)
- ✅ `web/api/auth.ts` — AuthUser 加 `credits`;`AuthResponse` 加 `api_key/base_url/model`;`fetchCredits()` + `CreditTransaction` 类型
- ✅ `web/stores/auth.ts` — `register()` 把自动发的 key 存入 transformStore
- ✅ `web/api/swarm.ts` — `runSwarm` 无 key 时抛错(不再发 "Bearer eval")
- ✅ `web/views/ChatView.vue` — `needsKey` 改成通用(所有模型都要 key);无 key 时引导去 API Key 页;内联注册改为可选(用自己的模型)
- ✅ `web/components/NavBar.vue` — 用户下拉菜单(头像+积分+菜单:积分管理/API Key/我的舰队/社区/退出)
- ✅ `web/views/CreditsView.vue` — 积分管理页(余额大数字+流水表+充值入口)
- ✅ `web/views/ApiKeyView.vue` — API Key 管理页(查看 key+端点列表+重新生成+curl 示例)
- ✅ `web/views/DocsView.vue` — 完整文档页(7步:注册→第一次调用→选模型→找舰队→搭舰队→积分说明→各语言示例)
- ✅ `web/components/SiteFooter.vue` — 美化页脚(四列+EvoMap logo+联系方式)
- ✅ 路由: `/credits`, `/api-keys`, `/docs` + NavBar/Footer 入口

### curl 验证结果(后端闭环已通)
- 注册 → 自动发 key + 1000 积分 ✅
- 无 key 调用 → 401 ✅
- 有 key 调用 swarm-baseline → 成功(扣50) ✅ *(注:有次测 swarm-evo 返回 500,可能是内置 evomap 模型对某些请求超时,需排查 callReal 错误)*
- 余额检查 → 402 ✅
- 积分流水记录 ✅

---

## 三、需要完成的剩余工作(按优先级)

### 🔴 P0:修复 API Key 管理页的"无端点"引导
**文件**: `web/views/ApiKeyView.vue`
**问题**: 当用户只有注册自动发的 key(1 个端点,绑定内置模型),页面正常显示。但如果端点列表为空(理论不该发生),显示"去端点转换注册"是错的。
**修复**: 把空状态改成:
```
你的 API Key 还没生成。点击下方按钮创建(绑定内置默认模型,开箱即用)。
[创建我的 API Key]
```
点击后调 `POST /api/endpoints/register` 用 `config.defaultProvider` 的值(前端写死内置模型信息或从后端拿)。

### 🔴 P0:端点转换页改逻辑 — "更新上游"而非"拿新 key"
**文件**: `web/components/TransformSection.vue` + 后端 `src/endpoints.ts`
**问题**: 现在端点转换 = 注册新端点 = 拿新 key。应该改成:端点转换 = 更新用户现有 key 的上游 provider(key 不变)。
**修复方向**:
- 后端加 `PUT /api/endpoints/:id/upstream` — 更新某端点的 `upstream_base_url/api_key/model`(不改 api_key_hash)
- 前端 TransformSection:用户填完上游信息后,调这个 PUT 更新他的端点(而不是 POST register 创建新的)
- 结果展示:不再显示"新 Key",而是"你的上游模型已更新为 xxx,继续用你的 sk-evoship-xxx 即可"
- 标题改成"更换上游模型"(不是"端点转换/生成舰队端点")

### 🟡 P1:登录后恢复 key
**问题**: 注册时 key 存入 localStorage(transformStore),但换设备/清缓存后登录,key 就丢了(后端只存 hash 不能还原明文)。
**修复方向**(两选一):
- A. 登录路由(`/api/auth/login`)返回用户的第一个 active endpoint 的**完整 key** — 但后端只存 hash,做不到
- B. 登录后前端检查 `transformStore.lastApiKey`,为空时提示"你的 API Key 未同步,去 API Key 页重新生成"(API Key 页有 rotate 功能能生成新 key)
- **推荐 B**:在 `web/stores/auth.ts` 的 `login()` 后检查,无 key 时 toast 提示 + 引导

### 🟡 P1:内置模型 500 错误排查
**现象**: curl 测 `swarm-evo`(走完整蜂群)时偶尔 500,`swarm-baseline`(单次直通)正常。
**排查**: 看 `/tmp/evomap-server.log` 的 `[swarm] error:` 行。可能是内置 `evomap-gpt-5.5` 模型对蜂群的多轮调用超时/限流。
**修复**: 调整 `config.beeTimeoutMs`(当前 30000),或在 `swarm.ts` 的蜂群调用加更好的错误兜底。

### 🟢 P2:充值功能
**文件**: `src/auth.ts`(加 redeem 路由)+ `web/views/CreditsView.vue`
**当前**: CreditsView 充值按钮 disabled("即将开放")。
**实现**: 加 `POST /api/credits/redeem` body `{code}` — 验证兑换码 + addCredits。兑换码可硬编码几个测试码或存 DB 表。

---

## 四、关键文件索引

### 后端
| 文件 | 作用 | 关键行 |
|---|---|---|
| `src/config.ts` | 内置模型 + 积分配置 | `defaultProvider` / `signupCredits` / `callCostCredits` |
| `src/auth.ts` | 用户+积分+注册自动发key | `AuthStore` credits 方法、`registerAuthRoutes` 的 `onUserCreated`、`/api/credits` |
| `src/server.ts` | 调用入口+积分扣减 | `/v1/chat/completions`(:168) 和 `/api/playground/swarm/run`(:248) 的积分检查+扣减 |
| `src/endpoints.ts` | 端点存储+provider | `register`(加 skipHealthCheck)、`resolveEndpointProvider`、`toProvider` |
| `src/community.ts` | 社区功能 | 完整独立 |
| `src/fleets.ts` | 自定义舰队 | fork/setPublic/isPublic |
| `src/evolution-memory.ts` | 经验宝箱 | count/recent/deposit |

### 前端
| 文件 | 作用 |
|---|---|
| `web/api/auth.ts` | AuthUser(含 credits)+ fetchCredits |
| `web/api/swarm.ts` | runSwarm(无 key 抛错) |
| `web/api/endpoints.ts` | listEndpoints/rotateEndpointKey/registerEndpoint |
| `web/stores/auth.ts` | register 存 key 到 transformStore |
| `web/stores/transform.ts` | lastApiKey/lastResult(localStorage 持久化) |
| `web/stores/chat.ts` | 对话(用 transformStore.lastApiKey 调 runSwarm) |
| `web/stores/playground.ts` | 宝箱状态 + dispatch |
| `web/views/ChatView.vue` | 对话页(needsKey 通用引导) |
| `web/views/ApiKeyView.vue` | API Key 管理页 |
| `web/views/CreditsView.vue` | 积分管理页 |
| `web/views/DocsView.vue` | 完整文档页 |
| `web/views/PlaygroundView.vue` | 画布+舰队+宝箱+保存浮层 |
| `web/views/CommunityView.vue` | 社区列表 |
| `web/views/CommunityFleetView.vue` | 社区详情(赞+评+fork) |
| `web/components/NavBar.vue` | 用户下拉(头像+积分+菜单) |
| `web/components/SiteFooter.vue` | 美化页脚 |
| `web/components/playground/ExperienceTreasure.vue` | 经验宝箱 |
| `web/components/playground/PetNode.vue` | 节点+定制面板 |
| `web/components/TransformSection.vue` | **端点转换(需改逻辑:P0)** |

---

## 五、运行方式

```bash
cd /Users/baihe/Documents/evomap

# 单服务器模式(前端 build 到 public/, 后端 4000 同时 serve)
npm run build:web        # 构建前端
npm run start            # 启动(nohup npm run start > /tmp/evomap-server.log 2>&1 &)
# 访问 http://localhost:4000

# 开发模式(需两个进程,但 5173 容易被沙箱杀):
# nohup npm run dev:web > /tmp/evomap-vite.log 2>&1 &  (前端 5173)
# nohup npm run dev > /tmp/evomap-backend.log 2>&1 &   (后端 4000, tsx watch)

# 环境变量(.env):
# OPENAI_BASE_URL / OPENAI_API_KEY / SWARM_MODEL — 蜂群底层模型(当前用 mimo)
# EVOMAP_BASE_URL / EVOMAP_API_KEY / EVOMAP_MODEL — 内置默认 provider(给注册用户用)
# EVOMAP_TOKEN — EvoMap 经验继承/回流
# SIGNUP_CREDITS=1000 / CALL_COST_CREDITS=50

# typecheck:
npx tsc --noEmit                    # 后端
npx vue-tsc -p web/tsconfig.json --noEmit  # 前端

# 灌入官方舰队(社区样板):
node --import tsx scripts/seed-official-fleets.ts
```

---

## 六、给新线程的交接提示词

把以下提示词粘贴到新线程:

```
我有一个 EvoShip 项目(/Users/baihe/Documents/evomap),需要你完成 API Key 与端点转换的解耦工作。

## 背景
项目已有完整的积分体系:注册自动送 1000 积分 + 自动发一个绑定内置默认模型(api.evomap.ai)的 sk-evoship API Key,每次调用扣 50 积分。后端已全部实现并测通。

## 需要你做的(按优先级)

### P0:端点转换逻辑解耦
现在的"端点转换"页(web/components/TransformSection.vue)逻辑是:用户填上游模型信息 → POST /api/endpoints/register → 创建新端点 → 返回新 key。
应该改成:用户填上游模型信息 → 更新他现有端点的上游 provider → **key 不变**(继续用注册时发的 sk-evoship-xxx)。

具体:
1. 后端 src/endpoints.ts 加 `PUT /api/endpoints/:id/upstream` 路由:更新 upstream_base_url/upstream_api_key/upstream_model,不改 api_key_hash
2. 前端 TransformSection.vue:提交时调 PUT 更新(而非 POST 创建),标题改"更换上游模型",结果不显示新 key 而是提示"上游已更新,继续用你的 key"
3. API Key 管理页(web/views/ApiKeyView.vue)的空状态引导改成"创建我的 API Key"(而非"去端点转换注册")

### P1:登录后 key 恢复
用户换设备登录后 transformStore.lastApiKey 可能为空(后端只存 hash 不能还原)。在 web/stores/auth.ts 的 login() 后检查,无 key 时提示去 /api-keys 页重新生成。

### P1:内置模型 500 排查
curl 测 swarm-evo(完整蜂群)时偶尔 500,swarm-baseline 正常。查 /tmp/evomap-server.log 的 error,可能是内置 evomap-gpt-5.5 对蜂群多轮调用超时。

详细上下文见 docs/handoff-apikey-credits-flow.md。先读那个文档,再开始实现。
```
