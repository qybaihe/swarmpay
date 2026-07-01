<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n();
/**
 * 舰队选择器 —— 自定义下拉面板(非原生 select)。
 * 数据来源:
 *   ① 我的端点:listEndpoints() —— 展示 label + upstream_model + upstream_base_url + 健康状态。
 *   ② 官方舰队:listPublicFleets() 过滤 author.name === OFFICIAL —— 展示 图标 + 名称 + 设计意图 + 节点数。
 * 选中后,父组件据此决定本次运行的 tier/topology/apiKey。
 */
import { ref, computed, onMounted, watch, onBeforeUnmount } from "vue";
import { listEndpoints, type RegisteredEndpoint } from "../api/endpoints";
import { listPublicFleets, getPublicFleet, type CommunityFleetSummary } from "../api/community";
import type { PlaygroundTopology } from "../api/swarm";
import type { SelectedFleet } from "../types/fleet-picker";
import { useAuthStore } from "../stores/auth";

// 运行时键:后端 community 蜂群 author.name 用此过滤官方蜂群(灌库数据用,勿改品牌字样否则匹配失效)
const OFFICIAL_NAME = "EvoShip 官方";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{
  (e: "update:modelValue", v: string): void;
  (e: "select", fleet: SelectedFleet | null): void;
}>();

const auth = useAuthStore();

const endpoints = ref<RegisteredEndpoint[]>([]);
const officialFleets = ref<CommunityFleetSummary[]>([]);
const loading = ref(true);
const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const fleetTopologyCache = ref<Record<number, PlaygroundTopology>>({});

// 官方舰队的图标(按 model_id 末段映射)
const FLEET_ICON: Record<string, string> = {
  "official-think-tank": "🏛️",
  "official-code-workshop": "🛠️",
  "official-debate-arena": "⚔️",
  "official-quality-shield": "🛡️",
  "official-fullstack-dag": "🌟",
};
function fleetIcon(f: CommunityFleetSummary): string {
  const slug = f.model_id.replace("user:", "");
  return FLEET_ICON[slug] || "⭐";
}
function fleetDisplayName(f: CommunityFleetSummary): string {
  if (f.label) {
    const main = f.label.split("·")[0].trim();
    if (main) return main;
  }
  return f.name;
}
// 设计意图:label 里 · 后面的部分
function fleetDesignIntent(f: CommunityFleetSummary): string {
  if (!f.label) return "";
  const parts = f.label.split("·");
  if (parts.length >= 2) return parts.slice(1).join("·").trim().replace(/\(官方出品\)/g, "").trim();
  return "";
}

function buildSelected(id: string): SelectedFleet | null {
  if (!id) return null;
  if (id.startsWith("ep-")) {
    const epId = Number(id.slice(3));
    const ep = endpoints.value.find((e) => e.id === epId);
    if (!ep) return null;
    return {
      id, source: "endpoint",
      label: ep.label || ep.upstream_model,
      endpointId: ep.id, upstreamModel: ep.upstream_model,
    };
  }
  if (id.startsWith("of-")) {
    const fleetId = Number(id.slice(3));
    const f = officialFleets.value.find((x) => x.id === fleetId);
    if (!f) return null;
    return { id, source: "official", label: fleetDisplayName(f), modelId: f.model_id, fleetId: f.id };
  }
  return null;
}

// 触发按钮显示文案
const triggerText = computed(() => {
  const sel = buildSelected(props.modelValue);
  if (sel) {
    if (sel.source === "official") return `${fleetIcon(officialFleets.value.find(f => f.id === sel.fleetId)!)} ${sel.label}`;
    return sel.label;
  }
  return loading.value ? "加载编队中…" : "选择编队";
});

function toggleOpen() {
  if (loading.value) return;
  open.value = !open.value;
}
function closePanel() { open.value = false; }

function pick(id: string) {
  emit("update:modelValue", id);
  emit("select", buildSelected(id));
  closePanel();
}

// 点外部关闭
function onDocClick(e: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) closePanel();
}
onMounted(async () => {
  document.addEventListener("click", onDocClick);
  loading.value = true;
  try {
    await auth.ensureLoaded();
    const tasks: Promise<unknown>[] = [];
    if (auth.isAuthed) {
      tasks.push(listEndpoints().then((list) => { endpoints.value = list; }));
    }
    tasks.push(
      listPublicFleets({ sort: "new", page: 1 }).then((r) => {
        officialFleets.value = r.items.filter((f) => f.author.name === OFFICIAL_NAME);
      }),
    );
    await Promise.all(tasks);
  } finally {
    loading.value = false;
  }
});
onBeforeUnmount(() => document.removeEventListener("click", onDocClick));

// 默认选第一个官方舰队
watch(
  [loading, officialFleets],
  ([isLoading]) => {
    if (isLoading || props.modelValue) return;
    const first = officialFleets.value[0];
    if (first) {
      emit("update:modelValue", `of-${first.id}`);
      emit("select", buildSelected(`of-${first.id}`));
    }
  },
  { immediate: true },
);

async function loadFleetTopology(fleetId: number): Promise<PlaygroundTopology | null> {
  if (fleetTopologyCache.value[fleetId]) return fleetTopologyCache.value[fleetId];
  try {
    const detail = await getPublicFleet(fleetId);
    fleetTopologyCache.value[fleetId] = detail.topology;
    return detail.topology;
  } catch {
    return null;
  }
}
defineExpose({ buildSelected, loadFleetTopology });
</script>

