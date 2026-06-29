<script setup lang="ts">
import { ref } from "vue";
import type { SwarmBee } from "../api/swarm";
import { ROLE } from "../constants/fleet";
import ShipIcon from "./ShipIcon.vue";

const props = defineProps<{ bees: SwarmBee[] }>();

// 记录每个节点是否展开 snippet
const expanded = ref<Record<string, boolean>>({});

function statusText(s: SwarmBee["status"]): string {
  if (s === "breakthrough") return "⚡ 突破";
  if (s === "hinted") return "受信号提示";
  if (s === "timed_out") return "✕ 失联";
  return "已完成";
}
function toggle(id: string) {
  expanded.value[id] = !expanded.value[id];
}
</script>

<template>
  <div class="fleet-chain">
    <template v-for="(b, i) in bees" :key="b.id">
      <div class="ship-node" :class="['v-' + b.variant, b.status, { breakthrough: b.status === 'breakthrough' }]" @click="toggle(b.id)">
        <div class="head">
          <div class="icon"><ShipIcon :ship="(ROLE[b.variant]?.ship) || 'flagship'" /></div>
          <div>
            <div class="name" :style="{ color: ROLE[b.variant]?.color || '#8893bf' }">
              {{ ROLE[b.variant]?.name || b.variant }}
            </div>
            <div class="status">{{ b.id }} · {{ statusText(b.status) }}</div>
          </div>
        </div>
        <div class="lat">⏱ {{ b.latency_ms }}ms</div>
        <div class="snip" :class="{ open: expanded[b.id] }">{{ b.snippet || "" }}</div>
      </div>
      <div class="ship-arrow" v-if="i < bees.length - 1">→</div>
    </template>
  </div>
</template>

<style scoped>
.fleet-chain {
  display: flex;
  gap: 0;
  align-items: stretch;
  overflow-x: auto;
  padding: 10px 0 18px;
}
.ship-node {
  flex: 0 0 auto;
  min-width: 175px;
  max-width: 220px;
  padding: 15px;
  background: rgba(8, 11, 26, 0.55);
  border: 1px solid var(--panel-line);
  cursor: pointer;
  transition: 0.2s;
}
.ship-node:hover {
  transform: translateY(-3px);
}
.ship-node.breakthrough {
  box-shadow: 0 0 22px rgba(255, 184, 77, 0.4);
}
.ship-node.breakthrough::after {
  content: "⚡";
  position: absolute;
  margin-top: -46px;
  margin-left: 168px;
  font-size: 18px;
}
.ship-node.hinted {
  opacity: 0.5;
  border-style: dashed;
}
.ship-node.timed_out {
  opacity: 0.4;
}
.ship-node .head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.ship-node .icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 22px;
}
.ship-node .name {
  font-size: 13px;
  font-weight: 700;
}
.ship-node .status {
  font-size: 10px;
  color: var(--dim);
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.ship-node .lat {
  font-size: 11px;
  color: var(--muted);
  margin-top: 8px;
}
.ship-node .snip {
  font-size: 11px;
  color: var(--dim);
  margin-top: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ship-node .snip.open {
  -webkit-line-clamp: unset;
}
.ship-arrow {
  flex: 0 0 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cyan);
  font-size: 18px;
}
/* variant 配色边框 */
.v-orchestrator { border-color: rgba(255, 184, 77, 0.4); }
.v-orchestrator .icon { color: var(--amber); }
.v-planner { border-color: rgba(92, 168, 255, 0.4); }
.v-planner .icon { color: var(--blue); }
.v-coder { border-color: rgba(58, 224, 255, 0.4); }
.v-coder .icon { color: var(--cyan); }
.v-reviewer { border-color: rgba(139, 92, 255, 0.4); }
.v-reviewer .icon { color: var(--violet); }
.v-explorer { border-color: rgba(255, 92, 200, 0.4); }
.v-explorer .icon { color: var(--pink); }
</style>
