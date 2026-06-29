# EvoShip 图标设计提示词(v1)

> 品牌:EvoShip = 进化星际舰队协作引擎。Logo 要传达 **进化(层层向上)+ 飞艇/星舰(流线飞行)+ 大厂级极简气质**。
> 硬约束:纯黑底 + 纯白图案、无文字无渐变、几何精确、可缩放到 favicon。

## 设计理念

用一个轮廓同时承载三个语义:

- **进化** → chevron 分段递进、向上突破
- **飞艇/星舰** → 流线艇身、锐利艇首、尾翼
- **大厂气质** → 单色、大量负空间、几何精确(对标 Apple / Stripe / SpaceX / Linear)

## 主方案概念

横向流线飞艇剪影,艇首锐利指向右,艇身由 **3 道递进上升的 chevron 分段**构成(既是飞艇分段船体,也是「层层进化向上」的箭头),尾部一道小上翘尾翼。一眼看出「飞艇 + 进化」。

## 主方案提示词

### 英文(MJ / DALL-E / 即梦)

> A minimalist app icon logo for a tech brand named EvoShip. A sleek aerodynamic airship / zeppelin silhouette in pure white on a solid pure black background. Elongated horizontal hull with a sharp pointed nose facing right. The hull is composed of 3 ascending chevron layers that grow slightly larger toward the tail, suggesting evolution, progression and forward motion. A small upward tail fin at the rear. Flat single-color vector style, pure white (#FFFFFF) logo only, no gradients, no shadows. Geometric, precise, premium big-tech company aesthetic à la Apple, Stripe, SpaceX, Linear. Generous negative space, clean lines, perfectly centered composition with balanced silhouette, memorable and iconic. No text, no letters, no words, no numbers. Square 1:1 format.

### 中文(即梦 / 通义万相)

> 一个名为 EvoShip 的科技品牌极简 App 图标 logo。纯黑背景上一个纯白色的流线型飞艇/齐柏林飞艇剪影。横向拉长的艇身,艇首锐利指向右。艇身由 3 段递进上升的折角(chevron)组成,越往后越大,象征进化、递进与向前推进。尾部一道小上翘尾翼。扁平单色矢量风格,只有纯白(#FFFFFF)图案,无渐变无阴影。几何精确,大厂级气质(类似 Apple/Stripe/SpaceX)。大量负空间,线条干净,居中构图,轮廓平衡、易记、有标志性。无任何文字、字母、数字。正方形 1:1。

### 反向提示词(negative)

```
text, letters, words, numbers, watermark, gradient, shadow, 3d, glossy, colorful, detailed, complex, noise, background patterns, multiple colors
```

## 备选方案 A:单体上升箭头星舰(更抽象)

> Minimalist white-on-black app icon. A single bold geometric arrow pointing up-and-right, its leading edge swept like a starship nose, its body tapering to a sharp tail. The arrow is formed by one continuous angular silhouette suggesting a futuristic star cruiser ascending. Pure white solid on pure black, flat vector, no gradients. Clean negative space, Apple/SpaceX-tier minimalism. No text. Square.

## 备选方案 B:低多边形折纸飞艇(更现代)

> Minimalist white-on-black app icon. A low-poly origami-style airship, a few flat triangular facets forming a sleek elongated zeppelin hull pointing right with a small fin. Single flat white color on solid black, sharp facet edges, no gradients, no shadow. Premium tech-startup logo, geometric, memorable silhouette, centered. No text. Square.

## 落地规格

| 项 | 规格 |
|---|---|
| 画布 | 正方形 1:1,1024×1024 生成后矢量化 |
| 配色 | 背景 `#000000`,图案 `#FFFFFF`(单色,可反色) |
| 边距 | logo 居中,四周留约 15% 安全区 |
| 矢量化 | 最终做成 SVG(Vectorizer.ai / Illustrator 图像描摹),favicon 要能缩到 16×16 可辨 |
| 文字 | 零文字,任何字母/数字都不要 |
| 渐变/阴影 | 不要,扁平单色 |
| 导出 | SVG + 16/32/64/180 favicon + 1024 PNG |

## 替换流程

新图标定稿后:

1. 把白色版 SVG 放到 `benchmarks/assets/model-icons/evoship.svg`(替换当前三角)。
2. 同步更新 `public/index.html` 里 `<link rel="icon" ...>` 的 inline SVG(浏览器标签页图标)。
3. 删缓存:`rm -f benchmarks/assets/model-icons/_png/evoship-*.png`。
4. 如需重新生成本地展示素材,先确认对应脚本和数据都在本机工作区内。

当前 `evoship.svg` 是从原 favicon(尖角三角 `#3ae0ff` + `#8b5cff` 描边)拆出来的过渡版,定稿后会被替换。
