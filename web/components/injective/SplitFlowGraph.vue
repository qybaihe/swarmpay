<script setup lang="ts">
// 分润流向图：左=用户预算，中=各 agent 节点（按 weight 粗细/大小），右=各钱包地址。
// 输入是 DistributeResult.splits（见 src/injective/types.ts 的 SplitShare）。
// 用 SVG 画流动箭头动画，体现"资金按贡献分配"。

import { computed } from "vue";
import { baseUnitsToInj, shortAddr } from "../../stores/injective";

// 宽松类型对接后端 SplitShare，避免被实现进度卡住（archetype/addr/amount/weight）。
interface SplitShareLike {
  archetype: string;
  addr: string;
  amount: string; // 最小单位
  weight: number;
}

const props = defineProps<{
  splits: SplitShareLike[];
  totalDistributed?: string; // 最小单位
  denom?: string;
}>();

const DENOM = computed(() => props.denom || "inj");

// 各 archetype 的展示色（复用站内舰种色 + 链上金/青点缀）
const ARCH_COLOR: Record<string, string> = {
  orchestrator: "#ffb84d",
  planner: "#5ca8ff",
  coder: "#3ae0ff",
  reviewer: "#8b5cff",
  explorer: "#ff5cc8",
  payer: "#ffd23f",
  treasurer: "#3dffb0",
};

const ARCH_LABEL: Record<string, string> = {
  orchestrator: "旗舰",
  planner: "导航舰",
  coder: "工程舰",
  reviewer: "监察舰",
  explorer: "斥候舰",
  payer: "支付舰",
  treasurer: "金库舰",
};

function colorFor(arch: string): string {
  return ARCH_COLOR[arch] || "#3ae0ff";
}
function labelFor(arch: string): string {
  return ARCH_LABEL[arch] || arch;
}

// 归一化权重 → 节点大小/连线粗细（用最小单位金额也能反映贡献）
const maxWeight = computed(() => {
  const ws = props.splits.map((s) => Math.abs(s.weight) || 0);
  return ws.length ? Math.max(...ws) : 1;
});
const totalWeight = computed(() =>
  props.splits.reduce((acc, s) => acc + (Math.abs(s.weight) || 0), 0) || 1,
);

interface FlowRow {
  archetype: string;
  addr: string;
  amount: string;
  amountInj: string;
  weight: number;
  sharePct: number; // 占比 %
  color: string;
  label: string;
  nodeSize: number; // px
  strokeW: number; // 连线粗细
}

const rows = computed<FlowRow[]>(() =>
  props.splits.map((s) => {
    const w = Math.abs(s.weight) || 0;
    const sizeRatio = maxWeight.value > 0 ? w / maxWeight.value : 0;
    return {
      archetype: s.archetype,
      addr: s.addr,
      amount: s.amount,
      amountInj: baseUnitsToInj(s.amount),
      weight: w,
      sharePct: Math.round((w / totalWeight.value) * 1000) / 10,
      color: colorFor(s.archetype),
      label: labelFor(s.archetype),
      nodeSize: 26 + sizeRatio * 30, // 26~56px
      strokeW: 1.5 + sizeRatio * 4.5, // 1.5~6
    };
  }),
);

const totalInj = computed(() => baseUnitsToInj(props.totalDistributed || "0"));
const hasSplits = computed(() => rows.value.length > 0);

// SVG 视图盒：左预算锚点 x=80，中节点 x=240，右钱包 x=460；每行垂直间距由行数自适应
const LAYOUT = { leftX: 80, midX: 250, rightX: 470, rowGap: 78, topPad: 70, svgW: 560 };
const svgHeight = computed(() =>
  hasSplits.value ? LAYOUT.topPad * 2 + rows.value.length * LAYOUT.rowGap : 160,
);
function rowY(i: number): number {
  return LAYOUT.topPad + i * LAYOUT.rowGap;
}
</script>

