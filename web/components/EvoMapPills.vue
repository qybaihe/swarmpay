<script setup lang="ts">
import type { SwarmTrace } from "../api/swarm";

const props = defineProps<{ trace: SwarmTrace }>();
</script>

<template>
  <div class="evomap-row">
    <span class="evo-pill" v-if="trace.inherited_recipes?.length">
      🧬 继承 {{ trace.inherited_recipes.length }} 条经验
    </span>
    <span class="evo-pill published" v-if="trace.evomap_backflow?.status === 'published'">
      ✅ 已回流进化网络<template v-if="trace.evomap_backflow.title"> · {{ trace.evomap_backflow.title }}</template>
    </span>
    <span class="evo-pill skipped" v-else-if="trace.evomap_backflow?.status === 'skipped'">
      ⏭️ 回流跳过
    </span>
    <span class="none" v-if="!trace.inherited_recipes?.length && !trace.evomap_backflow">
      无 EvoMap 联动(非 evo 型号)
    </span>
  </div>
</template>

<style scoped>
.evomap-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}
.evo-pill {
  padding: 9px 15px;
  border-radius: 999px;
  background: rgba(61, 255, 176, 0.08);
  border: 1px solid rgba(61, 255, 176, 0.25);
  color: var(--green);
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.evo-pill.skipped {
  color: var(--dim);
  background: rgba(255, 255, 255, 0.03);
  border-color: var(--panel-line);
}
.none {
  color: var(--dim);
  font-size: 12px;
}
</style>
