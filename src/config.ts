import dotenv from "dotenv";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
dotenv.config();

function bool(v: string | undefined, def: boolean): boolean {
  if (v === undefined || v === "") return def;
  return v === "true" || v === "1" || v === "yes";
}
function num(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

// 从 ~/.evomap/ 读取 node 凭证(skill.md 规定的标准位置)
function readNodeCredential(): { id: string; secret: string } {
  const dir = path.join(os.homedir(), ".evomap");
  try {
    const id = fs.readFileSync(path.join(dir, "node_id"), "utf8").trim();
    const secret = fs.readFileSync(path.join(dir, "node_secret"), "utf8").trim();
    if (id.startsWith("node_") && secret.length === 64) return { id, secret };
  } catch {
    /* 文件不存在,降级 */
  }
  // 环境变量兜底
  const envId = process.env.EVOMAP_NODE_ID || "";
  const envSecret = process.env.EVOMAP_NODE_SECRET || "";
  return { id: envId, secret: envSecret };
}

const nodeCred = readNodeCredential();

export const config = {
  port: num(process.env.PORT, 4000),

  // 对外公开 base URL(用于给用户展示 base_url,反代后必须配置)。
  // 留空时回退到运行时 req.protocol + host。
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "").trim(),

  // 模型后端:留空 → mock
  openaiBaseUrl: (process.env.OPENAI_BASE_URL || "").trim(),
  openaiApiKey: (process.env.OPENAI_API_KEY || "").trim(),
  useMock: !(process.env.OPENAI_BASE_URL && process.env.OPENAI_BASE_URL.trim()),

  swarmModel: process.env.SWARM_MODEL || "qwen2.5:7b",
  aggregatorModel: process.env.AGGREGATOR_MODEL || "qwen2.5:7b",
  baselineModel: process.env.BASELINE_MODEL || "gpt-4o",

  // 内置默认模型 provider:用户没注册自己的端点时,自动用这个作为上游。
  // 新用户注册会自动发一个绑定此 provider 的 sk-evoship key。
  // ⚠️ 必须用独立环境变量配置,不再复用 EVOMAP_BASE_URL(那是平台域名)。
  //    留空 → 注册的 key 无可用上游,需用户自行注册端点。
  defaultProvider: {
    baseUrl: (process.env.DEFAULT_PROVIDER_BASE_URL || process.env.OPENAI_BASE_URL || "").trim(),
    apiKey: (process.env.DEFAULT_PROVIDER_API_KEY || process.env.OPENAI_API_KEY || "").trim(),
    model: (process.env.DEFAULT_PROVIDER_MODEL || process.env.SWARM_MODEL || "").trim(),
  },

  // 积分体系
  signupCredits: num(process.env.SIGNUP_CREDITS, 1000),
  callCostCredits: num(process.env.CALL_COST_CREDITS, 50),

  swarmSize: num(process.env.SWARM_SIZE, 4),
  requestTimeoutMs: num(process.env.REQUEST_TIMEOUT_MS, 60000),
  beeTimeoutMs: num(process.env.BEE_TIMEOUT_MS, 30000),

  // EvoMap — A 路径(Developer OAuth,开发套件官方接入)
  // ⚠️ EVOMAP_BASE_URL 是 EvoMap 平台地址(OAuth/recipe/A2A),与默认模型 provider 无关。
  evomapToken: (process.env.EVOMAP_TOKEN || "").trim(),
  evomapBaseUrl: (process.env.EVOMAP_BASE_URL || "https://evomap.ai").trim(),
  evomapPublishBackflow: bool(process.env.EVOMAP_PUBLISH_BACKFLOW, true),
  // OAuth app 凭证(从 evomap.ai/dev/portal 注册 test_mode app 拿)
  oauthClientId: (process.env.EVOMAP_CLIENT_ID || "").trim(),
  oauthClientSecret: (process.env.EVOMAP_CLIENT_SECRET || "").trim(),
  oauthRedirectUri: (process.env.EVOMAP_REDIRECT_URI || "http://localhost:4000/oauth/callback").trim(),

  // EvoMap — B 路径(A2A node 协议,用于 swarm 端点/handoff/广播)
  // 从 ~/.evomap/node_id + node_secret 读取,无需 env
  evomapNodeId: nodeCred.id,
  evomapNodeSecret: nodeCred.secret,
  hasNodeCredentials: !!(nodeCred.id && nodeCred.secret),
  // 通信适配模式:platform(真实调用)/ local(本地 MessageBus 降级)
  adapterMode: (process.env.ADAPTER_MODE || "platform").trim() as "platform" | "local",

  // Webhook:门户注册端点后拿到的签名密钥(whsec_...)。留空 → 验签恒失败,webhook 不生效。
  webhookSecret: (process.env.EVOMAP_WEBHOOK_SECRET || "").trim(),

  // 流水线:reviewer→coder 返工最大轮数
  maxRevisionRounds: num(process.env.MAX_REVISION_ROUNDS, 2),

  // ── Injective 链上通道(新增,加法式,默认关 → 原服务零变化)──
  injective: {
    enabled: bool(process.env.INJECTIVE_ENABLED, false),
    network: (process.env.INJECTIVE_NETWORK || "mock") as "mock" | "testnet" | "mainnet",
    chainId: (process.env.INJECTIVE_CHAIN_ID || "dorado-1").trim(),
    rpc: (process.env.INJECTIVE_RPC || "https://sentry.lcd.injective.network").trim(),
    rest: (process.env.INJECTIVE_REST || "https://sentry.lcd.injective.network").trim(),
    denom: (process.env.INJECTIVE_DENOM || "inj").trim(),
    splitContractAddr: (process.env.INJECTIVE_SPLIT_CONTRACT_ADDR || "").trim(),
    // 测试网代签私钥(仅 testnet;主网绝不使用)
    demoKey: (process.env.INJECTIVE_DEMO_KEY || "").trim(),
    protocolFeeBps: num(process.env.INJECTIVE_PROTOCOL_FEE_BPS, 500), // 5%
    archetypeAddrs: parseArchetypeAddrs(process.env.INJECTIVE_ARCHETYPE_ADDRS),
  },
};

/** 解析 INJECTIVE_ARCHETYPE_ADDRS(JSON 字符串)→ Record<archetype, addr> */
function parseArchetypeAddrs(raw: string | undefined): Record<string, string> {
  if (!raw || !raw.trim()) return {};
  try {
    const obj = JSON.parse(raw);
    return typeof obj === "object" && obj ? obj : {};
  } catch {
    return {};
  }
}

/** 三档模型名:客户端选哪个就走哪条路径 */
export const MODEL_TIERS = {
  // 直通单次调用(基线对比用)
  "swarm-baseline": { tier: "baseline", desc: "single model, no swarm (baseline)" },
  // N 蜂并行 + 投票
  "swarm-lite": { tier: "lite", desc: "N bees parallel + vote" },
  // N 蜂 + LLM 聚合 + 突破传播
  "swarm-heavy": { tier: "heavy", desc: "N bees + LLM aggregate + breakthrough broadcast" },
  // heavy + EvoMap 继承/回流(独家)
  "swarm-evo": { tier: "evo", desc: "heavy + EvoMap capability inheritance & backflow" },
} as const;

export type Tier = keyof typeof MODEL_TIERS;
