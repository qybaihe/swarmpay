import { createI18n } from "vue-i18n";
import { zh } from "@/locales/zh";
import { en } from "@/locales/en";

export type Lang = "zh" | "en";

function detectLocale(): Lang {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("swarmpay:locale");
    if (saved === "zh" || saved === "en") return saved;
  }
  if (typeof navigator !== "undefined") {
    const navLang = navigator.language || (navigator as any).userLanguage || "";
    return navLang.toLowerCase().startsWith("zh") ? "zh" : "en";
  }
  return "zh";
}

const initial = detectLocale();

export const i18n = createI18n({
  legacy: false,
  locale: initial,
  fallbackLocale: "en",
  messages: {
    zh,
    en,
  },
});

// 初始同步 <html lang>
if (typeof document !== "undefined") {
  document.documentElement.lang = initial === "zh" ? "zh-CN" : "en";
}