<template>
  <div class="fleet-picker" ref="rootRef">
    <button class="trigger" :class="{ open, loading }" @click="toggleOpen" type="button">
      <span class="trigger-text">{{ triggerText }}</span>
      <span class="caret" :class="{ up: open }">▾</span>
    </button>

    <Transition name="drop">
      <div v-if="open" class="panel">
        <!-- 我的端点 -->
        <div v-if="endpoints.length" class="group">
          <div class="group-label">{{ t('fleetpicker.k1') }}</div>
          <button
            v-for="ep in endpoints" :key="`ep-${ep.id}`"
            class="item" :class="{ active: modelValue === `ep-${ep.id}` }"
            @click="pick(`ep-${ep.id}`)" type="button"
          >
            <span class="item-dot" :class="ep.status"></span>
            <span class="item-body">
              <span class="item-name">{{ ep.label || ep.upstream_model }}</span>
              <span class="item-meta">
                <span class="chip model">{{ ep.upstream_model }}</span>
                <span class="url">{{ ep.upstream_base_url }}</span>
              </span>
            </span>
          </button>
        </div>

        <!-- 官方编队 -->
        <div v-if="officialFleets.length" class="group">
          <div class="group-label">{{ t('fleetpicker.k2') }}</div>
          <button
            v-for="f in officialFleets" :key="`of-${f.id}`"
            class="item official" :class="{ active: modelValue === `of-${f.id}` }"
            @click="pick(`of-${f.id}`)" type="button"
          >
            <span class="item-ic">{{ fleetIcon(f) }}</span>
            <span class="item-body">
              <span class="item-name">{{ fleetDisplayName(f) }}</span>
              <span class="item-meta">
                <span class="intent" v-if="fleetDesignIntent(f)">{{ fleetDesignIntent(f) }}</span>
                <span class="chip count">{{ f.node_count }} 编</span>
              </span>
            </span>
          </button>
        </div>

        <!-- 空态 -->
        <div v-if="!loading && !endpoints.length && !officialFleets.length" class="empty">
          {{ t('fleetpicker.k3') }}<br />{{ t('fleetpicker.k4') }}
        </div>
        <!-- 未登录提示端点 -->
        <div v-if="!auth.isAuthed && !endpoints.length" class="login-hint"
          >{ t('fleetpicker.k5') }}
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fleet-picker {
  position: relative;
  display: inline-block;
}
.trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  background: rgba(8, 11, 26, 0.85);
  border: 1px solid var(--panel-line);
  border-radius: 8px;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  min-width: 200px;
  max-width: 280px;
  transition: 0.18s;
}
.trigger:hover:not(.loading) {
  border-color: var(--cyan);
  box-shadow: 0 0 0 1px rgba(58, 224, 255, 0.15);
}
.trigger.open {
  border-color: var(--cyan);
  box-shadow: 0 0 0 1px rgba(58, 224, 255, 0.25);
}
.trigger.loading { cursor: wait; opacity: 0.7; }
.trigger-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.caret {
  font-size: 10px;
  color: var(--dim);
  transition: 0.2s;
}
.caret.up { transform: rotate(180deg); }

/* 下拉面板 */
.panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  min-width: 360px;
  max-width: 440px;
  max-height: 420px;
  overflow-y: auto;
  background: rgba(10, 14, 30, 0.97);
  border: 1px solid var(--panel-line);
  border-radius: 12px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(58, 224, 255, 0.06);
  backdrop-filter: blur(16px);
  padding: 6px;
}
.panel::-webkit-scrollbar { width: 8px; }
.panel::-webkit-scrollbar-thumb { background: rgba(120, 160, 255, 0.2); border-radius: 4px; }

.group { padding: 4px 0; }
.group + .group { border-top: 1px solid rgba(120, 160, 255, 0.08); margin-top: 4px; }
.group-label {
  padding: 8px 12px 4px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--dim);
  text-transform: uppercase;
}

/* 单项 */
.item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: 0.14s;
}
.item:hover {
  background: rgba(58, 224, 255, 0.08);
  border-color: rgba(58, 224, 255, 0.2);
}
.item.active {
  background: rgba(58, 224, 255, 0.14);
  border-color: rgba(58, 224, 255, 0.4);
}
.item-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 8px rgba(61, 255, 176, 0.7);
  margin-top: 6px;
  flex-shrink: 0;
}
.item-dot.error { background: var(--red); box-shadow: 0 0 8px rgba(255, 92, 122, 0.7); }
.item-ic {
  font-size: 18px;
  line-height: 1;
  margin-top: 2px;
  flex-shrink: 0;
}
.item-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.item-name {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item.official .item-name { color: #ffe9a8; }
.item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.intent {
  font-size: 11px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 240px;
}
.url {
  font-size: 10.5px;
  color: var(--dim);
  font-family: ui-monospace, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}
.chip {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 999px;
  font-family: ui-monospace, monospace;
  flex-shrink: 0;
}
.chip.model {
  background: rgba(58, 224, 255, 0.12);
  color: var(--cyan);
  border: 1px solid rgba(58, 224, 255, 0.25);
}
.chip.count {
  background: rgba(137, 91, 255, 0.14);
  color: #b89aff;
  border: 1px solid rgba(137, 91, 255, 0.3);
}

.empty, .login-hint {
  padding: 16px 14px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
}
.login-hint {
  border-top: 1px solid rgba(120, 160, 255, 0.08);
  margin-top: 4px;
  color: var(--dim);
}

/* 过渡 */
.drop-enter-active, .drop-leave-active { transition: opacity 0.16s, transform 0.16s; }
.drop-enter-from, .drop-leave-to { opacity: 0; transform: translateY(-6px); }

@media (max-width: 760px) {
  .panel { min-width: 280px; max-width: 320px; }
}
</style>