<template>
  <div class="split-flow">
    <div class="sf-head">
      <span class="sf-title">链上分润流向</span>
      <span class="sf-total">合计 {{ totalInj }} {{ DENOM }} · {{ rows.length }} 个角色</span>
    </div>

    <div v-if="!hasSplits" class="sf-empty">
      <div class="sf-empty-emoji">💸</div>
      <p>暂无分润数据</p>
      <p class="sub">提交蜂群运行后，资金将按各 agent 贡献权重分配到对应链上钱包</p>
    </div>

    <svg
      v-else
      class="sf-svg"
      :viewBox="`0 0 ${LAYOUT.svgW} ${svgHeight}`"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="分润流向图"
    >
      <defs>
        <!-- 流动渐变：金 → 青 -->
        <linearGradient id="sf-flow-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ffd23f" stop-opacity="0.9" />
          <stop offset="100%" stop-color="#3ae0ff" stop-opacity="0.9" />
        </linearGradient>
        <!-- 单条路径用 archetype 色做 stroke 渐变 -->
        <linearGradient id="sf-coin-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ffd23f" />
          <stop offset="100%" stop-color="#3dffb0" />
        </linearGradient>
        <!-- 发光滤镜 -->
        <filter id="sf-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- 左侧：用户预算源（金库） -->
      <g class="sf-source">
        <circle :cx="LAYOUT.leftX" :cy="svgHeight / 2" r="34" fill="rgba(255,210,63,0.12)" stroke="#ffd23f" stroke-width="2" filter="url(#sf-glow)" />
        <text :x="LAYOUT.leftX" :y="svgHeight / 2 - 2" text-anchor="middle" class="sf-source-emoji">🏦</text>
        <text :x="LAYOUT.leftX" :y="svgHeight / 2 + 52" text-anchor="middle" class="sf-source-label">用户预算</text>
        <text :x="LAYOUT.leftX" :y="svgHeight / 2 + 68" text-anchor="middle" class="sf-source-amt">{{ totalInj }} {{ DENOM }}</text>
      </g>

      <!-- 每行：中节点 → 右钱包 的流动箭头 + 左→中的分发线 -->
      <g v-for="(row, i) in rows" :key="i" class="sf-row">
        <!-- 左(预算) → 中(agent 节点)分发线 -->
        <path
          :d="`M ${LAYOUT.leftX + 34} ${svgHeight / 2} C ${LAYOUT.leftX + 90} ${svgHeight / 2}, ${LAYOUT.midX - 60} ${rowY(i)}, ${LAYOUT.midX - row.nodeSize / 2} ${rowY(i)}`"
          :stroke="row.color"
          :stroke-width="row.strokeW * 0.7"
          fill="none"
          stroke-opacity="0.55"
          stroke-dasharray="5 6"
          class="sf-line-dash"
        />
        <!-- 中(agent) → 右(钱包) 流动线（核心动画线） -->
        <path
          :d="`M ${LAYOUT.midX + row.nodeSize / 2} ${rowY(i)} C ${LAYOUT.midX + 90} ${rowY(i)}, ${LAYOUT.rightX - 80} ${rowY(i)}, ${LAYOUT.rightX - 6} ${rowY(i)}`"
          stroke="url(#sf-flow-grad)"
          :stroke-width="row.strokeW"
          fill="none"
          class="sf-line-flow"
          :style="{ '--flow-color': row.color }"
        />
        <!-- 流动粒子（沿路径运动） -->
        <circle r="3" class="sf-particle">
          <animateMotion :dur="`${1.6 + i * 0.15}s`" repeatCount="indefinite" rotate="auto"
            :path="`M ${LAYOUT.midX + row.nodeSize / 2} ${rowY(i)} C ${LAYOUT.midX + 90} ${rowY(i)}, ${LAYOUT.rightX - 80} ${rowY(i)}, ${LAYOUT.rightX - 6} ${rowY(i)}`" />
          <animate attributeName="fill" :values="`${row.color};#ffd23f;${row.color}`" dur="1.6s" repeatCount="indefinite" />
        </circle>

        <!-- 中：agent 节点（圆，大小按 weight） -->
        <g class="sf-agent">
          <circle :cx="LAYOUT.midX" :cy="rowY(i)" :r="row.nodeSize / 2" :fill="`${row.color}22`" :stroke="row.color" stroke-width="2" filter="url(#sf-glow)" />
          <text :x="LAYOUT.midX" :y="rowY(i) + 3" text-anchor="middle" class="sf-agent-pct">{{ row.sharePct }}%</text>
        </g>
        <text :x="LAYOUT.midX" :y="rowY(i) + row.nodeSize / 2 + 14" text-anchor="middle" class="sf-agent-label">{{ row.label }}</text>
        <text :x="LAYOUT.midX" :y="rowY(i) + row.nodeSize / 2 + 28" text-anchor="middle" class="sf-agent-amt">{{ row.amountInj }} {{ DENOM }}</text>

        <!-- 右：钱包地址 -->
        <g class="sf-wallet">
          <rect :x="LAYOUT.rightX" :y="rowY(i) - 14" width="92" height="28" rx="6" :fill="`${row.color}14`" :stroke="row.color" stroke-width="1" stroke-opacity="0.6" />
          <text :x="LAYOUT.rightX + 6" :y="rowY(i) - 1" class="sf-wallet-addr">{{ shortAddr(row.addr, 6, 4) }}</text>
          <text :x="LAYOUT.rightX + 6" :y="rowY(i) + 10" class="sf-wallet-tag">w={{ row.weight }}</text>
        </g>
      </g>

      <!-- 列标题 -->
      <text :x="LAYOUT.leftX" :y="26" text-anchor="middle" class="sf-col-head">预算源</text>
      <text :x="LAYOUT.midX" :y="26" text-anchor="middle" class="sf-col-head">Agent 贡献</text>
      <text :x="LAYOUT.rightX + 46" :y="26" text-anchor="middle" class="sf-col-head">链上钱包</text>
    </svg>
  </div>
