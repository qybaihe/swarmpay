<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { fetchStatus, type StatusInfo } from "../api/status";
import { useAuthStore } from "../stores/auth";

const scrolled = ref(false);
const status = ref<StatusInfo | null>(null);
const auth = useAuthStore();
const router = useRouter();
const userMenuOpen = ref(false);
let statusTimer = 0;

function onScroll() {
  scrolled.value = window.scrollY > 60;
}

async function loadStatus() {
  try {
    status.value = await fetchStatus();
  } catch {
    status.value = { backend: "—", endpointsRegistered: null, online: false };
  }
}

onMounted(() => {
  window.addEventListener("scroll", onScroll, { passive: true });
  loadStatus();
  auth.ensureLoaded().catch(() => { /* ignore */ });
  statusTimer = window.setInterval(loadStatus, 30000);
});
onUnmounted(() => {
  window.removeEventListener("scroll", onScroll);
  if (statusTimer) window.clearInterval(statusTimer);
});

const statusText = () => {
  if (!status.value) return "检测中…";
  if (!status.value.online) return "后端未连接(演示模式)";
  const ep = status.value.endpointsRegistered;
  return ep !== null
    ? `在线 · ${status.value.backend} · ${ep} 端点已注册`
    : `在线 · ${status.value.backend}`;
};

async function logout() {
  await auth.logout();
  router.push("/");
}

// 锚点导航:非首页时先回首页再滚到对应 section。
async function goSection(hash: string) {
  if (router.currentRoute.value.path !== "/") {
    await router.push("/");
    await nextTick();
  }
  const el = document.querySelector(hash);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<template>
  <header class="nav" :class="{ scrolled }">
    <div class="nav-in">
      <RouterLink to="/" class="logo">
        <span class="mark"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2 19 20 12 16 5 20z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="11" r="1.7" fill="currentColor"/></svg></span>
        <b>EvoShip</b>
      </RouterLink>
      <div class="nav-mid">
        <nav class="nav-links">
          <RouterLink to="/endpoints">端点</RouterLink>
          <a href="#pipeline" @click.prevent="goSection('#pipeline')">原理</a>
          <a href="#roster" @click.prevent="goSection('#roster')">舰队</a>
          <a href="#tiers" @click.prevent="goSection('#tiers')">型号</a>
          <RouterLink to="/community">社区</RouterLink>
          <RouterLink to="/docs">文档</RouterLink>
          <RouterLink v-if="auth.isAuthed" to="/my-fleets">我的舰队</RouterLink>
        </nav>
        <span class="status-badge" :class="{ off: status && !status.online }">
          <span class="dot"></span><span>{{ statusText() }}</span>
        </span>
      </div>
      <div class="nav-cta-group">
        <RouterLink to="/playground" class="nav-cta playground-link">🎮 Playground</RouterLink>
        <template v-if="auth.isAuthed">
          <div class="user-menu" @click="userMenuOpen = !userMenuOpen">
            <div class="user-avatar">{{ (auth.user?.name || auth.user?.email || "?").charAt(0).toUpperCase() }}</div>
            <div class="user-info">
              <div class="user-name">{{ auth.user?.name || auth.user?.email }}</div>
              <div class="user-credits" :class="{ low: (auth.user?.credits ?? 0) < 100 }">🪙 {{ auth.user?.credits ?? 0 }}</div>
            </div>
            <Transition name="dropdown">
              <div v-if="userMenuOpen" class="user-dropdown" @click.stop>
                <div class="dd-header">
                  <div class="dd-avatar">{{ (auth.user?.name || "?").charAt(0).toUpperCase() }}</div>
                  <div>
                    <div class="dd-name">{{ auth.user?.name }}</div>
                    <div class="dd-email">{{ auth.user?.email }}</div>
                  </div>
                </div>
                <RouterLink to="/credits" class="dd-item" @click="userMenuOpen = false">
                  <span class="dd-icon">🪙</span><span class="dd-text">积分管理</span><span class="dd-val">{{ auth.user?.credits ?? 0 }}</span>
                </RouterLink>
                <RouterLink to="/pricing" class="dd-item" @click="userMenuOpen = false">
                  <span class="dd-icon">↑</span><span class="dd-text">升级我的套餐</span>
                </RouterLink>
                <RouterLink to="/api-keys" class="dd-item" @click="userMenuOpen = false">
                  <span class="dd-icon">🔑</span><span class="dd-text">API Key 管理</span>
                </RouterLink>
                <RouterLink to="/my-fleets" class="dd-item" @click="userMenuOpen = false">
                  <span class="dd-icon">📂</span><span class="dd-text">我的舰队</span>
                </RouterLink>
                <RouterLink to="/community" class="dd-item" @click="userMenuOpen = false">
                  <span class="dd-icon">🌐</span><span class="dd-text">舰队社区</span>
                </RouterLink>
                <button class="dd-item dd-logout" type="button" @click="logout">
                  <span class="dd-icon">🚪</span><span class="dd-text">退出登录</span>
                </button>
              </div>
            </Transition>
          </div>
        </template>
        <RouterLink v-else to="/login" class="nav-cta">登录</RouterLink>
      </div>
    </div>
  </header>
</template>

<style scoped>
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  transition: background 0.3s, backdrop-filter 0.3s, border-color 0.3s;
}
.nav.scrolled {
  background: rgba(4, 5, 13, 0.82);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--panel-line);
}
.nav-in {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 6vw;
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.nav-mid {
  display: flex;
  align-items: center;
  gap: 30px;
}
.nav-links {
  display: flex;
  gap: 34px;
}
.nav-links a {
  color: var(--muted);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: 0.2s;
}
.nav-links a:hover {
  color: #fff;
}
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(61, 255, 176, 0.08);
  border: 1px solid rgba(61, 255, 176, 0.25);
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
.status-badge .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 8px var(--green);
  animation: pulse 1.6s ease infinite;
}
.status-badge.off {
  background: rgba(255, 92, 122, 0.08);
  border-color: rgba(255, 92, 122, 0.25);
}
.status-badge.off .dot {
  background: var(--red);
  box-shadow: 0 0 8px var(--red);
}
.nav-cta {
  padding: 8px 20px;
  border-radius: 0;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
  border: 1px solid rgba(255, 255, 255, 0.3);
  transition: 0.2s;
  letter-spacing: 0.5px;
}
.nav-cta-group {
  display: flex;
  gap: 10px;
}
.nav-cta.playground-link {
  border-color: rgba(58, 224, 255, 0.5);
  color: var(--cyan);
}
.nav-cta.playground-link:hover {
  background: rgba(58, 224, 255, 0.12);
  border-color: var(--cyan);
}
.nav-cta:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #fff;
}
.logout-btn {
  background: transparent;
  font-family: inherit;
  cursor: pointer;
}
.user-pill {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 8px 12px;
  border: 1px solid rgba(61, 255, 176, 0.26);
  color: var(--green);
  font-size: 13px;
  font-weight: 700;
  background: rgba(61, 255, 176, 0.08);
}
@media (max-width: 760px) {
  .nav-links {
    display: none;
  }
  .nav-mid {
    gap: 14px;
  }
}

