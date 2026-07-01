<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { computed, ref } from "vue";
import { Handle, Position } from "@vue-flow/core";
import PetSprite from "./PetSprite.vue";
import { PET_BY_ID, ROLE_INFO, TASK_TYPES, TASK_TYPE_BY_KEY, type Action, type Role } from "../../constants/pets";
import { usePlaygroundStore } from "../../stores/playground";
import { shortAddr, baseUnitsToInj } from "../../stores/injective";
const { t } = useI18n();

export interface PetNodeData {
  petId: string; // 角色 id(claude/doubao...)
  role: string; // 当前舰种
  label?: string; // 后端 graph node label
  graphNodeId?: string;
  instanceId?: string;
  laneId?: string;
  // 运行态(由 store 写)
  status?: "idle" | "active" | "breakthrough";
  bubble?: string; // 当前对话气泡文本
  // ── 节点定制(用户填,保存舰队时 AI 据此美化) ──
  customTaskType?: string;  // 场景任务 key (analysis/design/...)
  customSkill?: string;     // 自由文本:擅长做什么
}

const props = defineProps<{
  id: string;
  data: PetNodeData;
}>();

const emit = defineEmits<{
  (e: "click-node", id: string): void;
}>();

const store = usePlaygroundStore();
const meta = computed(() => PET_BY_ID[props.data.petId]);
const roleInfo = computed(() => ROLE_INFO[props.data.role as Role] ?? ROLE_INFO.planner);
const displayName = computed(() => props.data.label || meta.value?.name || props.id);
const instanceTail = computed(() => {
  const id = props.data.instanceId;
  if (!id || id === props.data.label) return "";
  const parts = id.split("-");
  return parts.slice(-2).join("-");
});

// 运行态:从 store 读这个节点的实时状态(reactive)
const runtime = computed(() => store.nodeState[props.id]);
const status = computed(() => runtime.value?.status ?? "idle");
const bubble = computed(() => runtime.value?.bubble ?? "");

// 链上态:从 store.nodeChainState 读(reactive 对象,避开 node.data 的 markRaw 响应坑)
const chainState = computed(() => store.nodeChainState[props.id]);
const hasChain = computed(() => !!(chainState.value && (chainState.value.addr || chainState.value.balance || chainState.value.earnedInj)));
const shortAddress = computed(() => shortAddr(chainState.value?.addr ?? null, 6, 4));
// balance 存的可读字符串就直接用;若写入方误传最小单位,用 baseUnitsToInj 兜底格式化
const balanceInj = computed(() => {
  const b = chainState.value?.balance;
  if (b == null || b === "") return "0";
  // 含小数点或纯短数字视为已格式化;超长整数串视为最小单位
  return b.includes(".") || b.length <= 18 ? b : baseUnitsToInj(b);
});
const earnedInj = computed(() => {
  const e = chainState.value?.earnedInj;
  if (e == null || e === "") return "0";
  return e.includes(".") || e.length <= 18 ? e : baseUnitsToInj(e);
});

// 动作映射:idle→Idle, active/entrancing→Speaking, breakthrough→Supported
const action = computed<Action>(() => {
  if (status.value === "active" || status.value === "entrancing") return "Speaking";
  if (status.value === "breakthrough") return "Supported";
  return "Idle";
});

// 是否有定制内容(显示角标用)。props.data 被 markRaw,直接读字段不会触发响应,
// 故用一个本地 bump 计数器,在 select/input 改动时递增以强制 computed 重算。
const customBump = ref(0);
const hasCustom = computed(() => {
  void customBump.value;
  return !!(props.data.customTaskType || (props.data.customSkill && props.data.customSkill.trim()));
});

// 内联展开态(本地)
const expanded = ref(false);

// 切换舰种
function cycleRole() {
  const roles: Role[] = ["orchestrator", "planner", "coder", "reviewer", "explorer"];
  const i = roles.indexOf(props.data.role as Role);
  store.setNodeRole(props.id, roles[(i + 1) % roles.length]);
  // setNodeRole 仅触发响应,实际 role 回写在 PlaygroundView;这里直接改 data
  (props.data as PetNodeData).role = roles[(i + 1) % roles.length];
  customBump.value++;
}

// 定制面板:角色下拉直接改 data.role
function selectRole(r: string) {
  (props.data as PetNodeData).role = r;
  customBump.value++;
}
function selectTask(t: string) {
  (props.data as PetNodeData).customTaskType = t || undefined;
  customBump.value++;
}
function onSkillInput(e: Event) {
  const v = (e.target as HTMLTextAreaElement).value;
  (props.data as PetNodeData).customSkill = v || undefined;
  customBump.value++;
}

// 设为突破源
function toggleBreakthroughSource() {
  store.toggleBreakthroughSource(props.id);
}
const isBtSource = computed(() => store.breakthroughSources.has(props.id));

