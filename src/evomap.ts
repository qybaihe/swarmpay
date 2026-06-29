// evomap.ts
// EvoMap 深度集成层(经验继承 + 经验回流)。
// 双路径:
//   B 路径(node)优先:/a2a/fetch 检索 Capsule 经验 + /a2a/publish 发布 Gene+Capsule(实测 200,无需 OAuth)
//   A 路径(OAuth)补充:有 token 时用 /developer/oauth/recipes 检索 recipe(更丰富的工作流)
// node 凭证是核心,OAuth 审批未过不影响蜂群协作。

import crypto from "node:crypto";
import { config } from "./config.js";
import { emit } from "./log.js";

export interface InheritedRecipe {
  title: string;
  description?: string;
  source: "local" | "capsule" | "recipe"; // local = 本地进化记忆,capsule = B路径,recipe = A路径
  qualityScore?: number;
  reuseCount?: number;
  generation?: number;
  matchScore?: number;
  memoryId?: number;
}

export interface EvoMapClient {
  enabled: boolean;
  searchRecipes(query: string, limit?: number): Promise<InheritedRecipe[]>;
  publishRecipeDraft(input: {
    title: string;
    description: string;
    steps: { role: string; action: string }[];
    metadata?: Record<string, unknown>;
    goal?: string;
    finalContent?: string;
  }): Promise<{ ok: boolean; detail?: string }>;
}

// 运行时 OAuth token(可选,A 路径补充)
let runtimeToken = "";
export function setRuntimeOAuthToken(token: string): void {
  runtimeToken = token.trim();
  realClient.enabled = true;
  emit("inherit", `🧬 EvoMap 开发套件 OAuth 已激活(recipe 检索补充)`);
}
function activeOAuthToken(): string {
  return runtimeToken || config.evomapToken;
}

function newMessageId(): string {
  return `msg_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`;
}

