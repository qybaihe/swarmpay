<script setup lang="ts">
// 链上金钱流动 overlay:从 sender(用户预算源)向各 agent 钱包画金色分润箭头。
// 输入是 splits[{archetype, addr, amount, weight}] + senderAddr。
// 复用 SplitFlowGraph 的金色渐变 / animateMotion 粒子 / dash 流动动画。
// 坐标先用固定 LAYOUT(后续主线会改成动态节点坐标),组件能独立渲染。

import { computed } from "vue";
import { baseUnitsToInj, shortAddr } from "../../stores/injective";

// 宽松类型对接后端 SplitShare(archetype/addr/amount/weight),避免被实现进度卡住。
interface SplitShareLike {
  archetype: string;
  addr: string;
  amount: string; // 最小单位
  weight: number;
}

const props = defineProps<{
  splits: SplitShareLike[];
  senderAddr?: string;
  totalDistributed?: string; // 最小单位
  denom?: string;
}>();

const DENOM = computed(() => props.denom || "inj");

// archetype 展示色(复用站内舰种色 + 链上金/青点缀),与 SplitFlowGraph 保持一致
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

// 归一化权重 → 节点大小 / 连线粗细(也用最小单位金额反映贡献)
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
  sharePct: number;
  color: string;
  label: string;
  nodeSize: number;
  strokeW: number;
  senderToAgentPath: string;
}

const rows = computed<FlowRow[]>(() =>
  props.splits.map((s) => {
    const w = Math.abs(s.weight) || 0;
    const sizeRatio = maxWeight.value > 0 ? w / maxWeight.value : 0;
    const nodeSize = 26 + sizeRatio * 30;
    // sender(左)→ agent 节点(中) 的贝塞尔路径(核心金色流动线)
    const sy = LAYOUT.topPad + 0 * LAYOUT.rowGap; // sender 居中,路径 Y 由行 Y 调整
    void sy;
    return {
      archetype: s.archetype,
      addr: s.addr,
      amount: s.amount,
      amountInj: baseUnitsToInj(s.amount),
      weight: w,
      sharePct: Math.round((w / totalWeight.value) * 1000) / 10,
      color: colorFor(s.archetype),
      label: labelFor(s.archetype),
      nodeSize,
      strokeW: 1.5 + sizeRatio * 4.5,
      senderToAgentPath: "", // 占位,渲染时按行 Y 动态拼
    };
  }),
);

const totalInj = computed(() => baseUnitsToInj(props.totalDistributed || "0"));
const hasSplits = computed(() => rows.value.length > 0);
const senderShort = computed(() => shortAddr(props.senderAddr ?? null, 6, 4));

// 固定 LAYOUT(参考 SplitFlowGraph):左=sender 预算源,中=agent 节点,右=各钱包
const LAYOUT = { leftX: 80, midX: 250, rightX: 470, rowGap: 78, topPad: 70, svgW: 560 };
const svgHeight = computed(() =>
  hasSplits.value ? LAYOUT.topPad * 2 + rows.value.length * LAYOUT.rowGap : 160,
);
function rowY(i: number): number {
  return LAYOUT.topPad + i * LAYOUT.rowGap;
}
// sender 居中纵向位置
const senderY = computed(() => svgHeight.value / 2);

/** 拼出 sender → 某 agent 节点 的金色贝塞尔路径。 */
function senderToAgentPath(i: number, row: FlowRow): string {
  const y = rowY(i);
  const sx = LAYOUT.leftX + 34; // sender 圆右沿
  const ex = LAYOUT.midX - row.nodeSize / 2; // agent 节点圆左沿
  return `M ${sx} ${senderY.value} C ${sx + 80} ${senderY.value}, ${ex - 70} ${y}, ${ex} ${y}`;
}
/** 拼出 agent 节点 → 钱包 的贝塞尔路径。 */
function agentToWalletPath(i: number, row: FlowRow): string {
  const y = rowY(i);
  const sx = LAYOUT.midX + row.nodeSize / 2;
  const ex = LAYOUT.rightX - 6;
  return `M ${sx} ${y} C ${sx + 90} ${y}, ${ex - 80} ${y}, ${ex} ${y}`;
}
</script>

