<script setup lang="ts">
import { copyText } from "../composables/useToast";
const props = defineProps<{ text: string; label?: string }>();

function onCopy() {
  copyText(props.text);
}
</script>

<template>
  <button class="copy-btn" @click="onCopy">{{ label || "复制" }}</button>
</template>
