// Pinia store:语言切换(localStorage 持久化 + navigator.language 自动检测)
import { defineStore } from "pinia";
import { ref } from "vue";
import { i18n } from "@/i18n";

export type Lang = "zh" | "en";

const STORAGE_KEY = "swarmpay:locale";

function detectInitial(): Lang {
  // 1. 用户手动选择过 → 用持久化值
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  }
  // 2. 否则按浏览器语言自动检测
  if (typeof navigator !== "undefined") {
    const navLang = navigator.language || (navigator as any).userLanguage || "";
    // zh 开头(含 zh-CN/zh-TW/zh-HK)→ 中文,其余 → 英文
    return navLang.toLowerCase().startsWith("zh") ? "zh" : "en";
  }
  return "zh";
}

function applyLang(lang: Lang) {
  // 同步 vue-i18n 全局 locale
  if (i18n.global.locale) {
    i18n.global.locale.value = lang;
  }
  // 同步 <html lang="...">
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }
}

export const useLocaleStore = defineStore("locale", () => {
  const lang = ref<Lang>(detectInitial());

  // 初始化时立刻应用一次
  applyLang(lang.value);

  function setLocale(next: Lang) {
    lang.value = next;
    applyLang(next);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, next);
    }
  }

  function toggle() {
    setLocale(lang.value === "zh" ? "en" : "zh");
  }

  return { lang, setLocale, toggle };
});
