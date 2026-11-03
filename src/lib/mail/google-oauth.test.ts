import { describe, expect, it } from "vitest";
import {
  authUrl,
  exchangeCode,
  GMAIL_SCOPE,
  hasGmailScope,
  OAuthError,
  pkceChallenge,
  pkcePair,
  refreshAccessToken,
  signState,
  verifyState,
} from "./google-oauth";

const client = {
  clientId: "cid",
  clientSecret: "sec",
  redirectUri: "https://app/api/gmail/callback",
};

describe("OAuth do Gmail", () => {
  it("URL pede só leitura, acesso offline, consentimento e PKCE S256", () => {
    const { challenge } = pkcePair();
    const u = new URL(authUrl(client, "st", challenge, "a@b.c"));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("scope")).toBe(GMAIL_SCOPE);
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBe(challenge);
    expect(u.searchParams.get("redirect_uri")).toBe(client.redirectUri);
    expect(u.searchParams.get("login_hint")).toBe("a@b.c");
  });

  it("desafio PKCE segue a RFC 7636 (exemplo do apêndice B)", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("estado assinado: aceita o certo, recusa adulterado ou vencido", () => {
    const s = { userId: "u1", state: "x", verifier: "v", exp: 2_000 };
    const c = signState(s, "segredo");
    expect(verifyState(c, "segredo", 1_000)).toEqual(s);
    expect(verifyState(c, "outro", 1_000)).toBeNull();
    expect(verifyState(c, "segredo", 3_000)).toBeNull();
    const [body, mac] = c.split(".");
    const forged = Buffer.from(JSON.stringify({ ...s, userId: "u2" })).toString("base64url");
    expect(verifyState(`${forged}.${mac}`, "segredo", 1_000)).toBeNull();
    expect(verifyState(`${body}`, "segredo", 1_000)).toBeNull();
    expect(verifyState(undefined, "segredo", 1_000)).toBeNull();
  });

  it("troca o código mandando o verificador e devolve o refresh token", async () => {
    let sent: URLSearchParams | null = null;
    const t = await exchangeCode(client, "code1", "ver1", async (_url, init) => {
      sent = init?.body as URLSearchParams;
      return Response.json({
        access_token: "at",
        refresh_token: "rt",
        scope: `openid ${GMAIL_SCOPE}`,
        expires_in: 3599,
      });
    });
    expect(sent!.get("code_verifier")).toBe("ver1");
    expect(sent!.get("grant_type")).toBe("authorization_code");
    expect(t).toEqual({
      accessToken: "at",
      refreshToken: "rt",
      scope: `openid ${GMAIL_SCOPE}`,
      expiresIn: 3599,
    });
    expect(hasGmailScope(t.scope)).toBe(true);
    expect(hasGmailScope("openid email")).toBe(false);
  });

  it("invalid_grant na renovação vira acesso encerrado", async () => {
    const err = await refreshAccessToken(client, "rt", async () =>
      Response.json(
        { error: "invalid_grant", error_description: "Token has been expired or revoked." },
        { status: 400 },
      ),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(OAuthError);
    expect((err as OAuthError).revoked).toBe(true);
  });
});

describe("status da conexão", async () => {
  const { gmailExpiredEvent, maskEmail } = await import("./status");
  it("mascara o e-mail na dica", () => {
    expect(maskEmail("gustavo@gmail.com")).toBe("gu•••@gmail.com");
    expect(maskEmail("sem-arroba")).toBe("••••");
  });
  it("aviso de reconexão diz quantos dias o acesso durou", () => {
    const e = gmailExpiredEvent(
      { connected_at: "2026-11-01T10:00:00.000Z" },
      "2026-11-08T11:00:00.000Z",
    );
    expect(e.key).toBe("gmail-expired:2026-11-01T10:00:00.000Z");
    expect(e.body).toContain("7 dia(s)");
    expect(e.path).toBe("/app/integracoes");
  });
});
