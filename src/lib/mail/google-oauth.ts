import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * OAuth do Google para ler o Gmail (escopo só de leitura), separado do login.
 * Fluxo "web server" com PKCE: o app troca o código pelo refresh token no servidor.
 * Puro (sem banco), com `fetch` injetável para testes.
 */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

type FetchLike = typeof fetch;

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

/** Par PKCE: o verificador fica no cookie; o desafio vai para o Google. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: pkceChallenge(verifier) };
}

export function pkceChallenge(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest());
}

export function authUrl(c: OAuthClient, state: string, challenge: string, loginHint?: string) {
  const p = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `${AUTH_URL}?${p}`;
}

/**
 * Cookie de estado assinado (HMAC): liga o retorno do Google ao usuário que
 * começou o fluxo e guarda o verificador PKCE. Validade curta.
 */
export interface OAuthState {
  userId: string;
  state: string;
  verifier: string;
  exp: number;
}

export function signState(s: OAuthState, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(s)));
  const mac = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${mac}`;
}

export function verifyState(
  cookie: string | undefined,
  secret: string,
  nowMs: number,
): OAuthState | null {
  if (!cookie) return null;
  const [body, mac] = cookie.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
    return s.exp > nowMs ? s : null;
  } catch {
    return null;
  }
}

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
  /** O Google encerrou o acesso (revogado, senha trocada, app em teste há 7 dias…). */
  get revoked() {
    return this.code === "invalid_grant";
  }
}

async function postForm(url: string, form: Record<string, string>, f: FetchLike) {
  const res = await f(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = String(json.error ?? `http_${res.status}`);
    throw new OAuthError(code, `Google OAuth: ${code}`);
  }
  return json;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  scope: string;
  expiresIn: number;
}

/** Troca o código do retorno pelos tokens (inclui o refresh token com access_type=offline). */
export async function exchangeCode(
  c: OAuthClient,
  code: string,
  verifier: string,
  f: FetchLike = fetch,
): Promise<TokenSet> {
  const j = await postForm(
    TOKEN_URL,
    {
      code,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: c.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    },
    f,
  );
  return {
    accessToken: String(j.access_token ?? ""),
    refreshToken: j.refresh_token ? String(j.refresh_token) : null,
    scope: String(j.scope ?? ""),
    expiresIn: Number(j.expires_in ?? 0),
  };
}

/** Novo access token a partir do refresh token. Lança OAuthError("invalid_grant") se o acesso acabou. */
export async function refreshAccessToken(
  c: Pick<OAuthClient, "clientId" | "clientSecret">,
  refreshToken: string,
  f: FetchLike = fetch,
): Promise<{ accessToken: string; expiresIn: number }> {
  const j = await postForm(
    TOKEN_URL,
    {
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    },
    f,
  );
  return { accessToken: String(j.access_token ?? ""), expiresIn: Number(j.expires_in ?? 0) };
}

/** Revoga o acesso no Google (melhor esforço: o app apaga o token de qualquer jeito). */
export async function revokeToken(token: string, f: FetchLike = fetch): Promise<boolean> {
  try {
    const res = await f(REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Endereço e historyId da caixa (base da sincronização incremental). */
export async function gmailProfile(
  accessToken: string,
  f: FetchLike = fetch,
): Promise<{ email: string; historyId: string }> {
  const res = await f(PROFILE_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new OAuthError(`http_${res.status}`, `Gmail respondeu ${res.status}`);
  const j = (await res.json()) as { emailAddress?: string; historyId?: string };
  return { email: String(j.emailAddress ?? ""), historyId: String(j.historyId ?? "") };
}

/** O usuário pode desmarcar o escopo na tela do Google: confere se veio. */
export function hasGmailScope(scope: string): boolean {
  return scope.split(/\s+/).includes(GMAIL_SCOPE);
}
