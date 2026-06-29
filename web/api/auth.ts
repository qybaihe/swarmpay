export interface AuthUser {
  id: number;
  email: string;
  name: string;
  credits: number;
  created_at: number;
}

export interface AuthResponse {
  user: AuthUser;
  /** 注册时自动发的 API key(绑定内置默认模型) */
  api_key?: string;
  base_url?: string;
  model?: string;
}

export interface CreditTransaction {
  id: number;
  delta: number;
  balance: number;
  reason: string;
  created_at: number;
}

export interface CreditsInfo {
  balance: number;
  transactions: CreditTransaction[];
}

async function parseAuthError(res: Response, fallback: string): Promise<string> {
  try {
    const j = await res.json();
    return j.error?.message || fallback;
  } catch {
    return fallback;
  }
}

export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(await parseAuthError(res, "获取登录态失败。"));
  const d = (await res.json()) as AuthResponse;
  return d.user;
}

export async function registerAccount(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<AuthResponse> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseAuthError(res, "注册失败。"));
  return (await res.json()) as AuthResponse;
}

export async function loginAccount(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseAuthError(res, "登录失败。"));
  return (await res.json()) as AuthResponse;
}

export async function logoutAccount(): Promise<void> {
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseAuthError(res, "退出登录失败。"));
}

export async function fetchCredits(): Promise<CreditsInfo> {
  const res = await fetch("/api/credits", { credentials: "include" });
  if (!res.ok) throw new Error(await parseAuthError(res, "获取积分失败。"));
  return (await res.json()) as CreditsInfo;
}