/* 用户菜单下拉 */
.user-menu { position: relative; display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 10px 4px 4px; border-radius: 999px; background: rgba(137,91,255,0.1); border: 1px solid rgba(137,91,255,0.3); transition: 0.18s; }
.user-menu:hover { background: rgba(137,91,255,0.18); border-color: rgba(137,91,255,0.5); }
.user-avatar { width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg,#895bff,#3ae0ff); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; color: #fff; flex-shrink: 0; }
.user-info { display: flex; flex-direction: column; gap: 1px; line-height: 1.2; }
.user-name { font-size: 12px; color: #e8e8f0; font-weight: 600; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.user-credits { font-size: 11px; color: #ffd23f; font-weight: 700; font-family: ui-monospace, monospace; }
.user-credits.low { color: #ff7a96; }
.user-dropdown { position: absolute; top: calc(100% + 8px); right: 0; min-width: 240px; background: rgba(10,14,32,0.98); border: 1px solid rgba(137,91,255,0.3); border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); padding: 8px; z-index: 100; backdrop-filter: blur(20px); }
.dd-header { display: flex; align-items: center; gap: 10px; padding: 10px 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 6px; }
.dd-avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg,#895bff,#3ae0ff); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800; color: #fff; }
.dd-name { font-size: 14px; color: #fff; font-weight: 700; }
.dd-email { font-size: 11px; color: var(--dim); }
.dd-item { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; font-size: 13px; color: #e8e8f0; text-decoration: none; cursor: pointer; background: none; border: none; font-family: inherit; width: 100%; text-align: left; transition: 0.15s; }
.dd-item:hover { background: rgba(137,91,255,0.12); }
.dd-icon { font-size: 15px; width: 20px; text-align: center; }
.dd-text { flex: 1; }
.dd-val { font-size: 12px; color: #ffd23f; font-weight: 700; font-family: ui-monospace, monospace; }
.dd-logout { color: #ff7a96; }
.dd-logout:hover { background: rgba(255,92,122,0.1); }
.dropdown-enter-active, .dropdown-leave-active { transition: all 0.2s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