// 点击卡片:触发登场动画 + 展开/收起定制面板
let downX = 0, downY = 0, dragged = false;
function onCardMouseDown(e: MouseEvent) {
  downX = e.clientX; downY = e.clientY; dragged = false;
}
function onCardClick() {
  if (dragged) return; // 拖动过就不算点击
  // 触发登场动画(由 PlaygroundView 处理语音/闪光)
  emit("click-node", props.id);
  expanded.value = !expanded.value;
}
function onCardMouseMove(e: MouseEvent) {
  if (Math.abs(e.clientX - downX) > 4 || Math.abs(e.clientY - downY) > 4) dragged = true;
}
</script>

<template>
  <div
    class="pet-node"
    data-testid="pet-node"
    :data-role="data.role"
    :data-node-label="displayName"
    :class="[status, { 'bt-source': isBtSource, expanded }]"
    :style="{ '--tint': meta?.tint }"
    @click="onCardClick"
    @mousedown="onCardMouseDown"
    @mousemove="onCardMouseMove"
  >
    <Handle type="target" :position="Position.Left" />
    <div v-if="hasCustom" class="custom-badge" :title="t('petnode.k9')">✏️</div>
    <div class="sprite-box">
      <PetSprite :sprite="meta?.sprite || 'PetClawd'" :action="action" />
    </div>
    <div class="bar">
      <span class="role-ic" :style="{ color: roleInfo.color }">{{ roleInfo.icon }}</span>
      <span class="name">{{ displayName }}</span>
      <span class="role-name">{{ roleInfo.name }}</span>
    </div>
    <div v-if="instanceTail" class="instance-id">{{ instanceTail }}</div>

    <!-- 链上信息:地址 + INJ 余额 + 本次赚多少(无数据时优雅降级,不渲染) -->
    <div v-if="hasChain" class="onchain-bar" :title="`地址: ${chainState?.addr || '—'}\n余额: ${balanceInj} INJ\n本次: +${earnedInj} INJ`">
      <span class="oc-addr">🔗 {{ shortAddress }}</span>
      <span class="oc-bal">{{ balanceInj }} INJ</span>
      <span v-if="chainState?.earnedInj" class="oc-earned">+{{ earnedInj }}</span>
    </div>

    <!-- 操作按钮(悬停显示) -->
    <div class="node-actions">
      <button class="nbtn" :title="t('petnode.k10')" @click.stop="cycleRole">{{ t('petnode.k1') }}</button>
      <button class="nbtn" :class="{ on: isBtSource }" :title="t('petnode.k11')" @click.stop="toggleBreakthroughSource">{{ t('petnode.k2') }}</button>
    </div>

    <!-- 内联定制面板(点击卡片展开) -->
    <div v-if="expanded" class="customize" @click.stop @mousedown.stop>
      <div class="cz-head">
        <span>{{ t('petnode.k3') }}</span>
        <button class="cz-close" :title="t('petnode.k12')" @click.stop="expanded = false">✕</button>
      </div>
      <div class="cz-field">
        <label>{{ t('petnode.k4') }}</label>
        <select class="cz-select" :value="data.role" @change="selectRole(($event.target as HTMLSelectElement).value)">
          <option v-for="r in (['orchestrator','planner','coder','reviewer','explorer'] as Role[])" :key="r" :value="r">
            {{ ROLE_INFO[r].icon }} {{ ROLE_INFO[r].name }}
          </option>
        </select>
      </div>
      <div class="cz-field">
        <label>{{ t('petnode.k5') }}</label>
        <select class="cz-select" :value="data.customTaskType || ''" @change="selectTask(($event.target as HTMLSelectElement).value)">
          <option value="">{{ t('petnode.k6') }}</option>
          <option v-for="t in TASK_TYPES" :key="t.key" :value="t.key">
            {{ t.icon }} {{ t.name }} · {{ t.duty }}
          </option>
        </select>
      </div>
      <div class="cz-field">
        <label>{{ t('petnode.k7') }}</label>
        <textarea
          class="cz-textarea"
          rows="2"
          :placeholder="t('petnode.k13')"
          :value="data.customSkill || ''"
          @input="onSkillInput"
        ></textarea>
      </div>
      <div v-if="hasCustom" class="cz-hint">{{ t('petnode.k8') }}</div>
    </div>

    <!-- 对话气泡 -->
    <Transition name="bubble">
      <div v-if="bubble" class="bubble">
        <span class="tail"></span>
        {{ bubble }}
      </div>
    </Transition>

    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<style scoped>
