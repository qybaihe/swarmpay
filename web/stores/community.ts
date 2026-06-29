// Pinia store:社区浏览状态
import { defineStore } from "pinia";
import { ref } from "vue";
import {
  listPublicFleets,
  type CommunityFleetSummary,
} from "../api/community";

export const useCommunityStore = defineStore("community", () => {
  const fleets = ref<CommunityFleetSummary[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const sort = ref<"new" | "hot">("new");
  const query = ref("");

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      const r = await listPublicFleets({ sort: sort.value, q: query.value });
      fleets.value = r.items;
      total.value = r.total;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "加载社区失败。";
    } finally {
      loading.value = false;
    }
  }

  function setSort(s: "new" | "hot") {
    sort.value = s;
    return load();
  }

  function setQuery(q: string) {
    query.value = q;
    return load();
  }

  return { fleets, total, loading, error, sort, query, load, setSort, setQuery };
});
