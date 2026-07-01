<script setup lang="ts">
import { useI18n } from "vue-i18n";
import SectionHeader from "./SectionHeader.vue";
import ShipIcon from "./ShipIcon.vue";
const { t } = useI18n();

const roles = [
  { key: "orchestrator", ship: "flagship", name: "rostersection.r_orch",
    focus: "rostersection.r_orch_focus",
    archetype: "orchestrator", temp: "0.3", reward: "0.15", handoff: "rostersection.r_wallet_split" },
  { key: "planner", ship: "navigator", name: "rostersection.r_plan",
    focus: "rostersection.r_plan_focus",
    archetype: "planner", temp: "0.4", reward: "0.20", handoff: "rostersection.r_wallet_split" },
  { key: "coder", ship: "engineer", name: "rostersection.r_code",
    focus: "rostersection.r_code_focus",
    archetype: "coder", temp: "0.6", reward: "0.30", handoff: "rostersection.r_wallet_bounty" },
  { key: "reviewer", ship: "auditor", name: "rostersection.r_rev",
    focus: "rostersection.r_rev_focus",
    archetype: "reviewer", temp: "0.7", reward: "0.20", handoff: "rostersection.r_wallet_send" },
  { key: "explorer", ship: "scout", name: "rostersection.r_exp",
    focus: "rostersection.r_exp_focus",
    archetype: "explorer", temp: "0.9", reward: "0.15", handoff: "rostersection.r_wallet_split" },
];
</script>

<template>
  <section class="flat-section" id="roster">
    <div class="flat-inner">
      <SectionHeader eyebrow="ON-CHAIN ROLES" :title="t('rostersection.k3')"
        :sub="t('rostersection.sub')" />
      <div class="roster">
        <div class="role" :class="'r-' + r.key" v-for="r in roles" :key="r.key">
          <div class="ric"><ShipIcon :ship="r.ship" /></div>
          <h4>{{ t(r.name) }}</h4>
          <div class="focus" v-html="t(r.focus)"></div>
          <div class="attrs">
            <span>archetype: <b>{{ r.archetype }}</b></span>
            <span>{{ t('rostersection.k1') }} <b>{{ r.temp }}</b>{{ t('rostersection.k2') }} <b>{{ r.reward }}</b></span>
            <span><b>{{ t(r.handoff) }}</b></span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.flat-section {
  padding: 120px 6vw;
  background: var(--bg);
  position: relative;
}
.flat-section::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 50% 40% at 20% 0%, rgba(139, 92, 255, 0.12), transparent 60%),
    radial-gradient(ellipse 50% 40% at 80% 100%, rgba(58, 224, 255, 0.1), transparent 60%);
}
.flat-inner {
  position: relative;
  z-index: 1;
  max-width: 1280px;
  margin: 0 auto;
}
.roster {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 18px;
}
.role {
  padding: 26px 22px;
  background: rgba(8, 11, 26, 0.5);
  border: 1px solid var(--panel-line);
  transition: 0.25s;
}
.role:hover {
  transform: translateY(-4px);
  background: rgba(8, 11, 26, 0.7);
}
.role .ric {
  width: 48px;
  height: 48px;
  font-size: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}
.role h4 {
  font-size: 17px;
  margin-bottom: 4px;
}
.role .focus {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
  margin-bottom: 14px;
  min-height: 58px;
}
.role .attrs {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 11px;
  color: var(--dim);
}
.role .attrs b {
  color: var(--text);
  font-weight: 600;
}
.r-orchestrator { border-color: rgba(255, 184, 77, 0.35); }
.r-orchestrator .ric { color: var(--amber); }
.r-planner { border-color: rgba(92, 168, 255, 0.35); }
.r-planner .ric { color: var(--blue); }
.r-coder { border-color: rgba(58, 224, 255, 0.35); }
.r-coder .ric { color: var(--cyan); }
.r-reviewer { border-color: rgba(139, 92, 255, 0.35); }
.r-reviewer .ric { color: var(--violet); }
.r-explorer { border-color: rgba(255, 92, 200, 0.35); }
.r-explorer .ric { color: var(--pink); }
@media (max-width: 760px) {
  .flat-section { padding: 80px 6vw; }
}
</style>
