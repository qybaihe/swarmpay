<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import SectionHeader from "./SectionHeader.vue";
import LoadingCore from "./LoadingCore.vue";
import AnswerBlock from "./AnswerBlock.vue";
import MetricsGrid from "./MetricsGrid.vue";
import EvoMapPills from "./EvoMapPills.vue";
import FleetChain from "./FleetChain.vue";
import { runSwarm, type SwarmTrace } from "../api/swarm";
import { mockTrace, mockAnswer } from "../api/mock";
import { useDemoStore } from "../stores/demo";
import { useTransformStore } from "../stores/transform";
import { useAuthStore } from "../stores/auth";
import { TIER_OPTIONS } from "../constants/fleet";

const demoStore = useDemoStore();
const transformStore = useTransformStore();
const auth = useAuthStore();
const router = useRouter();

const goal = ref("用 HTML 写一个登录页面");
const tier = ref("swarm-heavy");
const apiKey = ref("");

const loading = ref(false);
const errMsg = ref("");
const answer = ref("");
const trace = ref<SwarmTrace | null>(null);
const showResult = ref(false);

const noteText = () =>
  demoStore.demoMode
    ? "演示模式:直接载入预置舰队过程,无需后端、无需等待。"
    : "真调后端:POST /v1/chat/completions,真实模型约 30-90 秒。后端未启动会自动提示。";

// 转换区点「立即试一下」时,把 key 同步过来
watch(
  () => transformStore.lastApiKey,
  (k) => {
    if (k) apiKey.value = k;
  },
);
onMounted(() => {
  if (transformStore.lastApiKey) apiKey.value = transformStore.lastApiKey;
});

function toggleDemoMode() {
  demoStore.toggle();
}

async function dispatch() {
  errMsg.value = "";
  if (!goal.value) {
    errMsg.value = "请输入目标。可点演示模式直接看预置结果。";
    return;
  }

  // 演示模式:直接载入 mock
  if (demoStore.demoMode) {
    loading.value = true;
    showResult.value = false;
    await new Promise((r) => setTimeout(r, 1500));
    loading.value = false;
    trace.value = mockTrace(goal.value, tier.value);
    answer.value = "【演示模式 · 预置数据】" + mockAnswer(goal.value);
    showResult.value = true;
    return;
  }

  await auth.ensureLoaded();
  if (!auth.isAuthed) {
    errMsg.value = "真实后端调用需要先登录。你也可以切换演示模式直接预览。";
    router.push({ path: "/login", query: { redirect: "/#demo" } });
    return;
  }

  loading.value = true;
  showResult.value = false;

  // 真调后端
  try {
    const res = await runSwarm({ goal: goal.value, tier: tier.value, apiKey: apiKey.value || undefined });
    loading.value = false;
    answer.value = res.content;
    trace.value = res.trace;
    showResult.value = true;
  } catch (e) {
    loading.value = false;
    errMsg.value = `调用失败:${e instanceof Error ? e.message : e}。可点演示模式直接看预置结果。`;
  }
}
</script>

<template>
  <section class="screen" id="demo">
    <div class="bg-dim"></div>
    <div class="screen-content">
      <SectionHeader eyebrow="LIVE DEMO" title="透视舰队端点背后"
        sub="派出舰队编队,实时看它们如何分工、突破、交叉验证、聚合出最终答案。真实模型约需 30-90 秒。" />

      <div class="demo-card">
        <div class="demo-input-row">
          <div class="field">
            <label>目标(派舰队去解)</label>
            <input v-model="goal" autocomplete="off" />
          </div>
          <div class="field">
            <label>编队型号</label>
            <select v-model="tier">
              <option v-for="o in TIER_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
          <button class="demo-go" @click="dispatch" :disabled="loading">派出舰队</button>
        </div>
        <div class="demo-options">
          <span>API Key(留空走全局 demo):</span>
          <input v-model="apiKey" type="password" placeholder="sk-evoship-..." autocomplete="off" />
          <button class="ghost-btn" :class="{ on: demoStore.demoMode }" @click="toggleDemoMode">
            {{ demoStore.demoMode ? "✅ 演示模式已开" : "演示模式" }}
          </button>
        </div>
        <div class="demo-note">{{ noteText() }}</div>

        <LoadingCore :active="loading" />

        <div class="msg err" :class="{ show: errMsg }">{{ errMsg }}</div>

        <div class="demo-result" :class="{ show: showResult }">
          <AnswerBlock :content="answer" />
          <template v-if="trace">
            <MetricsGrid :trace="trace" />
            <EvoMapPills :trace="trace" />
            <div class="fleet-chain-label">🛰️ 舰队协作节点链(点击展开)</div>
            <FleetChain v-if="trace.bees?.length" :bees="trace.bees" />
            <div v-else class="empty">本型号未组队协作。</div>
          </template>
          <div v-else class="empty">此型号未返回舰队过程数据。</div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.screen {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  background: #04050d;
}
.bg-dim {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(ellipse 60% 40% at 70% 30%, rgba(58, 224, 255, 0.16), transparent 60%),
    radial-gradient(ellipse 60% 40% at 20% 70%, rgba(139, 92, 255, 0.18), transparent 60%),
    #04050d;
}
.screen-content {
  position: relative;
  z-index: 2;
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
  padding: 120px 6vw 8vh;
}
.demo-card {
  max-width: 1000px;
  margin: 0 auto;
  padding: 36px;
  background: rgba(8, 11, 26, 0.78);
  border: 1px solid var(--panel-line);
  backdrop-filter: blur(18px);
}
.demo-input-row {
  display: grid;
  grid-template-columns: 1fr 200px auto;
  gap: 14px;
  align-items: end;
}
.demo-input-row .field { margin-bottom: 0; }
.demo-go {
  padding: 14px 24px;
  height: 50px;
  background: #fff;
  color: #04050d;
  font-weight: 800;
  font-size: 14px;
  border: none;
  cursor: pointer;
  transition: 0.2s;
  font-family: inherit;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 0.8px;
}
.demo-go:hover:not(:disabled) { background: var(--cyan); }
.demo-go:disabled { opacity: 0.6; cursor: not-allowed; }
.demo-options {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-top: 16px;
  flex-wrap: wrap;
  color: var(--muted);
  font-size: 13px;
}
.demo-options input {
  flex: 1;
  min-width: 200px;
  padding: 9px 12px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--panel-line);
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
}
.ghost-btn {
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--panel-line);
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: 0.15s;
}
.ghost-btn:hover { border-color: var(--cyan); color: var(--cyan); }
.ghost-btn.on { background: rgba(255, 184, 77, 0.14); border-color: var(--amber); color: var(--amber); }
.demo-note {
  margin-top: 12px;
  font-size: 12px;
  color: var(--dim);
}
.demo-result {
  display: none;
  margin-top: 28px;
}
.demo-result.show {
  display: block;
  animation: fadeUp 0.4s ease;
}
.fleet-chain-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--cyan);
  letter-spacing: 1.2px;
  margin-bottom: 14px;
  text-transform: uppercase;
}
.empty {
  color: var(--dim);
  font-size: 13px;
  padding: 14px;
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: none; }
}
@media (max-width: 760px) {
  .demo-input-row { grid-template-columns: 1fr; }
  .demo-card { padding: 26px 20px; }
  .screen-content { padding: 100px 6vw 6vh; }
}
</style>