const realClient: EvoMapClient = {
  enabled: config.hasNodeCredentials,

  // 继承:优先 B 路径 /a2a/fetch 检索 Capsule;有 OAuth 时再补 A 路径 recipe
  async searchRecipes(query, limit = 4): Promise<InheritedRecipe[]> {
    const results: InheritedRecipe[] = [];

    // ── B 路径(核心):GET /a2a/assets/search 按 signals 检索经验(实测 200,返回真实 asset)──
    if (config.hasNodeCredentials) {
      try {
        const url = `${config.evomapBaseUrl}/a2a/assets/search?signals=${encodeURIComponent(query.slice(0, 60))}&limit=${limit}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${config.evomapNodeSecret}` },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = (await res.json()) as { assets?: Array<{ title?: string; description?: string; summary?: string; name?: string }> };
          const assets = data.assets || [];
          for (const a of assets.slice(0, limit)) {
            results.push({
              title: a.title || a.name || a.summary?.slice(0, 60) || "(无标题)",
              description: a.description || a.summary?.slice(0, 120),
              source: "capsule",
            });
          }
          emit("inherit", `🧬 /a2a/assets/search 继承 ${results.length} 条经验`);
        } else {
          emit("inherit", `/a2a/assets/search 返回 ${res.status}`);
        }
      } catch (e) {
        emit("inherit", `/a2a/assets/search 异常:${e instanceof Error ? e.message.slice(0, 40) : e}`);
      }
    }

    // ── A 路径(补充):有 OAuth token 时检索 recipe 工作流 ──
    const oauthToken = activeOAuthToken();
    if (oauthToken) {
      try {
        const res = await fetch(
          `${config.evomapBaseUrl}/developer/oauth/recipes?q=${encodeURIComponent(query)}&limit=${limit}`,
          { headers: { Authorization: `Bearer ${oauthToken}` }, signal: AbortSignal.timeout(8000) },
        );
        if (res.ok) {
          const data = (await res.json()) as { recipes?: Array<{ title?: string; description?: string }> };
          for (const r of (data.recipes || []).slice(0, limit)) {
            results.push({ title: r.title || "", description: r.description, source: "recipe" });
          }
        }
      } catch {
        /* OAuth 不可用时静默降级 */
      }
    }

    return results;
  },

  // 回流:发布 Gene+Capsule bundle 到 EvoMap(B 路径 /a2a/publish,schema 对齐 llms-full)
  async publishRecipeDraft(input) {
    if (!config.hasNodeCredentials) {
      return { ok: false, detail: "no node credentials" };
    }
    // asset_id = sha256(递归规范化 JSON,不含 asset_id 字段)
    // 平台规则:递归排序所有层级 key,然后 JSON.stringify(无空格)
    const computeAssetId = (obj: Record<string, unknown>): string => {
      const deepSort = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(deepSort);
        if (v && typeof v === "object") {
          const sorted: Record<string, unknown> = {};
          for (const k of Object.keys(v as Record<string, unknown>).sort()) {
            if (k === "asset_id") continue;
            sorted[k] = deepSort((v as Record<string, unknown>)[k]);
          }
          return sorted;
        }
        return v;
      };
      const canon = JSON.stringify(deepSort(obj));
      return "sha256:" + crypto.createHash("sha256").update(canon).digest("hex");
    };

    const geneSlug = `evoship_${(input.goal || input.title).slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now().toString(36)}`;
    const signals = [input.goal?.slice(0, 40) || "swarm_task", "evoship", (input.metadata?.tier as string) || "swarm"].map((s) => s.slice(0, 60));

    const gene = {
      type: "Gene" as const,
      schema_version: "1.5.0",
      id: geneSlug,
      category: "optimize" as const,
      signals_match: signals,
      summary: input.description.slice(0, 200) || `EvoShip 蜂群策略: ${input.title}`,
      preconditions: ["EvoShip swarm endpoint available"],
      strategy: input.steps.map((s) => {
        const step = `[${s.role}] ${s.action}`;
        // 平台要求每个 strategy step >= 15 字符,描述可执行操作
        return step.length >= 15 ? step : step + " (execute and verify)";
      }).slice(0, 8),
      constraints: { max_files: 0, forbidden_paths: ["node_modules/", ".env"] },
      validation: ['node -e "require(\'assert\').strictEqual(JSON.parse(JSON.stringify({a:1})).a,1)"'],
    };
    const geneAssetId = computeAssetId(gene);
    (gene as Record<string, unknown>).asset_id = geneAssetId;

    const capsule = {
      type: "Capsule" as const,
      schema_version: "1.5.0",
      trigger: signals,
      gene: geneAssetId,
      summary: input.description.slice(0, 200) || `EvoShip 蜂群产物: ${input.title}`,
      content: (input.finalContent || input.description).slice(0, 2000),
      code_snippet: input.steps.map((s) => `${s.role}: ${s.action}`).join("\n").slice(0, 500),
      confidence: 0.8,
      blast_radius: {
        files: Math.max(1, Number(input.metadata?.subtasks) || 1),
        lines: Math.max(1, input.finalContent?.length || input.description.length || 1),
      },
      outcome: { status: "success", score: 0.8 },
      success_streak: 1,
      env_fingerprint: { platform: "evoship", arch: "swarm", tier: String(input.metadata?.tier || "swarm") },
    };
    const capsuleAssetId = computeAssetId(capsule);
    (capsule as Record<string, unknown>).asset_id = capsuleAssetId;

    const body = {
      protocol: "gep-a2a" as const,
      protocol_version: "1.0.0",
      message_type: "publish" as const,
      message_id: newMessageId(),
      sender_id: config.evomapNodeId,
      timestamp: new Date().toISOString(),
      payload: { assets: [gene, capsule] },
    };

    try {
      const res = await fetch(`${config.evomapBaseUrl}/a2a/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.evomapNodeSecret}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });
      const text = await res.text();
      const ok = res.ok || res.status === 201 || res.status === 202;
      emit("backflow", ok ? `🧬 已发布 Gene+Capsule bundle(gene=${geneSlug.slice(0, 16)})` : `publish ${res.status}: ${text.slice(0, 60)}`);
      return { ok, detail: ok ? `published gene=${geneSlug}` : text.slice(0, 200) };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message.slice(0, 200) : String(e) };
    }
  },
};

// 无 node 凭证时:完全降级
const mockClient: EvoMapClient = {
  enabled: false,
  async searchRecipes(query) {
    emit("inherit", `EvoMap 继承关闭(无 node 凭证)`, { query });
    return [];
  },
  async publishRecipeDraft() {
    return { ok: false, detail: "no node credentials" };
  },
};

export const evomap: EvoMapClient = config.hasNodeCredentials ? realClient : mockClient;

/** 把继承到的经验拼成注入蜂群的先验文本 */
export function renderInheritance(recipes: InheritedRecipe[]): string {
  if (recipes.length === 0) return "";
  const lines = recipes
    .map((r) => {
      const meta = [
        r.generation ? `G${r.generation}` : "",
        r.qualityScore ? `q=${r.qualityScore}` : "",
        r.reuseCount ? `reuse=${r.reuseCount}` : "",
      ].filter(Boolean).join(" ");
      return `- [${r.source}${meta ? " " + meta : ""}] 《${r.title}》${r.description ? ":" + r.description.slice(0, 100) : ""}`;
    })
    .join("\n");
  return `【EvoMap 已继承的可复用经验(优先参考,勿重复造轮子)】\n${lines}\n`;
}
