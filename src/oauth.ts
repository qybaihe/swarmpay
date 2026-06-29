// oauth.ts
// EvoMap 开发套件官方 OAuth2 + PKCE 流程(对齐 examples/quickstart/index.js)
// 让用户在官网点"Connect with EvoMap"即可授权,拿到 access_token 用于 recipe/gene/reuse 读写。
// token 不落浏览器,只在服务端内存/返回给用户复制(开发期)。

import crypto from "node:crypto";
import { config } from "./config.js";
import { emit } from "./log.js";

const BASE = config.evomapBaseUrl;
// 官方 quickstart 钦定的自助 scope(全部自动通过,无需审核)
// 注意:app 状态 pending 时只能用这三个;recipe:write/publish 可能需 app approved
const SCOPE = "recipe:read gene:read reuse:query";
const pending = new Map<string, string>(); // state -> code_verifier

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** 构造授权 URL(PKCE S256)+ 缓存 verifier */
export function buildAuthorizeUrl(): { url: string; configured: boolean } {
  if (!config.oauthClientId) {
    return { url: "", configured: false };
  }
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  pending.set(state, verifier);

  const url =
    `${BASE}/oauth/authorize?` +
    new URLSearchParams({
      response_type: "code",
      client_id: config.oauthClientId,
      redirect_uri: config.oauthRedirectUri,
      scope: SCOPE,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    });
  return { url, configured: true };
}

/** 用授权码换 token(回调时调用) */
export async function exchangeCodeForToken(code: string, state: string): Promise<{
  ok: boolean;
  accessToken?: string;
  error?: string;
}> {
  const verifier = pending.get(state);
  if (!verifier) return { ok: false, error: "unknown_state" };
  pending.delete(state);

  try {
    const res = await fetch(`${BASE}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: config.oauthClientId,
        ...(config.oauthClientSecret ? { client_secret: config.oauthClientSecret } : {}),
        redirect_uri: config.oauthRedirectUri,
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json().catch(() => null)) as { access_token?: string; error?: string } | null;
    if (!res.ok || !data?.access_token) {
      return { ok: false, error: data?.error || `token_exchange_failed_${res.status}` };
    }
    emit("inherit", `🧬 OAuth 授权成功,已拿到开发套件 access_token`);
    return { ok: true, accessToken: data.access_token };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 当前是否配置了 OAuth app(可走开发套件流程) */
export function isOAuthConfigured(): boolean {
  return !!config.oauthClientId;
}
