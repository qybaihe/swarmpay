<script setup lang="ts">
import { useI18n } from "vue-i18n";
// DocsView —— SwarmPay 完整文档(大成级设计)。
// 四大篇章:① 链上分账 Agent 协作机制 ② 注册到调用全流程 ③ 链上计费 ④ 链上金币代替经验流转。
// 设计:左侧固定目录 + 右侧分章,深色玻璃质感,金/青/紫三色叙事。
import { ref, onMounted, onUnmounted } from "vue";
import { RouterLink } from "vue-router";
import NavBar from "../components/NavBar.vue";
import SiteFooter from "../components/SiteFooter.vue";
import { useTransformStore } from "../stores/transform";
import { useInjectiveStore, baseUnitsToInj, shortAddr } from "../stores/injective";

const { t } = useI18n();
const transformStore = useTransformStore();
const apiKey = transformStore.lastApiKey || transformStore.lastResult?.api_key || "sk-swarmpay-xxxx";
const host = typeof window !== "undefined" ? window.location.origin + "/v1" : "https://swarmpay.me/v1";
const onchainHost = typeof window !== "undefined" ? window.location.origin : "https://swarmpay.me";

const inj = useInjectiveStore();
const activeSection = ref("mechanism");

const sections = [
  { id: "mechanism", icon: "🧬", title: "协作机制", sub: "链上分账 Agent 如何协作" },
  { id: "quickstart", icon: "🚀", title: "快速开始", sub: "注册到第一次调用" },
  { id: "billing", icon: "⛓️", title: "链上计费", sub: "INJ 结算与分润" },
  { id: "experience", icon: "🪙", title: "经验流转", sub: "链上金币代替经验" },
  { id: "api", icon: "📦", title: "API 参考", sub: "端点与示例" },
];

const copied = ref<string | null>(null);
function copyCode(key: string, code: string) {
  navigator.clipboard?.writeText(code).then(() => {
    copied.value = key;
    setTimeout(() => { copied.value = null; }, 1500);
  }).catch(() => { /* ignore */ });
}

function onScroll() {
  const offsets = sections.map((s) => {
    const el = document.getElementById(s.id);
    return { id: s.id, top: el ? el.getBoundingClientRect().top : Infinity };
  });
  const cur = offsets.find((o) => o.top >= 0 && o.top < 200) || offsets[0];
  if (cur) activeSection.value = cur.id;
}
onMounted(() => {
  inj.fetchStatus().catch(() => { /* ignore */ });
  window.addEventListener("scroll", onScroll, { passive: true });
});
onUnmounted(() => window.removeEventListener("scroll", onScroll));

// 链上配置(真实数据)
const network = () => inj.status?.network || "…";
const chainId = () => inj.status?.chainId || "…";
const feeBps = () => inj.status?.protocolFeeBps ?? 500;
const feePct = () => (feeBps() / 100).toFixed(0);
const archCount = () => Object.keys(inj.archetypeAddrs || {}).length;

// 复制用代码串(避免模板内反引号转义)
const curlQuickstart = `curl ${host}/chat/completions -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '{"model":"swarm-evo","messages":[{"role":"user","content":"用一句话解释 Injective 链上分润"}]}'`;
const curlRun = `curl ${onchainHost}/api/injective/run -H "Content-Type: application/json" -d '{"goal":"设计一个微服务架构","tier":"swarm-evo","budgetAmount":"500000000000000000","budgetDenom":"inj","senderAddr":"inj1..."}'`;

// 协作机制五角色
const roles = [
  { icon: "🚢", name: "旗舰 Orchestrator", color: "var(--amber)", role: "拆解目标、调度、聚合", wallet: "自有钱包" },
  { icon: "🧭", name: "导航 Planner", color: "var(--blue)", role: "输出结构化计划", wallet: "自有钱包" },
  { icon: "⚙️", name: "工程 Coder", color: "var(--cyan)", role: "产出方案/代码", wallet: "自有钱包·可被悬赏" },
  { icon: "🔍", name: "监察 Reviewer", color: "var(--violet)", role: "审查纠错·可发悬赏", wallet: "自有钱包·可发悬赏" },
  { icon: "🛰️", name: "斥候 Explorer", color: "var(--pink)", role: "打破局部最优", wallet: "自有钱包" },
];