</template>

<style scoped>
.split-flow {
  background: rgba(8, 11, 26, 0.6);
  border: 1px solid var(--panel-line);
  border-radius: 10px;
  padding: 14px;
}
.sf-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}
.sf-title {
  font-size: 13px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.4px;
}
.sf-total {
  font-size: 11px;
  color: var(--cyan);
  font-family: ui-monospace, monospace;
}
.sf-svg {
  width: 100%;
  height: auto;
  display: block;
}
.sf-empty {
  padding: 30px 12px;
  text-align: center;
  color: var(--dim);
}
.sf-empty-emoji { font-size: 40px; margin-bottom: 8px; opacity: 0.6; }
.sf-empty p { font-size: 13px; margin: 2px 0; }
.sf-empty .sub { font-size: 11px; color: var(--dim); }

.sf-col-head {
  fill: var(--dim);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.sf-source-emoji { font-size: 22px; }
.sf-source-label { fill: #fff; font-size: 10px; font-weight: 700; }
.sf-source-amt { fill: var(--amber); font-size: 10px; font-family: ui-monospace, monospace; }

.sf-agent-pct { fill: #fff; font-size: 11px; font-weight: 800; }
.sf-agent-label { fill: var(--muted); font-size: 10px; font-weight: 600; }
.sf-agent-amt { fill: var(--green); font-size: 9px; font-family: ui-monospace, monospace; }

.sf-wallet-addr { fill: #e8e8f0; font-size: 9px; font-family: ui-monospace, monospace; }
.sf-wallet-tag { fill: var(--dim); font-size: 8px; font-family: ui-monospace, monospace; }

/* 流动线：dasharray 流动动画 */
.sf-line-flow {
  stroke-dasharray: 6 5;
  animation: sf-dash 1s linear infinite;
  filter: drop-shadow(0 0 4px var(--flow-color, #3ae0ff));
}
.sf-line-dash {
  animation: sf-dash 2.4s linear infinite;
}
@keyframes sf-dash {
  to { stroke-dashoffset: -22; }
}
.sf-particle {
  filter: drop-shadow(0 0 4px #ffd23f);
}
</style>
