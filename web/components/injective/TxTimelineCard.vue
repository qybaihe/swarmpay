<script setup lang="ts">
// 交易回执卡片：txHash（可点击跳 Injective 浏览器）+ 状态 + mode(contract/direct) + gas。
// 输入是 DistributeResult（见 src/injective/types.ts）。
// 后端 mock 模式下 txHash 形如 mock_xxx，此时不生成浏览器链接（展示为本地回执）。

import { computed } from "vue";
import { baseUnitsToInj, shortAddr } from "../../stores/injective";

// 宽松类型对接后端 DistributeResult。
interface DistributeResultLike {
  txHash: string;
  mode: "contract" | "direct";
  splits?: { archetype: string; addr: string; amount: string; weight: number }[];
  totalDistributed?: string;
  feeDeducted?: string;
  success: boolean;
  error?: string;
}

const props = defineProps<{
  payment: DistributeResultLike;
  denom?: string;
}>();

const DENOM = computed(() => props.denom || "inj");

const isMock = computed(() => props.payment.txHash?.startsWith("mock_"));
const explorerUrl = computed(() => {
  if (isMock.value) return "";
  return `https://testnet.explorer.injective.network/transaction/${props.payment.txHash}`;
});

const statusText = computed(() => (props.payment.success ? "成功" : "失败"));
const modeLabel = computed(() =>
  props.payment.mode === "contract" ? "合约执行" : "直接转账",
);
const modeDesc = computed(() =>
  props.payment.mode === "contract"
    ? "一次合约调用完成多接收方分润"
    : "参与者较少，多笔原生转账聚合",
);

const totalInj = computed(() => baseUnitsToInj(props.payment.totalDistributed || "0"));
const feeInj = computed(() => baseUnitsToInj(props.payment.feeDeducted || "0"));
const splitCount = computed(() => props.payment.splits?.length || 0);

const txHashShort = computed(() => shortAddr(props.payment.txHash, 10, 8));

function copyHash() {
  navigator.clipboard?.writeText(props.payment.txHash).catch(() => { /* ignore */ });
}
</script>

<template>
  <div class="tx-card" :class="{ ok: payment.success, fail: !payment.success, mock: isMock }">
    <div class="tx-head">
      <span class="tx-badge" :class="payment.success ? 'ok' : 'fail'">
        <span class="dot"></span>{{ statusText }}
      </span>
      <span class="tx-mode" :class="payment.mode">{{ modeLabel }}</span>
      <span v-if="isMock" class="tx-mock-tag">MOCK 回执</span>
    </div>

    <div class="tx-row tx-hash-row">
      <label>TxHash</label>
      <div class="tx-hash-val">
        <code :title="payment.txHash">{{ txHashShort }}</code>
        <button class="tx-mini-btn" type="button" @click="copyHash" title="复制 txHash">复制</button>
        <a
          v-if="explorerUrl"
          class="tx-mini-btn explorer"
          :href="explorerUrl"
          target="_blank"
          rel="noopener noreferrer"
          title="在 Injective 浏览器查看"
        >浏览器 ↗</a>
      </div>
    </div>

    <div class="tx-grid">
      <div class="tx-cell">
        <label>执行模式</label>
        <b>{{ modeLabel }}</b>
        <em>{{ modeDesc }}</em>
      </div>
      <div class="tx-cell">
        <label>分润人数</label>
        <b>{{ splitCount }}</b>
        <em>个链上接收方</em>
      </div>
      <div class="tx-cell">
        <label>已分发</label>
        <b class="amt">{{ totalInj }} {{ DENOM }}</b>
        <em>合计到账</em>
      </div>
      <div class="tx-cell">
        <label>协议服务费</label>
        <b class="fee">{{ feeInj }} {{ DENOM }}</b>
        <em>从预算扣除</em>
      </div>
    </div>

    <div v-if="payment.error" class="tx-error">⚠️ {{ payment.error }}</div>

    <div v-if="payment.splits && payment.splits.length" class="tx-splits">
      <div class="tx-splits-head">到账明细</div>
      <div class="tx-splits-list">
        <div v-for="(s, i) in payment.splits" :key="i" class="tx-split-item">
          <span class="ts-arch">{{ s.archetype }}</span>
          <code class="ts-addr">{{ shortAddr(s.addr, 6, 4) }}</code>
          <b class="ts-amt">{{ baseUnitsToInj(s.amount) }} {{ DENOM }}</b>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tx-card {
  background: rgba(8, 11, 26, 0.7);
  border: 1px solid var(--panel-line);
  border-left: 3px solid var(--green);
  border-radius: 10px;
  padding: 14px 16px;
}
.tx-card.fail { border-left-color: var(--red); }
.tx-card.mock { border-left-color: var(--amber); }

