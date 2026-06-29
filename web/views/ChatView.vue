<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { useChatStore, type ChatMessage } from "../stores/chat";
import { useFleetsStore } from "../stores/fleets";
import { useAuthStore } from "../stores/auth";
import { useTransformStore } from "../stores/transform";
import { useChatRunner } from "../composables/useChatRunner";
import { renderMarkdown } from "../composables/useMarkdown";
import { useToast } from "../composables/useToast";
import { createApiKey } from "../api/api-keys";

const chatStore = useChatStore();
const fleetsStore = useFleetsStore();
const auth = useAuthStore();
const transformStore = useTransformStore();
const toast = useToast();
const route = useRoute();
const { replay, stop } = useChatRunner();

const input = ref("");
const listRef = ref<HTMLElement | null>(null);

// 内置档
const builtinModels = [
  { id: "swarm-evo", name: "swarm-evo · 进化旗舰 ★" },
  { id: "swarm-heavy", name: "swarm-heavy · 重型" },
  { id: "swarm-lite", name: "swarm-lite · 轻型" },
  { id: "swarm-baseline", name: "swarm-baseline · 直通(单次)" },
];
// 用户自定义舰队
const customModels = computed(() => fleetsStore.fleets.map((f) => ({ id: f.model_id, name: `${f.model_id} · ${f.name}` })));
const allModels = computed(() => [...customModels.value, ...builtinModels]);

// 没有 API key(注册自动发的 key 丢失时,如换设备/清缓存)。所有模型都需要 key。
const needsKey = computed(() => !transformStore.lastApiKey);

const creatingKey = ref(false);

async function createKeyHere() {
  creatingKey.value = true;
  try {
    const d = await createApiKey("对话页 API Key");
    transformStore.setResult({
      base_url: d.base_url,
      api_key: d.api_key,
      model: d.model || "swarm-evo",
      models: d.models,
    });
    toast.show("API Key 已创建,可以发消息了");
  } catch (e) {
    toast.show(e instanceof Error ? `创建失败:${e.message}` : "创建失败");
  } finally {
    creatingKey.value = false;
  }
}

async function scrollToBottom() {
  await nextTick();
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
}

async function onSend() {
  const text = input.value.trim();
  if (!text || chatStore.running) return;
  if (needsKey.value) {
    toast.show("请先获取 API Key(注册自动发放,或去 API Key 页)");
    return;
  }
  input.value = "";
  await chatStore.send(text, async (msg: ChatMessage) => {
    await replay(msg);
  });
  await scrollToBottom();
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    onSend();
  }
}

function toggleLog(msg: ChatMessage) {
  msg.replaying = !msg.replaying;
}

function renderHtml(md: string): string {
  return renderMarkdown(md);
}

onMounted(async () => {
  await auth.ensureLoaded();
  if (!auth.isAuthed) return;
  await fleetsStore.load();
  // 从 Playground 跳转来时:预填舰队 + 问题(query 参数)
  const qModel = typeof route.query.model === "string" ? route.query.model : "";
  if (qModel) chatStore.setModel(qModel);
  const qGoal = typeof route.query.goal === "string" ? route.query.goal : "";
  if (qGoal) input.value = qGoal;
});

watch(() => chatStore.messages.length, () => scrollToBottom());
</script>

