<script setup lang="ts">
import { onMounted } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { useFleetsStore } from "../stores/fleets";
import { useAuthStore } from "../stores/auth";
import { useToast } from "../composables/useToast";
import { publishFleet } from "../api/community";
import SiteFooter from "../components/SiteFooter.vue";

const fleetsStore = useFleetsStore();
const auth = useAuthStore();
const router = useRouter();
const toast = useToast();

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadToPlayground(id: number) {
  // 详情存到 sessionStorage,Playground 加载时读取
  try {
    const detail = await fleetsStore.detail(id);
    sessionStorage.setItem("evoship:load-fleet", String(id));
    router.push("/playground");
    toast.show(`将加载舰队:${detail.name}`);
  } catch (e) {
    toast.show(e instanceof Error ? `❌ ${e.message}` : "加载失败");
  }
}

async function remove(id: number, name: string) {
  if (!confirm(`删除舰队「${name}」?此操作不可恢复。`)) return;
  try {
    await fleetsStore.remove(id);
    toast.show("已删除");
  } catch (e) {
    toast.show(e instanceof Error ? `❌ ${e.message}` : "删除失败");
  }
}

async function copyModel(modelId: string) {
  try {
    await navigator.clipboard.writeText(modelId);
    toast.show("已复制模型名 ✓");
  } catch {
    /* ignore */
  }
}

async function togglePublish(id: number, isPublic: boolean) {
  const next = !isPublic;
  try {
    await publishFleet(id, next);
    // 更新本地状态
    const f = fleetsStore.fleets.find((x) => x.id === id);
    if (f) f.is_public = next;
    toast.show(next ? "已发布到社区 🌐" : "已从社区撤回");
  } catch (e) {
    toast.show(e instanceof Error ? `❌ ${e.message}` : "操作失败");
  }
}

