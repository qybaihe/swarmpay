<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import NavBar from "../components/NavBar.vue";
import SiteFooter from "../components/SiteFooter.vue";
import SectionHeader from "../components/SectionHeader.vue";
import CodeTabs from "../components/CodeTabs.vue";
import CopyButton from "../components/CopyButton.vue";
import { checkEndpoint, listEndpoints, registerEndpoint, type RegisteredEndpoint, type RegisterResult } from "../api/endpoints";
import { useTransformStore } from "../stores/transform";
import { useAuthStore } from "../stores/auth";
import { URL_PRESETS, MODEL_PRESETS } from "../constants/fleet";

const store = useTransformStore();
const auth = useAuthStore();
const router = useRouter();

// 表单
const userBaseUrl = ref("");
const userApiKey = ref("");
const userModel = ref("");
const label = ref("");
const submitting = ref(false);
const errMsg = ref("");

// 结果
const result = ref<RegisterResult | null>(null);
const demoMode = ref(false);
const showResult = ref(false);
const endpoints = ref<RegisteredEndpoint[]>([]);
const loadingEndpoints = ref(false);
const endpointErr = ref("");
const checkingEndpointId = ref<number | null>(null);
const currentApiKey = computed(() => store.lastApiKey || store.lastResult?.api_key || "YOUR_API_KEY");

const pythonCode = computed(() => {
  if (!result.value) return "";
  const r = result.value;
  return `from openai import OpenAI

client = OpenAI(
    base_url="${r.base_url}",
    api_key="${currentApiKey.value}",
)
res = client.chat.completions.create(
    model="${r.model}",
    messages=[{"role": "user", "content": "你的提示词"}],
)
print(res.choices[0].message.content)
# 舰队过程(可选):print(res.model_dump().get("x_swarm_trace"))`;
});

const curlCode = computed(() => {
  if (!result.value) return "";
  const r = result.value;
  return `curl -X POST ${r.base_url}/chat/completions \\
  -H "Authorization: Bearer ${currentApiKey.value}" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "${r.model}", "messages": [{"role": "user", "content": "你的提示词"}]}'`;
});

function openPlayground() {
  router.push("/playground");
}

async function copyModel(m: string) {
  try {
    await navigator.clipboard.writeText(m);
  } catch {
    /* ignore */
  }
}

