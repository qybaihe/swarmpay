<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useToast } from "../composables/useToast";
import { getPublicProfile, toggleFollow, forkFleet, type PublicUserProfile } from "../api/community";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const toast = useToast();

const profile = ref<PublicUserProfile | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const following = ref(false);
const userId = computed(() => Number(route.params.userId));

async function load() {
  loading.value = true;
  error.value = null;
  try {
    profile.value = await getPublicProfile(userId.value);
    following.value = profile.value?.followed_by_me ?? false;
  } catch (e) { error.value = e instanceof Error ? e.message : "加载失败"; }
  finally { loading.value = false; }
}

async function onFollow() {
  if (!auth.isAuthed) { toast.show("请先登录"); router.push({ path: "/login", query: { redirect: `/community/user/${userId.value}` } }); return; }
  if (!profile.value) return;
  const next = !following.value;
  try {
    const r = await toggleFollow(userId.value, next);
    following.value = r.following;
    profile.value.follower_count += next ? 1 : -1;
  } catch (e) { toast.show(e instanceof Error ? e.message : "失败"); }
}

async function doFork(fleetId: number) {
  if (!auth.isAuthed) { toast.show("请先登录"); return; }
  try {
    toast.show("复制中…");
    const r = await forkFleet(fleetId);
    toast.show(`已复制为 ${r.model_id}`);
    sessionStorage.setItem("evoship:load-fleet", String(r.id));
    router.push("/playground");
  } catch (e) { toast.show(e instanceof Error ? `❌ ${e.message}` : "失败"); }
}

onMounted(async () => { await auth.ensureLoaded(); await load(); });
</script>

<template>
  <video class="bg-video" autoplay muted loop playsinline preload="auto" poster="/bg-starship.png"><source src="/bg-launch.mp4" type="video/mp4" /></video>
  <div class="bg-overlay"></div>
  <div class="top">
    <RouterLink to="/" class="logo"><b>SwarmPay</b></RouterLink>
    <RouterLink to="/community" class="back-home">← 返回社区</RouterLink>
  </div>
  <div class="stage">
    <div class="container">
      <div v-if="loading" class="state">加载中…</div>
      <div v-else-if="error" class="state err">⚠️ {{ error }}</div>
      <template v-else-if="profile">
        <div class="profile-head">
          <div class="avatar">{{ profile.name.charAt(0).toUpperCase() }}</div>
          <div class="pinfo">
            <h1>{{ profile.name }}</h1>
            <div class="pstats">
              <span>{{ profile.fleet_count }} 舰队</span>
              <span>{{ profile.follower_count }} 粉丝</span>
              <span>关注 {{ profile.following_count }}</span>
            </div>
          </div>
          <button class="follow-btn" :class="{ on: following }" @click="onFollow">{{ following ? "已关注" : "+ 关注" }}</button>
        </div>

        <h2 class="sec-title">公开舰队</h2>
        <div v-if="!profile.fleets.length" class="empty">还没有公开舰队。</div>
        <div v-else class="grid">
          <div v-for="f in profile.fleets" :key="f.id" class="card">
            <RouterLink :to="`/community/fleet/${f.id}`" class="card-name">{{ f.name }}</RouterLink>
            <div class="card-meta">{{ f.node_count }}节点 · {{ f.edge_count }}边 · ❤️{{ f.like_count }}</div>
            <div v-if="f.label" class="card-desc">{{ f.label }}</div>
            <button class="op" @click="doFork(f.id)">复制</button>
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
.stage { position: relative; z-index: 2; min-height: 100vh; padding: 100px 6vw 60px; }
.container { max-width: 1000px; margin: 0 auto; }
.state { padding: 50px; text-align: center; color: var(--muted); background: rgba(8,11,26,0.7); border: 1px solid var(--panel-line); border-radius: 12px; }
.state.err { color: var(--red); }
.profile-head { display: flex; align-items: center; gap: 20px; margin-bottom: 36px; padding: 24px; background: rgba(8,11,26,0.78); border: 1px solid var(--panel-line); border-radius: 14px; }
.avatar { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #895bff, #3ae0ff); display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; color: #fff; flex-shrink: 0; }
.pinfo { flex: 1; }
.pinfo h1 { font-size: 24px; color: #fff; margin: 0 0 8px; }
.pstats { display: flex; gap: 18px; font-size: 13px; color: var(--muted); }
.follow-btn { padding: 10px 24px; font-size: 14px; font-family: inherit; font-weight: 600; border-radius: 8px; cursor: pointer; background: rgba(137,91,255,0.16); border: 1px solid rgba(137,91,255,0.4); color: #b89aff; }
.follow-btn.on { background: rgba(255,255,255,0.06); border-color: var(--panel-line); color: var(--dim); }
.sec-title { font-size: 18px; color: #fff; margin: 0 0 18px; }
.empty { color: var(--dim); font-size: 14px; padding: 30px; text-align: center; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.card { padding: 16px; background: rgba(8,11,26,0.78); border: 1px solid var(--panel-line); border-radius: 10px; }
.card-name { font-size: 15px; font-weight: 700; color: #fff; text-decoration: none; display: block; margin-bottom: 6px; }
.card-name:hover { color: var(--cyan); }
.card-meta { font-size: 11px; color: var(--dim); margin-bottom: 8px; }
.card-desc { font-size: 12px; color: var(--muted); line-height: 1.5; margin-bottom: 12px; }
.op { width: 100%; font-size: 12px; padding: 7px 0; border-radius: 6px; cursor: pointer; font-family: inherit; background: rgba(58,224,255,0.14); border: 1px solid rgba(58,224,255,0.35); color: var(--cyan); }
.op:hover { background: rgba(58,224,255,0.24); }
</style>
