import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/current-user";
import { googleClient, oauthStateSecret } from "@/lib/mail/accounts";
import { authUrl, pkcePair, signState } from "@/lib/mail/google-oauth";
import { getRequestOrigin } from "@/lib/request-origin";

const STATE_COOKIE = "mp_gmail_oauth";

/** Começa a conexão com o Gmail (só leitura): leva ao consentimento do Google. */
export async function GET() {
  const origin = await getRequestOrigin();
  const user = await getOptionalUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/app/integracoes`);
  const client = googleClient();
  if (!client) return NextResponse.redirect(`${origin}/app/integracoes?gmail=configurar`);

  const { verifier, challenge } = pkcePair();
  const state = randomBytes(16).toString("base64url");
  const redirectUri = `${origin}/api/gmail/callback`;
  const res = NextResponse.redirect(
    authUrl({ ...client, redirectUri }, state, challenge, user.email ?? undefined),
  );
  res.cookies.set(
    STATE_COOKIE,
    signState(
      { userId: user.id, state, verifier, exp: Date.now() + 10 * 60_000 },
      oauthStateSecret(),
    ),
    {
      httpOnly: true,
      secure: origin.startsWith("https://"),
      sameSite: "lax",
      path: "/api/gmail",
      maxAge: 600,
    },
  );
  return res;
}
