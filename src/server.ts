import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, MODEL_TIERS, type Tier } from "./config.js";
import { runSwarm } from "./swarm.js";
import { isMock } from "./model.js";
import { initAdapter, isPlatformMode } from "./protocol/adapter.js";
import { teamRoster } from "./agents/identity.js";
import { buildAuthorizeUrl, exchangeCodeForToken, isOAuthConfigured } from "./oauth.js";
import { setRuntimeOAuthToken } from "./evomap.js";
import { AuthStore, registerAuthRoutes } from "./auth.js";
import { ApiKeyStore, registerApiKeyRoutes, type ApiKeyRow } from "./api-keys.js";
import { bearerToken, isEvoShipApiKey, registerEndpointRoutes, EndpointStore } from "./endpoints.js";
import { FleetStore, registerFleetRoutes, USER_MODEL_PREFIX } from "./fleets.js";
import { registerCommunityRoutes } from "./community.js";
import { activeEvolutionMemory } from "./evolution-memory.js";
import { withModelProvider, type ModelProvider } from "./model.js";
import { createPlaygroundDemoOutput } from "./playground-demo.js";
import type { ChatCompletionRequest, ChatCompletionResponse } from "./openai-types.js";
import { securityHeaders, rateLimit, originGuard } from "./middleware/security.js";
import { publicBaseUrl } from "./url.js";
import { verifyWebhook, handleWebhookEvent, webhookEventStore, type WebhookEvent } from "./evomap-webhook.js";
import { createInjectiveRouter } from "./injective/routes.js";
import { createChain } from "./injective/index.js";
import { SplitExecutor } from "./injective/split-executor.js";
import { payerDecide } from "./injective/payer-agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 运行时 OAuth token(OAuth 流程拿到后存内存,供 evomap.ts 用)

const app = express();
// 反代(Nginx/Cloudflare)后信任 X-Forwarded-* 头,使 req.protocol / req.ip 正确
app.set("trust proxy", 1);
app.use(securityHeaders);

