<script setup lang="ts">
import { toRef } from "vue";
import { useSprite } from "../../composables/useSprite";
import type { Action } from "../../constants/pets";

const props = withDefaults(
  defineProps<{ sprite: string; action?: Action }>(),
  { action: "Idle" },
);
const { src } = useSprite(toRef(props, "sprite"), toRef(props, "action"));
</script>

<template>
  <img class="pet-sprite" :src="src" alt="" draggable="false" />
</template>

<style scoped>
.pet-sprite {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated; /* 像素清晰不模糊 */
  image-rendering: crisp-edges;
  pointer-events: none;
  user-select: none;
}
</style>