onMounted(async () => {
  await auth.ensureLoaded();
  if (!auth.isAuthed) {
    router.replace({ path: "/login", query: { redirect: "/my-fleets" } });
    return;
  }
  await fleetsStore.load();
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
      <b>SwarmPay</b>
    </RouterLink>
    <RouterLink to="/" class="back-home">← 返回首页</RouterLink>
  </div>

  <div class="stage">
    <div class="container">
      <div class="head">
        <div>
          <h1>📂 我的舰队</h1>
          <p class="sub">你在 Playground 搭建并保存的自定义蜂群编队。每个舰队对应一个模型名 <code>user:&lt;名字&gt;</code>,注册端点后用它测试。</p>
        </div>
        <RouterLink to="/playground" class="new-btn">+ 去 Playground 新建</RouterLink>
      </div>

      <div v-if="fleetsStore.loading" class="state">加载中…</div>
      <div v-else-if="fleetsStore.error" class="state err">⚠️ {{ fleetsStore.error }}</div>
      <div v-else-if="!fleetsStore.fleets.length" class="empty">
        <div class="empty-icon">🛸</div>
        <p>还没有保存任何舰队。</p>
        <p class="empty-hint">去 Playground 拖节点搭一套拓扑,点「💾 保存为舰队」即可出现在这里。</p>
        <RouterLink to="/playground" class="new-btn">前往 Playground</RouterLink>
      </div>

      <div v-else class="table">
        <div class="thead">
          <div class="th th-name">舰队名 / 模型名</div>
          <div class="th th-scale">规模</div>
          <div class="th th-label">描述</div>
          <div class="th th-time">创建时间</div>
          <div class="th th-actions">操作</div>
        </div>
        <div v-for="f in fleetsStore.fleets" :key="f.id" class="tr">
          <div class="td td-name">
            <div class="fname">{{ f.name }} <span v-if="f.is_public" class="public-tag" title="已发布到社区">🌐</span></div>
            <code class="fmodel" @click="copyModel(f.model_id)" title="点击复制">{{ f.model_id }}</code>
          </div>
          <div class="td td-scale">{{ f.node_count }} 节点 · {{ f.edge_count }} 边</div>
          <div class="td td-label">{{ f.label || "—" }}</div>
          <div class="td td-time">{{ formatTime(f.created_at) }}</div>
          <div class="td td-actions">
            <button class="op load" @click="loadToPlayground(f.id)">加载到画布</button>
            <button class="op pub" :class="{ on: f.is_public }" @click="togglePublish(f.id, f.is_public)">
              {{ f.is_public ? "撤回发布" : "发布到社区" }}
            </button>
            <button class="op del" @click="remove(f.id, f.name)">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <SiteFooter />
</template>

<style scoped>
.bg-video {
  position: fixed; inset: 0; width: 100%; height: 100%;
  object-fit: cover; z-index: 0;
  background: #04050d url("/bg-starship.png") center/cover no-repeat;
}
.bg-overlay {
  position: fixed; inset: 0; z-index: 1; pointer-events: none;
  background:
    linear-gradient(90deg, rgba(4, 5, 13, 0.6) 0%, rgba(4, 5, 13, 0.45) 50%, rgba(4, 5, 13, 0.6) 100%),
    linear-gradient(180deg, rgba(4, 5, 13, 0.55) 0%, rgba(4, 5, 13, 0.4) 40%, rgba(4, 5, 13, 0.75) 100%);
}
.top {
  position: fixed; top: 0; left: 0; right: 0; z-index: 10;
  padding: 26px 6vw; display: flex; justify-content: space-between; align-items: center;
}
.top .logo { display: flex; align-items: center; gap: 8px; color: #fff; text-decoration: none; }
.top .logo .mark { width: 26px; height: 26px; color: var(--cyan); }
.top .logo b { font-size: 18px; font-weight: 800; }
.back-home { color: var(--muted); text-decoration: none; font-size: 14px; font-weight: 500; transition: 0.2s; }
.back-home:hover { color: #fff; }

.stage {
  position: relative; z-index: 2; min-height: 100vh;
  padding: 110px 6vw 60px;
}
.container { max-width: 1080px; margin: 0 auto; }
.head {
  display: flex; justify-content: space-between; align-items: flex-end; gap: 20px;
  margin-bottom: 28px; flex-wrap: wrap;
}
.head h1 { font-size: 28px; color: #fff; font-weight: 800; margin: 0 0 8px; }
.head .sub { font-size: 13px; color: var(--muted); line-height: 1.6; max-width: 560px; margin: 0; }
.head .sub code {
  background: rgba(137, 91, 255, 0.14); color: #b89aff;
  padding: 1px 6px; border-radius: 3px; font-size: 12px;
}
.new-btn {
  display: inline-block; padding: 11px 20px; border-radius: 8px;
  background: rgba(137, 91, 255, 0.16); border: 1px solid rgba(137, 91, 255, 0.4);
  color: #b89aff; text-decoration: none; font-size: 13px; font-weight: 600;
  transition: 0.15s; white-space: nowrap;
}
.new-btn:hover { background: rgba(137, 91, 255, 0.26); }

.state { padding: 40px; text-align: center; color: var(--muted); font-size: 14px;
  background: rgba(8, 11, 26, 0.7); border: 1px solid var(--panel-line); border-radius: 12px; }
.state.err { color: var(--red); border-color: rgba(255, 92, 122, 0.3); }

.empty {
  padding: 60px 30px; text-align: center;
  background: rgba(8, 11, 26, 0.7); border: 1px solid var(--panel-line); border-radius: 12px;
}
.empty-icon { font-size: 48px; margin-bottom: 14px; }
.empty p { color: #fff; font-size: 15px; margin: 4px 0; }
.empty-hint { color: var(--dim) !important; font-size: 13px !important; margin-bottom: 20px !important; }

.table {
  background: rgba(8, 11, 26, 0.78); border: 1px solid var(--panel-line);
  border-radius: 12px; overflow: hidden; backdrop-filter: blur(20px);
}
.thead, .tr {
  display: grid;
  grid-template-columns: minmax(200px, 1.6fr) 0.9fr minmax(140px, 1.2fr) 0.9fr 0.9fr;
  gap: 14px; align-items: center;
}
.thead {
  padding: 14px 20px; background: rgba(137, 91, 255, 0.08);
  border-bottom: 1px solid rgba(137, 91, 255, 0.2);
}
.th { font-size: 11px; color: var(--dim); letter-spacing: 0.6px; text-transform: uppercase; font-weight: 700; }
.tr { padding: 16px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); transition: 0.15s; }
.tr:last-child { border-bottom: 0; }
.tr:hover { background: rgba(137, 91, 255, 0.05); }
.td { font-size: 13px; color: var(--text); min-width: 0; }
.fname { color: #fff; font-weight: 700; font-size: 14px; margin-bottom: 4px; }
.fmodel {
  display: inline-block; font-size: 11px; color: var(--cyan);
  background: rgba(58, 224, 255, 0.1); padding: 2px 7px; border-radius: 4px;
  cursor: pointer; transition: 0.15s;
}
.fmodel:hover { background: rgba(58, 224, 255, 0.2); }
.td-scale, .td-time { color: var(--muted); font-size: 12px; }
.td-label { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.op {
  font-size: 11px; padding: 5px 11px; border-radius: 6px; cursor: pointer;
  font-family: inherit; border: 1px solid transparent; white-space: nowrap;
}
.op.load { background: rgba(58, 224, 255, 0.14); border-color: rgba(58, 224, 255, 0.35); color: var(--cyan); }
.op.load:hover { background: rgba(58, 224, 255, 0.24); }
.op.del { background: rgba(255, 92, 122, 0.12); border-color: rgba(255, 92, 122, 0.3); color: var(--red); }
.op.del:hover { background: rgba(255, 92, 122, 0.2); }
.op.pub { background: rgba(137, 91, 255, 0.12); border-color: rgba(137, 91, 255, 0.3); color: #b89aff; }
.op.pub:hover { background: rgba(137, 91, 255, 0.2); }
.op.pub.on { background: rgba(94, 234, 212, 0.12); border-color: rgba(94, 234, 212, 0.3); color: #5eead4; }
.public-tag { font-size: 12px; }

.legal { position: relative; z-index: 2; text-align: center; color: var(--dim); font-size: 12px; padding: 0 6vw 36px; }

@media (max-width: 760px) {
  .thead { display: none; }
  .tr {
    grid-template-columns: 1fr; gap: 8px; padding: 16px;
  }
  .td-name { border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 8px; }
}
</style>