// ── EvoMap Webhook 接收端点 ──
// 必须在全局 express.json / csrfGuard 之前注册:
//   ① 验签需要原始 raw body(express.json 会把它解析成对象,字节变化导致验签失败)
//   ② EvoMap 来的请求 Origin 不是 evoship.me,csrfGuard 会误拦,需豁免
app.post(
  "/webhooks/evomap",
  rateLimit({ windowMs: 60_000, max: 60 }), // 平台带退避重试,放宽
  express.raw({ type: "application/json", limit: "1mb" }),
  (req, res) => {
    const secret = config.webhookSecret;
    const sig = req.get("X-EvoMap-Webhook-Signature");
    if (!verifyWebhook(req.body, sig, secret)) {
      // 验签失败:可能是密钥未配、伪造请求、或重放过期。一律 400,平台会重试。
      webhookEventStore().record({
        eventId: `rejected_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        eventType: "signature_failed",
        livemode: false,
        status: "rejected",
        detail: secret ? "signature verification failed" : "webhook secret not configured",
      });
      return res.status(400).send("bad signature");
    }
    let event: WebhookEvent;
    try {
      const parsed = JSON.parse(req.body.toString("utf8")) as Partial<WebhookEvent>;
      event = {
        id: String(parsed.id || `evt_${Date.now()}`),
        type: String(parsed.type || "unknown"),
        livemode: Boolean(parsed.livemode),
        data: (parsed.data || {}) as Record<string, unknown>,
      };
    } catch {
      return res.status(400).send("invalid json");
    }
    // 幂等投递日志(平台重试时 event_id 去重)
    const logged = webhookEventStore().record({
      eventId: event.id,
      eventType: event.type,
      livemode: event.livemode,
      status: "verified",
      payload: event.data,
    });
    if (!logged.inserted) {
      // 重复投递:已处理过,直接 ack(平台不再重试)
      return res.status(200).send("duplicate, already processed");
    }
    try {
      const result = handleWebhookEvent(event);
      webhookEventStore().record({
        eventId: `${event.id}:result`,
        eventType: event.type,
        livemode: event.livemode,
        status: result.status,
        detail: result.detail,
      });
      res.status(200).json({ received: true, status: result.status });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      webhookEventStore().record({
        eventId: `${event.id}:error`,
        eventType: event.type,
        livemode: event.livemode,
        status: "error",
        detail: msg.slice(0, 300),
      });
      res.status(200).json({ received: true, status: "error", detail: msg.slice(0, 200) });
    }
  },
);

app.use(express.json({ limit: "8mb" }));

// CSRF 同源校验:允许的 host(来自 PUBLIC_BASE_URL 或请求 host)
const allowedHosts = config.publicBaseUrl ? [config.publicBaseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")] : [];
function csrfGuard(req: express.Request, res: express.Response, next: express.NextFunction): void {
  // webhooks 已在上方用 HMAC 验签独立保护,豁免 CSRF 同源校验
  if (req.path.startsWith("/webhooks/")) return next();
  const hosts = allowedHosts.length ? allowedHosts : [req.get("host") || ""].filter(Boolean);
  return originGuard(hosts)(req, res, next);
}
app.use(csrfGuard);
const authStore = new AuthStore();
const endpointStore = new EndpointStore();
const apiKeyStore = new ApiKeyStore();
const fleetStore = new FleetStore();

// 限流:登录/注册防爆破(每个 IP 每分钟 10 次)
app.use("/api/auth/login", rateLimit({ windowMs: 60_000, max: 10 }));
app.use("/api/auth/register", rateLimit({ windowMs: 60_000, max: 10 }));

// 注册路由:注册新用户时自动发一个开箱可用的 sk-evoship key
registerAuthRoutes(app, authStore, {
  onUserCreated: async (userId: number, req) => {
    const key = apiKeyStore.createKey({ userId, name: "默认 API Key" });
    const base = req ? publicBaseUrl(req) : `http://localhost:${config.port}`;
    return { api_key: key.api_key, base_url: `${base}/v1`, model: "swarm-evo" };
  },
});
registerApiKeyRoutes(app, authStore, apiKeyStore, fleetStore);
registerEndpointRoutes(app, authStore, endpointStore, fleetStore);
registerFleetRoutes(app, authStore, fleetStore);
registerCommunityRoutes(app, authStore, fleetStore);

// ── 经验宝箱库存统计(只读,供前端宝箱角标展示)──
app.get("/api/evolution/memory/stats", (_req, res) => {
  const mem = activeEvolutionMemory();
  res.json({ total: mem.count(), recent: mem.recent(5) });
});

// ── Webhook 投递日志(只读,便于在门户发测试事件后排查)──
app.get("/api/webhooks/events", (_req, res) => {
  const ws = webhookEventStore();
  res.json({
    configured: Boolean(config.webhookSecret),
    total: ws.count(),
    recent: ws.recent(10),
  });
});

function rid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function roughTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

type ConfiguredEndpoint = ReturnType<EndpointStore["findConfiguredProviderForUser"]>;

interface ApiCaller {
  key: ApiKeyRow;
  userId: number;
  provider: ModelProvider;
  configuredEndpoint: ConfiguredEndpoint;
}

function resolveApiCaller(req: express.Request): ApiCaller | null {
  const token = bearerToken(req);
  const key = token ? apiKeyStore.findByApiKey(token) : null;
  if (!key) return null;
  const configuredEndpoint = endpointStore.findConfiguredProviderForUser(key.user_id);
  return {
    key,
    userId: key.user_id,
    provider: configuredEndpoint?.provider || config.defaultProvider,
    configuredEndpoint,
  };
}

/** 解析请求 model 字段 → {tier, customTopology, error}
 *  - 内置 tier(swarm-*):走对应档位
 *  - user:<name>:必须带用户 API key,从 key 拿 userId 查 user_fleets,注入该舰队拓扑(含美化人设)
 *  - 其它:fallback swarm-evo */
function resolveModel(
  requested: string,
  caller: ApiCaller | null,
): { tier: Tier; customTopology?: ChatCompletionRequest["x_playground_topology"]; error?: { status: number; message: string } } {
  // 内置 tier
  if ((Object.keys(MODEL_TIERS) as Tier[]).includes(requested as Tier)) {
    return { tier: requested as Tier };
  }
  // 用户自定义模型
  if (requested.startsWith(USER_MODEL_PREFIX)) {
    if (!caller) {
      return { tier: "swarm-evo", error: { status: 401, message: `自定义模型 ${requested} 需要有效的 EvoShip API Key。` } };
    }
    const fleetRow = fleetStore.findByModelId(caller.userId, requested);
    if (!fleetRow) {
      return { tier: "swarm-evo", error: { status: 404, message: `未找到模型 ${requested}:该 API key 所属账号下没有这个自定义舰队。请在 Playground 保存或检查模型名。` } };
    }
    let topology: ChatCompletionRequest["x_playground_topology"] | undefined;
    try {
      topology = JSON.parse(fleetRow.topology_json) as ChatCompletionRequest["x_playground_topology"];
    } catch {
      return { tier: "swarm-evo", error: { status: 500, message: `舰队 ${requested} 拓扑数据损坏。` } };
    }
    // 自定义拓扑执行:tier 固定 evo(实际走 runCustomTopology 分支,强制 HARD)
    return { tier: "swarm-evo", customTopology: topology };
  }
  // 未知 model:fallback
  return { tier: "swarm-evo" };
}

// ── GET /v1/models ──
app.get("/v1/models", (_req, res) => {
  res.json({
    object: "list",
    data: Object.entries(MODEL_TIERS).map(([id, m]) => ({
      id,
      object: "model",
      created: Math.floor(Date.now() / 1000),
      owned_by: "swarm-endpoint",
      x_desc: m.desc,
    })),
  });
});

// ── GET / ── EvoShip 官网(蜂群端点介绍 + 端点转换)
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// 静态资源(背景图等)— 放在路由之后、404 兜底之前
app.use(express.static(path.join(__dirname, "..", "public")));

// ── Injective 链上通道(新增,加法式)── 挂 /api/injective/* 路由
app.use("/api/injective", createInjectiveRouter());

// ── GET /api/status ── 健康检查 + 说明(API 用)
app.get("/api/status", (_req, res) => {
  res.type("json").send({
    service: "evoship",
    status: "ok",
    backend: isMock() ? "MOCK (set OPENAI_BASE_URL for real models)" : "real",
    evomap: config.evomapToken ? "connected" : "disabled (set EVOMAP_TOKEN)",
    oauth: isOAuthConfigured() ? "ready (visit /oauth/start)" : "not configured (set EVOMAP_CLIENT_ID)",
    webhook: config.webhookSecret ? `ready (POST /webhooks/evomap, ${webhookEventStore().count()} events received)` : "not configured (set EVOMAP_WEBHOOK_SECRET)",
    endpoints_registered: endpointStore.countActive(),
    models: Object.keys(MODEL_TIERS),
    usage:
      "Point any OpenAI-compatible client at this base_url; use model=swarm-lite|swarm-heavy|swarm-evo|swarm-baseline",
  });
});

// ── 开发套件 OAuth 流程(对齐 examples/quickstart)──
// 用户在官网点 Connect → 跳 EvoMap 授权 → 回调拿 token → 注入蜂群继承/回流
app.get("/oauth/start", (_req, res) => {
  const { url, configured } = buildAuthorizeUrl();
  if (!configured) {
    return res.status(400).type("html").send(
      `<h1>OAuth 未配置</h1><p>需要先在 <a href="https://evomap.ai/dev/portal">evomap.ai/dev/portal</a> 注册 test_mode app,</p>` +
      `<p>然后把 <code>EVOMAP_CLIENT_ID</code> / <code>EVOMAP_CLIENT_SECRET</code> 填入 <code>.env</code> 重启。</p>`,
    );
  }
  res.redirect(url);
});

app.get("/oauth/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.status(400).send(`OAuth 授权失败: ${error}`);
  if (!code || !state) return res.status(400).send("Missing code or state");
  const result = await exchangeCodeForToken(String(code), String(state));
  if (!result.ok || !result.accessToken) {
    return res.status(400).send(`Token 交换失败: ${result.error}`);
  }
  // 注入 runtime token,蜂群继承/回流立即激活
  setRuntimeOAuthToken(result.accessToken);
  res.type("html").send(
    `<div style="font-family:sans-serif;max-width:600px;margin:60px auto;padding:24px">` +
    `<h1>✅ EvoMap 开发套件已连接</h1>` +
    `<p>蜂群的 <b>经验继承</b>(recipe/gene 检索)和 <b>经验回流</b>(recipe 发布)已激活。</p>` +
    `<p>swarm-evo 档现在会真实检索 EvoMap 价值网络。</p>` +
    `<p style="color:#666;font-size:13px">token 已注入服务端内存(不会暴露)。` +
    `<br>开发用 token(复制设置 EVOMAP_TOKEN):<code>${result.accessToken.slice(0, 12)}…${result.accessToken.slice(-6)}</code></p>` +
    `<p><a href="/">← 返回 EvoShip 首页</a> · <a href="/api/status">查看状态</a></p></div>`,
  );
});

// ── POST /v1/chat/completions ── 核心
app.post("/v1/chat/completions", async (req, res) => {
  const body = req.body as ChatCompletionRequest;

  if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: { message: "messages[] required", type: "invalid_request" } });
  }

  // 把客户端选的 model 映射到 tier(未知 model 默认走 swarm-evo)
  const requested = String(body.model || "swarm-evo");

  // 本 MVP 不支持 stream(蜂群需聚合后输出);stream=true 时降级为非流式并告知
  const wantsStream = body.stream === true;
  const token = bearerToken(req);
  const caller = resolveApiCaller(req);
  if (!caller && isEvoShipApiKey(token)) {
    return res.status(401).json({ error: { message: "invalid EvoShip API key", type: "invalid_api_key" } });
  }

  const resolved = resolveModel(requested, caller);
  if (resolved.error) {
    return res.status(resolved.error.status).json({ error: { message: resolved.error.message, type: "invalid_request" } });
  }
  // 必须有用户 API key 才能调用:链上付费要求能定位用户
  if (!caller) {
    return res.status(401).json({ error: { message: "请先登录并在「我的 API Key」页面创建 API Key。", type: "unauthorized" } });
  }
  // 链上 INJ 余额检查(替代已废除的 credits):每次调用需 callCostInj
  const userId = caller.userId;
  const userRow = authStore.findUserById(userId);
  const payerAddr = userRow?.injective_address || (createChain().getSignerAddress?.() ?? "");
  if (!payerAddr) {
    return res.status(402).json({ error: { message: "未绑定 Injective 地址,请到个人设置绑定钱包地址。", type: "no_injective_address" } });
  }
  const callCostInj = config.injective.callCostInj;
  if (callCostInj) {
    try {
      const bal = await createChain().getBalance(payerAddr, config.injective.denom);
      if (BigInt(bal.amount) < BigInt(callCostInj)) {
        return res.status(402).json({ error: { message: `链上 INJ 不足:当前 ${bal.amount},每次调用需 ${callCostInj}。`, type: "insufficient_balance", balance: bal.amount, required: callCostInj } });
      }
    } catch (e) {
      // 余额查询失败(mock 或测试网异常)不阻断,降级放行(后扣模式兜底)
      console.warn("[v1] balance check skipped:", e instanceof Error ? e.message : e);
    }
  }
  // 优先级:user:模型绑定的拓扑 > 请求体 x_playground_topology > 无(走 tier 默认)
  const customTopology = resolved.customTopology || body.x_playground_topology;

  try {
    const out = await withModelProvider(caller.provider, () => runSwarm({
      tier: resolved.tier,
      messages: body.messages,
      customTopology,
    }));
    // 成功完成:链上分润(替代扣积分)。预算=callCostInj,付款方=payerAddr(代签或用户)
    let payment: unknown = null;
    if (callCostInj && BigInt(callCostInj) > 0n) {
      try {
        const chain = createChain();
        const actualPayer = chain.getSignerAddress?.() || payerAddr;
        const decided = payerDecide(out.trace as never);
        payment = await new SplitExecutor(chain).distribute({ reward_split: decided, breakthroughs_broadcast: 0 }, callCostInj, config.injective.denom, actualPayer);
      } catch (e) {
        console.warn("[v1] onchain distribute failed (answer still returned):", e instanceof Error ? e.message : e);
      }
    }
    apiKeyStore.markUse(caller.key.id, true);
    if (caller.configuredEndpoint) endpointStore.markUse(caller.configuredEndpoint.row.id, true);

    const response: ChatCompletionResponse = {
      id: rid("chatcmpl"),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: requested,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: out.content },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: roughTokens(JSON.stringify(body.messages)),
        completion_tokens: roughTokens(out.content),
        total_tokens: roughTokens(JSON.stringify(body.messages)) + roughTokens(out.content),
      },
      x_swarm_trace: out.trace,
    };

    if (wantsStream) {
      // 非流式兜底:一次性返回(并在 note 里说明)
      return res.json({ ...response, x_note: "stream not supported in v1; returned non-streamed." });
    }
    res.json(response);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    apiKeyStore.markUse(caller.key.id, false);
    if (caller.configuredEndpoint) endpointStore.markUse(caller.configuredEndpoint.row.id, false, msg);
    console.error("[swarm] error:", msg);
    res.status(500).json({ error: { message: `swarm error: ${msg}`, type: "internal_error" } });
  }
});

