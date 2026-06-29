<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useCommunityStore } from "../stores/community";
import { useAuthStore } from "../stores/auth";
import { useToast } from "../composables/useToast";
import { forkFleet } from "../api/community";
import SiteFooter from "../components/SiteFooter.vue";

const community = useCommunityStore();
const auth = useAuthStore();
const router = useRouter();
const toast = useToast();

const searchInput = ref("");
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function onSearch(e: Event) {
  searchInput.value = (e.target as HTMLInputElement).value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => community.setQuery(searchInput.value), 350);
}

// 展示名:优先用 label(中文描述),截掉"·"后面的官方出品等后缀;没有则用 name
function displayName(f: { name: string; label?: string }): string {
  if (f.label) {
    const main = f.label.split("·")[0].trim();
    if (main) return main;
  }
  return f.name;
}
// 描述:label 里"·"后面的设计意图部分
function descText(f: { name: string; label?: string }): string {
  if (!f.label) return "";
  const parts = f.label.split("·");
  if (parts.length >= 2) return parts.slice(1).join("·").trim();
  return f.label;
}

async function doFork(fleetId: number, name: string, target: "playground" | "chat") {
  if (!auth.isAuthed) {
    toast.show("请先登录后再复制舰队");
    router.push({ path: "/login", query: { redirect: "/community" } });
    return;
  }
  try {
    toast.show("复制中…");
    const r = await forkFleet(fleetId);
    toast.show(`已复制为 ${r.model_id}`);
    if (target === "playground") {
      sessionStorage.setItem("evoship:load-fleet", String(r.id));
      router.push("/playground");
    } else {
      router.push({ path: "/chat", query: { model: r.model_id } });
    }
  } catch (e) {
    toast.show(e instanceof Error ? `❌ ${e.message}` : "复制失败");
  }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

onMounted(async () => {
  await auth.ensureLoaded();
  await community.load();
});
</script>

<template>
  <video class="bg-video" autoplay muted loop playsinline preload="auto" poster="/bg-starship.png">
    <source src="/bg-launch.mp4" type="video/mp4" />
  </video>
  <div class="bg-overlay"></div>

  <div class="top">
    <RouterLink to="/" class="logo">
      <span class="mark"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2 19 20 12 16 5 20z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="11" r="1.7" fill="currentColor"/></svg></span>
      <b>EvoShip</b>
    </RouterLink>
    <RouterLink to="/playground" class="back-home">← 去 Playground</RouterLink>
  </div>

  <div class="stage">
    <div class="container">
      <div class="head">
        <div>
          <h1>🌐 舰队社区</h1>
          <p class="sub">看看大家搭了什么舰队,复制一份到自己 Playground 改,或直接拿去试用。</p>
        </div>
      </div>

      <div class="toolbar">
        <input class="search-box" :value="searchInput" @input="onSearch" placeholder="搜索舰队名 / 描述 / 作者…" />
        <div class="sort-group">
          <button class="sort-btn" :class="{ on: community.sort === 'new' }" @click="community.setSort('new')">最新</button>
          <button class="sort-btn" :class="{ on: community.sort === 'hot' }" @click="community.setSort('hot')">最热</button>
        </div>
      </div>

      <div v-if="community.loading" class="state">加载中…</div>
      <div v-else-if="community.error" class="state err">⚠️ {{ community.error }}</div>
      <div v-else-if="!community.fleets.length" class="empty">
        <div class="empty-icon">🛸</div>
        <p>社区还没有公开舰队。</p>
        <p class="empty-sub">去 Playground 搭一套拓扑,在「我的舰队」里点「发布到社区」就能出现在这里。</p>
        <RouterLink to="/playground" class="cta">前往 Playground</RouterLink>
      </div>

      <div v-else class="grid">
        <div v-for="f in community.fleets" :key="f.id" class="card">
          <div class="card-head">
            <RouterLink :to="`/community/fleet/${f.id}`" class="card-name">{{ displayName(f) }}</RouterLink>
            <span class="card-meta">{{ f.node_count }}节点 · {{ f.edge_count }}边</span>
          </div>
          <div class="card-author">
            <RouterLink :to="`/community/user/${f.author.id}`" class="author-link">@{{ f.author.name }}</RouterLink>
            <span class="time">{{ timeAgo(f.created_at) }}</span>
          </div>
          <div v-if="f.label" class="card-desc">{{ descText(f) }}</div>
          <div class="card-stats">
            <span>❤️ {{ f.like_count }}</span>
            <span>💬 {{ f.comment_count }}</span>
          </div>
          <div class="card-actions">
            <button class="op fork-edit" @click="doFork(f.id, f.name, 'playground')">复制并编辑</button>
            <button class="op fork-try" @click="doFork(f.id, f.name, 'chat')">直接试</button>
          </div>
        </div>
      </div>
      <div v-if="!community.loading && community.fleets.length" class="count">共 {{ community.total }} 个公开舰队</div>
    </div>
  </div>

  <SiteFooter />
</template>

<style scoped>
.bg-video { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; background: #04050d url("/bg-starship.png") center/cover no-repeat; }
.bg-overlay { position: fixed; inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(90deg, rgba(4,5,13,0.62) 0%, rgba(4,5,13,0.48) 50%, rgba(4,5,13,0.62) 100%), linear-gradient(180deg, rgba(4,5,13,0.55) 0%, rgba(4,5,13,0.42) 40%, rgba(4,5,13,0.78) 100%); }
.top { position: fixed; top: 0; left: 0; right: 0; z-index: 10; padding: 26px 6vw; display: flex; justify-content: space-between; align-items: center; }
.top .logo { display: flex; align-items: center; gap: 8px; color: #fff; text-decoration: none; }
.top .logo .mark { width: 26px; height: 26px; color: var(--cyan); }
.top .logo b { font-size: 18px; font-weight: 800; }
.back-home { color: var(--muted); text-decoration: none; font-size: 14px; }
.back-home:hover { color: #fff; }

.stage { position: relative; z-index: 2; min-height: 100vh; padding: 100px 6vw 60px; }
.container { max-width: 1180px; margin: 0 auto; }
.head { margin-bottom: 24px; }
.head h1 { font-size: 30px; color: #fff; font-weight: 800; margin: 0 0 8px; }
.head .sub { font-size: 14px; color: var(--muted); margin: 0; }

.toolbar { display: flex; gap: 14px; margin-bottom: 26px; flex-wrap: wrap; }
.search-box { flex: 1; min-width: 220px; font-size: 14px; font-family: inherit; background: rgba(8,11,26,0.9); border: 1px solid var(--panel-line); color: #e8e8f0; border-radius: 8px; padding: 11px 16px; }
.search-box:focus { outline: none; border-color: var(--cyan); }
.sort-group { display: flex; gap: 0; border: 1px solid var(--panel-line); border-radius: 8px; overflow: hidden; }
.sort-btn { padding: 11px 20px; font-size: 13px; font-family: inherit; background: rgba(8,11,26,0.9); border: none; color: var(--muted); cursor: pointer; }
.sort-btn.on { background: rgba(58,224,255,0.18); color: var(--cyan); }

.state { padding: 50px; text-align: center; color: var(--muted); font-size: 14px; background: rgba(8,11,26,0.7); border: 1px solid var(--panel-line); border-radius: 12px; }
.state.err { color: var(--red); }
.empty { padding: 70px 30px; text-align: center; background: rgba(8,11,26,0.7); border: 1px solid var(--panel-line); border-radius: 12px; }
.empty-icon { font-size: 50px; margin-bottom: 16px; }
.empty p { color: #fff; font-size: 16px; margin: 6px 0; }
.empty-sub { color: var(--dim) !important; font-size: 13px !important; margin-bottom: 22px !important; }
.cta { display: inline-block; padding: 11px 22px; border-radius: 8px; background: rgba(137,91,255,0.16); border: 1px solid rgba(137,91,255,0.4); color: #b89aff; text-decoration: none; font-size: 13px; font-weight: 600; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; }
.card { padding: 18px; background: rgba(8,11,26,0.78); border: 1px solid var(--panel-line); border-radius: 12px; backdrop-filter: blur(20px); transition: 0.18s; display: flex; flex-direction: column; }
.card:hover { border-color: rgba(137,91,255,0.4); transform: translateY(-2px); box-shadow: 0 8px 26px rgba(0,0,0,0.4); }
.card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.card-name { font-size: 16px; font-weight: 700; color: #fff; text-decoration: none; }
.card-name:hover { color: var(--cyan); }
.card-meta { font-size: 11px; color: var(--dim); flex-shrink: 0; }
.card-author { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.author-link { font-size: 13px; color: #b89aff; text-decoration: none; }
.author-link:hover { text-decoration: underline; }
.time { font-size: 11px; color: var(--dim); }
.card-desc { font-size: 13px; color: var(--muted); line-height: 1.5; margin-bottom: 12px; flex: 1; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.card-stats { display: flex; gap: 14px; font-size: 12px; color: var(--dim); margin-bottom: 14px; }
.card-actions { display: flex; gap: 8px; }
.op { flex: 1; font-size: 12px; padding: 8px 0; border-radius: 7px; cursor: pointer; font-family: inherit; border: 1px solid transparent; }
.fork-edit { background: rgba(58,224,255,0.14); border-color: rgba(58,224,255,0.35); color: var(--cyan); }
.fork-edit:hover { background: rgba(58,224,255,0.24); }
.fork-try { background: rgba(137,91,255,0.14); border-color: rgba(137,91,255,0.35); color: #b89aff; }
.fork-try:hover { background: rgba(137,91,255,0.24); }

.count { text-align: center; color: var(--dim); font-size: 12px; margin-top: 28px; }
.legal { position: relative; z-index: 2; text-align: center; color: var(--dim); font-size: 12px; padding: 0 6vw 36px; }
</style>