<template>
  <div class="reward-flow-overlay">
    <div class="rf-head">
      <span class="rf-title">✨ 链上分润流向</span>
      <span v-if="hasSplits" class="rf-total">合计 {{ totalInj }} {{ DENOM }} · {{ rows.length }} 个角色</span>
    </div>

    <div v-if="!hasSplits" class="rf-empty">
      <div class="rf-empty-emoji">💸</div>
      <p>暂无分润数据</p>
      <p class="sub">提交蜂群运行后,资金将按各 agent 贡献权重分配到对应链上钱包</p>
    </div>

    <svg
      v-else
      class="rf-svg"
      :viewBox="`0 0 ${LAYOUT.svgW} ${svgHeight}`"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="链上金钱流动 overlay"
    >
      <defs>
        <!-- 流动渐变:金 → 青(核心金色分润箭头) -->
        <linearGradient id="rf-flow-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ffd23f" stop-opacity="0.9" />
          <stop offset="100%" stop-color="#3ae0ff" stop-opacity="0.9" />
        </linearGradient>
        <!-- 金币渐变:金 → 绿 -->
        <linearGradient id="rf-coin-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ffd23f" />
          <stop offset="100%" stop-color="#3dffb0" />
        </linearGradient>
        <!-- 发光滤镜 -->
        <filter id="rf-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <!-- 金色箭头标记 -->
        <marker id="rf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffd23f" />
        </marker>
      </defs>

      <!-- 左侧:sender 预算源(金库) -->
      <g class="rf-source">
        <circle :cx="LAYOUT.leftX" :cy="senderY" r="34" fill="rgba(255,210,63,0.12)" stroke="#ffd23f" stroke-width="2" filter="url(#rf-glow)" />
        <text :x="LAYOUT.leftX" :y="senderY - 2" text-anchor="middle" class="rf-source-emoji">🏦</text>
        <text :x="LAYOUT.leftX" :y="senderY + 52" text-anchor="middle" class="rf-source-label">预算源</text>
        <text :x="LAYOUT.leftX" :y="senderY + 68" text-anchor="middle" class="rf-source-amt">{{ senderShort }}</text>
      </g>

      <!-- 每行:sender → agent 金色流动线 + agent → 钱包 流动箭头 + 粒子 -->
      <g v-for="(row, i) in rows" :key="i" class="rf-row">
        <!-- sender → agent:金色核心流动线(带箭头) -->
        <path
          :d="senderToAgentPath(i, row)"
          stroke="url(#rf-flow-grad)"
          :stroke-width="row.strokeW"
          fill="none"
          marker-end="url(#rf-arrow)"
          class="rf-line-flow"
          :style="{ '--flow-color': row.color }"
        />
        <!-- 流动粒子(沿 sender→agent 路径运动) -->
        <circle r="3" fill="#ffd23f" class="rf-particle">
          <animateMotion :dur="`${1.6 + i * 0.15}s`" repeatCount="indefinite" rotate="auto"
            :path="senderToAgentPath(i, row)" />
          <animate attributeName="fill" :values="`${row.color};#ffd23f;${row.color}`" dur="1.6s" repeatCount="indefinite" />
        </circle>

        <!-- agent → 钱包:细分发线(dash 流动) -->
        <path
          :d="agentToWalletPath(i, row)"
          :stroke="row.color"
          :stroke-width="row.strokeW * 0.7"
          fill="none"
          stroke-opacity="0.55"
          stroke-dasharray="5 6"
          class="rf-line-dash"
        />

        <!-- 中:agent 节点(圆,大小按 weight) -->
        <g class="rf-agent">
          <circle :cx="LAYOUT.midX" :cy="rowY(i)" :r="row.nodeSize / 2" :fill="`${row.color}22`" :stroke="row.color" stroke-width="2" filter="url(#rf-glow)" />
          <text :x="LAYOUT.midX" :y="rowY(i) + 3" text-anchor="middle" class="rf-agent-pct">{{ row.sharePct }}%</text>
        </g>
        <text :x="LAYOUT.midX" :y="rowY(i) + row.nodeSize / 2 + 14" text-anchor="middle" class="rf-agent-label">{{ row.label }}</text>
        <text :x="LAYOUT.midX" :y="rowY(i) + row.nodeSize / 2 + 28" text-anchor="middle" class="rf-agent-amt">+{{ row.amountInj }} {{ DENOM }}</text>

        <!-- 右:钱包地址 -->
        <g class="rf-wallet">
          <rect :x="LAYOUT.rightX" :y="rowY(i) - 14" width="92" height="28" rx="6" :fill="`${row.color}14`" :stroke="row.color" stroke-width="1" stroke-opacity="0.6" />
          <text :x="LAYOUT.rightX + 6" :y="rowY(i) - 1" class="rf-wallet-addr">{{ shortAddr(row.addr, 6, 4) }}</text>
          <text :x="LAYOUT.rightX + 6" :y="rowY(i) + 10" class="rf-wallet-tag">w={{ row.weight }}</text>
        </g>
      </g>

      <!-- 列标题 -->
      <text :x="LAYOUT.leftX" :y="26" text-anchor="middle" class="rf-col-head">预算源</text>
      <text :x="LAYOUT.midX" :y="26" text-anchor="middle" class="rf-col-head">Agent 贡献</text>
      <text :x="LAYOUT.rightX + 46" :y="26" text-anchor="middle" class="rf-col-head">链上钱包</text>
    </svg>
  </div>
