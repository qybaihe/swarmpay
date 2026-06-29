// 对外展示的 base_url 工具:优先用 PUBLIC_BASE_URL,否则回退到请求自身 protocol+host
import type { Request } from "express";
import { config } from "./config.js";

export function publicBaseUrl(req: Request): string {
  if (config.publicBaseUrl) return config.publicBaseUrl.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

/** 生成 /v1 端点的对外 base_url */
export function publicV1BaseUrl(req: Request): string {
  return `${publicBaseUrl(req)}/v1`;
}
