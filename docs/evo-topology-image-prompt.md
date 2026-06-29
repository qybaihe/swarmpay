# 进化模式协作拓扑图 — AI 绘图交接待办

> 用途:把这张「进化模式协作拓扑图」交给 AI 绘图工具(Midjourney / Ideogram / GPT-image / Gemini / Recraft)生成一张成品图,替换 `web/public/assets/evo-mode-topology.png`。
>
> ⚠️ **重要前置说明**
> - AI 图像模型对**精确中文小字 + 多节点连线**还原能力有限,容易糊字 / 错字 / 漏线。
> - 推荐按文字保真度排序:**Ideogram 3.0 > GPT-image > Gemini 2.5 Flash Image > Recraft v3 > Midjourney**(MJ 中文最差)。
> - 若要**像素级精确**,已另做了纯 CSS+SVG 版本(`web/components/EvoTopology.vue`),浏览器渲染零失真,建议优先用它,本图作为静态兜底/封面图。
> - 生成后建议用 Figma / PS 把糊掉的小字重新手敲覆盖一遍。

---

## 一、画面整体风格(Prompt 骨架,英文喂给 AI)

```
A sci-fi HUD-style system architecture topology diagram on a deep dark navy background (hex #04050d),
fully flat, no card/frame/border around it, seamlessly blended into the dark background.
Dark tech aesthetic, neon glow, depth, futuristic mission-control feel.
Color palette: emerald green (#3dffb0), cyan (#3ae0ff), amber-gold (#ffd23f/#ffb84d),
sky blue (#5ca8ff), violet (#8b5cff), hot pink (#ff5cc8).
Glowing rounded-rectangle nodes with soft colored halos, thin flowing light beams along the
connection lines, subtle grid pattern in the background, rotating orbital rings.
Clean, high-end, premium dashboard look. 16:10 widescreen, high detail, sharp text.
```

背景要求(关键):
- **纯深色底 #04050d,不要任何独立卡片框、不要蓝色矩形背景板**,整张图直接铺在深色底上,像融入夜空。
- 底部可加极淡的网格线(rgba(58,224,255,0.05))和两个角落的极淡径向光晕(左上紫、右下青),制造空间纵深。
- 不要手绘风 / 不要扁平插画风 / 不要 3D 立体卡通风 —— 要**科技仪表盘 HUD 风**。

---

## 二、整体布局(俯视示意)

```
┌─────────────────────────────────────────────────────────┐
│  [旗舰·继承拆解]            ┌──────────────┐            │
│      👑 旗舰蜂 L3     ──继承→│              │            │
│                              │  ★ EvoMap    │            │
│  ┌────────┐                  │  基因库 ★    │            │
│  │航线 A  │←派发             │ (DNA双螺旋)  │            │
│  │规划→工程│                 │              │            │
│  │→审查   │  ←突破广播→      │ Gene/Capsule │            │
│  ├────────┤                  └──────┬───────┘            │
│  │航线 B· │                         │                    │
│  │突破源  │                         │回流                 │
│  ├────────┤                         │                    │
│  │航线 C  │                         │                    │
│  └───┬────┘                         │                    │
│      │ 聚合上报                      │                    │
│      ▼                              ▼                    │
│            [旗舰·合成最优解] ──回流──→ (闭环回到基因库)    │
│                                                          │
│  ──────────── 底部图例区 ────────────                    │
└─────────────────────────────────────────────────────────┘
```

核心构图原则:
1. **EvoMap 基因库是画面正中心、最大、最亮、最显眼的元素**——它是整个体系的"心脏"。
2. 外围一圈:左上旗舰(拆解)→ 左侧三条并行航线 → 底部旗舰(聚合)。
3. 基因库与外围形成一个**闭环**:继承(出去)→ 回流(回来)。

---

## 三、逐个元素的精确文字与颜色

### ★ 中央主元素:EvoMap 基因库(最重要,要大!)