</template>

<style scoped>
.reward-flow-overlay {
  background: rgba(8, 11, 26, 0.6);
  border: 1px solid rgba(255, 210, 63, 0.3);
  border-radius: 10px;
  padding: 14px;
}
.rf-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}
.rf-title {
  font-size: 13px;
  font-weight: 800;
  color: #ffd23f;
  letter-spacing: 0.4px;
}
.rf-total {
  font-size: 11px;
  color: var(--cyan, #3ae0ff);
  font-family: ui-monospace, monospace;
}
.rf-svg {
  width: 100%;
  height: auto;
  display: block;
}
.rf-empty {
  padding: 30px 12px;
  text-align: center;
  color: var(--dim, #6b7280);
}
.rf-empty-emoji { font-size: 40px; margin-bottom: 8px; opacity: 0.6; }
.rf-empty p { font-size: 13px; margin: 2px 0; }
.rf-empty .sub { font-size: 11px; color: var(--dim, #6b7280); }

.rf-col-head {
  fill: var(--dim, #6b7280);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.rf-source-emoji { font-size: 22px; }
.rf-source-label { fill: #fff; font-size: 10px; font-weight: 700; }
.rf-source-amt { fill: #ffd23f; font-size: 9px; font-family: ui-monospace, monospace; }

.rf-agent-pct { fill: #fff; font-size: 11px; font-weight: 800; }
.rf-agent-label { fill: #b8b8c8; font-size: 10px; font-weight: 600; }
.rf-agent-amt { fill: #3dffb0; font-size: 9px; font-family: ui-monospace, monospace; }

.rf-wallet-addr { fill: #e8e8f0; font-size: 9px; font-family: ui-monospace, monospace; }
.rf-wallet-tag { fill: #6b7280; font-size: 8px; font-family: ui-monospace, monospace; }

/* 金色流动线:dasharray 流动动画 + 发光 */
.rf-line-flow {
  stroke-dasharray: 6 5;
  animation: rf-dash 1s linear infinite;
  filter: drop-shadow(0 0 4px var(--flow-color, #ffd23f));
}
.rf-line-dash {
  animation: rf-dash 2.4s linear infinite;
}
@keyframes rf-dash {
  to { stroke-dashoffset: -22; }
}
.rf-particle {
  filter: drop-shadow(0 0 4px #ffd23f);
}
</style>
