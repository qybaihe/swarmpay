<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { PETS, ROLE_INFO } from "../../constants/pets";
import PetSprite from "./PetSprite.vue";
const { t } = useI18n();

defineProps<{ compact?: boolean }>();

// 拖拽开始:把 petId 塞进 dataTransfer,PlaygroundView 的 drop 读取
function onDragStart(e: DragEvent, petId: string) {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData("application/pet", petId);
  e.dataTransfer.effectAllowed = "move";
}
</script>

<template>
  <aside class="sidebar" :class="{ compact }">
    <div class="side-head">
      <div class="side-title">{{ t('sidebar.k1') }}</div>
      <div class="side-hint">{{ t('sidebar.k2') }}</div>
    </div>
    <div class="pet-list">
      <div
        v-for="p in PETS"
        :key="p.id"
        class="pet-chip"
        :style="{ '--tint': p.tint }"
        :title="`${p.name} · ${ROLE_INFO[p.role].name}`"
        draggable="true"
        @dragstart="onDragStart($event, p.id)"
      >
        <div class="chip-sprite"><PetSprite :sprite="p.sprite" action="Idle" /></div>
        <div class="chip-meta">
          <div class="chip-name">{{ p.name }}</div>
          <div class="chip-role">
            <span :style="{ color: ROLE_INFO[p.role].color }">{{ ROLE_INFO[p.role].icon }}</span>
            {{ ROLE_INFO[p.role].name }}
          </div>
        </div>
      </div>
    </div>

    <div class="side-tips">
      <div class="tip-title">{{ t('sidebar.k3') }}</div>
      <ol>
        <li>{{ t('sidebar.k4') }}</li>
        <li>{{ t('sidebar.k5') }} <b>{{ t('sidebar.k6') }}</b>{{ t('sidebar.k7') }}</li>
        <li>{{ t('sidebar.k8') }} <b>{{ t('sidebar.k9') }}</b>{{ t('sidebar.k10') }} <b>{{ t('sidebar.k11') }}</b></li>
        <li>{{ t('sidebar.k12') }}</li>
      </ol>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 230px;
  flex-shrink: 0;
  background: rgba(8, 11, 26, 0.85);
  border-right: 1px solid var(--panel-line);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  transition: width 0.22s ease;
}
.side-head {
  padding: 18px 16px 12px;
  border-bottom: 1px solid var(--panel-line);
}
.side-title { font-size: 15px; font-weight: 800; color: #fff; }
.side-hint { font-size: 11px; color: var(--dim); margin-top: 3px; }

.pet-list {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.pet-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--panel-line);
  border-radius: 10px;
  cursor: grab;
  transition: 0.2s;
}
.pet-chip:hover {
  border-color: var(--tint);
  background: rgba(255, 255, 255, 0.06);
  transform: translateX(2px);
}
.pet-chip:active { cursor: grabbing; }
.chip-sprite {
  width: 40px;
  height: 44px;
  flex-shrink: 0;
}
.chip-name { font-size: 13px; font-weight: 700; color: #fff; }
.chip-role { font-size: 11px; color: var(--dim); }

.side-tips {
  margin-top: auto;
  padding: 16px;
  border-top: 1px solid var(--panel-line);
  font-size: 12px;
  color: var(--muted);
}
.tip-title { font-weight: 700; color: var(--cyan); margin-bottom: 8px; }
.side-tips ol { padding-left: 18px; line-height: 1.7; }
.side-tips b { color: #fff; }

.sidebar.compact {
  width: 72px;
  overflow-x: hidden;
}
.sidebar.compact .side-head {
  padding: 12px 8px;
  text-align: center;
}
.sidebar.compact .side-title {
  font-size: 0;
}
.sidebar.compact .side-title::after {
  content: "🐾";
  font-size: 18px;
}
.sidebar.compact .side-hint,
.sidebar.compact .chip-meta,
.sidebar.compact .side-tips {
  display: none;
}
.sidebar.compact .pet-list {
  align-items: center;
  gap: 7px;
  padding: 8px;
}
.sidebar.compact .pet-chip {
  width: 48px;
  height: 50px;
  justify-content: center;
  gap: 0;
  padding: 3px;
  border-radius: 8px;
}
.sidebar.compact .pet-chip:hover {
  transform: none;
}
.sidebar.compact .chip-sprite {
  width: 38px;
  height: 42px;
}
</style>