// ── POST /api/playground/swarm/run ── Playground 专属入口:支持用户自定义拓扑真实执行
app.post("/api/playground/swarm/run", async (req, res) => {
  const body = req.body as {
    goal?: string;
    tier?: Tier;
    topology?: ChatCompletionRequest["x_playground_topology"];
    demo?: boolean;
  };
  const requested = String(body.tier || "swarm-heavy");
  const isDemo = body.demo === true || req.get("X-EvoShip-Demo") === "true";
  if (isDemo) {
    return res.json(createPlaygroundDemoOutput());
  }
  const goal = String(body.goal || "").trim();
  if (!goal) return res.status(400).json({ error: { message: "goal required", type: "invalid_request" } });
  const token = bearerToken(req);
  const caller = resolveApiCaller(req);
  if (!caller && isEvoShipApiKey(token)) {
    return res.status(401).json({ error: { message: "invalid EvoShip API key", type: "invalid_api_key" } });
  }

  const resolved = resolveModel(requested, caller);
  if (resolved.error) {
    return res.status(resolved.error.status).json({ error: { message: resolved.error.message, type: "invalid_request" } });
  }
  // 必须有用户 API key 才能调用
  if (!caller) {
    return res.status(401).json({ error: { message: "请先登录获取 API Key。", type: "unauthorized" } });
  }
  // 链上 INJ 余额检查(替代积分)+ 付款方解析
  const userId = caller.userId;
  const userRow = authStore.findUserById(userId);
  const payerAddr = userRow?.injective_address || (createChain().getSignerAddress?.() ?? "");
  const callCostInj = config.injective.callCostInj;
  if (callCostInj && payerAddr) {
    try {
      const bal = await createChain().getBalance(payerAddr, config.injective.denom);
      if (BigInt(bal.amount) < BigInt(callCostInj)) {
        return res.status(402).json({ error: { message: `链上 INJ 不足:当前 ${bal.amount},每次调用需 ${callCostInj}。`, type: "insufficient_balance", balance: bal.amount, required: callCostInj } });
      }
    } catch (e) {
      console.warn("[playground] balance check skipped:", e instanceof Error ? e.message : e);
    }
  }
  // 优先级:user:模型绑定的拓扑 > 请求体 topology > 无
  const customTopology = resolved.customTopology || body.topology;

  try {
    const run = () => runSwarm({
      tier: resolved.tier,
      messages: [{ role: "user", content: goal }],
      customTopology,
    });
    const out = await withModelProvider(caller.provider, run);
    // 成功完成:链上分润(替代扣积分)+ 响应附带 payment(供前端 Playground 画金钱流动)
    let payment: unknown = null;
    if (callCostInj && BigInt(callCostInj) > 0n) {
      try {
        const chain = createChain();
        const actualPayer = chain.getSignerAddress?.() || payerAddr;
        const decided = payerDecide(out.trace as never);
        payment = await new SplitExecutor(chain).distribute({ reward_split: decided, breakthroughs_broadcast: 0 }, callCostInj, config.injective.denom, actualPayer);
      } catch (e) {
        console.warn("[playground] onchain distribute failed (answer still returned):", e instanceof Error ? e.message : e);
      }
    }
    apiKeyStore.markUse(caller.key.id, true);
    if (caller.configuredEndpoint) endpointStore.markUse(caller.configuredEndpoint.row.id, true);
    res.json({ content: out.content, trace: out.trace, payment });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    apiKeyStore.markUse(caller.key.id, false);
    if (caller.configuredEndpoint) endpointStore.markUse(caller.configuredEndpoint.row.id, false, msg);
    console.error("[playground swarm] error:", msg);
    res.status(500).json({ error: { message: `playground swarm error: ${msg}`, type: "internal_error" } });
  }
});

