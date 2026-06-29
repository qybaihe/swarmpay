<script setup lang="ts">
import { computed } from "vue";
import { renderMarkdown } from "../composables/useMarkdown";

const props = defineProps<{ content: string }>();
const html = computed(() => renderMarkdown(props.content));
</script>

<template>
  <div class="answer-block">
    <div class="label">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 2 19 20 12 16 5 20z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      </svg>
      旗舰聚合最终答案
    </div>
    <div class="content" v-html="html"></div>
  </div>
</template>

<style scoped>
.answer-block {
  padding: 22px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--panel-line);
  margin-bottom: 22px;
}
.answer-block .label {
  font-size: 11px;
  font-weight: 700;
  color: var(--cyan);
  letter-spacing: 1.2px;
  margin-bottom: 12px;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 8px;
}
.answer-block .label svg {
  width: 18px;
  height: 18px;
  color: var(--amber);
}
.answer-block .content {
  font-size: 15px;
  line-height: 1.8;
}
.answer-block .content :deep(h1),
.answer-block .content :deep(h2),
.answer-block .content :deep(h3) {
  margin: 14px 0 8px;
}
.answer-block .content :deep(code) {
  background: rgba(58, 224, 255, 0.1);
  color: var(--cyan);
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 13px;
}
.answer-block .content :deep(pre) {
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid var(--panel-line);
  padding: 14px;
  margin: 12px 0;
  overflow-x: auto;
}
.answer-block .content :deep(pre code) {
  background: none;
  color: #cdd6f4;
  padding: 0;
}
</style>
