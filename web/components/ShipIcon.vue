<script setup lang="ts">
import { computed } from "vue";
import { SHIP_SVG } from "../constants/fleet";

const props = defineProps<{ ship: string }>();
const svg = computed(() => SHIP_SVG[props.ship] || SHIP_SVG.flagship);
</script>

<template>
  <span class="ship-icon" v-html="svg"></span>
</template>

<style scoped>
.ship-icon {
  display: inline-flex;
  width: 1em;
  height: 1em;
}
.ship-icon :deep(svg) {
  width: 100%;
  height: 100%;
}
</style>
