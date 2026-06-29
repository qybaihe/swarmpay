<script setup lang="ts">
import { RouterLink } from "vue-router";
import SiteFooter from "../components/SiteFooter.vue";
import { useTransformStore } from "../stores/transform";

const transformStore = useTransformStore();
const apiKey = transformStore.lastApiKey || transformStore.lastResult?.api_key || "YOUR_API_KEY";
const host = typeof window !== "undefined" ? window.location.origin + "/v1" : "https://evoship.me/v1";
</script>

<template>
  <video class="bg-video" autoplay muted loop playsinline preload="auto" poster="/bg-starship.png"><source src="/bg-launch.mp4" type="video/mp4" /></video>
  <div class="bg-overlay"></div>
  <div class="top">
    <RouterLink to="/" class="logo"><b>EvoShip</b></RouterLink>
    <RouterLink to="/playground" class="back-home">← 返回</RouterLink>
  </div>

  <div class="stage">
    <div class="container">
      <h1>📖 EvoShip 使用文档</h1>
      <p class="sub">从注册到第一次调用蜂群,5 分钟完成上手。</p>

      <!-- 目录 -->
      <div class="toc">
        <a href="#step1" class="toc-item"><span class="toc-num">1</span> 注册账号,领取积分和 API Key</a>
        <a href="#step2" class="toc-item"><span class="toc-num">2</span> 第一次调用(验证 Key 可用)</a>
        <a href="#step3" class="toc-item"><span class="toc-num">3</span> 选择舰队模型</a>
        <a href="#step4" class="toc-item"><span class="toc-num">4</span> 找到你的舰队</a>
        <a href="#step5" class="toc-item"><span class="toc-num">5</span> 在 Playground 搭自己的舰队</a>
        <a href="#step6" class="toc-item"><span class="toc-num">6</span> 积分说明</a>
        <a href="#step7" class="toc-item"><span class="toc-num">7</span> 各语言调用示例</a>
      </div>

      <!-- Step 1 -->
      <section id="step1" class="doc-section">
        <h2><span class="step-badge">1</span> 注册账号,领取积分和 API Key</h2>
        <p>注册 EvoShip 账号后,系统会自动:</p>
        <ul>
          <li>赠送 <b class="hi">1000 积分</b>(每次完整蜂群调用消耗 50 积分,共可调用 20 次)</li>
          <li>生成一个 <b class="hi">API Key</b>(格式 <code>sk-evoship-xxxx</code>),绑定内置默认模型(<code>evomap-gpt-5.5</code>)</li>
        </ul>
        <div class="callout">
          <span class="callout-icon">🔑</span>
          <span>你的 Key 在 <RouterLink to="/api-keys" class="inline-link">API Key 管理页</RouterLink> 查看。注册时也会直接显示。</span>
        </div>
      </section>

      <!-- Step 2 -->
      <section id="step2" class="doc-section">
        <h2><span class="step-badge">2</span> 第一次调用(验证 Key 可用)</h2>
        <p>拿到 Key 后,用任意 OpenAI 兼容客户端或 curl 测试:</p>
        <div class="code-block">
          <div class="cb-label">curl</div>
          <pre class="cb-code">curl {{ host }}/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{ apiKey }}" \
  -d '{
    "model": "swarm-evo",
    "messages": [
      { "role": "user", "content": "你好" }
    ]
  }'</pre>
        </div>
        <p>返回标准 OpenAI 格式响应。蜂群会在后台协作(规划→实现→审查→聚合),然后返回最终答案。</p>
        <div class="callout warn">
          <span class="callout-icon">⚠️</span>
          <span>每次完整调用扣 <b>50 积分</b>。余额不足会返回 HTTP 402。到 <RouterLink to="/credits" class="inline-link">积分管理</RouterLink> 查看余额。</span>
        </div>
      </section>

      <!-- Step 3 -->
      <section id="step3" class="doc-section">
        <h2><span class="step-badge">3</span> 选择舰队模型</h2>
        <p>通过 <code>model</code> 字段选不同舰队:</p>
        <div class="model-table">
          <div class="mt-row mt-head">
            <span>model 值</span><span>舰队</span><span>说明</span><span>积分</span>
          </div>
          <div class="mt-row"><code>swarm-evo</code><span>进化旗舰 ★</span><span>最强,带经验继承/回流</span><span>50/次</span></div>
          <div class="mt-row"><code>swarm-heavy</code><span>重型</span><span>拆解+分工流水线+突破广播</span><span>50/次</span></div>
          <div class="mt-row"><code>swarm-lite</code><span>轻型</span><span>几只蜂并行+投票</span><span>50/次</span></div>
          <div class="mt-row"><code>swarm-baseline</code><span>直通</span><span>单次调用,不走蜂群(对照)</span><span>50/次</span></div>
          <div class="mt-row"><code>user:你的舰队名</code><span>自定义</span><span>按你在 Playground 搭的拓扑跑</span><span>50/次</span></div>
        </div>
        <div class="callout">
          <span class="callout-icon">💡</span>
          <span>推荐先用 <code>swarm-evo</code> 体验完整蜂群协作。简单问题会自动直通省算力,复杂问题才拆解分工。</span>
        </div>
      </section>

      <!-- Step 4 -->
      <section id="step4" class="doc-section">
        <h2><span class="step-badge">4</span> 找到你的舰队</h2>
        <p>你保存的自定义舰队模型名格式是 <code>user:舰队名</code>。查看你所有舰队:</p>
        <ul>
          <li>页面入口:<RouterLink to="/my-fleets" class="inline-link">我的舰队</RouterLink>(右上角用户菜单 → 我的舰队)</li>
          <li>每个舰队卡片显示 <code>model_id</code>(如 <code>user:my-fleet-1</code>),点击可复制</li>
          <li>调用时把这个值填入 <code>model</code> 字段即可</li>
        </ul>
        <div class="code-block">
          <div class="cb-label">调用你的自定义舰队</div>
          <pre class="cb-code">curl {{ host }}/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{ apiKey }}" \
  -d '{
    "model": "user:my-fleet-1",
    "messages": [
      { "role": "user", "content": "帮我设计一个 REST API" }
    ]
  }'</pre>
        </div>
        <div class="callout warn">
          <span class="callout-icon">🔑</span>
          <span>自定义舰队必须用<b>你自己的 API Key</b> 调用(不能调别人的 <code>user:</code> 舰队)。想用别人的舰队?在 <RouterLink to="/community" class="inline-link">社区</RouterLink> 点「复制并编辑」变成你自己的。</span>
        </div>
      </section>

      <!-- Step 5 -->
      <section id="step5" class="doc-section">
        <h2><span class="step-badge">5</span> 在 Playground 搭自己的舰队</h2>
        <ol>
          <li>进入 <RouterLink to="/playground" class="inline-link">Playground</RouterLink>,切换到「自定义编队」模式</li>
          <li>从左侧角色池拖节点(规划/实现/审查/探索/旗舰)到画布</li>
          <li>拉线连接节点,定义交接顺序(谁把结果交给谁)</li>
          <li>点节点卡片可<b>定制</b>:选角色类型、场景任务、写擅长描述</li>
          <li>点「💾 保存为舰队」,起个名 → AI 自动美化每个节点人设</li>
          <li>得到 <code>user:你的舰队名</code>,就能用它调用了</li>
        </ol>
        <div class="callout">
          <span class="callout-icon">🐝</span>
          <span>保存后可直接「去对话测试」或「发布到社区」分享给别人。</span>
        </div>
      </section>

      <!-- Step 6 -->
      <section id="step6" class="doc-section">
        <h2><span class="step-badge">6</span> 积分说明</h2>
        <div class="credit-grid">
          <div class="cg-item"><span class="cg-num">+1000</span><span class="cg-text">注册赠送</span></div>
          <div class="cg-item"><span class="cg-num">-50</span><span class="cg-text">每次完整蜂群调用(无论简单复杂)</span></div>
          <div class="cg-item"><span class="cg-num">402</span><span class="cg-text">余额不足时返回的状态码</span></div>
        </div>
        <p>积分流水可在 <RouterLink to="/credits" class="inline-link">积分管理页</RouterLink> 查看。充值功能即将开放。</p>
      </section>

      <!-- Step 7 -->
      <section id="step7" class="doc-section">
        <h2><span class="step-badge">7</span> 各语言调用示例</h2>

        <h3>Python (OpenAI SDK)</h3>
        <div class="code-block">
          <pre class="cb-code">from openai import OpenAI