<template>
  <video class="bg-video" autoplay muted loop playsinline preload="auto" poster="/bg-starship.png">
    <source src="/bg-launch.mp4" type="video/mp4" />
  </video>
  <div class="bg-overlay"></div>

  <div class="top">
    <RouterLink to="/" class="logo">
      <span class="mark"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2 19 20 12 16 5 20z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="11" r="1.7" fill="currentColor"/></svg></span>
      <b>SwarmPay</b>
    </RouterLink>
    <RouterLink to="/playground" class="back-home">← 返回 Playground</RouterLink>
  </div>

  <div class="stage">
    <div class="chat-shell">
      <!-- 顶栏:舰队选择 + direct 对比开关 -->
      <div class="chat-topbar">
        <div class="fleet-select">
          <span class="fs-label">🛰️ 舰队</span>
          <select v-model="chatStore.modelId" class="fs-select" @change="chatStore.setModel(chatStore.modelId)">
            <optgroup v-if="customModels.length" label="我的自定义舰队">
              <option v-for="m in customModels" :key="m.id" :value="m.id">{{ m.name }}</option>
            </optgroup>
            <optgroup label="内置档位">
              <option v-for="m in builtinModels" :key="m.id" :value="m.id">{{ m.name }}</option>
            </optgroup>
          </select>
        </div>
        <label class="compare-toggle" :class="{ on: chatStore.compareDirect }">
          <input type="checkbox" :checked="chatStore.compareDirect" @change="chatStore.toggleCompare()" />
          <span>⚡ 对比 direct 单次</span>
        </label>
        <button class="clear-btn" @click="stop(); chatStore.clear()" :disabled="chatStore.running">清空对话</button>
      </div>
      <div v-if="needsKey" class="key-hint">
        <div class="key-hint-row">
          <span>⚠️ 需要 API Key 才能调用。注册时已自动生成,如丢失可在 API Key 页重新获取。</span>
        </div>
        <div class="key-hint-actions">
          <button class="key-action-btn primary" @click="createKeyHere" :disabled="creatingKey">{{ creatingKey ? "创建中..." : "创建 API Key" }}</button>
          <RouterLink to="/api-keys" class="key-action-btn">去 API Key 页</RouterLink>
          <RouterLink to="/endpoints" class="key-action-btn">上传自己的上游模型</RouterLink>
        </div>
      </div>

      <!-- 消息列表 -->
      <div class="msg-list" ref="listRef">
        <div v-if="!chatStore.messages.length" class="empty">
          <div class="empty-icon">💬</div>
          <p>发一个问题,看舰队怎么协作回答。</p>
          <p class="empty-sub">答案下方可展开「蜂群协作过程」日志。开启对比还能同时看 direct 单次的效果。</p>
        </div>

        <div v-for="msg in chatStore.messages" :key="msg.id" class="msg" :class="msg.role">
          <template v-if="msg.role === 'user'">
            <div class="bubble user-bubble">{{ msg.content }}</div>
          </template>
          <template v-else>
            <div class="ai-msg">
              <div v-if="msg.error" class="ai-error">❌ {{ msg.error }}</div>
              <template v-else>
                <!-- 指标卡 -->
                <div v-if="msg.metrics" class="metrics-row">
                  <span class="metric">⏱ {{ msg.metrics.latencyMs }}ms</span>
                  <span class="metric">🐝 {{ msg.metrics.agentRuns }} 次执行</span>
                  <span class="metric">🔄 {{ msg.metrics.handoffs }} 交接</span>
                  <span v-if="msg.metrics.broadcasts" class="metric">⚡ {{ msg.metrics.broadcasts }} 突破</span>
                  <span v-if="msg.metrics.revisions" class="metric">🔁 {{ msg.metrics.revisions }} 返工</span>
                </div>
                <!-- 答案 -->
                <div v-if="msg.content" class="answer" v-html="renderHtml(msg.content)"></div>
                <div v-else class="typing">●●● 舰队协作中…</div>

                <!-- 可展开日志区 -->
                <div v-if="msg.logs.length" class="log-zone">
                  <button class="log-toggle" @click="toggleLog(msg)">
                    {{ msg.replaying ? "▾" : "▸" }} 蜂群协作过程({{ msg.logs.length }} 步)
                  </button>
                  <div v-if="msg.replaying" class="log-list">
                    <div v-for="(log, i) in msg.logs" :key="i" class="log-line">
                      <span class="log-from">{{ log.from }}</span>
                      <span class="log-text">{{ log.text }}</span>
                    </div>
                  </div>
                </div>

                <!-- direct 对比 -->
                <div v-if="msg.direct" class="direct-zone">
                  <div class="direct-head">
                    <span class="direct-tag">DIRECT · 单次直通</span>
                    <span class="direct-latency">⏱ {{ msg.direct.latencyMs }}ms</span>
                  </div>
                  <div v-if="msg.direct.error" class="ai-error">❌ {{ msg.direct.error }}</div>
                  <div v-else class="direct-answer" v-html="renderHtml(msg.direct.content)"></div>
                </div>
              </template>
            </div>
          </template>
        </div>
      </div>

      <!-- 输入框 -->
      <div class="input-zone">
        <textarea
          v-model="input"
          class="input-box"
          rows="2"
          placeholder="问点什么…(Enter 发送,Shift+Enter 换行)"
          :disabled="chatStore.running"
          @keydown="onKeyDown"
        ></textarea>
        <button class="send-btn" @click="onSend" :disabled="!input.trim() || chatStore.running">
          {{ chatStore.running ? "运行中…" : "发送 ▶" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bg-video {
  position: fixed; inset: 0; width: 100%; height: 100%;
  object-fit: cover; z-index: 0;
  background: #04050d url("/bg-starship.png") center/cover no-repeat;
}
.bg-overlay {
  position: fixed; inset: 0; z-index: 1; pointer-events: none;
  background:
    linear-gradient(90deg, rgba(4,5,13,0.62) 0%, rgba(4,5,13,0.48) 50%, rgba(4,5,13,0.62) 100%),
    linear-gradient(180deg, rgba(4,5,13,0.55) 0%, rgba(4,5,13,0.42) 40%, rgba(4,5,13,0.78) 100%);
}
.top {
  position: fixed; top: 0; left: 0; right: 0; z-index: 10;
  padding: 26px 6vw; display: flex; justify-content: space-between; align-items: center;
}
.top .logo { display: flex; align-items: center; gap: 8px; color: #fff; text-decoration: none; }
.top .logo .mark { width: 26px; height: 26px; color: var(--cyan); }
.top .logo b { font-size: 18px; font-weight: 800; }
.back-home { color: var(--muted); text-decoration: none; font-size: 14px; }
.back-home:hover { color: #fff; }

.stage { position: relative; z-index: 2; height: 100vh; padding: 90px 6vw 30px; box-sizing: border-box; }
.chat-shell {
  max-width: 880px; height: 100%; margin: 0 auto;
  display: flex; flex-direction: column;
  background: rgba(8, 11, 26, 0.78); border: 1px solid var(--panel-line);
  border-radius: 14px; overflow: hidden; backdrop-filter: blur(20px);
}

.chat-topbar {
  display: flex; align-items: center; gap: 16px; padding: 14px 20px;
  border-bottom: 1px solid var(--panel-line); flex-wrap: wrap;
}
.fleet-select { display: flex; align-items: center; gap: 8px; }
.fs-label { font-size: 13px; color: var(--dim); font-weight: 600; }
.fs-select {
  font-size: 13px; font-family: inherit; background: rgba(8,11,26,0.9);
  border: 1px solid rgba(58,224,255,0.3); color: #e8e8f0; border-radius: 6px; padding: 6px 10px;
  max-width: 260px;
}
.fs-select:focus { outline: none; border-color: var(--cyan); }
.compare-toggle {
  display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dim);
  cursor: pointer; padding: 6px 12px; border: 1px solid var(--panel-line); border-radius: 6px;
  transition: 0.15s;
}
.compare-toggle.on { color: #ffb84d; border-color: rgba(255,184,77,0.5); background: rgba(255,184,77,0.08); }
.compare-toggle input { accent-color: #ffb84d; }
.clear-btn {
  margin-left: auto; font-size: 12px; padding: 6px 14px; cursor: pointer; font-family: inherit;
  background: rgba(255,92,122,0.1); border: 1px solid rgba(255,92,122,0.3); color: var(--red); border-radius: 6px;
}
.clear-btn:hover:not(:disabled) { background: rgba(255,92,122,0.2); }
.clear-btn:disabled { opacity: 0.4; }
.key-hint {
  padding: 10px 20px; font-size: 12px; color: #ffb84d; background: rgba(255,184,77,0.08);
  border-bottom: 1px solid rgba(255,184,77,0.2);
}
.key-hint-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.key-hint-btn {
  font-size: 12px; padding: 5px 14px; cursor: pointer; font-family: inherit; flex-shrink: 0;
  background: rgba(255,184,77,0.16); border: 1px solid rgba(255,184,77,0.5); color: #ffb84d; border-radius: 6px;
}
.key-hint-btn:hover { background: rgba(255,184,77,0.26); }
.inline-register {
  margin-top: 12px; padding: 14px; background: rgba(8,11,26,0.6); border-radius: 8px;
  display: flex; flex-direction: column; gap: 10px;
}
.reg-field { display: flex; flex-direction: column; gap: 4px; }
.reg-field label { font-size: 11px; color: var(--dim); }
.reg-input {
  font-size: 13px; font-family: inherit; background: rgba(8,11,26,0.9);
  border: 1px solid var(--panel-line); color: #e8e8f0; border-radius: 6px; padding: 7px 10px;
}
.reg-input:focus { outline: none; border-color: var(--cyan); }
.reg-submit {
  font-size: 13px; font-weight: 600; padding: 9px 0; cursor: pointer; font-family: inherit; border-radius: 6px;
  background: rgba(137,91,255,0.18); border: 1px solid rgba(137,91,255,0.45); color: #b89aff;
}
.reg-submit:hover:not(:disabled) { background: rgba(137,91,255,0.28); }
.reg-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.reg-note { font-size: 11px; color: var(--dim); line-height: 1.5; }
.slide-enter-active, .slide-leave-active { transition: all 0.25s ease; overflow: hidden; }
.slide-enter-from, .slide-leave-to { opacity: 0; max-height: 0; }
.slide-enter-to, .slide-leave-from { opacity: 1; max-height: 500px; }

.msg-list { flex: 1; overflow-y: auto; padding: 20px; }
.empty { text-align: center; padding: 60px 20px; color: var(--muted); }
.empty-icon { font-size: 44px; margin-bottom: 14px; }
.empty p { margin: 6px 0; font-size: 14px; }
.empty-sub { color: var(--dim) !important; font-size: 12px !important; }

.msg { margin-bottom: 22px; }
.msg.user { display: flex; justify-content: flex-end; }
.user-bubble {
  max-width: 72%; padding: 11px 16px; border-radius: 16px 16px 4px 16px;
  background: rgba(58,224,255,0.14); border: 1px solid rgba(58,224,255,0.3);
  color: #eafcff; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
}
.ai-msg { max-width: 88%; }
.ai-error {
  padding: 12px 16px; border-radius: 8px; background: rgba(255,92,122,0.1);
  border: 1px solid rgba(255,92,122,0.3); color: var(--red); font-size: 13px;
}
.metrics-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.metric {
  font-size: 11px; padding: 3px 9px; border-radius: 999px;
  background: rgba(137,91,255,0.1); border: 1px solid rgba(137,91,255,0.25); color: #b89aff;
}
.answer {
  padding: 16px 18px; border-radius: 10px; background: rgba(0,0,0,0.3);
  border: 1px solid var(--panel-line); color: #e8e8f0; font-size: 14px; line-height: 1.7;
  word-break: break-word;
}
.answer :deep(code) {
  background: rgba(58,224,255,0.12); padding: 1px 5px; border-radius: 3px; font-size: 12px;
}
.answer :deep(pre) {
  background: rgba(0,0,0,0.5); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0;
}
.answer :deep(pre code) { background: none; padding: 0; }
.typing { padding: 14px 18px; color: var(--cyan); font-size: 13px; letter-spacing: 2px; }

.log-zone { margin-top: 10px; }
.log-toggle {
  font-size: 12px; padding: 6px 12px; cursor: pointer; font-family: inherit;
  background: rgba(94,234,212,0.08); border: 1px solid rgba(94,234,212,0.25); color: #5eead4;
  border-radius: 6px;
}
.log-toggle:hover { background: rgba(94,234,212,0.16); }
.log-list {
  margin-top: 8px; padding: 12px 14px; border-radius: 8px;
  background: rgba(0,0,0,0.35); border: 1px solid rgba(94,234,212,0.15);
  max-height: 320px; overflow-y: auto;
}
.log-line { display: flex; gap: 8px; padding: 4px 0; font-size: 12px; line-height: 1.5; border-bottom: 1px solid rgba(255,255,255,0.04); }
.log-line:last-child { border-bottom: 0; }
.log-from { color: #5eead4; font-weight: 600; flex-shrink: 0; min-width: 90px; }
.log-text { color: var(--muted); word-break: break-word; }

.direct-zone {
  margin-top: 14px; padding: 14px 16px; border-radius: 10px;
  background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.18);
}
.direct-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.direct-tag {
  font-size: 10px; font-weight: 700; letter-spacing: 0.8px; color: var(--dim);
  padding: 3px 8px; border: 1px solid var(--panel-line); border-radius: 4px;
}
.direct-latency { font-size: 11px; color: var(--dim); }
.direct-answer { color: var(--muted); font-size: 13px; line-height: 1.65; word-break: break-word; }
.direct-answer :deep(code) { background: rgba(255,255,255,0.08); padding: 1px 4px; border-radius: 3px; font-size: 12px; }

.input-zone {
  display: flex; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--panel-line);
}
.input-box {
  flex: 1; resize: none; font-family: inherit; font-size: 14px; line-height: 1.5;
  background: rgba(8,11,26,0.9); border: 1px solid var(--panel-line); color: #e8e8f0;
  border-radius: 8px; padding: 10px 14px;
}
.input-box:focus { outline: none; border-color: var(--cyan); }
.input-box:disabled { opacity: 0.5; }
.send-btn {
  align-self: stretch; padding: 0 24px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit;
  background: rgba(58,224,255,0.16); border: 1px solid rgba(58,224,255,0.4); color: var(--cyan); border-radius: 8px;
  transition: 0.15s;
}
.send-btn:hover:not(:disabled) { background: rgba(58,224,255,0.26); }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
