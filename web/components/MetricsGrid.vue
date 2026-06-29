<script setup lang="ts">
import type { SwarmTrace } from "../api/swarm";

const props = defineProps<{ trace: SwarmTrace }>();

const items = () => {
  const t = props.trace;
  return [
    { num: String(t.swarm_size ?? 0), lbl: "子任务/舰数" },
    { num: String(t.breakthroughs_broadcast ?? 0), lbl: "突破广播数" },
    { num: ((t.total_latency_ms ?? 0) / 1000).toFixed(1) + "s", lbl: "总耗时" },
    { num: t.aggregator === "llm" ? "旗舰聚合" : "投票", lbl: "聚合方式" },
  ];
};
</script>

<template>
  <div class="metrics">
    <div class="metric" v-for="(m, i) in items()" :key="i">
      <div class="num">{{ m.num }}</div>
      <div class="lbl">{{ m.lbl }}</div>
    </div>
  </div>
</template>

<style scoped>
.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 14px;
  margin-bottom: 24px;
}
.metric {
  padding: 16px;
  background: rgba(8, 11, 26, 0.5);
  border: 1px solid var(--panel-line);
  text-align: center;
}
.metric .num {
  font-size: 24px;
  font-weight: 800;
  background: linear-gradient(90deg, var(--cyan), var(--violet));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.metric .lbl {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
  letter-spacing: 0.5px;
}
</style>
