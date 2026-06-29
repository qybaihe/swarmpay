<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useTransformStore } from "../stores/transform";
import { useToast } from "../composables/useToast";
import { listEndpoints, type RegisteredEndpoint } from "../api/endpoints";
import { createApiKey, listApiKeys, rotateApiKey, revokeApiKey, type UserApiKey } from "../api/api-keys";
import SiteFooter from "../components/SiteFooter.vue";

const auth = useAuthStore();
const transformStore = useTransformStore();
const router = useRouter();
const toast = useToast();

const keys = ref<UserApiKey[]>([]);
const endpoints = ref<RegisteredEndpoint[]>([]);
const revealedKeys = ref<Record<number, string>>({});
const baseUrl = ref(typeof window !== "undefined" ? window.location.origin + "/v1" : "https://evoship.me/v1");
const defaultModel = ref("swarm-evo");
const loading = ref(true);
const creating = ref(false);
const rotating = ref<number | null>(null);
const revoking = ref<number | null>(null);

const currentKey = computed(() => transformStore.lastApiKey || transformStore.lastResult?.api_key || "");
const activeKeys = computed(() => keys.value.filter((key) => key.status === "active"));
const latestEndpoint = computed(() => endpoints.value[0] || null);

function matchesPreview(fullKey: string, preview: string): boolean {
  const [prefix, suffix] = preview.split("...");
  return !!fullKey && !!prefix && !!suffix && fullKey.startsWith(prefix) && fullKey.endsWith(suffix);
}

function rememberKey(result: { base_url: string; api_key: string; model: string; models?: string[] }) {
  transformStore.setResult({
    base_url: result.base_url,
    api_key: result.api_key,
    model: result.model,
    models: result.models,
  });
}

async function load() {
  loading.value = true;
  try {
    const [keyResult, endpointList] = await Promise.all([listApiKeys(), listEndpoints()]);
    keys.value = keyResult.keys;
    endpoints.value = endpointList;
    baseUrl.value = keyResult.base_url || baseUrl.value;
    defaultModel.value = keyResult.model || "swarm-evo";
  } catch (e) {
    toast.show(e instanceof Error ? `加载失败:${e.message}` : "加载失败");
  } finally {
    loading.value = false;
  }
}

async function createKey() {
  creating.value = true;
  try {
    const result = await createApiKey("默认 API Key");
    keys.value = [result.key, ...keys.value.filter((key) => key.id !== result.key.id)];
    revealedKeys.value[result.key.id] = result.api_key;
    rememberKey(result);
    toast.show("API Key 已创建");
  } catch (e) {
    toast.show(e instanceof Error ? `创建失败:${e.message}` : "创建失败");
  } finally {
    creating.value = false;
  }
}

async function rotate(key: UserApiKey) {
  if (!confirm("重新生成这个 API Key?旧 key 会立即失效。")) return;
  rotating.value = key.id;
  try {
    const result = await rotateApiKey(key.id);
    keys.value = [result.key, ...keys.value.filter((item) => item.id !== result.key.id)];
    revealedKeys.value[key.id] = result.api_key;
    rememberKey(result);
    toast.show("已生成新 API Key");
  } catch (e) {
    toast.show(e instanceof Error ? `生成失败:${e.message}` : "生成失败");
  } finally {
    rotating.value = null;
  }
}

async function revoke(key: UserApiKey) {
  if (!confirm("停用这个 API Key?停用后它不能再调用 /v1。")) return;
  revoking.value = key.id;
  try {
    const updated = await revokeApiKey(key.id);
    keys.value = keys.value.map((item) => item.id === updated.id ? updated : item);
    delete revealedKeys.value[key.id];
    if (matchesPreview(currentKey.value, key.api_key_preview)) transformStore.clear();
    toast.show("API Key 已停用");
  } catch (e) {
    toast.show(e instanceof Error ? `停用失败:${e.message}` : "停用失败");
  } finally {
    revoking.value = null;
  }
}

