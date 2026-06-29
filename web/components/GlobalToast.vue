<script setup lang="ts">
import { useToast } from "../composables/useToast";
const { state } = useToast();
</script>

<template>
  <div class="toast" :class="{ show: state.visible }">{{ state.text }}</div>
</template>