function formatTime(ts?: number) {
  if (!ts) return "尚未记录";
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function upsertEndpoint(endpoint?: RegisteredEndpoint | null) {
  if (!endpoint) return;
  const rest = endpoints.value.filter((item) => item.id !== endpoint.id);
  endpoints.value = [endpoint, ...rest].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

async function loadEndpoints() {
  endpointErr.value = "";
  await auth.ensureLoaded();
  if (!auth.isAuthed) return;
  loadingEndpoints.value = true;
  try {
    endpoints.value = await listEndpoints();
  } catch (e) {
    endpointErr.value = e instanceof Error ? e.message : "端点列表加载失败。";
  } finally {
    loadingEndpoints.value = false;
  }
}

async function recheckEndpoint(endpoint: RegisteredEndpoint) {
  endpointErr.value = "";
  checkingEndpointId.value = endpoint.id;
  try {
    const checked = await checkEndpoint(endpoint.id);
    upsertEndpoint(checked.endpoint);
    if (!checked.ok) endpointErr.value = checked.result.error || "端点复检未通过。";
  } catch (e) {
    endpointErr.value = e instanceof Error ? e.message : "端点复检失败。";
  } finally {
    checkingEndpointId.value = null;
  }
}

async function onSubmit() {
  errMsg.value = "";
  await auth.ensureLoaded();
  if (!auth.isAuthed) {
    errMsg.value = "请先登录后再生成你的舰队端点。";
    router.push({ path: "/login", query: { redirect: "/endpoints" } });
    return;
  }
  if (!userBaseUrl.value || !userApiKey.value || !userModel.value) {
    errMsg.value = "请完整填写 Base URL、API 密钥、模型名。";
    return;
  }
  submitting.value = true;
  try {
    const outcome = await registerEndpoint({
      userBaseUrl: userBaseUrl.value,
      userApiKey: userApiKey.value,
      userModel: userModel.value,
      label: label.value || undefined,
    });
    result.value = outcome.result;
    demoMode.value = outcome.demoMode;
    upsertEndpoint(outcome.result.endpoint);
    showResult.value = true;
    // 端点页是独立页,滚到结果卡顶部
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);
  } catch (e) {
    showResult.value = false;
    result.value = null;
    demoMode.value = false;
    errMsg.value = e instanceof Error ? e.message : "端点注册失败。";
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  loadEndpoints();
});
</script>

<template>
  <NavBar />
  <video class="bg-video" autoplay muted loop playsinline preload="auto" poster="/bg-starship.png">
    <source src="/bg-launch.mp4" type="video/mp4" />
  </video>

  <main class="endpoints-page">
    <div class="hero-head">
      <div class="eyebrow">ENDPOINT CONVERTER</div>
      <h1>更换上游模型</h1>
      <p class="lede">填入现有的 OpenAI 兼容端点,EvoShip 会把它保存为你的上游模型。保存后继续使用「我的 API Key」里的同一个 key 调用。</p>
    </div>

    <div class="transform-wrap">
      <div class="transform-card">
        <form @submit.prevent="onSubmit" novalidate>
          <div class="field">
            <label>模型端点 Base URL</label>
            <input v-model="userBaseUrl" list="urlPresets" placeholder="https://api.openai.com/v1" required autocomplete="off" />
            <datalist id="urlPresets">
              <option v-for="u in URL_PRESETS" :key="u" :value="u" />
            </datalist>
          </div>
          <div class="row2">
            <div class="field">
              <label>API 密钥</label>
              <input v-model="userApiKey" type="password" placeholder="sk-..." required autocomplete="off" />
            </div>
            <div class="field">
              <label>模型名</label>
              <input v-model="userModel" list="modelPresets" placeholder="gpt-4o-mini" required autocomplete="off" />
              <datalist id="modelPresets">
                <option v-for="m in MODEL_PRESETS" :key="m" :value="m" />
              </datalist>
            </div>
          </div>
          <div class="field" style="margin-bottom: 8px">
            <label>备注(可选)</label>
            <input v-model="label" placeholder="如:我的生产端点" autocomplete="off" />
          </div>
          <button type="submit" class="submit-btn" :disabled="submitting">
            {{ submitting ? "健康检查中…" : "保存上游模型" }}
          </button>
          <div class="msg err" :class="{ show: errMsg }">{{ errMsg }}</div>
        </form>

        <!-- 结果卡 -->
        <div class="result" :class="{ show: showResult, 'demo-mode': demoMode }">
          <div class="ok">
            上游模型已保存,健康检查已通过。继续使用你的 EvoShip API Key 调用,底层会转发到这个上游模型。
          </div>
          <template v-if="result">
            <div v-if="result.endpoint" class="endpoint-health">
              <span class="health-dot" :class="result.endpoint.status"></span>
              <span>{{ result.endpoint.label }}</span>
              <b>{{ result.endpoint.upstream_model }}</b>
              <em>{{ result.endpoint.upstream_base_url }}</em>
            </div>
            <div class="out-item">
              <span class="k">Base URL</span>
              <span class="v">{{ result.base_url }}</span>
              <CopyButton :text="result.base_url" />
            </div>
            <div class="out-item">
              <span class="k">模型名</span>
              <span class="v">{{ result.model }}</span>
              <CopyButton :text="result.model" />
            </div>

            <div v-if="result.models && result.models.length" class="out-models">
              <div class="out-models-head">
                <span class="k">可用模型</span>
                <span class="out-models-hint">用你的 API Key 调用时,model 填下面任意一个都能用。带 <code>user:</code> 前缀的是你在 Playground 保存的自定义舰队。</span>
              </div>
              <div class="out-models-chips">
                <span v-for="m in result.models" :key="m" class="model-chip" :class="{ custom: m.startsWith('user:') }" @click="copyModel(m)">
                  {{ m }}
                </span>
              </div>
            </div>

            <CodeTabs :python="pythonCode" :curl="curlCode" />

            <div class="result-actions">
              <button class="btn btn-primary" @click="openPlayground">去 Playground 试用</button>
              <button class="btn btn-primary evo" @click="openPlayground">观察自进化</button>
            </div>
          </template>
        </div>
      </div>

      <div v-if="auth.isAuthed || endpoints.length" class="endpoint-list">
        <div class="endpoint-list-head">
          <div>
            <span>已注册端点</span>
            <em>{{ endpoints.length }} endpoints</em>
          </div>
          <button type="button" @click="loadEndpoints" :disabled="loadingEndpoints">
            {{ loadingEndpoints ? "刷新中" : "刷新" }}
          </button>
        </div>
        <div v-if="endpointErr" class="endpoint-list-error">{{ endpointErr }}</div>
        <div v-if="!loadingEndpoints && endpoints.length === 0" class="endpoint-empty">
          还没有上传上游模型。此时你的 API Key 会使用内置默认 provider。
        </div>
        <div v-for="endpoint in endpoints" :key="endpoint.id" class="endpoint-row" :class="endpoint.status">
          <div class="endpoint-main">
            <span class="health-dot" :class="endpoint.status"></span>
            <b>{{ endpoint.label }}</b>
            <em>{{ endpoint.upstream_model }}</em>
          </div>
          <div class="endpoint-sub">
            <span>{{ endpoint.upstream_base_url }}</span>
            <span>last check {{ formatTime(endpoint.last_checked_at) }}</span>
            <span>ok {{ endpoint.success_count || 0 }} / fail {{ endpoint.failure_count || 0 }}</span>
            <span v-if="endpoint.last_error" class="endpoint-last-error">{{ endpoint.last_error }}</span>
          </div>
          <div class="endpoint-actions">
            <button type="button" class="endpoint-check" @click="recheckEndpoint(endpoint)" :disabled="checkingEndpointId === endpoint.id">
              {{ checkingEndpointId === endpoint.id ? "复检中" : "复检" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </main>
  <SiteFooter />
</template>

<style scoped>
.bg-video {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  background: #04050d url("/bg-starship.png") center/cover no-repeat;
}
.endpoints-page {
  position: relative;
  z-index: 1;
  max-width: 1280px;
  margin: 0 auto;
  padding: 130px 6vw 8vh;
  min-height: 100vh;
}
.hero-head {
  text-align: center;
  margin-bottom: 48px;
}
.eyebrow {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 3px;
  color: var(--cyan);
  text-transform: uppercase;
  margin-bottom: 14px;
}
.hero-head h1 {
  font-size: clamp(34px, 5vw, 52px);
  font-weight: 800;
  letter-spacing: -1px;
}
.lede {
  margin: 16px auto 0;
  max-width: 620px;
  font-size: clamp(15px, 1.8vw, 17px);
  color: var(--muted);
  line-height: 1.6;
}

.transform-wrap {
  max-width: 680px;
  margin: 0 auto;
}
.transform-card {
  padding: 40px;
  background: rgba(8, 11, 26, 0.78);
  border: 1px solid var(--panel-line);
  backdrop-filter: blur(20px);
}
.submit-btn {
  width: 100%;
  padding: 16px;
  background: #fff;
  color: #04050d;
  font-weight: 800;
  font-size: 15px;
  border: none;
  cursor: pointer;
  transition: 0.2s;
  margin-top: 8px;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  letter-spacing: 0.8px;
}
.submit-btn:hover:not(:disabled) {
  background: var(--cyan);
}
.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 结果卡 */
.result {
  margin-top: 28px;
  padding: 26px;
  background: rgba(61, 255, 176, 0.06);
  border: 1px solid rgba(61, 255, 176, 0.32);
  display: none;
}
.result.show {
  display: block;
  animation: fadeUp 0.5s ease;
}
.result.demo-mode {
  background: rgba(255, 184, 77, 0.06);
  border-color: rgba(255, 184, 77, 0.32);
}
.result.demo-mode .ok {
  color: var(--amber);
}
.result .ok {
  color: var(--green);
  font-weight: 700;
  margin-bottom: 20px;
  font-size: 15px;
}
.endpoint-health {
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(61, 255, 176, 0.22);
  background: rgba(61, 255, 176, 0.05);
  color: var(--muted);
  font-size: 12px;
}
.health-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--green);
  box-shadow: 0 0 10px rgba(61, 255, 176, 0.8);
}
.health-dot.error {
  background: var(--red);
  box-shadow: 0 0 10px rgba(255, 92, 122, 0.8);
}
.endpoint-health b {
  color: #fff;
  font-weight: 800;
}
.endpoint-health em {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: normal;
  color: var(--dim);
}
.out-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.out-item:last-of-type {
  border: 0;
}
.out-item .k {
  font-size: 11px;
  color: var(--dim);
  letter-spacing: 0.8px;
  text-transform: uppercase;
  width: 88px;
  flex-shrink: 0;
}
.out-item .v {
  font-size: 14px;
  color: var(--text);
  flex: 1;
  word-break: break-all;
}
.out-models {
  padding: 14px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.out-models-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.out-models-head .k {
  font-size: 11px;
  color: var(--dim);
  letter-spacing: 0.8px;
  text-transform: uppercase;
  flex-shrink: 0;
}
.out-models-hint {
  font-size: 11px;
  color: var(--dim);
  line-height: 1.5;
}
.out-models-hint code {
  color: var(--cyan);
  background: rgba(58, 224, 255, 0.1);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 10px;
}
.out-models-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.model-chip {
  font-size: 12px;
  padding: 5px 11px;
  border-radius: 999px;
  background: rgba(58, 224, 255, 0.1);
  border: 1px solid rgba(58, 224, 255, 0.3);
  color: var(--cyan);
  cursor: pointer;
  font-family: ui-monospace, monospace;
  transition: 0.15s;
}
.model-chip:hover {
  background: rgba(58, 224, 255, 0.2);
}
.model-chip.custom {
  background: rgba(137, 91, 255, 0.12);
  border-color: rgba(137, 91, 255, 0.4);
  color: #b89aff;
}
.model-chip.custom:hover {
  background: rgba(137, 91, 255, 0.22);
}
.result-actions {
  margin-top: 22px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.result-actions .btn {
  padding: 12px 24px;
  font-size: 14px;
}
.endpoint-list {
  margin-top: 18px;
  padding: 16px;
  border: 1px solid rgba(58, 224, 255, 0.18);
  background: rgba(58, 224, 255, 0.035);
}
.endpoint-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.endpoint-list-head div {
  display: flex;
  align-items: center;
  gap: 8px;
}
.endpoint-list-head span {
  color: #fff;
  font-weight: 800;
  font-size: 13px;
}
.endpoint-list-head em {
  color: var(--dim);
  font-style: normal;
  font-size: 11px;
}
.endpoint-list-head button,
.endpoint-check {
  flex-shrink: 0;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}
.endpoint-list-head button:hover:not(:disabled),
.endpoint-check:hover:not(:disabled) {
  border-color: var(--cyan);
  color: #fff;
}
.endpoint-list-head button:disabled,
.endpoint-check:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.endpoint-list-error,
.endpoint-empty {
  padding: 8px 10px;
  border: 1px solid rgba(255, 184, 77, 0.22);
  background: rgba(255, 184, 77, 0.06);
  color: #ffb84d;
  font-size: 12px;
}
.endpoint-list-error {
  border-color: rgba(255, 92, 122, 0.28);
  background: rgba(255, 92, 122, 0.08);
  color: var(--red);
}
.endpoint-row {
  position: relative;
  display: grid;
  gap: 7px;
  margin-top: 8px;
  padding: 10px 154px 10px 10px;
  border: 1px solid rgba(61, 255, 176, 0.2);
  background: rgba(61, 255, 176, 0.045);
}
.endpoint-row.error {
  border-color: rgba(255, 92, 122, 0.28);
  background: rgba(255, 92, 122, 0.055);
}
.endpoint-main,
.endpoint-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.endpoint-main b,
.endpoint-main em,
.endpoint-main code,
.endpoint-sub span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.endpoint-main b {
  color: #fff;
  font-size: 12px;
}
.endpoint-main em {
  color: var(--green);
  font-style: normal;
  font-size: 12px;
}
.endpoint-main code {
  color: var(--dim);
  font-size: 11px;
}
.endpoint-sub {
  flex-wrap: wrap;
  color: var(--dim);
  font-size: 11px;
}
.endpoint-sub span:first-child {
  max-width: 260px;
}
.endpoint-last-error {
  color: var(--red);
}
.endpoint-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 6px;
}
.endpoint-rotate {
  border-color: rgba(58, 224, 255, 0.24);
  color: var(--cyan);
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: none; }
}
@media (max-width: 760px) {
  .endpoints-page { padding: 100px 6vw 6vh; }
  .transform-card { padding: 30px 22px; }
  .endpoint-row { padding-right: 10px; }
  .endpoint-actions { position: static; width: max-content; }
}
</style>
