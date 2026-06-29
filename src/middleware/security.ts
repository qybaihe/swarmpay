// 生产安全中间件(零额外依赖)
// - securityHeaders: 设置基础安全响应头
// - rateLimit: 简单的固定窗口 IP 级限流(内存,单实例足够)
// - originGuard: 防 CSRF —— 对带 cookie 登录态的 state-changing 请求校验同源
import type { Request, Response, NextFunction } from "express";

/** 基础安全响应头(等价于 helmet 子集,不引入依赖) */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  // HSTS: 仅生产(反代后 https 才有意义),由调用方按需开启
  next();
}

interface RateBucket {
  count: number;
  resetAt: number;
}

/** 固定窗口 IP 限流。超限返回 429。
 *  options: { windowMs, max } —— 每个 IP 在 windowMs 内最多 max 次请求 */
export function rateLimit(opts: { windowMs: number; max: number }) {
  const buckets = new Map<string, RateBucket>();
  // 周期性清理,防内存无限增长
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }, opts.windowMs).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    // 信任反代后的真实 IP(trust proxy 已开)
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    let bucket = buckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(ip, bucket);
    }
    bucket.count += 1;
    res.setHeader("X-RateLimit-Limit", String(opts.max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, opts.max - bucket.count)));
    if (bucket.count > opts.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: { message: "请求过于频繁,请稍后再试。", type: "rate_limit_exceeded" },
      });
      return;
    }
    next();
  };
}

/** CSRF 同源校验:对依赖 cookie 的写操作(POST/PUT/DELETE/PATCH),
 *  要求 Origin/Referer 与本机 host 同源。API key 调用(Bearer)不受此限制。
 *  放行条件:① 带 Authorization Bearer(sk-evoship-) 或 ② Origin 同源 或 ③ 无 Origin(部分客户端)时放行 GET。
 *  开发环境豁免:Origin 是 localhost/127.0.0.1(vite dev server 等本地工具)时放行,
 *                避免 changeOrigin 代理下 Host(4000)与 Origin(5173)端口不一致导致的误拦。 */
function isDevOrigin(host: string): boolean {
  // 形如 localhost:5173 / 127.0.0.1:5174 → 取 hostname 部分判断
  const hostname = host.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function originGuard(allowedHosts: string[]): (req: Request, res: Response, next: NextFunction) => void {
  const allowed = new Set(allowedHosts.map((h) => h.toLowerCase()));
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    // Bearer token API 调用不走 CSRF 校验(它们不依赖 cookie)
    const auth = req.headers.authorization || "";
    if (/^Bearer\s+sk-evoship-/i.test(auth)) return next();
    const origin = (req.headers.origin || req.headers.referer || "").toLowerCase();
    if (!origin) return next(); // 无 Origin 头的请求放过(非浏览器客户端)
    try {
      const u = new URL(origin);
      // 开发环境豁免:vite/webpack dev server 跑在 localhost 任意端口
      if (isDevOrigin(u.host)) return next();
      if (allowed.has(u.host)) return next();
    } catch {
      /* 非法 Origin 继续拒绝 */
    }
    res.status(403).json({ error: { message: "跨域请求被拒绝(CSRF 校验失败)。", type: "forbidden" } });
  };
}
