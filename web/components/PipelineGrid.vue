<script setup lang="ts">
import SectionHeader from "./SectionHeader.vue";
</script>

<template>
  <section class="flat-section" id="pipeline">
    <div class="flat-inner">
      <SectionHeader
        eyebrow="进化协作"
        title="进化模式协作拓扑"
        sub="复杂目标进入进化协作模式后,旗舰会先从 EvoMap 继承同类经验,再拆解成多条任务航线并行推进。每条航线由规划蜂、工程蜂、审查蜂形成闭环,审查不通过就带反馈返工;任一关键突破会即时广播全队,最终由旗舰聚合最优结果,并把成功配方回流 EvoMap。"
      />

      <figure class="topology-figure" aria-label="进化模式协作拓扑图">
        <picture>
          <source srcset="/assets/evo-mode-topology.webp" type="image/webp" />
          <img
            src="/assets/evo-mode-topology.png"
            alt="进化模式协作拓扑: EvoMap 经验网络向旗舰编排提供继承经验,旗舰拆解目标并分发多条任务航线,规划蜂、工程蜂、审查蜂闭环推进,突破广播同步全队,旗舰聚合最终答案并回流成功配方。"
            loading="lazy"
            decoding="async"
          />
        </picture>
      </figure>
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
    radial-gradient(ellipse 52% 42% at 22% 4%, rgba(139, 92, 255, 0.12), transparent 62%),
    radial-gradient(ellipse 56% 44% at 78% 96%, rgba(58, 224, 255, 0.11), transparent 64%);
}
.flat-inner {
  position: relative;
  z-index: 1;
  max-width: 1240px;
  margin: 0 auto;
}
.topology-figure {
  position: relative;
  margin: 42px auto 0;
  padding: 14px;
  border: 1px solid rgba(58, 224, 255, 0.24);
  background:
    linear-gradient(180deg, rgba(58, 224, 255, 0.08), rgba(61, 255, 176, 0.03)),
    rgba(4, 7, 18, 0.86);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.03) inset,
    0 24px 90px rgba(0, 0, 0, 0.42),
    0 0 62px rgba(58, 224, 255, 0.08);
  overflow: hidden;
}
.topology-figure img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: #050814;
}

@media (max-width: 760px) {
  .flat-section {
    padding: 80px 6vw;
  }
  .topology-figure {
    margin-top: 30px;
    padding: 8px;
  }
}
</style>
