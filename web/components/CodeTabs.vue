<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ref, computed } from "vue";
import CopyButton from "./CopyButton.vue";

const { t } = useI18n();
const props = defineProps<{
  python: string;
  curl: string;
}>();

const active = ref<"py" | "curl">("py");
const current = computed(() => (active.value === "py" ? props.python : props.curl));
</script>

<template>
  <div class="code-tabs">
    <div class="tab-head">
      <button :class="{ active: active === 'py' }" @click="active = 'py'">Python</button>
      <button :class="{ active: active === 'curl' }" @click="active = 'curl'">curl</button>
    </div>
    <div class="code-box">
      <CopyButton :text="current" :label="t('codetabs.k1')" />
      <pre>{{ current }}</pre>
    </div>
  </div>
</template>

<style scoped>
.tab-head {
  display: flex;
  gap: 0;
}
.tab-head button {
  padding: 9px 20px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--panel-line);
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
}
.tab-head button.active {
  background: rgba(58, 224, 255, 0.12);
  color: var(--cyan);
  border-bottom-color: transparent;
}
.code-box {
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid var(--panel-line);
  padding: 16px;
  overflow-x: auto;
  position: relative;
}
.code-box pre {
  font-size: 13px;
  line-height: 1.7;
  color: #cdd6f4;
  white-space: pre;
}
.code-box :deep(.copy-btn) {
  position: absolute;
  top: 10px;
  right: 10px;
}
</style>