client = OpenAI(
    api_key="{{ apiKey }}",
    base_url="{{ host }}",
)

response = client.chat.completions.create(
    model="swarm-evo",
    messages=[{"role": "user", "content": "你好"}],
)

print(response.choices[0].message.content)</pre>
        </div>

        <h3>JavaScript / Node.js</h3>
        <div class="code-block">
          <pre class="cb-code">import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "{{ apiKey }}",
  baseURL: "{{ host }}",
});

const res = await client.chat.completions.create({
  model: "swarm-evo",
  messages: [{ role: "user", content: "你好" }],
});

console.log(res.choices[0].message.content);</pre>
        </div>

        <h3>curl(完整版,带自定义舰队)</h3>
        <div class="code-block">
          <pre class="cb-code">curl {{ host }}/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{ apiKey }}" \
  -d '{
    "model": "user:my-fleet-1",
    "messages": [
      { "role": "user", "content": "用 Python 写一个快速排序" }
    ]
  }'</pre>
        </div>

        <div class="callout">
          <span class="callout-icon">✅</span>
          <span>任何兼容 OpenAI API 的工具(LangChain、Cursor、ChatBox、Open WebUI 等)都可以直接填入这个 base_url 和 key 使用。</span>
        </div>
      </section>

      <div class="doc-footer">
        <p>还有问题?联系 <a href="mailto:support@evoship.me" class="inline-link">support@evoship.me</a></p>
        <RouterLink to="/playground" class="cta-final">🚀 去 Playground 开始 →</RouterLink>
      </div>
    </div>
  </div>
  <SiteFooter />
