<script setup lang="ts">
import { useRouter, RouterLink } from "vue-router";
import { nextTick } from "vue";

const router = useRouter();

// 锚点导航:非首页时先回首页再滚到对应 section,避免子页点击卡死
async function goSection(hash: string) {
  if (router.currentRoute.value.path !== "/") {
    await router.push("/");
    await nextTick();
  }
  document.querySelector(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<template>
  <footer class="site-footer">
    <div class="footer-inner">
      <!-- 品牌区 -->
      <div class="col col-brand">
        <span class="logo">
          <span class="mark"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2 19 20 12 16 5 20z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="11" r="1.7" fill="currentColor"/></svg></span>
          <b>SwarmPay</b>
        </span>
        <p class="tagline">Injective 上的自进蜂群 × 链上分润 Agent 经济体</p>
        <p class="powered">
          <span class="pw-label">链上分润结算基于</span>
          <a href="https://injective.com" target="_blank" rel="noopener" class="pw-link">
            <span class="pw-logo">Injective</span>
          </a>
          <span>构建</span>
        </p>
      </div>

      <!-- 导航区 -->
      <div class="col">
        <h4>导航</h4>
        <a href="#pipeline" @click.prevent="goSection('#pipeline')">链上协作流</a>
        <RouterLink to="/endpoints">端点</RouterLink>
        <a href="#roster" @click.prevent="goSection('#roster')">Agent 角色</a>
        <a href="#tiers" @click.prevent="goSection('#tiers')">结算模式</a>
      </div>

      <!-- 玩法区 -->
      <div class="col">
        <h4>玩法</h4>
        <router-link to="/playground">Playground</router-link>
        <router-link to="/chat">对话测试</router-link>
        <router-link to="/community">Agent 社区</router-link>
        <router-link to="/docs">使用文档</router-link>
      </div>

      <!-- 联系区 -->
      <div class="col col-contact">
        <h4>联系</h4>
        <a href="mailto:support@swarmpay.me" class="contact-item">
          <span class="ci-icon">✉️</span>
          <span class="ci-text">
            <span class="ci-label">支持页面</span>
            <span class="ci-value">support@swarmpay.me</span>
          </span>
        </a>
        <a href="https://business.swarmpay.me" target="_blank" rel="noopener" class="contact-item">
          <span class="ci-icon">🤝</span>
          <span class="ci-text">
            <span class="ci-label">商务联系</span>
            <span class="ci-value">business.swarmpay.me</span>
          </span>
        </a>
      </div>
    </div>

    <!-- 版权底栏 -->
    <div class="footer-bottom">
      <span class="copyright">© 2026 @SwarmPay · 自进蜂群 × 链上分润</span>
      <span class="built-with">
        链上分润结算基于
        <a href="https://injective.com" target="_blank" rel="noopener" class="bw-link">
          <span class="bw-logo">Injective</span>
        </a>
        构建
      </span>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  position: relative;
  z-index: 2;
  background: linear-gradient(180deg, rgba(8, 11, 26, 0.6) 0%, rgba(4, 5, 13, 0.92) 100%);
  border-top: 1px solid var(--panel-line);
  padding: 48px 6vw 0;
  color: var(--dim);
}

.footer-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1.6fr 1fr 1fr 1.4fr;
  gap: 40px;
  padding-bottom: 36px;
}

/* 品牌区 */
.col-brand .logo {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  margin-bottom: 14px;
}
.col-brand .logo b { font-size: 20px; font-weight: 800; letter-spacing: 0.3px; }
.mark { width: 28px; height: 28px; color: var(--cyan); display: inline-flex; }
.mark svg { width: 100%; height: 100%; filter: drop-shadow(0 0 6px rgba(58, 224, 255, 0.4)); }
.tagline {
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 16px;
  line-height: 1.6;
}
.powered {
  font-size: 12px;
  color: var(--dim);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.pw-label { color: var(--dim); }
.pw-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(137, 91, 255, 0.1);
  border: 1px solid rgba(137, 91, 255, 0.25);
  transition: 0.2s;
}
.pw-link:hover {
  background: rgba(137, 91, 255, 0.2);
  border-color: rgba(137, 91, 255, 0.5);
}
.pw-logo {
  height: 22px;
  width: auto;
  display: block;
}

/* 各列 */
.col h4 {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  margin: 0 0 14px;
}
.col a {
  display: block;
  font-size: 13px;
  color: var(--muted);
  text-decoration: none;
  padding: 5px 0;
  transition: 0.18s;
}
.col a:hover {
  color: var(--cyan);
  transform: translateX(2px);
}

/* 联系区 */
.col-contact .contact-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}
.col-contact .contact-item:hover { transform: none; }
.ci-icon {
  font-size: 18px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(58, 224, 255, 0.08);
  border: 1px solid rgba(58, 224, 255, 0.2);
  border-radius: 8px;
  flex-shrink: 0;
}
.ci-text { display: flex; flex-direction: column; gap: 1px; }
.ci-label { font-size: 10px; color: var(--dim); letter-spacing: 0.3px; }
.ci-value { font-size: 13px; color: var(--cyan); font-weight: 600; }
.col-contact .contact-item:hover .ci-value { color: #fff; }

/* 版权底栏 */
.footer-bottom {
  max-width: 1100px;
  margin: 0 auto;
  padding: 18px 0 26px;
  border-top: 1px solid var(--panel-line);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.copyright {
  font-size: 12px;
  color: var(--dim);
  letter-spacing: 0.3px;
}
.built-with {
  font-size: 11px;
  color: var(--dim);
  opacity: 0.85;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.bw-link { display: inline-flex; align-items: center; }
.bw-logo {
  height: 14px;
  width: auto;
  display: block;
  opacity: 0.7;
  transition: 0.2s;
}
.bw-link:hover .bw-logo { opacity: 1; }

@media (max-width: 760px) {
  .footer-inner {
    grid-template-columns: 1fr 1fr;
    gap: 28px;
  }
  .col-brand { grid-column: 1 / -1; }
  .footer-bottom { justify-content: center; text-align: center; }
}
</style>