// 协作流程步骤
const flow = [
  { n: 1, t: "拆解", d: "旗舰把目标拆成子任务航线", icon: "🚢" },
  { n: 2, t: "规划", d: "导航输出分步计划与约束", icon: "🧭" },
  { n: 3, t: "攻关", d: "工程并行产出,斥候提供非显然方案", icon: "⚙️" },
  { n: 4, t: "审查", d: "监察批判产出,不通过带反馈返工", icon: "🔍" },
  { n: 5, t: "聚合", d: "旗舰合成最优解返回用户", icon: "✨" },
  { n: 6, t: "分润", d: "LLM 按贡献在链上分 INJ 给各 agent", icon: "⛓️" },
];
</script>

<template>
  <NavBar />
  <video class="bg-video" autoplay muted loop playsinline preload="auto" poster="/bg-starship.png">
    <source src="/bg-launch.mp4" type="video/mp4" />
  </video>
  <div class="bg-overlay"></div>

  <div class="doc-layout">
    <!-- 左侧目录 -->
    <aside class="doc-toc">
      <div class="toc-head">
        <span class="toc-logo">📖</span>
        <div>
          <div class="toc-title">{{ t('docs.k1') }}</div>
          <div class="toc-sub">{{ t('docs.k2') }}</div>
        </div>
      </div>
      <nav class="toc-nav">
        <a v-for="s in sections" :key="s.id" :href="`#${s.id}`" class="toc-item" :class="{ active: activeSection === s.id }">
          <span class="ti-icon">{{ s.icon }}</span>
          <span class="ti-text">
            <span class="ti-title">{{ s.title }}</span>
            <span class="ti-sub">{{ s.sub }}</span>
          </span>
        </a>
      </nav>
      <div class="toc-status">
        <div class="ts-row"><span>{{ t('docs.k3') }}</span><b :class="network()">{{ network() }}</b></div>
        <div class="ts-row"><span>chainId</span><b class="mono">{{ chainId() }}</b></div>
        <div class="ts-row"><span>{{ t('docs.k4') }}</span><b>{{ archCount() }} 个</b></div>
        <div class="ts-row"><span>{{ t('docs.k5') }}</span><b>{{ feePct() }}%</b></div>
      </div>
    </aside>

    <!-- 右侧正文 -->
    <main class="doc-main">
      <!-- ── 1. 协作机制 ── -->
      <section id="mechanism" class="doc-section">
        <div class="sec-eyebrow">{{ t('docs.k6') }}</div>
        <h2 class="sec-title">{{ t('docs.k7') }}</h2>
        <p class="sec-lead"
          >{ t('docs.k8') }}<b>{{ t('docs.k9') }}</b>{{ t('docs.k10') }}
        </p>

        <div class="roles-grid">
          <div v-for="r in roles" :key="r.name" class="role-card" :style="{ '--rc': r.color }">
            <div class="role-icon">{{ r.icon }}</div>
            <div class="role-name">{{ r.name }}</div>
            <div class="role-job">{{ r.role }}</div>
            <div class="role-wallet">🔗 {{ r.wallet }}</div>
          </div>
        </div>

        <h3 class="sub-h">{{ t('docs.k11') }}</h3>
        <div class="flow-track">
          <div v-for="s in flow" :key="s.n" class="flow-step">
            <div class="flow-icon">{{ s.icon }}</div>
            <div class="flow-n">{{ s.n }}</div>
            <div class="flow-t">{{ s.t }}</div>
            <div class="flow-d">{{ s.d }}</div>
          </div>
        </div>

        <div class="callout gold">
          <span class="co-icon">⛓️</span>
          <div>
            <b>{{ t('docs.k12') }}</b>{{ t('docs.k13') }} <a href="https://testnet.mintscan.io/injective-testnet" target="_blank" rel="noopener">Mintscan</a>{{ t('docs.k14') }}
          </div>
        </div>
      </section>

      <!-- ── 2. 快速开始 ── -->
      <section id="quickstart" class="doc-section">
        <div class="sec-eyebrow">{{ t('docs.k15') }}</div>
        <h2 class="sec-title">{{ t('docs.k16') }}</h2>

        <div class="steps">
          <div class="step">
            <div class="step-num">1</div>
            <div class="step-body">
              <h4>{{ t('docs.k17') }}</h4>
              <p>{{ t('docs.k18') }} <RouterLink to="/login" class="inline-link">{{ t('docs.k19') }}</RouterLink>{{ t('docs.k20') }}</p>
              <p class="step-tip">{{ t('docs.k21') }} <a href="https://testnet.injective.network/" target="_blank" rel="noopener">{{ t('docs.k22') }}</a>{{ t('docs.k23') }}</p>
            </div>
          </div>

          <div class="step">
            <div class="step-num">2</div>
            <div class="step-body">
              <h4>{{ t('docs.k24') }}</h4>
              <p>{{ t('docs.k25') }} <code>sk-swarmpay-xxxx</code>{{ t('docs.k26') }} <RouterLink to="/api-keys" class="inline-link">{{ t('docs.k27') }}</RouterLink>{{ t('docs.k28') }} <code>swarm-evo</code>。</p>
            </div>
          </div>

          <div class="step">
            <div class="step-num">3</div>
            <div class="step-body">
              <h4>{{ t('docs.k29') }}</h4>
              <p>{{ t('docs.k30') }} <code>/chat/completions</code>{{ t('docs.k31') }}</p>
              <div class="code-block">
                <div class="cb-bar"><span class="cb-label">curl</span><button class="cb-copy" @click="copyCode('curl1', curlQuickstart)">{{ copied === 'curl1' ? '✓' : '复制' }}</button></div>
                <pre class="cb-code">curl {{ host }}/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{ apiKey }}" \
  -d '{
    "model": "swarm-evo",
    "messages": [{ "role": "user", "content": "用一句话解释 Injective 链上分润" }]
  }'</pre>
              </div>
              <p>{{ t('docs.k32') }} <code>x_swarm_trace</code>{{ t('docs.k33') }}</p>
              <div class="callout warn">
                <span class="co-icon">⚠️</span>
                <div>{{ t('docs.k34') }} <b>402</b>{{ t('docs.k35') }} <RouterLink to="/credits" class="inline-link">{{ t('docs.k36') }}</RouterLink>{{ t('docs.k37') }}</div>
              </div>
            </div>
          </div>

          <div class="step">
            <div class="step-num">4</div>
            <div class="step-body">
              <h4>{{ t('docs.k38') }}</h4>
              <div class="model-table">
                <div class="mt-row mt-head"><span>model</span><span>{{ t('docs.k39') }}</span><span>{{ t('docs.k40') }}</span></div>
                <div class="mt-row"><code>swarm-evo</code><span>{{ t('docs.k41') }}</span><span>{{ t('docs.k42') }}</span></div>
                <div class="mt-row"><code>swarm-heavy</code><span>{{ t('docs.k43') }}</span><span>{{ t('docs.k44') }}</span></div>
                <div class="mt-row"><code>swarm-lite</code><span>{{ t('docs.k45') }}</span><span>{{ t('docs.k46') }}</span></div>
                <div class="mt-row"><code>swarm-baseline</code><span>{{ t('docs.k47') }}</span><span>{{ t('docs.k48') }}</span></div>
                <div class="mt-row"><code>{{ t('docs.k49') }}</code><span>{{ t('docs.k50') }}</span><span>{{ t('docs.k44') }}</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── 3. 链上计费 ── -->
      <section id="billing" class="doc-section">
        <div class="sec-eyebrow">{{ t('docs.k51') }}</div>
        <h2 class="sec-title">{{ t('docs.k52') }}</h2>
        <p class="sec-lead"
          >{ t('docs.k53') }}<b>{{ feePct() }}% 协议费</b>{{ t('docs.k54') }}
        </p>

        <div class="billing-flow">
          <div class="bf-node user">{{ t('docs.k55') }}<br><small>100% INJ</small></div>
          <div class="bf-arrow">→</div>
          <div class="bf-node fee">{{ t('docs.k56') }}<br><small>{{ feePct() }}% → treasurer</small></div>
          <div class="bf-arrow">+</div>
          <div class="bf-node pool">{{ t('docs.k57') }}<br><small>{{ 100 - Number(feePct()) }}% 按权重</small></div>
          <div class="bf-arrow">→</div>
          <div class="bf-node agents">{{ t('docs.k58') }}<br><small>{{ t('docs.k59') }}</small></div>
        </div>

        <div class="billing-notes">
          <div class="bn-card"><div class="bn-icon">⚖️</div><h4>{{ t('docs.k44') }}</h4><p>{{ t('docs.k60') }}</p></div>
          <div class="bn-card"><div class="bn-icon">💰</div><h4>{{ t('docs.k61') }}</h4><p>{{ t('docs.k62') }}</p></div>
          <div class="bn-card"><div class="bn-icon">🔍</div><h4>{{ t('docs.k63') }}</h4><p>{{ t('docs.k64') }}</p></div>
        </div>

        <div class="callout">
          <span class="co-icon">🔗</span>
          <div>{{ t('docs.k65') }} <RouterLink to="/onchain" class="inline-link">{{ t('docs.k66') }}</RouterLink>{{ t('docs.k67') }} <RouterLink to="/pricing" class="inline-link">{{ t('docs.k68') }}</RouterLink>{{ t('docs.k69') }}</div>
        </div>
      </section>

      <!-- ── 4. 经验流转 ── -->
      <section id="experience" class="doc-section">
        <div class="sec-eyebrow">{{ t('docs.k70') }}</div>
        <h2 class="sec-title">{{ t('docs.k71') }}</h2>
        <p class="sec-lead"
          >{ t('docs.k72') }}<b>{{ t('docs.k73') }}</b>{{ t('docs.k74') }}<b>{{ t('docs.k75') }}</b>。
        </p>

        <div class="exp-compare">
          <div class="ec-col ec-old">
            <div class="ec-head">{{ t('docs.k76') }}</div>
            <div class="ec-item">{{ t('docs.k77') }}</div>
            <div class="ec-item">{{ t('docs.k78') }}</div>
            <div class="ec-item">{{ t('docs.k79') }}</div>
            <div class="ec-item">{{ t('docs.k80') }}</div>
            <div class="ec-item">{{ t('docs.k81') }}</div>
          </div>
          <div class="ec-col ec-new">
            <div class="ec-head">{{ t('docs.k82') }}</div>
            <div class="ec-item">{{ t('docs.k83') }}</div>
            <div class="ec-item">{{ t('docs.k84') }}</div>
            <div class="ec-item">{{ t('docs.k85') }}</div>
            <div class="ec-item">{{ t('docs.k86') }}</div>
            <div class="ec-item">{{ t('docs.k87') }}</div>
          </div>
        </div>

        <h3 class="sub-h">{{ t('docs.k88') }}</h3>
        <div class="exp-loop">
          <div class="el-step"><div class="el-icon">🐝</div><div class="el-t">{{ t('docs.k89') }}</div><div class="el-d">{{ t('docs.k90') }}</div></div>
          <div class="el-arrow">↓</div>
          <div class="el-step"><div class="el-icon">⚖️</div><div class="el-t">{{ t('docs.k91') }}</div><div class="el-d">{{ t('docs.k92') }}</div></div>
          <div class="el-arrow">↓</div>
          <div class="el-step"><div class="el-icon">⛓️</div><div class="el-t">{{ t('docs.k93') }}</div><div class="el-d">{{ t('docs.k94') }}</div></div>
          <div class="el-arrow">↓</div>
          <div class="el-step gold"><div class="el-icon">💰</div><div class="el-t">{{ t('docs.k75') }}</div><div class="el-d">{{ t('docs.k95') }}</div></div>
          <div class="el-arrow back">{{ t('docs.k96') }}</div>
        </div>

        <div class="callout gold">
          <span class="co-icon">💡</span>
          <div>
            <b>{{ t('docs.k97') }}</b>{{ t('docs.k98') }}
          </div>
        </div>

        <p class="exp-action">{{ t('docs.k99') }} <RouterLink to="/credits" class="inline-link">{{ t('docs.k100') }}</RouterLink>{{ t('docs.k101') }}</p>
      </section>

      <!-- ── 5. API 参考 ── -->
      <section id="api" class="doc-section">
        <div class="sec-eyebrow">{{ t('docs.k102') }}</div>
        <h2 class="sec-title">{{ t('docs.k103') }}</h2>

        <h3 class="sub-h">{{ t('docs.k104') }}</h3>
        <div class="code-block">
          <div class="cb-bar"><span class="cb-label">POST {{ host }}/chat/completions</span></div>
          <pre class="cb-code">{
  "model": "swarm-evo",
  "messages": [{ "role": "user", "content": "你的目标" }]
}

