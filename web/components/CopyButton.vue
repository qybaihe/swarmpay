<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { copyText } from "../composables/useToast";
const { t } = useI18n();
const props = defineProps<{ text: string; label?: string }>();

function onCopy() {
  copyText(props.text);
}
</script>

<template>
  <button class="copy-btn" @click="onCopy">{{ label || "复制" }}</button>
</template>