// ── SPA fallback:Vue Router history 模式下,/login 等前端路由刷新要回 index.html ──
// 只对 GET 且非 API 路径生效;/v1 /api/ /oauth 命中不到时继续走下面的 JSON 404
// 注意:/api-keys /api-docs 等前端路由会被 /api 前缀误判,所以精确用 /api/(带斜杠)
app.get("*", (req, res, next) => {
  const p = req.path;
  if (p.startsWith("/v1/") || p.startsWith("/api/") || p.startsWith("/oauth/") || p.includes(".") || p === "/v1" || p === "/api" || p === "/oauth") {
    return next();
  }
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// ── POST /v1/chat/completions 之外的兜底:返回支持的端点 ──
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: `Not found: ${req.method} ${req.path}. Supported: GET /v1/models, POST /v1/chat/completions`,
      type: "not_found",
    },
  });
});

app.listen(config.port, async () => {
  const bar = "═".repeat(60);
  console.log(`\n${bar}\n  🐝 EvoShip — 异构分工蜂群(多 Agent 协作架构)\n${bar}`);
  console.log(`  官网      : http://localhost:${config.port}/`);
  console.log(`  端点      : http://localhost:${config.port}/v1`);
  console.log(`  Backend   : ${isMock() ? "MOCK" : "REAL"} (${config.swarmModel})`);
  console.log(`  架构      : 异构分工流水线 (planner→coder→reviewer + handoff)`);
  console.log(`  Models    : ${Object.keys(MODEL_TIERS).join(", ")}`);
  console.log(`  Recipe    : ${config.evomapToken ? "connected (EVOMAP_TOKEN)" : "disabled — visit /oauth/start or set EVOMAP_TOKEN"}`);
  console.log(`  开发套件  : ${isOAuthConfigured() ? "ready (/oauth/start → Connect with EvoMap)" : "未配置 (set EVOMAP_CLIENT_ID/SECRET)"}`);
  // 探测 EvoMap A2A 平台连通性
  await initAdapter();
  console.log(`  A2A 平台  : ${isPlatformMode() ? "✅ REAL (session/message + swarm/intent + a2a/fetch)" : "⚠️ LOCAL 降级"}`);
  console.log(`  Roster    : ${Object.keys(teamRoster()).join(" / ")}`);
  console.log(`${bar}\n`);
});