.pet-node {
  width: 132px;
  background: rgba(8, 11, 26, 0.88);
  border: 2px solid var(--tint, var(--panel-line));
  border-radius: 14px;
  padding: 8px 8px 6px;
  position: relative;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5);
  transition: box-shadow 0.25s, transform 0.25s;
}
.pet-node.active {
  box-shadow: 0 0 26px var(--tint), 0 0 50px rgba(58, 224, 255, 0.3);
  transform: translateY(-2px);
}
/* 登场:iOS 式闪光 + 轻微弹跳 */
.pet-node.entrancing {
  animation: entrance 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 0 40px var(--tint), 0 0 80px rgba(255, 255, 255, 0.5);
}
@keyframes entrance {
  0% { transform: scale(0.3) rotate(-8deg); opacity: 0; box-shadow: 0 0 0 var(--tint); }
  50% { transform: scale(1.15) rotate(4deg); opacity: 1; box-shadow: 0 0 60px #fff; }
  100% { transform: scale(1) rotate(0); opacity: 1; box-shadow: 0 0 40px var(--tint); }
}
.pet-node.breakthrough {
  box-shadow: 0 0 32px #ffb84d, 0 0 60px rgba(255, 184, 77, 0.45);
  animation: btPulse 0.7s ease infinite alternate;
}
@keyframes btPulse {
  to { transform: translateY(-2px) scale(1.03); }
}
.pet-node.bt-source {
  border-color: #ffb84d;
  border-style: dashed;
}
.pet-node.bt-source::after {
  content: "⚡源";
  position: absolute;
  top: -10px;
  right: -10px;
  font-size: 11px;
  background: #ffb84d;
  color: #04050d;
  padding: 2px 6px;
  border-radius: 8px;
  font-weight: 700;
}
.sprite-box {
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bar {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  padding: 4px 2px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.bar .role-ic { font-size: 13px; }
.bar .name { font-weight: 700; color: #fff; }
.bar .role-name { color: var(--dim); font-size: 10px; margin-left: auto; }
.instance-id {
  margin-top: 3px;
  color: var(--dim);
  font-size: 9px;
  line-height: 1;
  text-align: center;
}

/* 链上信息条:地址 + 余额 + 本次赚 */
.onchain-bar {
  margin-top: 4px;
  padding: 3px 5px;
  background: linear-gradient(90deg, rgba(255, 210, 63, 0.1), rgba(58, 224, 255, 0.08));
  border: 1px solid rgba(255, 210, 63, 0.28);
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: ui-monospace, monospace;
  font-size: 9px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
}
.onchain-bar .oc-addr {
  color: #ffd23f;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
}
.onchain-bar .oc-bal {
  color: #3ae0ff;
  flex: 0 0 auto;
}
.onchain-bar .oc-earned {
  color: #3dffb0;
  font-weight: 700;
  flex: 0 0 auto;
}

.node-actions {
  display: flex;
  gap: 5px;
  margin-top: 5px;
  opacity: 0;
  transition: opacity 0.2s;
}
.pet-node:hover .node-actions { opacity: 1; }
.nbtn {
  flex: 1;
  font-size: 10px;
  padding: 3px 0;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--panel-line);
  color: var(--muted);
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
}
.nbtn:hover { border-color: var(--tint); color: #fff; }
.nbtn.on { background: rgba(255, 184, 77, 0.2); border-color: #ffb84d; color: #ffb84d; }

/* 对话气泡 */
.bubble {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%);
  background: #fff;
  color: #04050d;
  font-size: 12px;
  font-weight: 600;
  padding: 7px 12px;
  border-radius: 12px;
  white-space: nowrap;
  max-width: 200px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
  z-index: 5;
}
.bubble .tail {
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid #fff;
}
.bubble-enter-active, .bubble-leave-active { transition: all 0.25s ease; }
.bubble-enter-from, .bubble-leave-to { opacity: 0; transform: translateX(-50%) translateY(6px); }

/* 已定制角标 */
.custom-badge {
  position: absolute;
  top: -8px;
  left: -8px;
  font-size: 13px;
  background: rgba(137, 91, 255, 0.95);
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  z-index: 4;
}

/* 内联定制面板 */
.pet-node.expanded {
  width: 200px;
  z-index: 20;
}
.customize {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed rgba(137, 91, 255, 0.4);
}
.cz-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  color: #b89aff;
  margin-bottom: 8px;
}
.cz-close {
  background: none;
  border: none;
  color: var(--dim);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}
.cz-close:hover { color: #fff; }
.cz-field {
  margin-bottom: 7px;
}
.cz-field label {
  display: block;
  font-size: 10px;
  color: var(--dim);
  margin-bottom: 3px;
  letter-spacing: 0.3px;
}
.cz-select, .cz-textarea {
  width: 100%;
  font-size: 11px;
  font-family: inherit;
  background: rgba(8, 11, 26, 0.9);
  border: 1px solid rgba(137, 91, 255, 0.3);
  color: #e8e8f0;
  border-radius: 5px;
  padding: 4px 6px;
  box-sizing: border-box;
}
.cz-select:focus, .cz-textarea:focus {
  outline: none;
  border-color: rgba(137, 91, 255, 0.7);
}
.cz-textarea {
  resize: vertical;
  min-height: 32px;
  line-height: 1.4;
}
.cz-select option {
  background: #0a0e22;
  color: #e8e8f0;
}
.cz-hint {
  font-size: 10px;
  color: rgba(61, 255, 176, 0.8);
  margin-top: 2px;
}
</style>
