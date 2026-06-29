// 端点注册 API。只负责上传/复检用户自己的上游模型,不再创建 EvoShip API Key。

export interface RegisteredEndpoint {
  id: number;
  label: string;
  upstream_base_url: string;
  upstream_model: string;
  api_key_preview?: string;
  status: "active" | "error";
  last_error?: string;
  created_at: number;
  updated_at?: number;
  last_checked_at?: number;
  last_used_at?: number;
  success_count?: number;
  failure_count?: number;
}

export interface RegisterResult {
  base_url: string;
  model: string;
  /** 该 key 可用的所有模型名(内置 tier + 用户自定义舰队 user:*) */
  models?: string[];
  created_at?: number;
  endpoint?: RegisteredEndpoint;
}

export interface RegisterInput {
  userBaseUrl: string;
  userApiKey: string;
  userModel: string;
  label?: string;
}

export interface RegisterOutcome {
  result: RegisterResult;
  demoMode: boolean;
}

/**
 * 注册/转换上游端点。只有后端健康检查通过后才会保存为当前用户的可用上游。
 */
export async function registerEndpoint(
  input: RegisterInput,
): Promise<RegisterOutcome> {
  const swarmHost = location.origin;
  try {
    const res = await fetch("/api/endpoints/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        user_base_url: input.userBaseUrl,
        user_api_key: input.userApiKey,
        user_model: input.userModel,
        label: input.label || undefined,
      }),
    });

    if (res.ok) {
      const d = await res.json();
      return {
        result: {
          base_url: d.base_url || swarmHost + "/v1",
          model: d.model || "swarm-evo",
          models: Array.isArray(d.models) ? d.models : undefined,
          created_at: d.created_at,
          endpoint: d.endpoint,
        },
        demoMode: false,
      };
    }

    let msg = `后端返回 ${res.status}`;
    try {
      const j = await res.json();
      msg = j.error?.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "端点注册失败。");
  }
}

async function parseApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body.error?.message || fallback;
  } catch {
    return fallback;
  }
}

export async function listEndpoints(): Promise<RegisteredEndpoint[]> {
  const res = await fetch("/api/endpoints", { credentials: "include" });
  if (!res.ok) throw new Error(await parseApiError(res, `端点列表返回 ${res.status}`));
  const body = await res.json();
  return Array.isArray(body.endpoints) ? body.endpoints : [];
}

export async function checkEndpoint(id: number): Promise<{
  ok: boolean;
  result: { ok: boolean; sample?: string; error?: string; latencyMs: number };
  endpoint: RegisteredEndpoint | null;
}> {
  const res = await fetch(`/api/endpoints/${id}/check`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseApiError(res, `端点复检返回 ${res.status}`));
  return await res.json();
}
