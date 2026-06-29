# EvoShip 全栈交接提示词(线程重启用)

> **本文档给一个全新独立线程的 agent 使用,从零开始也能接手。**
> 项目根:`/Users/baihe/Documents/evomap`
> 最后更新:2026-06-19

---

## 📌 第 0 节:这个项目现在是什么

**EvoShip** 是一个 **OpenAI 兼容的蜂群/舰队推理端点**产品。用户把自己的模型端点(base_url + api_key + model)转换成 EvoShip 的"舰队端点",任意 OpenAI 兼容客户端(Cursor/Cline/LangChain)改一个 base_url 就能获得多 Agent 协作推理。

当前状态:**前端已全量迁移到 Vue 3 + Vite,后端是 Node/Express/TypeScript,带一个可视化 Playground**。

### 技术栈
- **后端**:Node 20 / Express 4 / TypeScript / `tsx` 运行(无编译)/ openai SDK
- **前端**:Vue 3 + Vite 8 + Pinia + Vue Router + @vue-flow/core(节点画布)
- **构建**:前端 `npm run build:web` 产物进 `public/`,后端 `tsx watch` 直接 serve

### 三个页面
| 路由 | 文件 | 说明 |
|---|---|---|
| `/` | `web/views/HomeView.vue` | 产品官网首页(8 区块:Hero 视频背景/端点转换器/实战演示/六阶段原理/舰队阵容/型号档位) |
| `/login` | `web/views/LoginView.vue` | 登录/注册页(**纯前端假提交,后端 /api/auth/* 未实现**) |
| `/playground` | `web/views/PlaygroundView.vue` | 🎮 可拖拽节点画布(19 个像素角色,会动+配音+台词,消息流转可视化) |

---

## 🗂️ 第 1 节:必读文件(按顺序,5 分钟建立全局)

```
项目根:/Users/baihe/Documents/evomap

必读:
1. 本文档(handoff-vue-playground.md)           ← 全局认知
2. package.json                                   ← scripts + 依赖
3. web/vite.config.ts                             ← 前端构建配置
4. web/router.ts                                  ← 三条路由
5. web/constants/pets.ts                          ← Playground 19 角色元数据
6. web/constants/fleet.ts                         ← 首页舰种 SVG/映射
7. src/server.ts                                  ← 后端入口(serve 前端 + API)
8. src/config.ts                                  ← 全局配置
9. AGENTS.md                                      ← 蜂群角色宪法
```

---

## 📁 第 2 节:完整目录结构(含每个文件职责)

```
evomap/
├── package.json              ★ 改过:加 dev:web / build:web script + Vue 依赖
├── tsconfig.json               后端 TS 配置(noEmit,不动)
├── src/                        后端(业务逻辑零改动)
│   ├── server.ts             ★ 改过:加 express.static + SPA fallback(见 §4)
│   ├── config.ts              .env 配置
│   ├── swarm.ts               蜂群编排入口
│   ├── model.ts               模型调用
│   ├── registry.ts            (旧文件,端点注册,未启用)
│   ├── orchestration/         orchestrator + pipeline 流水线
│   ├── agents/                角色定义 + types
│   ├── protocol/              GEP-A2A 信封 + adapter
│   └── evomap.ts              EvoMap 经验继承/回流
├── scripts/
│   ├── gen-launch-video.mjs  ★ 新增:调 MiniMax API 生成火箭发射视频
│   ├── demo-compare.ts
│   ├── aime-eval.ts
│   └── math-eval.ts
├── docs/
│   ├── handoff-vue-playground.md  ★ 本文档
│   └── handoff-fullstack.md       旧版交接(端点转换改造计划,后端部分未执行)
├── public/                    ★ 前端构建产物输出处(emptyOutDir:false)
│   ├── index.html              ← Vite 生成(覆盖旧静态版)
│   ├── assets/                 ← JS/CSS bundle + sprites/audio
│   │   ├── index-*.js          构建产物(~430KB,gzip 150KB)
│   │   ├── index-*.css         构建产物(~44KB)
│   │   ├── sprites/            928 张像素角色 PNG(Pet<Char><Action><NN>.png)
│   │   └── audio/              23 个 mp3(19 配音 + SFX)
│   ├── bg-starship.png         首屏静态兜底图(1.8MB)
│   ├── bg-launch.mp4           首屏火箭发射视频(1.3MB,MiniMax 生成)
│   └── legacy-html/            旧单文件 HTML 备份(可删)
│       ├── index.legacy.html
│       └── login.legacy.html
└── web/                       ★ 新增:Vue 源码(全部前端逻辑在这里)
    ├── index.html              Vite 入口 HTML
    ├── main.ts                 createApp + Pinia + router + 引入 tokens/base.css
    ├── App.vue                 <RouterView/> + GlobalToast
    ├── router.ts               / + /login + /playground 三条路由
    ├── vite.config.ts          outDir: ../public, emptyOutDir:false, dev proxy
    ├── tsconfig.json           Vue 独立 TS 配置(不污染后端)
    ├── assets/styles/
    │   ├── tokens.css          :root 设计 token(颜色/舰种色)
    │   └── base.css            reset + body + 共享类(.field/.btn/.msg/.toast)
    ├── constants/
    │   ├── fleet.ts            SHIP_SVG(5舰种) / ROLE / STAGES / 表单预设
    │   └── pets.ts          ★ Playground 19 角色元数据(id↔sprite↔voice↔台词↔舰种)
    ├── api/
    │   ├── endpoints.ts        POST /api/endpoints/register(+ 演示降级)
    │   ├── swarm.ts            POST /v1/chat/completions + SwarmTrace 接口
    │   ├── status.ts           GET /api/status
    │   └── mock.ts             演示模式 mock trace/answer
    ├── composables/
    │   ├── useToast.ts         全局 toast + copyText
    │   ├── useMarkdown.ts      marked + DOMPurify
    │   ├── useSprite.ts     ★ 像素角色帧动画引擎(rAF 切 00→07 帧)
    │   └── useFlowRunner.ts ★ Playground 消息流转引擎(拓扑遍历+粒子+配音)
    ├── stores/
    │   ├── demo.ts             演示模式开关
    │   ├── transform.ts        转换结果(跨 section 传 api_key)
    │   └── playground.ts    ★ Playground 节点运行态/突破源/登场/日志
    ├── views/
    │   ├── HomeView.vue        首页 = NavBar+Hero+Transform+Demo+Pipeline+Roster+Tiers+Footer
    │   ├── LoginView.vue       登录页(视频背景 + AuthCard)
    │   └── PlaygroundView.vue  ★ 节点画布页(vue-flow + Sidebar + 运行栏 + 粒子层)
    └── components/
        ├── (首页 14 个)
        │   NavBar/HeroSection/TransformSection/CodeTabs/DemoSection/
        │   LoadingCore/AnswerBlock/MetricsGrid/EvoMapPills/FleetChain/
        │   PipelineGrid/RosterSection/TiersSection/SiteFooter/
        │   + 通用:CopyButton/SectionHeader/ShipIcon/GlobalToast/AuthCard
        └── playground/
            ├── PetSprite.vue   ★ 帧动画播放器(<img src> 切帧,pixelated)
            ├── PetNode.vue     ★ vue-flow 自定义节点(像素角色+气泡+登场动画)
            └── Sidebar.vue     ★ 角色池(拖拽源)+ 玩法说明
```

---

## 🏗️ 第 3 节:前端 Vue 架构(本次最大改动)

### 迁移前 → 迁移后
- **旧**:`public/index.html`(826 行单文件 HTML+内联 CSS+JS)+ `public/login.html`(250 行)
- **新**:`web/` 目录 45 个 Vue/TS 文件,构建产物进 `public/`

### 构建链
```
npm run dev:web    → Vite dev server (5173),HMR,proxy /v1 /api /oauth → 4000
npm run build:web  → vue-tsc 类型检查 + vite build → public/assets/index-*.{js,css}
npm run dev        → tsx watch src/server.ts (4000),express.static serve public/
```

### 关键设计决策
1. **构建产物不删现有资源**:`vite.config.ts` 设 `emptyOutDir:false`,bg-*.png/mp4 不会被覆盖
2. **tsconfig 隔离**:后端 `tsconfig.json`(noEmit, src/scripts)不动;`web/tsconfig.json` 独立给 Vue
3. **vue-flow 类型坑**:vue-flow 的 `Node`/`Edge` 泛型会触发 TS2589(深层实例化),`PlaygroundView` 和 `useFlowRunner` 用 `any[]` + 本地宽松接口绕开
4. **markdown**:从手写迷你引擎换成 `marked` + `dompurify`

### 首页区块结构(HomeView.vue)
```
NavBar(滚动玻璃化 + 状态徽标 + Playground/登录 CTA)
HeroSection(火箭发射视频背景 + 左上渐变标题)
TransformSection(端点转换表单 → POST register → 演示降级 → 结果卡 + 代码示例)
DemoSection(派舰队 → 加载动画 → trace 可视化:答案/指标/EvoMap/舰队节点链)
PipelineGrid(六阶段:继承→编队→突破→广播→收敛→回流)
RosterSection(五舰种:旗舰/导航/工程/监察/斥候)
TiersSection(四档型号 + 客户端 logo)
SiteFooter
```

---

## 🎮 第 4 节:Playground 节点画布(本次新增功能)

### 是什么
`/playground` 是一个可视化编排画布。用户从侧栏拖**像素角色节点**进画布,手动连线建编队,输入问题后看消息在节点间流转。

### 19 个角色(全部带配音)
素材来源:`/Users/baihe/Documents/New project 22/ClipClashPixel/`(iOS app),搬到 `web/public/assets/sprites/`(928 PNG)+ `audio/`(19 配音)。

| 类别 | 角色 |
|---|---|
| 圆桌常驻 | Claude / 张雪峰 / 豆包 / Trump |
| 商业科技 | 雷军 / 张一鸣 / Musk / Sam Altman / Einstein / Newton / 黄仁勋 |
| 动漫推理 | 柯南 / 路飞 / Misa / L |
| 有趣角色 | 乌萨奇 / 小八 / 奶龙 / Rilakkuma |

### 角色 ↔ 舰种 默认映射(可改)
- **旗舰 orchestrator**:Claude / 张雪峰
- **导航舰 planner**:豆包 / 雷军 / Sam / 小八 / Rilakkuma
- **工程舰 coder**:张一鸣 / Musk / 黄仁勋
- **监察舰 reviewer**:Trump / Newton / 柯南 / L
- **斥候舰 explorer**:Einstein / 路飞 / Misa / 乌萨奇 / 奶龙

### 素材命名坑(id↔sprite 不直译,务必查表)
```
claude       → PetClawd      (不是 PetClaude)
musk         → PetMuskie     (不是 PetMusk)
hachiware    → PetXiaoba     (小八拼音)
nailong      → PetHappyNailong(带 Happy 前缀)
l-lawliet    → PetL
doubao       → PetDoubaoHuman(用 Human 版)
sam-altman   → PetSam
jensen-huang → PetJensenHuang
```
所有映射在 `web/constants/pets.ts` 的 `PETS` 数组里,sprite 路径用 `spritePath(sprite, action, frame)` 生成。

### 角色动画机制
- **不是 sprite sheet**,是**单帧 PNG 序列**:每角色 4 动作(Idle/Opposed/Speaking/Supported)× 8 帧(00-07)= 32 张,192×208px
- 播放:`useSprite.ts` 用 `requestAnimationFrame` 按 ~130ms/帧切 `<img src>`,`image-rendering: pixelated` 保像素清晰

### 登场动画(iOS app 风格)
拖角色进画布触发 `entrancing` 态(`PetNode.vue`):
- **闪光弹跳**:`scale(0.3)→1.15→1` + 轻微旋转 + 角色色光晕扩散到白闪再收回
- **切 Speaking 帧**:登场期间播 8 帧 Speaking 动画
- **台词气泡**:弹角色招牌台词(Trump→"Make America Great Again!")
- **播登场语音**:`new Audio(voice).play()`(浏览器自动播放策略:首次需用户交互,拖拽满足)
- 2.4 秒后退出登场态回 Idle

### 消息流转引擎(`useFlowRunner.ts`)
1. 输入问题点「派出舰队」
2. **Kahn 拓扑排序**:从入度 0 的节点开始遍历
3. 每个节点:**激活**(亮+气泡+台词+播配音)→ 沿出边发**青色消息粒子**(CSS 动画飞行)→ 下一节点激活
4. **突破源节点**(用户手动标⚡):激活时向**全体其他节点**发**金色广播粒子**(经验同步扩散),其余节点闪"✨受启发"
5. 末节点后弹「✅ 编队经验已回流 EvoMap」
6. 全程 mock,不调真实蜂群

### 节点交互
- **拖拽**:vue-flow 原生,从节点边缘 Handle 拉连线
- **悬停节点**:显示🔄切换舰种 / ⚡标突破源 按钮
- **清空**:顶栏按钮清空所有节点和连线

---

## 🔧 第 5 节:后端改动(仅 server.ts,业务逻辑零改动)

### 5.1 静态资源服务
```typescript
// src/server.ts:48
app.use(express.static(path.join(__dirname, "..", "public")));
```
让 `public/` 下的 bg-*.png/mp4、assets/sprites、assets/audio 能被访问。

### 5.2 SPA fallback(Vue Router history 模式必需)
```typescript
// src/server.ts:150-158
app.get("*", (req, res, next) => {
  const p = req.path;
  if (p.startsWith("/v1") || p.startsWith("/api") || p.startsWith("/oauth") || p.includes(".")) {
    return next(); // API 或静态资源,交给 404
  }
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});
```
让 `/login`、`/playground` 等前端路由刷新不报 404 JSON。API 路径仍返回 JSON 404。

> **注意**:Express 4 用 `"*"`,不是 Express 5 的 `"/{*splat}"`。

### 5.3 未实现的后端功能(前端已做演示降级)
| 端点 | 状态 | 前端兜底 |
|---|---|---|
| `POST /api/endpoints/register` | ❌ 未实现 | TransformSection fetch 失败 → 生成假 `sk-evoship-xxx` key + 黄色"演示模式"提示 |
| `POST /api/auth/*`(登录/注册) | ❌ 未实现 | AuthCard 假提交 → localStorage `evoship_demo_user` + 成功提示 + 跳首页 |
| Playground | 纯前端 mock | 不调任何后端 |

---

## 🎬 第 6 节:首屏火箭发射视频(已生成)

### 怎么来的
用 MiniMax 图生视频 API(`MiniMax-Hailuo-2.3`)把静态飞船图 `bg-starship.png` 变成动态火箭发射视频。

### 生成脚本
`scripts/gen-launch-video.mjs` —— 完整流程:
1. 读 `public/bg-starship.png` → base64 data URI
2. `POST /v1/video_generation`(Authorization: Bearer,first_frame_image=data URI,prompt=火箭发射描述)
3. `GET /v1/query/video_generation?task_id=` 轮询(2-5 分钟)
4. `GET /v1/files/retrieve?file_id=` 取下载 URL
5. 下载到 `public/bg-launch.mp4`

### 重新生成(换效果)
改 `gen-launch-video.mjs` 里的 `PROMPT`(如"火箭回收着陆"/"星舰在轨飞行"),`node scripts/gen-launch-video.mjs` 自动覆盖。需要 MiniMax API key(脚本里硬编码了一个,可能过期需换)。

### 视频接入
`HeroSection.vue` 和 `LoginView.vue` 用 `<video autoplay muted loop playsinline poster="/bg-starship.png">`,视频加载前显示静态图兜底。

---

## ▶️ 第 7 节:如何运行(给新线程 agent)

```bash
cd /Users/baihe/Documents/evomap

# 方式 A:开发模式(两个终端)
npm run dev          # 终端 1:后端 :4000
npm run dev:web      # 终端 2:前端 :5173(HMR),proxy API → :4000
# 浏览器开 http://localhost:5173/(开发看这里)

# 方式 B:演示/生产模式(一个终端,看构建产物)
npm run build:web    # 构建前端 → public/assets/
npm run dev          # 后端 :4000 直接 serve public/
# 浏览器开 http://localhost:4000/

# 类型检查(两个都要过)
npm run typecheck          # 后端 tsc
npx vue-tsc -p web/tsconfig.json --noEmit  # 前端
```

### 验证清单
- [ ] `http://localhost:4000/` 首页 8 区块正常,Hero 视频背景播放
- [ ] `http://localhost:4000/login` 登录页正常,刷新不 404
- [ ] `http://localhost:4000/playground` 画布页正常
  - [ ] 侧栏 19 个角色,拖进画布有登场动画+配音
  - [ ] 能拉连线、切舰种、标突破源
  - [ ] 输入问题点运行,消息流转+粒子
- [ ] `npm run typecheck` + `vue-tsc` 均 0 错误

---

## ⚠️ 第 8 节:已知坑 & 注意事项

### 开发环境坑
1. **端口占用**:之前会话遗留的 `tsx watch` 进程会抢 4000 端口,跑 stale 代码。修复:`lsof -ti:4000 | xargs kill -9` 后重启
2. **macOS bash 3.2**:`declare -A`(关联数组)不支持,写 shell 脚本拷素材用 python 或 `bash -c` 显式
3. **vite dev 端口**:5173 常被占,Vite 自动跳 5174/5175,看启动日志

### vue-flow 类型坑
vue-flow 的 `Node`/`Edge` 泛型触发 TS2589(Type instantiation excessively deep)。`PlaygroundView.vue` 用 `any[]`,`useFlowRunner.ts` 用本地宽松接口 `FlowNode`/`FlowEdge` 绕开。**不要**直接 `import { Node } from "@vue-flow/core"` 当类型注解。

### 素材坑
1. **id↔sprite 不一致**:见 §4 命名坑表,务必用 `pets.ts` 的 `PETS` 数组查表
2. **nailoong 双 o**:`nailoong_i_am_nailoong.mp3`(voice) vs `PetHappyNailong`(sprite),拼写不统一
3. **无配音角色被排除**:Bubu / BytePilot / CloudStrife / Codix / Engineer / NimbusCloud 有 sprite 但无 voice,已从 `pets.ts` 去掉(用户要求"只要带配音的")
4. **build 产物体积**:928 张 PNG + vue-flow 让 JS bundle 到 430KB(gzip 150KB),可接受

### 未完成 / 待办(如需继续)
- **真实端点转换**:`/api/endpoints/register` 后端未实现(前端演示降级)。如要做,参考 `docs/handoff-fullstack.md` 的 Part A
- **真实登录**:`/api/auth/*` 未实现(AuthCard 假提交)。TODO 见 `AuthCard.vue` 顶部 FIXME 注释
- **Playground 接真实蜂群**:目前纯 mock,可接 `/v1/chat/completions` 的 `x_swarm_trace`
- **Cloudflare Worker 部署**:用户提过意图,但 express 4 非 Worker 原生,需迁 Hono,是独立大改造

---

## 📦 第 9 节:依赖清单

### 运行时
```
vue@^3.5  vue-router@^5.1  pinia@^3.0
marked@^18  dompurify@^3.4
@vue-flow/core  @vue-flow/background  @vue-flow/controls  @vue-flow/minimap
express@^4.19  openai@^4.67  dotenv
```

### 构建/类型
```
vite@^8  @vitejs/plugin-vue@^6  typescript@^5.5  vue-tsc@^3.3
tsx@^4.19  @types/node  @types/express  @types/dompurify
```

### package.json scripts
```json
{
  "dev": "tsx watch src/server.ts",
  "dev:web": "vite --config web/vite.config.ts",
  "build:web": "vue-tsc -p web/tsconfig.json --noEmit && vite build --config web/vite.config.ts",
  "start": "tsx src/server.ts",
  "demo": "tsx scripts/demo-compare.ts",
  "typecheck": "tsc --noEmit"
}
```

---

## 🧬 第 10 节:Git 状态(交接时)

- **当前分支**:main
- **未提交改动**:`public/index.html`(构建产物)、`web/views/PlaygroundView.vue`(登场动画)、大量未跟踪的 sprites/audio/build 产物
- **建议**:`web/` 源码 + `src/server.ts` + `package.json` 应提交;`public/assets/sprites` 和 `public/assets/audio`(二进制素材)考虑 git-lfs 或单独管理

---

## ✅ 第 11 节:本次会话完成清单

1. ✅ **前端全量迁移到 Vue 3 + Vite**:45 个文件,首页+登录页 8 区块全迁
2. ✅ **后端 SPA fallback**:`/login` `/playground` 刷新不 404
3. ✅ **登录页**:登录/注册 tab + 假提交(后端未实现,有 FIXME)
4. ✅ **首屏火箭发射视频**:MiniMax 图生视频生成,接入 Hero/登录页背景
5. ✅ **Playground 节点画布**:vue-flow + 19 个像素角色(会动+配音+台词)
6. ✅ **登场动画**:iOS 风格闪光弹跳 + 登场语音 + 台词气泡
7. ✅ **消息流转可视化**:拓扑遍历 + 青色粒子 + 金色突破广播扩散 + 经验回流
8. ✅ **素材搬运**:928 PNG + 23 mp3 从 ClipClashPixel 到 web/public/assets/
9. ✅ **typecheck 双绿**:后端 tsc + 前端 vue-tsc 均 0 错误
