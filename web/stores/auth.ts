import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { fetchMe, loginAccount, logoutAccount, registerAccount, type AuthUser } from "../api/auth";
import { useTransformStore } from "./transform";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<AuthUser | null>(null);
  const loaded = ref(false);
  const loading = ref(false);

  const isAuthed = computed(() => !!user.value);

  async function loadMe(): Promise<AuthUser | null> {
    loading.value = true;
    try {
      user.value = await fetchMe();
      if (!user.value) useTransformStore().clear();
      loaded.value = true;
      return user.value;
    } finally {
      loading.value = false;
    }
  }

  async function ensureLoaded(): Promise<AuthUser | null> {
    if (loaded.value) return user.value;
    return loadMe();
  }

  async function login(email: string, password: string): Promise<AuthUser> {
    loading.value = true;
    try {
      const resp = await loginAccount({ email, password });
      user.value = resp.user;
      loaded.value = true;
      return user.value;
    } finally {
      loading.value = false;
    }
  }

  async function register(email: string, password: string, name?: string): Promise<AuthUser> {
    loading.value = true;
    try {
      const resp = await registerAccount({ email, password, name });
      user.value = resp.user;
      loaded.value = true;
      // 注册自动发的 key 存入 transformStore,供 Playground/对话页调用用
      if (resp.api_key) {
        useTransformStore().setResult({
          base_url: resp.base_url || "",
          api_key: resp.api_key,
          model: resp.model || "swarm-evo",
        });
      }
      return user.value;
    } finally {
      loading.value = false;
    }
  }

  async function logout(): Promise<void> {
    loading.value = true;
    try {
      await logoutAccount();
      user.value = null;
      useTransformStore().clear();
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  return { user, loaded, loading, isAuthed, loadMe, ensureLoaded, login, register, logout };
});