.tx-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.tx-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.tx-badge.ok { background: rgba(61,255,176,0.12); color: var(--green); border: 1px solid rgba(61,255,176,0.3); }
.tx-badge.fail { background: rgba(255,92,122,0.12); color: var(--red); border: 1px solid rgba(255,92,122,0.3); }
.tx-badge .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; }
.tx-mode {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 5px;
  border: 1px solid rgba(58,224,255,0.3);
  color: var(--cyan);
  background: rgba(58,224,255,0.08);
}
.tx-mode.direct { border-color: rgba(137,91,255,0.3); color: #b89aff; background: rgba(137,91,255,0.08); }
.tx-mock-tag {
  font-size: 10px;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 5px;
  color: var(--amber);
  background: rgba(255,184,77,0.1);
  border: 1px solid rgba(255,184,77,0.3);
}

.tx-row { margin-bottom: 10px; }
.tx-row label { display: block; font-size: 10px; color: var(--dim); font-weight: 700; margin-bottom: 4px; letter-spacing: 0.4px; }
.tx-hash-val {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tx-hash-val code {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  color: #e8e8f0;
  background: rgba(0,0,0,0.34);
  padding: 5px 9px;
  border-radius: 6px;
  border: 1px solid var(--panel-line);
  word-break: break-all;
}
.tx-mini-btn {
  font-size: 11px;
  padding: 4px 9px;
  border-radius: 5px;
  cursor: pointer;
  font-family: inherit;
  border: 1px solid var(--panel-line);
  background: rgba(255,255,255,0.04);
  color: var(--muted);
  text-decoration: none;
  transition: 0.15s;
}
.tx-mini-btn:hover { color: #fff; border-color: rgba(58,224,255,0.45); }
.tx-mini-btn.explorer { color: var(--cyan); border-color: rgba(58,224,255,0.35); }
.tx-mini-btn.explorer:hover { background: rgba(58,224,255,0.12); }

.tx-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
  margin-bottom: 10px;
}
.tx-cell {
  padding: 9px 11px;
  background: rgba(4,5,13,0.5);
  border: 1px solid var(--panel-line);
  border-radius: 7px;
}
.tx-cell label { display: block; font-size: 10px; color: var(--dim); font-weight: 700; margin-bottom: 3px; }
.tx-cell b { display: block; font-size: 14px; color: #fff; font-weight: 800; }
.tx-cell b.amt { color: var(--green); font-family: ui-monospace, monospace; font-size: 13px; }
.tx-cell b.fee { color: var(--amber); font-family: ui-monospace, monospace; font-size: 13px; }
.tx-cell em { font-size: 10px; color: var(--dim); font-style: normal; }

.tx-error {
  margin-bottom: 10px;
  padding: 8px 10px;
  background: rgba(255,92,122,0.1);
  border: 1px solid rgba(255,92,122,0.28);
  color: var(--red);
  font-size: 12px;
  border-radius: 6px;
}

.tx-splits-head { font-size: 11px; font-weight: 700; color: var(--muted); margin-bottom: 6px; }
.tx-splits-list { display: grid; gap: 5px; }
.tx-split-item {
  display: grid;
  grid-template-columns: 90px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 5px 8px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--panel-line);
  border-radius: 5px;
}
.ts-arch { font-size: 11px; color: var(--cyan); font-weight: 700; }
.ts-addr { font-size: 10px; color: var(--muted); font-family: ui-monospace, monospace; }
.ts-amt { font-size: 11px; color: var(--green); font-family: ui-monospace, monospace; font-weight: 700; }
</style>
