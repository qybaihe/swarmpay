// Pinia store:用户 API Key(跨页面给 Playground/Chat 复用)
import { defineStore } from "pinia";
import { ref, watch } from "vue";

export interface StoredApiKeyResult {
  base_url: string;
  api_key: string;
  model: string;
  models?: string[];
}

const STORAGE_KEY = "evoship:last-transform-result";

interface PersistedTransform {
  version: 1;
  lastResult: StoredApiKeyResult | null;
  lastApiKey: string;
}

function readPersisted(): PersistedTransform {
  if (typeof localStorage === "undefined") {
    return { version: 1, lastResult: null, lastApiKey: "" };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, lastResult: null, lastApiKey: "" };
    const parsed = JSON.parse(raw) as Partial<PersistedTransform>;
    return {
      version: 1,
      lastResult: parsed.lastResult || null,
      lastApiKey: typeof parsed.lastApiKey === "string" ? parsed.lastApiKey : parsed.lastResult?.api_key || "",
    };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return { version: 1, lastResult: null, lastApiKey: "" };
  }
}

function writePersisted(payload: PersistedTransform) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore storage quota/private-mode failures */
  }
}

function clearPersisted() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore storage failures */
  }
}

export const useTransformStore = defineStore("transform", () => {
  const persisted = readPersisted();
  const lastResult = ref<StoredApiKeyResult | null>(persisted.lastResult);
  // API Key 页/注册页 → 演示区传递的 api_key
  const lastApiKey = ref<string>(persisted.lastApiKey);

  function setResult(r: StoredApiKeyResult) {
    lastResult.value = r;
    lastApiKey.value = r.api_key;
  }

  function clear() {
    lastResult.value = null;
    lastApiKey.value = "";
    clearPersisted();
  }

  watch([lastResult, lastApiKey], () => {
    writePersisted({
      version: 1,
      lastResult: lastResult.value,
      lastApiKey: lastApiKey.value,
    });
  }, { deep: true });

  return { lastResult, lastApiKey, setResult, clear };
});