// 返回:标准 OpenAI 格式 + x_swarm_trace(协作可视化)
// 链上计费:从绑定地址扣 INJ,分润入各 agent 钱包</pre>
        </div>

        <h3 class="sub-h">{{ t('docs.k105') }}</h3>
        <div class="endpoint-grid">
          <div class="ep"><code class="ep-method get">GET</code> <code>/api/injective/status</code><p>{{ t('docs.k106') }}</p></div>
          <div class="ep"><code class="ep-method get">GET</code> <code>/api/injective/smoke</code><p>{{ t('docs.k107') }}</p></div>
          <div class="ep"><code class="ep-method get">GET</code> <code>/api/injective/balance?addr=&denom=</code><p>{{ t('docs.k108') }}</p></div>
          <div class="ep"><code class="ep-method get">GET</code> <code>/api/injective/transactions?addr=</code><p>{{ t('docs.k109') }}</p></div>
          <div class="ep"><code class="ep-method post">POST</code> <code>/api/injective/run</code><p>{{ t('docs.k110') }}</p></div>
        </div>

        <h3 class="sub-h">{{ t('docs.k111') }}</h3>
        <div class="code-block">
          <div class="cb-bar"><span class="cb-label">POST {{ onchainHost }}/api/injective/run</span><button class="cb-copy" @click="copyCode('run1', curlRun)">{{ copied === 'run1' ? '✓' : '复制' }}</button></div>
          <pre class="cb-code">curl {{ onchainHost }}/api/injective/run \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "设计一个带权限的微服务架构",
    "tier": "swarm-evo",
    "budgetAmount": "500000000000000000",
    "budgetDenom": "inj",
    "senderAddr": "inj1..."
  }'

