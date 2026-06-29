<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useToast } from "../composables/useToast";
import { getPublicFleet, toggleLike, listComments, addComment, forkFleet, type CommunityFleetDetail, type FleetComment } from "../api/community";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const toast = useToast();

const fleet = ref<CommunityFleetDetail | null>(null);
const comments = ref<FleetComment[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const commentText = ref("");
const posting = ref(false);
const liking = ref(false);

const fleetId = computed(() => Number(route.params.id));

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [f, c] = await Promise.all([getPublicFleet(fleetId.value), listComments(fleetId.value)]);
    fleet.value = f;
    comments.value = c;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function onLike() {
  if (!auth.isAuthed) { toast.show("请先登录"); router.push({ path: "/login", query: { redirect: `/community/fleet/${fleetId.value}` } }); return; }
  if (!fleet.value || liking.value) return;
  liking.value = true;
  const next = !fleet.value.liked_by_me;
  try {
    const r = await toggleLike(fleetId.value, next);
    fleet.value.liked_by_me = r.liked;
    fleet.value.like_count = r.like_count;
  } catch (e) { toast.show(e instanceof Error ? e.message : "失败"); }
  finally { liking.value = false; }
}

async function onComment() {
  if (!auth.isAuthed) { toast.show("请先登录"); return; }
  const text = commentText.value.trim();
  if (!text || posting.value || !fleet.value) return;
  posting.value = true;
  try {
    const c = await addComment(fleetId.value, text);
    comments.value.push(c);
    commentText.value = "";
    if (fleet.value) fleet.value.comment_count += 1;
  } catch (e) { toast.show(e instanceof Error ? e.message : "评论失败"); }
  finally { posting.value = false; }
}

async function doFork(target: "playground" | "chat") {
  if (!auth.isAuthed) { toast.show("请先登录"); router.push({ path: "/login", query: { redirect: `/community/fleet/${fleetId.value}` } }); return; }
  if (!fleet.value) return;
  try {
    toast.show("复制中…");
    const r = await forkFleet(fleetId.value);
    toast.show(`已复制为 ${r.model_id}`);
    if (target === "playground") { sessionStorage.setItem("evoship:load-fleet", String(r.id)); router.push("/playground"); }
    else { router.push({ path: "/chat", query: { model: r.model_id } }); }
  } catch (e) { toast.show(e instanceof Error ? `❌ ${e.message}` : "复制失败"); }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}

// 展示名:label 中文部分优先
function displayTitle(f: CommunityFleetDetail): string {
  if (f.label) {
    const main = f.label.split("·")[0].trim();
    if (main) return main;
  }
  return f.name;
}
function descDetail(f: CommunityFleetDetail): string {
  if (!f.label) return "";
  const parts = f.label.split("·");
  return parts.length >= 2 ? parts.slice(1).join("·").trim() : f.label;
}

// 拓扑简化预览:节点圆点 + 角色色
const roleColors: Record<string, string> = { orchestrator: "#ffb84d", planner: "#5ca8ff", coder: "#3ae0ff", reviewer: "#8b5cff", explorer: "#ff5cc8" };

onMounted(async () => { await auth.ensureLoaded(); await load(); });
</script>

<template>
  <video class="bg-video" autoplay muted loop playsinline preload="auto" poster="/bg-starship.png"><source src="/bg-launch.mp4" type="video/mp4" /></video>
  <div class="bg-overlay"></div>
  <div class="top">
    <RouterLink to="/" class="logo"><b>EvoShip</b></RouterLink>
    <RouterLink to="/community" class="back-home">← 返回社区</RouterLink>
  </div>

  <div class="stage">
    <div class="container">
      <div v-if="loading" class="state">加载中…</div>
      <div v-else-if="error" class="state err">⚠️ {{ error }}</div>
      <template v-else-if="fleet">
        <div class="detail-head">
          <div>
            <h1>{{ displayTitle(fleet) }}</h1>
            <div class="author-row">
              <RouterLink :to="`/community/user/${fleet.author.id}`" class="author">@{{ fleet.author.name }}</RouterLink>
              <span class="time">{{ timeAgo(fleet.created_at) }}</span>
            </div>
          </div>
          <div class="stat-chips">
            <span class="chip">{{ fleet.node_count }} 节点</span>
            <span class="chip">{{ fleet.edge_count }} 边</span>
            <span class="chip like" :class="{ on: fleet.liked_by_me }" @click="onLike">❤️ {{ fleet.like_count }}</span>
            <span class="chip">💬 {{ fleet.comment_count }}</span>
          </div>
        </div>

        <!-- 拓扑预览 -->
        <div class="topo-preview">
          <div class="topo-title">协作拓扑</div>
          <div class="topo-nodes">
            <div v-for="(n, i) in fleet.topology.nodes" :key="n.id" class="topo-node">
              <div class="node-dot" :style="{ background: roleColors[n.role] || '#888' }"></div>
              <div class="node-label">{{ n.label || n.role }}</div>
              <div class="node-role">{{ n.role }}</div>
              <span v-if="i < fleet.topology.nodes.length - 1" class="node-arrow">→</span>
            </div>
          </div>
        </div>

        <p v-if="fleet.label" class="desc">{{ descDetail(fleet) }}</p>
        <div class="model-id-row"><code class="model-id">{{ fleet.model_id }}</code></div>

        <div class="actions">
          <button class="op fork-edit" @click="doFork('playground')">📋 复制并编辑</button>
          <button class="op fork-try" @click="doFork('chat')">▶ 直接试</button>
        </div>

        <!-- 评论 -->
        <div class="comments-section">
          <h3>💬 评论 ({{ comments.length }})</h3>
          <div class="comment-input">
            <textarea v-model="commentText" rows="2" placeholder="说点什么…" class="cinput"></textarea>
            <button class="csubmit" @click="onComment" :disabled="!commentText.trim() || posting">{{ posting ? "发送中" : "发送" }}</button>
          </div>
          <div v-if="!comments.length" class="no-comment">还没有评论,来抢沙发。</div>
          <div v-for="c in comments" :key="c.id" class="comment">
            <div class="c-head">
              <RouterLink :to="`/community/user/${c.author.id}`" class="c-author">@{{ c.author.name }}</RouterLink>
              <span class="c-time">{{ timeAgo(c.created_at) }}</span>
            </div>
            <div class="c-text">{{ c.content }}</div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.bg-video { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; background: #04050d url("/bg-starship.png") center/cover no-repeat; }
.bg-overlay { position: fixed; inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(90deg, rgba(4,5,13,0.62), rgba(4,5,13,0.48) 50%, rgba(4,5,13,0.62)), linear-gradient(180deg, rgba(4,5,13,0.55), rgba(4,5,13,0.42) 40%, rgba(4,5,13,0.78)); }
.top { position: fixed; top: 0; left: 0; right: 0; z-index: 10; padding: 26px 6vw; display: flex; justify-content: space-between; }
.top .logo { color: #fff; text-decoration: none; }
.back-home { color: var(--muted); text-decoration: none; font-size: 14px; }
.back-home:hover { color: #fff; }
.stage { position: relative; z-index: 2; min-height: 100vh; padding: 90px 6vw 60px; }
.container { max-width: 760px; margin: 0 auto; }
.state { padding: 50px; text-align: center; color: var(--muted); background: rgba(8,11,26,0.7); border: 1px solid var(--panel-line); border-radius: 12px; }
.state.err { color: var(--red); }
.detail-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 24px; flex-wrap: wrap; }
.detail-head h1 { font-size: 28px; color: #fff; margin: 0 0 6px; }
.author-row { display: flex; gap: 10px; align-items: center; }
.author { color: #b89aff; text-decoration: none; font-size: 14px; }
.author:hover { text-decoration: underline; }
.time { font-size: 12px; color: var(--dim); }
.stat-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { font-size: 12px; padding: 5px 12px; border-radius: 999px; background: rgba(255,255,255,0.05); border: 1px solid var(--panel-line); color: var(--muted); }
.chip.like { cursor: pointer; }
.chip.like.on { background: rgba(255,92,122,0.18); border-color: rgba(255,92,122,0.5); color: #ff7a96; }
.topo-preview { padding: 20px; background: rgba(8,11,26,0.6); border: 1px solid var(--panel-line); border-radius: 12px; margin-bottom: 20px; }
.topo-title { font-size: 12px; color: var(--dim); margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
.topo-nodes { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.topo-node { display: flex; align-items: center; gap: 6px; }
.node-dot { width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 8px currentColor; }
.node-label { font-size: 13px; color: #fff; font-weight: 600; }
.node-role { font-size: 10px; color: var(--dim); }
.node-arrow { color: var(--dim); margin: 0 4px; }
.desc { font-size: 14px; color: var(--muted); line-height: 1.7; margin: 0 0 12px; }
.model-id-row { margin-bottom: 24px; }
.model-id { font-size: 11px; color: var(--dim); background: rgba(58,224,255,0.08); padding: 2px 8px; border-radius: 4px; font-family: ui-monospace, monospace; }
.actions { display: flex; gap: 12px; margin-bottom: 36px; }
.op { flex: 1; font-size: 14px; padding: 13px 0; border-radius: 8px; cursor: pointer; font-family: inherit; border: 1px solid transparent; font-weight: 600; }
.fork-edit { background: rgba(58,224,255,0.14); border-color: rgba(58,224,255,0.35); color: var(--cyan); }
.fork-edit:hover { background: rgba(58,224,255,0.24); }
.fork-try { background: rgba(137,91,255,0.14); border-color: rgba(137,91,255,0.35); color: #b89aff; }
.fork-try:hover { background: rgba(137,91,255,0.24); }
.comments-section h3 { font-size: 16px; color: #fff; margin: 0 0 16px; }
.comment-input { display: flex; gap: 10px; margin-bottom: 20px; }
.cinput { flex: 1; font-family: inherit; font-size: 13px; background: rgba(8,11,26,0.9); border: 1px solid var(--panel-line); color: #e8e8f0; border-radius: 8px; padding: 10px 12px; resize: vertical; }
.cinput:focus { outline: none; border-color: var(--cyan); }
.csubmit { padding: 0 20px; font-size: 13px; font-family: inherit; background: rgba(58,224,255,0.16); border: 1px solid rgba(58,224,255,0.4); color: var(--cyan); border-radius: 8px; cursor: pointer; }
.csubmit:disabled { opacity: 0.4; }
.no-comment { color: var(--dim); font-size: 13px; padding: 16px 0; text-align: center; }
.comment { padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.comment:last-child { border-bottom: 0; }
.c-head { display: flex; gap: 10px; align-items: center; margin-bottom: 6px; }
.c-author { color: #b89aff; text-decoration: none; font-size: 13px; font-weight: 600; }
.c-time { font-size: 11px; color: var(--dim); }
.c-text { font-size: 14px; color: #e8e8f0; line-height: 1.6; }
</style>
