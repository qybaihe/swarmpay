// 全局 toast(复制提示等)
import { reactive } from "vue";

const state = reactive<{ visible: boolean; text: string }>({
  visible: false,
  text: "",
});
let timer: ReturnType<typeof setTimeout> | undefined;

export function useToast() {
  function show(msg = "已复制 ✓") {
    state.text = msg;
    state.visible = true;
    clearTimeout(timer);
    timer = setTimeout(() => (state.visible = false), 1400);
  }
  return { state, show };
}

// 复制到剪贴板(带 fallback),复制后弹 toast
export async function copyText(text: string): Promise<void> {
  const { show } = useToast();
  try {
    await navigator.clipboard.writeText(text);
    show("已复制 ✓");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      show("已复制 ✓");
    } catch {
      show("复制失败");
    }
    document.body.removeChild(ta);
  }
}
