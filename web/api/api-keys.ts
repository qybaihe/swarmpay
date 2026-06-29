export interface UserApiKey {
  id: number;
  user_id: number;
  name: string;
  api_key_preview: string;
  status: "active" | "revoked";
  created_at: number;
  updated_at: number;
  last_used_at?: number;
  success_count: number;
  failure_count: number;
}

export interface ApiKeyIssueResult {
  base_url: string;
  api_key: string;
  model: string;
  models?: string[];
  key: UserApiKey & { api_key: string };
  created_at?: number;
}

export interface ApiKeyListResult {
  keys: UserApiKey[];
  base_url: string;
  model: string;
  models?: string[];
}

async function parseApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body.error?.message || fallback;
  } catch {
    return fallback;
  }
}

export async function listApiKeys(): Promise<ApiKeyListResult> {
  const res = await fetch("/api/api-keys", { credentials: "include" });
  if (!res.ok) throw new Error(await parseApiError(res, `API Key 列表返回 ${res.status}`));
  return (await res.json()) as ApiKeyListResult;
}

export async function createApiKey(name = "默认 API Key"): Promise<ApiKeyIssueResult> {
  const res = await fetch("/api/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await parseApiError(res, `创建 API Key 返回 ${res.status}`));
  return (await res.json()) as ApiKeyIssueResult;
}

export async function rotateApiKey(id: number): Promise<ApiKeyIssueResult> {
  const res = await fetch(`/api/api-keys/${id}/rotate`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseApiError(res, `重新生成 API Key 返回 ${res.status}`));
  return (await res.json()) as ApiKeyIssueResult;
}

export async function revokeApiKey(id: number): Promise<UserApiKey> {
  const res = await fetch(`/api/api-keys/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseApiError(res, `停用 API Key 返回 ${res.status}`));
  const body = await res.json();
  return body.key as UserApiKey;
}