位置:画面正中央(横向 50%,纵向 42%)
尺寸:全图最大的元素,直径约占画面高度的 35%
外观:
- 中央一个**发光的 DNA 双螺旋**(绿→青渐变,#3dffb0 → #3ae0ff),垂直竖立,带柔光晕。
- 外围**三层同心旋转轨道环**(虚线/点线,从内到外颜色依次:浅绿、青、紫),缓慢旋转。
- DNA 螺旋上有 2 个流动光点沿螺旋线运动。

文字(精确,逐行):

```
经验网络            ← 顶部小标签,绿色 #3dffb0,字号小,字间距宽
EvoMap 基因库       ← 主标题,绿青渐变发光,字号最大最醒目(约 22-28px)
Gene 航线配方       ← 下方第一个胶囊标签,绿框绿字
Capsule 成功产物    ← 下方第二个胶囊标签,绿框绿字
```

---

### 节点 1:旗舰 · 继承拆解(左上)

位置:横向约 19%,纵向约 18%
颜色:琥珀金 #ffd23f(边框 + 光晕)
图标:👑
文字:

```
旗舰 · 继承拆解      ← 主名,白色加粗
旗舰蜂 · L3         ← 副标签,琥珀色等宽字
```

---

### 节点组:三条任务航线(画面左侧,竖向排列三条)

每条航线由三个小节点竖直排列,颜色按角色区分:

#### 航线 A(最左)
航线标签(顶部小字,灰色):`航线 A`
- 规划蜂:图标 📐,颜色天蓝 #5ca8ff
  - 文字:`规划蜂` / `出方案`
- 工程蜂:图标 ⚙️,颜色青 #3ae0ff
  - 文字:`工程蜂` / `写实现`
- 审查蜂:图标 🔍,颜色紫 #8b5cff
  - 文字:`审查蜂` / `验收`

#### 航线 B · 突破源(中间,高亮!)
航线标签(顶部小字,金色 #ffd23f 高亮):`航线 B · 突破源`
- 同样三个节点:规划蜂 / 工程蜂 / 审查蜂(文字颜色同上)
- 工程蜂周围有一圈**金色脉冲光环**(表示突破广播从这里发出)

#### 航线 C(最右)
航线标签(顶部小字,灰色):`航线 C`
- 同样三个节点:规划蜂 / 工程蜂 / 审查蜂

---

### 节点 2:旗舰 · 合成最优解(底部中央)

位置:横向约 46%,纵向约 83%
颜色:琥珀金 #ffb84d(边框 + 光晕)
图标:👑
文字:

```
旗舰 · 合成最优解     ← 主名,白色加粗
旗舰蜂 · 聚合         ← 副标签,琥珀色等宽字
```

---

## 四、所有连线 + 连线上的文字(精确)

每条连线都是「细底色线 + 上面一条流动的高亮光带」,带箭头。

| # | 起点 → 终点 | 颜色 | 样式 | 连线上的文字 |
|---|---|---|---|---|
| 1 | 基因库 → 旗舰(左上) | 绿 #3dffb0 | 流动光带 | `继承经验` |
| 2 | 旗舰(左上) → 航线A/B/C 的规划蜂 | 金 #ffd23f | 流动光带(3条扇形) | `拆解派发` |
| 3 | 航线内 规划蜂 → 工程蜂 | 蓝 #5ca8ff | 细线带箭头 | (无文字) |
| 4 | 航线内 工程蜂 → 审查蜂 | 青 #3ae0ff | 细线带箭头 | (无文字) |
| 5 | 审查蜂 → 工程蜂(返工) | 粉 #ff5cc8 | **虚线**带箭头 | (无文字,表示纠错回环) |
| 6 | 航线B 工程蜂 → 航线A、航线C | 白色半透明 | **虚线**,带金色脉冲 | `突破广播` |
| 7 | 三条航线的审查蜂 → 旗舰(底部) | 紫 #8b5cff | 流动光带(3条汇聚) | `聚合上报` |
| 8 | 旗舰(底部) → 基因库 | 绿 #3dffb0 | 流动光带(**这条最粗最亮**) | `回流新基因` |

**连线 #8 是关键**:它让基因库 ↔ 舰队 形成**闭环**(继承出去、流回来),视觉上要强调这是「越用越聪明」的进化循环。

---

## 五、底部图例区(画面最下方一整条)

### 第一行:六阶段循环(横向流程,每个是一颗小胶囊,中间用 → 连接)

精确文字(逐颗胶囊):

```
① 继承  →  ② 拆解  →  ③ 闭环攻关  →  ④ 突破广播  →  ⑤ 聚合  →  ⑥ 回流
```

其中 `⑥ 回流` 这颗胶囊要**高亮成绿色**(绿框绿字),强调它是闭环的关键。

### 下面三列(等宽三栏):

**第一栏 · 角色分工**(标题青色)
```
● 旗舰蜂 · 拆解与聚合
● 规划蜂 · 输出执行方案
● 工程蜂 · 产出具体实现
● 审查蜂 · 验收或返工
```
(每个圆点颜色对应角色色:金/蓝/青/紫)

**第二栏 · 数据链路**(标题青色)
```
── 继承 / 回流(绿色双向闭环)
── 派发子任务(金色)
── 聚合上报(紫色)
┄┄ 审查返工纠错(粉色虚线)
```

**第三栏 · 平台接口**(标题青色,用等宽字体显示)
```
GET /a2a/assets/search
POST /a2a/swarm/intent
POST /a2a/session/message
POST /a2a/publish
```

---

## 六、颜色速查表(直接取色)

| 元素 | 颜色 | 用途 |
|---|---|---|
| 背景 | `#04050d` | 全图深色底 |
| 旗舰蜂 | `#ffd23f` / `#ffb84d` | 两个旗舰节点、派发线 |
| 规划蜂 | `#5ca8ff` | 蓝色节点 |
| 工程蜂 | `#3ae0ff` | 青色节点 |
| 审查蜂 | `#8b5cff` | 紫色节点、聚合线 |
| EvoMap 基因库 | `#3dffb0` | 绿色,继承线、回流线、基因库主体 |
| 返工纠错 | `#ff5cc8` | 粉色虚线 |
| 突破广播 | 白色半透明 + `#ffd23f` 脉冲 | 航线间扩散 |
| 普通文字 | `#a8b0d4`(灰蓝) | 副标签、图例正文 |
| 标题文字 | `#ffffff` 白 | 节点主名 |

---

## 七、可直接复制的完整中文 Prompt(Ideogram / GPT-image 适用)

```
一张科技 HUD 风格的系统架构拓扑图,深色背景(#04050d 深海军蓝),整张图无卡片边框,
直接铺满深色底,像融入夜空。背景有极淡的网格线和左上紫、右下青的径向光晕。

【画面正中央,最大最亮的元素】一个发光的 DNA 双螺旋(绿色#3dffb0 到青色#3ae0ff渐变),
外圈三层缓慢旋转的虚线轨道环。下方文字:小标签"经验网络"(绿色),大标题"EvoMap 基因库"
(绿青渐变发光,全图最大),再下面两个绿色胶囊标签"Gene 航线配方"和"Capsule 成功产物"。

【左上区域】一个琥珀金色#ffd23f发光的圆角节点,图标👑,文字"旗舰 · 继承拆解",副标签
"旗舰蜂 · L3"。一条绿色流动光带从中央基因库指向这个节点,光带上写"继承经验"。

【左侧,竖向排列三条并行航线】每条航线有三个小节点:规划蜂(蓝色#5ca8ff,图标📐,写方案)、
工程蜂(青色#3ae0ff,图标⚙️,写实现)、审查蜂(紫色#8b5cff,图标🔍,验收)。三条航线分别
标注"航线 A""航线 B · 突破源""航线 C",其中航线 B 标签金色高亮。三条金色光带从左上旗舰扇形
指向三条航线的规划蜂,光带上写"拆解派发"。

【航线内部】规划蜂→工程蜂→审查蜂 用带箭头的细线串联。审查蜂到工程蜂有一条粉色#ff5cc8虚线
回路表示返工纠错。航线 B 的工程蜂周围有金色脉冲光环,白色虚线向航线 A 和航线 C 扩散,写
"突破广播"。

【底部中央】一个琥珀金色发光节点,图标👑,文字"旗舰 · 合成最优解",副标签"旗舰蜂 · 聚合"。
三条紫色#8b5cff流动光带从三条航线的审查蜂汇聚指向这个节点,光带上写"聚合上报"。
一条最粗最亮的绿色流动光带从这个底部旗舰指回中央基因库,写"回流新基因",形成闭环。

【最底部图例区】横向流程:①继承 → ②拆解 → ③闭环攻关 → ④突破广播 → ⑤聚合 → ⑥回流
(其中⑥回流绿色高亮)。下方三栏:角色分工(旗舰蜂/规划蜂/工程蜂/审查蜂,各带对应色圆点)、
数据链路(继承回流/派发/聚合/返工)、平台接口(GET /a2a/assets/search、POST /a2a/swarm/intent、
POST /a2a/session/message、POST /a2a/publish)。

整体氛围:高级、科幻、未来感、任务控制中心仪表盘,霓虹柔光,有空间纵深,文字清晰锐利,
16:10 宽屏,高细节。
```

---

## 八、英文 Prompt(Midjourney / 通用图模适用,中文文字可后期 PS 覆盖)

```
A sci-fi HUD mission-control topology diagram, deep dark navy background #04050d, no card frame,
seamlessly blended into the darkness, subtle grid pattern and faint radial glows (violet top-left,
cyan bottom-right). At the exact center, the LARGEST and brightest element: a glowing DNA double
helix (emerald-green to cyan gradient) surrounded by three slowly rotating dashed orbital rings,
labeled "EvoMap" — a gene/capsule memory core. Top-left: a glowing amber-gold node (crown icon)
"Queen / Decompose". Left side: three parallel vertical "lanes", each a chain of three smaller
glowing nodes (blue planner, cyan coder, violet reviewer). Flowing colored light beams connect them:
green beam from the gene core to the top queen ("inherit"), amber beams fanning out from the queen
to the lanes ("dispatch"), pink dashed feedback loops from reviewer back to coder, white dashed
"breakthrough broadcast" spreading from the middle lane, violet beams converging from reviewers to
a bottom queen node ("converge"), and the thickest brightest green beam looping back from the bottom
queen into the gene core ("backflow"), forming a closed evolution loop. Bottom legend strip with
six numbered stages and three columns. Neon glow, depth, premium dark-tech dashboard aesthetic,
clean sharp typography, 16:10 widescreen, ultra detailed. --ar 16:10 --style raw --v 6
```

---

## 九、生成后处理清单

- [ ] 检查所有中文小字是否清晰、无错字(尤其 `规划蜂`/`工程蜂`/`审查蜂`/`旗舰`/`基因库`)
- [ ] 确认中央基因库是**全图最大最亮**的元素(不是和节点一样大)
- [ ] 确认继承/回流两条绿色线构成**闭环**
- [ ] 糊掉/错位的文字用 Figma 或 PS 手敲覆盖(推荐字体:`PingFang SC` 标题、`JetBrains Mono` 等宽副标签)
- [ ] 导出为 `web/public/assets/evo-mode-topology.png`,尺寸建议 2400×1500(2x),保持原文件名即可热替换
- [ ] 若 AI 始终做不准文字,**直接用 `web/components/EvoTopology.vue` 的 CSS 版本**(已实现,零失真)