async function reveal(key: UserApiKey) {
  if (revealedKeys.value[key.id]) {
    delete revealedKeys.value[key.id];
    return;
  }
  if (matchesPreview(currentKey.value, key.api_key_preview)) {
    revealedKeys.value[key.id] = currentKey.value;
    return;
  }
  toast.show("完整 key 只在创建或重新生成时显示一次。需要完整值时请重新生成。");
}

async function copyKey(key: string) {
  try {
    await navigator.clipboard.writeText(key);
    toast.show("已复制");
  } catch {
    /* ignore */
  }
}

function formatTime(ts?: number) {
  if (!ts) return "尚未记录";
  return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

onMounted(async () => {
  await auth.ensureLoaded();
  if (!auth.isAuthed) {
    router.replace({ path: "/login", query: { redirect: "/api-keys" } });
    return;
  }
  await load();
});
</script>

<template>
  <video class="bg-video" autoplay muted loop playsinline preload="auto" poster="/bg-starship.png"><source src="/bg-launch.mp4" type="video/mp4" /></video>
  <div class="bg-overlay"></div>
  <div class="top">
    <RouterLink to="/" class="logo"><b>SwarmPay</b></RouterLink>
    <RouterLink to="/playground" class="back-home">返回</RouterLink>
  </div>

  <div class="stage">
    <div class="container">
      <h1>我的 API Key</h1>
      <p class="sub">API Key 属于账号本身。创建后立刻可以调用 SwarmPay;上传自己的模型端点后,继续使用同一个 key。</p>

      <div v-if="currentKey" class="current-key-card">
        <div class="ck-label">当前可复制 Key</div>
        <div class="ck-row">
          <code class="ck-value">{{ currentKey }}</code>
          <button class="ck-copy" @click="copyKey(currentKey)">复制</button>
        </div>
        <div class="ck-endpoint">Base URL: <code>{{ baseUrl }}</code></div>
        <div class="ck-hint">默认 model: <code>{{ defaultModel }}</code>。每次完整蜂群调用消耗 50 积分。</div>
      </div>
      <div v-else class="notice-card">
        后端不会保存完整明文 key。若你换设备或清空缓存,请在下方重新生成一个 API Key。
      </div>

      <div class="toolbar">
        <h2 class="sec-title">Key 列表 ({{ activeKeys.length }} active)</h2>
        <button class="create-btn" @click="createKey" :disabled="creating">{{ creating ? "创建中..." : "创建我的 API Key" }}</button>
      </div>

      <div v-if="loading" class="state">加载中...</div>
      <div v-else-if="!keys.length" class="empty">
        <p>你的 API Key 还没生成。</p>
        <button class="cta" @click="createKey" :disabled="creating">{{ creating ? "创建中..." : "创建我的 API Key" }}</button>
      </div>
      <div v-else class="key-list">
        <div v-for="key in keys" :key="key.id" class="key-card" :class="key.status">
          <div class="key-head">
            <span class="key-label">{{ key.name }}</span>
            <span class="key-status" :class="key.status">{{ key.status === "active" ? "正常" : "已停用" }}</span>
          </div>
          <div class="key-row">
            <span class="key-k">Key 预览</span>
            <code class="key-v">{{ key.api_key_preview }}</code>
            <button class="key-mini" @click="reveal(key)">{{ revealedKeys[key.id] ? "隐藏" : "显示完整" }}</button>
          </div>
          <div v-if="revealedKeys[key.id]" class="key-reveal">
            <code>{{ revealedKeys[key.id] }}</code>
            <button class="key-mini" @click="copyKey(revealedKeys[key.id])">复制</button>
          </div>
          <div class="key-row"><span class="key-k">创建时间</span><span class="key-v">{{ formatTime(key.created_at) }}</span></div>
          <div class="key-row"><span class="key-k">最近使用</span><span class="key-v">{{ formatTime(key.last_used_at) }}</span></div>
          <div class="key-row"><span class="key-k">调用统计</span><span class="key-v">{{ key.success_count }} 成功 / {{ key.failure_count }} 失败</span></div>
          <div class="key-actions">
            <button class="key-btn rot" @click="rotate(key)" :disabled="key.status !== 'active' || rotating === key.id || revoking === key.id">
              {{ rotating === key.id ? "生成中..." : "重新生成" }}
            </button>
            <button class="key-btn danger" @click="revoke(key)" :disabled="key.status !== 'active' || rotating === key.id || revoking === key.id">
              {{ revoking === key.id ? "停用中..." : "停用" }}
            </button>
          </div>
        </div>
      </div>

      <h2 class="sec-title">当前上游模型</h2>
      <div v-if="latestEndpoint" class="upstream-card">
        <div><b>{{ latestEndpoint.label || latestEndpoint.upstream_model }}</b><span :class="['upstream-status', latestEndpoint.status]">{{ latestEndpoint.status === "active" ? "健康" : "异常" }}</span></div>
        <p><code>{{ latestEndpoint.upstream_model }}</code> · {{ latestEndpoint.upstream_base_url }}</p>
        <RouterLink to="/endpoints" class="docs-link">更换上游模型</RouterLink>
      </div>
      <div v-else class="upstream-card muted">
        <div><b>内置默认模型</b><span class="upstream-status active">开箱可用</span></div>
        <p>还没有上传自己的上游模型。你的 API Key 会先使用内置默认 provider。</p>
        <RouterLink to="/endpoints" class="docs-link">上传自己的模型端点</RouterLink>
      </div>

      <h2 class="sec-title">快速调用示例</h2>
      <div class="example-card">
        <div class="ex-label">curl</div>
        <pre class="ex-code">curl {{ baseUrl }}/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{ currentKey || 'YOUR_API_KEY' }}" \
  -d '{
    "model": "{{ defaultModel }}",
    "messages": [
      { "role": "user", "content": "你好" }
    ]
  }'</pre>
      </div>
      <RouterLink to="/docs" class="docs-link">查看完整文档</RouterLink>
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
.container { max-width: 820px; margin: 0 auto; }
h1 { font-size: 28px; color: #fff; font-weight: 800; margin: 0 0 8px; }
.sub { font-size: 14px; color: var(--muted); margin: 0 0 28px; line-height: 1.6; }
.current-key-card, .notice-card, .upstream-card { padding: 22px; border-radius: 10px; background: rgba(8,11,26,0.72); border: 1px solid var(--panel-line); margin-bottom: 28px; }
.current-key-card { background: linear-gradient(135deg, rgba(58,224,255,0.1), rgba(137,91,255,0.08)); border-color: rgba(58,224,255,0.4); }
.notice-card { color: #ffd23f; border-color: rgba(255,210,63,0.28); background: rgba(255,210,63,0.08); font-size: 13px; line-height: 1.6; }
.ck-label { font-size: 12px; color: var(--cyan); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
.ck-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.ck-value { flex: 1; font-size: 13px; color: #fff; background: rgba(0,0,0,0.4); padding: 10px 14px; border-radius: 8px; font-family: ui-monospace, monospace; word-break: break-all; }
.ck-copy, .create-btn { padding: 9px 16px; font-size: 12px; font-family: inherit; cursor: pointer; background: rgba(58,224,255,0.16); border: 1px solid rgba(58,224,255,0.4); color: var(--cyan); border-radius: 7px; flex-shrink: 0; }
.ck-copy:hover, .create-btn:hover:not(:disabled) { background: rgba(58,224,255,0.26); }
.ck-endpoint, .ck-hint { font-size: 12px; color: var(--muted); margin-bottom: 6px; line-height: 1.5; }
.ck-endpoint code, .ck-hint code, .upstream-card code { color: var(--cyan); background: rgba(58,224,255,0.08); padding: 1px 6px; border-radius: 3px; }
.toolbar { display: flex; justify-content: space-between; gap: 14px; align-items: center; margin-bottom: 14px; }
.sec-title { font-size: 17px; color: #fff; margin: 0 0 16px; }
.toolbar .sec-title { margin: 0; }
.state, .empty { padding: 36px; text-align: center; color: var(--dim); font-size: 14px; background: rgba(8,11,26,0.6); border: 1px solid var(--panel-line); border-radius: 10px; margin-bottom: 28px; }
.empty p { color: #fff; margin: 0 0 16px; }
.cta { display: inline-block; padding: 10px 20px; border-radius: 8px; background: rgba(137,91,255,0.16); border: 1px solid rgba(137,91,255,0.4); color: #b89aff; text-decoration: none; font-size: 13px; cursor: pointer; font-family: inherit; }
.key-list { display: flex; flex-direction: column; gap: 14px; margin-bottom: 32px; }
.key-card { padding: 18px; background: rgba(8,11,26,0.7); border: 1px solid var(--panel-line); border-radius: 10px; }
.key-card.revoked { opacity: 0.62; }
.key-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.key-label { font-size: 15px; color: #fff; font-weight: 700; }
.key-status, .upstream-status { font-size: 11px; padding: 3px 10px; border-radius: 999px; margin-left: 10px; }
.key-status.active, .upstream-status.active { color: #5eead4; background: rgba(94,234,212,0.12); }
.key-status.revoked, .upstream-status.error { color: #ff7a96; background: rgba(255,92,122,0.12); }
.key-row { display: flex; align-items: center; gap: 10px; padding: 5px 0; font-size: 13px; }
.key-k { color: var(--dim); min-width: 80px; }
.key-v { color: #e8e8f0; }
.key-row code { font-family: ui-monospace, monospace; color: var(--cyan); background: rgba(58,224,255,0.06); padding: 1px 6px; border-radius: 3px; font-size: 12px; }
.key-mini { font-size: 11px; padding: 4px 10px; cursor: pointer; font-family: inherit; background: rgba(255,255,255,0.05); border: 1px solid var(--panel-line); color: var(--muted); border-radius: 5px; }
.key-mini:hover { background: rgba(255,255,255,0.1); color: #fff; }
.key-reveal { display: flex; align-items: center; gap: 10px; padding: 8px 12px; margin: 6px 0; background: rgba(0,0,0,0.4); border-radius: 8px; }
.key-reveal code { flex: 1; font-family: ui-monospace, monospace; color: #fff; font-size: 12px; word-break: break-all; }
.key-actions { display: flex; gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); }
.key-btn { font-size: 12px; padding: 7px 16px; cursor: pointer; font-family: inherit; border-radius: 6px; }
.key-btn.rot { background: rgba(255,184,77,0.1); border: 1px solid rgba(255,184,77,0.3); color: #ffb84d; }
.key-btn.danger { background: rgba(255,92,122,0.08); border: 1px solid rgba(255,92,122,0.28); color: #ff7a96; }
.key-btn:disabled, .create-btn:disabled, .cta:disabled { opacity: 0.5; cursor: not-allowed; }
.upstream-card { color: #e8e8f0; font-size: 14px; line-height: 1.6; }
.upstream-card p { color: var(--muted); margin: 8px 0 12px; }
.upstream-card.muted { border-color: rgba(58,224,255,0.22); }
.example-card { padding: 18px; background: rgba(0,0,0,0.4); border: 1px solid var(--panel-line); border-radius: 10px; margin-bottom: 24px; }
.ex-label { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
.ex-code { font-family: ui-monospace, monospace; font-size: 12px; color: #e8e8f0; line-height: 1.6; white-space: pre-wrap; word-break: break-all; margin: 0; }
.docs-link { display: inline-block; color: var(--cyan); text-decoration: none; font-size: 14px; font-weight: 600; }
.docs-link:hover { text-decoration: underline; }
@media (max-width: 620px) {
  .toolbar, .ck-row, .key-row, .key-reveal { align-items: stretch; flex-direction: column; }
  .key-k { min-width: 0; }
}
</style>