</template>

<style scoped>
.bg-video { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; background: #04050d url("/bg-starship.png") center/cover no-repeat; }
.bg-overlay { position: fixed; inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(90deg, rgba(4,5,13,0.62), rgba(4,5,13,0.48) 50%, rgba(4,5,13,0.62)), linear-gradient(180deg, rgba(4,5,13,0.55), rgba(4,5,13,0.42) 40%, rgba(4,5,13,0.78)); }
.top { position: fixed; top: 0; left: 0; right: 0; z-index: 10; padding: 26px 6vw; display: flex; justify-content: space-between; }
.top .logo { color: #fff; text-decoration: none; font-size: 18px; font-weight: 800; }
.back-home { color: var(--muted); text-decoration: none; font-size: 14px; }
.back-home:hover { color: #fff; }
.stage { position: relative; z-index: 2; min-height: 100vh; padding: 100px 6vw 40px; }
.container { max-width: 780px; margin: 0 auto; }
h1 { font-size: 28px; color: #fff; font-weight: 800; margin: 0 0 8px; }
.sub { font-size: 14px; color: var(--muted); margin: 0 0 32px; }

.toc { padding: 20px 24px; background: rgba(8,11,26,0.6); border: 1px solid var(--panel-line); border-radius: 12px; margin-bottom: 36px; display: flex; flex-direction: column; gap: 10px; }
.toc-item { display: flex; align-items: center; gap: 12px; font-size: 14px; color: var(--muted); text-decoration: none; transition: 0.15s; }
.toc-item:hover { color: var(--cyan); }
.toc-num { width: 22px; height: 22px; border-radius: 50%; background: rgba(58,224,255,0.15); border: 1px solid rgba(58,224,255,0.4); color: var(--cyan); font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

.doc-section { padding: 24px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.doc-section h2 { font-size: 20px; color: #fff; font-weight: 700; margin: 0 0 14px; display: flex; align-items: center; gap: 10px; }
.step-badge { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #895bff, #3ae0ff); color: #fff; font-size: 14px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.doc-section h3 { font-size: 15px; color: #b89aff; font-weight: 700; margin: 20px 0 10px; }
.doc-section p { font-size: 14px; color: #c8cad8; line-height: 1.7; margin: 8px 0; }
.doc-section ul, .doc-section ol { padding-left: 22px; }
.doc-section li { font-size: 14px; color: #c8cad8; line-height: 1.8; margin: 4px 0; }
.hi { color: #ffd23f; }
code { font-family: ui-monospace, "SF Mono", monospace; font-size: 12px; color: var(--cyan); background: rgba(58,224,255,0.08); padding: 1px 6px; border-radius: 3px; }
.inline-link { color: var(--cyan); text-decoration: none; border-bottom: 1px dashed rgba(58,224,255,0.4); }
.inline-link:hover { color: #fff; border-bottom-color: var(--cyan); }

.callout { display: flex; align-items: flex-start; gap: 10px; padding: 14px 16px; margin: 14px 0; border-radius: 10px; background: rgba(58,224,255,0.06); border: 1px solid rgba(58,224,255,0.2); font-size: 13px; color: #c8cad8; line-height: 1.6; }
.callout.warn { background: rgba(255,184,77,0.06); border-color: rgba(255,184,77,0.25); }
.callout-icon { font-size: 16px; flex-shrink: 0; }

.code-block { margin: 12px 0; border-radius: 10px; overflow: hidden; border: 1px solid var(--panel-line); }
.cb-label { padding: 8px 14px; background: rgba(137,91,255,0.1); font-size: 11px; color: #b89aff; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--panel-line); }
.cb-code { padding: 14px 16px; background: rgba(0,0,0,0.5); font-family: ui-monospace, monospace; font-size: 12px; color: #e8e8f0; line-height: 1.7; white-space: pre-wrap; word-break: break-all; margin: 0; }

.model-table { margin: 14px 0; border-radius: 10px; overflow: hidden; border: 1px solid var(--panel-line); }
.mt-row { display: grid; grid-template-columns: 1.3fr 1fr 2fr 0.6fr; gap: 10px; padding: 11px 14px; font-size: 13px; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.04); }
.mt-row:last-child { border-bottom: 0; }
.mt-head { background: rgba(137,91,255,0.08); font-size: 11px; color: var(--dim); text-transform: uppercase; font-weight: 700; }
.mt-row span { color: #c8cad8; }

.credit-grid { display: flex; gap: 12px; margin: 16px 0; }
.cg-item { flex: 1; padding: 18px; border-radius: 10px; background: rgba(8,11,26,0.6); border: 1px solid var(--panel-line); text-align: center; }
.cg-num { display: block; font-size: 22px; font-weight: 800; color: #ffd23f; font-family: ui-monospace, monospace; margin-bottom: 6px; }
.cg-text { font-size: 11px; color: var(--dim); line-height: 1.5; }

.doc-footer { text-align: center; padding: 36px 0 20px; }
.doc-footer p { font-size: 13px; color: var(--dim); margin-bottom: 18px; }
.cta-final { display: inline-block; padding: 13px 32px; border-radius: 10px; background: linear-gradient(135deg, rgba(137,91,255,0.25), rgba(58,224,255,0.25)); border: 1px solid rgba(137,91,255,0.5); color: #fff; text-decoration: none; font-size: 15px; font-weight: 700; transition: 0.2s; }
.cta-final:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(137,91,255,0.3); }

@media (max-width: 640px) {
  .mt-row { grid-template-columns: 1fr; gap: 4px; }
  .mt-head { display: none; }
  .credit-grid { flex-direction: column; }
}
</style>