// 返回:{ content, trace, payment{txHash,splits,feeDeducted}, bounties[] }
// payment.splits 即各 agent 链上入账明细,txHash 可在 Mintscan 验证</pre>
        </div>

        <div class="callout">
          <span class="co-icon">📚</span>
          <div>{{ t('docs.k112') }} <RouterLink to="/playground" class="inline-link">Playground</RouterLink>{{ t('docs.k113') }} <RouterLink to="/community" class="inline-link">{{ t('docs.k114') }}</RouterLink>{{ t('docs.k115') }}</div>
        </div>
      </section>
    </main>
  </div>

  <SiteFooter />
</template>

<style scoped>
.bg-video { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; background: #04050d url("/bg-starship.png") center/cover no-repeat; }
.bg-overlay { position: fixed; inset: 0; z-index: 1; pointer-events: none;
  background: linear-gradient(180deg, rgba(4,5,13,0.88) 0%, rgba(4,5,13,0.82) 40%, rgba(4,5,13,0.92) 100%); }

.doc-layout { position: relative; z-index: 2; display: grid; grid-template-columns: 280px 1fr; gap: 0; max-width: 1320px; margin: 0 auto; padding: 100px 6vw 60px; }

/* 左侧目录 */
.doc-toc { position: sticky; top: 88px; align-self: start; max-height: calc(100vh - 110px); overflow-y: auto; padding-right: 24px; border-right: 1px solid var(--panel-line); }
.toc-head { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
.toc-logo { font-size: 28px; }
.toc-title { color: #fff; font-size: 16px; font-weight: 800; }
.toc-sub { color: var(--dim); font-size: 11px; }
.toc-nav { display: flex; flex-direction: column; gap: 4px; margin-bottom: 28px; }
.toc-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; text-decoration: none; border: 1px solid transparent; transition: 0.18s; }
.toc-item:hover { background: rgba(58,224,255,0.06); }
.toc-item.active { background: rgba(139,92,255,0.12); border-color: rgba(139,92,255,0.3); }
.ti-icon { font-size: 18px; }
.ti-text { display: flex; flex-direction: column; }
.ti-title { color: #fff; font-size: 13px; font-weight: 700; }
.ti-sub { color: var(--dim); font-size: 10px; }
.toc-status { padding: 14px; background: rgba(8,11,26,0.6); border: 1px solid var(--panel-line); border-radius: 10px; }
.ts-row { display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; }
.ts-row span { color: var(--dim); }
.ts-row b { color: #fff; font-weight: 600; }
.ts-row b.testnet { color: var(--green); }
.ts-row b.mock { color: var(--amber); }
.mono { font-family: ui-monospace, monospace; }

/* 右侧正文 */
.doc-main { padding-left: 40px; min-width: 0; }
.doc-section { margin-bottom: 88px; scroll-margin-top: 90px; }
.sec-eyebrow { color: var(--cyan); font-size: 12px; font-weight: 800; letter-spacing: 2px; margin-bottom: 10px; }
.sec-title { color: #fff; font-size: clamp(26px, 3.5vw, 36px); font-weight: 800; letter-spacing: -0.5px; margin: 0 0 16px; }
.sec-lead { color: var(--muted); font-size: 15px; line-height: 1.75; max-width: 720px; margin: 0 0 28px; }
.sec-lead b { color: #fff; }
.sub-h { color: #fff; font-size: 18px; font-weight: 700; margin: 32px 0 16px; }

/* 角色卡 */
.roles-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 32px; }
.role-card { padding: 18px; background: rgba(8,11,26,0.6); border: 1px solid color-mix(in srgb, var(--rc) 30%, var(--panel-line)); border-radius: 12px; transition: 0.2s; }
.role-card:hover { transform: translateY(-3px); border-color: var(--rc); box-shadow: 0 8px 20px color-mix(in srgb, var(--rc) 15%, transparent); }
.role-icon { font-size: 26px; margin-bottom: 8px; }
.role-name { color: var(--rc); font-size: 14px; font-weight: 800; }
.role-job { color: var(--muted); font-size: 12px; margin: 4px 0 8px; line-height: 1.4; }
.role-wallet { color: var(--green); font-size: 11px; font-weight: 600; }

/* 流程轨道 */
.flow-track { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 28px; }
.flow-step { padding: 16px 12px; background: rgba(8,11,26,0.5); border: 1px solid var(--panel-line); border-radius: 10px; text-align: center; position: relative; }
.flow-icon { font-size: 22px; }
.flow-n { position: absolute; top: 6px; right: 8px; color: var(--dim); font-size: 11px; font-weight: 800; }
.flow-t { color: #fff; font-size: 13px; font-weight: 700; margin: 6px 0 2px; }
.flow-d { color: var(--dim); font-size: 11px; line-height: 1.4; }

/* callout */
.callout { display: flex; gap: 14px; padding: 18px; background: rgba(8,11,26,0.7); border: 1px solid var(--panel-line); border-radius: 10px; margin: 20px 0; }
.callout.gold { border-color: rgba(255,210,63,0.3); background: rgba(255,210,63,0.05); }
.callout.warn { border-color: rgba(255,184,77,0.3); background: rgba(255,184,77,0.05); }
.co-icon { font-size: 22px; flex-shrink: 0; }
.callout div { color: var(--muted); font-size: 13px; line-height: 1.65; }
.callout b { color: #fff; }
.callout a, .inline-link { color: var(--cyan); text-decoration: none; }
.callout a:hover, .inline-link:hover { text-decoration: underline; }

/* 步骤 */
.steps { display: flex; flex-direction: column; gap: 24px; }
.step { display: flex; gap: 18px; }
.step-num { flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--violet), var(--cyan)); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 15px; box-shadow: 0 4px 14px rgba(139,92,255,0.3); }
.step-body { flex: 1; min-width: 0; }
.step-body h4 { color: #fff; font-size: 16px; margin: 0 0 8px; }
.step-body p { color: var(--muted); font-size: 13px; line-height: 1.7; margin: 0 0 10px; }
.step-tip { font-size: 12px !important; color: var(--dim) !important; }
.step-body code { background: rgba(58,224,255,0.1); color: var(--cyan); padding: 2px 6px; border-radius: 4px; font-size: 12px; font-family: ui-monospace, monospace; }

/* 代码块 */
.code-block { background: rgba(0,0,0,0.4); border: 1px solid var(--panel-line); border-radius: 10px; overflow: hidden; margin: 12px 0; }
.cb-bar { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; background: rgba(58,224,255,0.05); border-bottom: 1px solid var(--panel-line); }
.cb-label { color: var(--cyan); font-size: 11px; font-family: ui-monospace, monospace; font-weight: 600; }
.cb-copy { background: none; border: 1px solid var(--panel-line); color: var(--muted); font-size: 11px; padding: 3px 10px; border-radius: 5px; cursor: pointer; font-family: inherit; }
.cb-copy:hover { color: #fff; border-color: var(--cyan); }
.cb-code { margin: 0; padding: 14px; color: #d4dafc; font-size: 12.5px; line-height: 1.6; font-family: ui-monospace, monospace; overflow-x: auto; white-space: pre; }

/* 模式表 */
.model-table { border: 1px solid var(--panel-line); border-radius: 10px; overflow: hidden; margin: 12px 0; }
.mt-row { display: grid; grid-template-columns: 1.2fr 1fr 1.4fr; padding: 10px 14px; font-size: 13px; }
.mt-row:not(:last-child) { border-bottom: 1px solid var(--panel-line); }
.mt-head { background: rgba(58,224,255,0.05); font-weight: 800; font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px; }
.mt-row code { color: var(--cyan); font-family: ui-monospace, monospace; font-size: 12px; }
.mt-row span { color: var(--muted); }

/* 计费流程 */
.billing-flow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 24px 0; }
.bf-node { padding: 16px; border-radius: 10px; text-align: center; font-size: 13px; font-weight: 700; color: #fff; min-width: 110px; }
.bf-node small { display: block; color: var(--dim); font-size: 10px; font-weight: 500; margin-top: 4px; }
.bf-node.user { background: rgba(255,184,77,0.12); border: 1px solid rgba(255,184,77,0.35); }
.bf-node.fee { background: rgba(61,255,176,0.1); border: 1px solid rgba(61,255,176,0.3); }
.bf-node.pool { background: rgba(58,224,255,0.1); border: 1px solid rgba(58,224,255,0.3); }
.bf-node.agents { background: rgba(139,92,255,0.12); border: 1px solid rgba(139,92,255,0.35); }
.bf-arrow { color: var(--dim); font-size: 18px; font-weight: 700; }
.billing-notes { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin: 24px 0; }
.bn-card { padding: 18px; background: rgba(8,11,26,0.6); border: 1px solid var(--panel-line); border-radius: 10px; }
.bn-icon { font-size: 24px; margin-bottom: 8px; }
.bn-card h4 { color: #fff; font-size: 14px; margin: 0 0 6px; }
.bn-card p { color: var(--muted); font-size: 12px; line-height: 1.55; margin: 0; }

/* 经验流转对比 */
.exp-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
.ec-col { padding: 20px; border-radius: 12px; }
.ec-old { background: rgba(255,92,122,0.06); border: 1px solid rgba(255,92,122,0.25); }
.ec-new { background: rgba(61,255,176,0.06); border: 1px solid rgba(61,255,176,0.3); }
.ec-head { font-size: 14px; font-weight: 800; margin-bottom: 14px; }
.ec-old .ec-head { color: var(--red); }
.ec-new .ec-head { color: var(--green); }
.ec-item { font-size: 13px; padding: 6px 0; }
.ec-old .ec-item { color: var(--muted); }
.ec-new .ec-item { color: #fff; }

/* 经验循环 */
.exp-loop { display: flex; flex-direction: column; align-items: center; gap: 8px; margin: 28px 0; }
.el-step { padding: 16px 28px; background: rgba(8,11,26,0.6); border: 1px solid var(--panel-line); border-radius: 12px; text-align: center; min-width: 260px; }
.el-step.gold { border-color: rgba(255,210,63,0.4); background: rgba(255,210,63,0.06); }
.el-icon { font-size: 24px; }
.el-t { color: #fff; font-size: 14px; font-weight: 700; margin: 4px 0 2px; }
.el-d { color: var(--dim); font-size: 12px; }
.el-arrow { color: var(--cyan); font-size: 20px; font-weight: 700; }
.el-arrow.back { color: var(--amber); font-size: 14px; }
.exp-action { color: var(--muted); font-size: 13px; margin-top: 20px; }

/* 端点 */
.endpoint-grid { display: grid; gap: 10px; margin: 16px 0; }
.ep { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: rgba(8,11,26,0.5); border: 1px solid var(--panel-line); border-radius: 8px; }
.ep code { font-family: ui-monospace, monospace; font-size: 13px; }
.ep p { margin: 0; color: var(--dim); font-size: 12px; flex: 1; }
.ep-method { padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; }
.ep-method.get { background: rgba(61,255,176,0.15); color: var(--green); }
.ep-method.post { background: rgba(139,92,255,0.15); color: var(--violet); }

@media (max-width: 980px) {
  .doc-layout { grid-template-columns: 1fr; padding: 90px 5vw 60px; }
  .doc-toc { position: static; max-height: none; border-right: none; border-bottom: 1px solid var(--panel-line); padding-right: 0; padding-bottom: 24px; margin-bottom: 32px; }
  .doc-main { padding-left: 0; }
  .exp-compare { grid-template-columns: 1fr; }
}
</style>
