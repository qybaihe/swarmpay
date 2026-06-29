<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const mode = ref<"login" | "register">("login");
const name = ref("");
const email = ref("");
const password = ref("");
const agree = ref(false);
const submitting = ref(false);
const msg = ref<{ type: "ok" | "err" | "info"; text: string } | null>(null);

const title = computed(() => (mode.value === "login" ? "欢迎回到舰队" : "加入舰队"));
const sub = computed(() =>
  mode.value === "login" ? "登录以管理你的链上蜂群" : "注册一个 SwarmPay 账号,开始组建你的蜂群",
);
const submitLabel = computed(() => (mode.value === "login" ? "登录" : "创建账号"));
const switchText = computed(() => (mode.value === "login" ? "还没有账号?" : "已有账号?"));
const switchLink = computed(() => (mode.value === "login" ? "立即注册 →" : "去登录 →"));

function setMode(m: "login" | "register") {
  mode.value = m;
  msg.value = null;
}

function validate(): string | null {
  if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) return "请输入有效的邮箱地址。";
  if (!password.value || password.value.length < 6) return "密码至少 6 位。";
  if (mode.value === "register" && !agree.value) return "请阅读并同意服务条款。";
  return null;
}

async function onSubmit() {
  const err = validate();
  if (err) {
    msg.value = { type: "err", text: err };
    return;
  }
  submitting.value = true;
  try {
    if (mode.value === "register") {
      await auth.register(email.value, password.value, name.value.trim() || undefined);
    } else {
      await auth.login(email.value, password.value);
    }
    msg.value = {
      type: "ok",
      text: mode.value === "register" ? "注册成功,已登录。" : "登录成功。",
    };
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/";
    setTimeout(() => router.push(redirect), 500);
  } catch (e) {
    msg.value = { type: "err", text: e instanceof Error ? e.message : "请求失败。" };
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="card" :data-mode="mode">
    <h1>{{ title }}</h1>
    <p class="sub">{{ sub }}</p>

    <div class="tab-row">
      <button :class="{ active: mode === 'login' }" type="button" @click="setMode('login')">登录</button>
      <button :class="{ active: mode === 'register' }" type="button" @click="setMode('register')">注册</button>
    </div>

    <form @submit.prevent="onSubmit" novalidate>
      <div class="field register-only" v-show="mode === 'register'">
        <label>称呼(可选)</label>
        <input v-model="name" type="text" placeholder="你想被怎么称呼" autocomplete="name" />
      </div>
      <div class="field">
        <label>邮箱</label>
        <input v-model="email" type="email" placeholder="you@example.com" required autocomplete="email" />
      </div>
      <div class="field">
        <label>密码</label>
                <input
                  v-model="password"
                  type="password"
                  placeholder="至少 6 位"
                  required
                  :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
                />
      </div>

      <div class="agree register-only" v-show="mode === 'register'">
        <input v-model="agree" type="checkbox" id="agree" />
        <span>我已阅读并同意 <a href="#">服务条款</a> 与 <a href="#">隐私政策</a></span>
      </div>

      <button type="submit" class="submit" :disabled="submitting">
        {{ submitting ? "处理中…" : submitLabel }}
      </button>
      <div class="msg" :class="[msg?.type, { show: msg }]" v-if="msg">{{ msg.text }}</div>
    </form>

    <div class="switch-txt">
      {{ switchText }}<a href="#" @click.prevent="setMode(mode === 'login' ? 'register' : 'login')">{{ switchLink }}</a>
    </div>
  </div>
</template>

<style scoped>
.card {
  width: 100%;
  max-width: 430px;
  padding: 44px 40px 36px;
  background: rgba(8, 11, 26, 0.78);
  border: 1px solid var(--panel-line);
  backdrop-filter: blur(22px);
  position: relative;
}
.card::before {
  content: "";
  position: absolute;
  inset: -1px;
  padding: 1px;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(58, 224, 255, 0.5), transparent 40%, transparent 60%, rgba(139, 92, 255, 0.5));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
.card h1 {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.8px;
  margin-bottom: 8px;
}
.card .sub {
  color: var(--muted);
  font-size: 14px;
  margin-bottom: 34px;
}
.tab-row {
  display: flex;
  margin-bottom: 28px;
  border-bottom: 1px solid var(--panel-line);
}
.tab-row button {
  flex: 1;
  padding: 12px 0;
  background: none;
  border: 0;
  color: var(--dim);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  position: relative;
  transition: 0.2s;
}
.tab-row button.active {
  color: #fff;
}
.tab-row button.active::after {
  content: "";
  position: absolute;
  left: 20%;
  right: 20%;
  bottom: -1px;
  height: 2px;
  background: linear-gradient(90deg, var(--cyan), var(--violet));
}
.submit {
  width: 100%;
  padding: 15px;
  margin-top: 6px;
  background: #fff;
  color: #04050d;
  font-weight: 800;
  font-size: 15px;
  border: none;
  cursor: pointer;
  transition: 0.2s;
  font-family: inherit;
  letter-spacing: 0.6px;
}
.submit:hover:not(:disabled) {
  background: var(--cyan);
}
.submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.agree {
  margin: 14px 0 4px;
  font-size: 12px;
  color: var(--muted);
  display: flex;
  gap: 8px;
  align-items: flex-start;
  line-height: 1.5;
}
.agree input {
  margin-top: 3px;
  accent-color: var(--cyan);
}
.agree a {
  color: var(--cyan);
  text-decoration: none;
}
.switch-txt {
  text-align: center;
  margin-top: 22px;
  font-size: 13px;
  color: var(--muted);
}
.switch-txt a {
  color: var(--cyan);
  text-decoration: none;
  font-weight: 600;
  margin-left: 4px;
}
.switch-txt a:hover {
  text-decoration: underline;
}
@media (max-width: 520px) {
  .card { padding: 34px 26px 30px; }
}
</style>
