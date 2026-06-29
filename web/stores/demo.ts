// Pinia store:演示模式开关
import { defineStore } from "pinia";
import { ref } from "vue";

export const useDemoStore = defineStore("demo", () => {
  const demoMode = ref(false);
  function toggle() {
    demoMode.value = !demoMode.value;
  }
  return { demoMode, toggle };
});
