<script setup lang="ts">
import SectionHeader from "./SectionHeader.vue";

const tiers = [
  { tag: "BASELINE", title: "信标基线", code: "swarm-baseline",
    desc: "单舰直通基线,作为编队的对照组。", featured: false },
  { tag: "LITE", title: "巡逻编队", code: "swarm-lite",
    desc: "少量舰并行解题 + 轻量聚合。速度快,适合中等任务。", featured: false },
  { tag: "★ HEAVY · 推荐", title: "突击编队", code: "swarm-heavy",
    desc: "异构编队分工 + 旗舰聚合 + 突破广播 + 返工纠错。", featured: true },
  { tag: "★ EVO · 独家", title: "进化旗舰", code: "swarm-evo",
    desc: "联合 EvoMap 自进化网络:继承同类经验、成功航线回流沉淀,越用越进化。独家能力。", featured: true },
];

const clients = ["Cursor", "Cline", "Aider", "LangChain", "Continue", "OpenAI SDK"];
</script>

<template>
  <section class="flat-section" id="tiers">
    <div class="flat-inner">
      <SectionHeader eyebrow="FLEET CLASSES" title="四级舰队型号"
        sub="客户端选哪个 model,就走哪条编队路径。推荐 swarm-evo 接入 EvoMap 经验网络。" />
      <div class="tier-grid">
        <div class="tier" :class="{ featured: t.featured }" v-for="t in tiers" :key="t.code">
          <div class="tag">{{ t.tag }}</div>
          <h3>{{ t.title }}</h3>
          <code>{{ t.code }}</code>
          <p>{{ t.desc }}</p>
        </div>
      </div>
      <div class="clients">
        <span class="client" v-for="c in clients" :key="c">{{ c }}</span>
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
.tier-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 20px;
}
.tier {
  padding: 28px 24px;
  background: rgba(8, 11, 26, 0.5);
  border: 1px solid var(--panel-line);
  transition: 0.25s;
}
.tier:hover {
  transform: translateY(-4px);
  border-color: rgba(58, 224, 255, 0.4);
}
.tier.featured {
  border-color: rgba(139, 92, 255, 0.5);
  background: linear-gradient(160deg, rgba(139, 92, 255, 0.12), rgba(8, 11, 26, 0.5));
}
.tier .tag {
  font-size: 11px;
  font-weight: 700;
  color: var(--cyan);
  letter-spacing: 1.2px;
  margin-bottom: 10px;
}
.tier.featured .tag { color: var(--violet); }
.tier h3 {
  font-size: 22px;
  margin-bottom: 8px;
}
.tier code {
  display: inline-block;
  background: rgba(58, 224, 255, 0.1);
  color: var(--cyan);
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 13px;
  margin-bottom: 14px;
}
.tier p {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}
.clients {
  display: flex;
  gap: 14px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 36px;
}
.client {
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--panel-line);
  color: var(--muted);
  font-size: 14px;
  font-weight: 600;
  transition: 0.2s;
}
.client:hover {
  color: var(--cyan);
  border-color: rgba(58, 224, 255, 0.3);
}
@media (max-width: 760px) {
  .flat-section { padding: 80px 6vw; }
}
</style>
