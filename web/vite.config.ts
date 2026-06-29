import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

// Vite 配置
// - 产物输出到项目根 public/（后端 express.static 直接 serve）
// - emptyOutDir:false:不删 public/ 下已有的 bg-*.png/mp4
// - dev server (5173) 把 /v1 /api /oauth 代理到后端 (4000)
//
// 注意:web/api/*.ts 是前端源码模块(被 stores/components import),
// 但路径前缀 /api 与后端 API 冲突。若不加 bypass,Vite 会把模块请求
// /api/auth.ts 也转发到后端 4000 → 404 → 模块加载失败 → 白屏。
// bypass 规则:带文件扩展名(.ts/.vue/.js/.css/.json...)的请求视为静态资源,
// 不转发,交还 Vite 正常编译。
const proxyTarget = "http://localhost:4000";
const proxyWithBypass = {
  target: proxyTarget,
  changeOrigin: true,
  bypass(req: { url?: string }) {
    // 静态模块/资源请求(带扩展名)不经代理,交给 Vite 处理
    if (req.url && /\.[a-zA-Z0-9]+(\?.*)?$/.test(req.url)) return req.url;
  },
};
export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [vue()],
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  build: {
    outDir: path.resolve(__dirname, "..", "public"),
    emptyOutDir: false,
    target: "es2020",
  },
  server: {
    port: 5173,
    proxy: {
      "/v1": proxyWithBypass,
      "/api": proxyWithBypass,
      "/oauth": proxyWithBypass,
    },
  },
});
