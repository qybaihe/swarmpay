// Pinia store:用户自定义舰队(Playground 拓扑持久化)
import { defineStore } from "pinia";
import { ref } from "vue";
import {
  listFleets,
  createFleet as apiCreateFleet,
  deleteFleet as apiDeleteFleet,
  getFleet as apiGetFleet,
  type UserFleet,
  type UserFleetDetail,
  type CreateFleetInput,
  type CreateFleetResult,
} from "../api/fleets";

export const useFleetsStore = defineStore("fleets", () => {
  const fleets = ref<UserFleet[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      fleets.value = await listFleets();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "加载舰队失败。";
      // 未登录时静默(不污染列表页)
      if (error.value.includes("401")) {
        fleets.value = [];
        error.value = null;
      }
    } finally {
      loading.value = false;
    }
  }

  async function create(input: CreateFleetInput): Promise<CreateFleetResult> {
    const result = await apiCreateFleet(input);
    // 刷新列表
    await load();
    return result;
  }

  async function detail(id: number): Promise<UserFleetDetail> {
    return await apiGetFleet(id);
  }

  async function remove(id: number): Promise<void> {
    await apiDeleteFleet(id);
    fleets.value = fleets.value.filter((f) => f.id !== id);
  }

  return { fleets, loading, error, load, create, detail, remove };
});
