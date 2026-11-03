import { NextResponse, type NextRequest } from "next/server";
import { getOptionalUser } from "@/lib/auth/current-user";
import { googleClient, oauthStateSecret, saveGmailConnection } from "@/lib/mail/accounts";
import {
  exchangeCode,
  gmailProfile,
  hasGmailScope,
  revokeToken,
  verifyState,
} from "@/lib/mail/google-oauth";
import { getRequestOrigin } from "@/lib/request-origin";

const STATE_COOKIE = "mp_gmail_oauth";

/** Volta do consentimento do Google: confere o estado, troca o código e guarda o acesso cifrado. */
export async function GET(request: NextRequest) {
  const origin = await getRequestOrigin();
  const back = (status: string) => {
    const res = NextResponse.redirect(`${origin}/app/integracoes?gmail=${status}`);
    res.cookies.set(STATE_COOKIE, "", { path: "/api/gmail", maxAge: 0 });
    return res;
  };

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back("negado");
  const st = verifyState(request.cookies.get(STATE_COOKIE)?.value, oauthStateSecret(), Date.now());
  const user = await getOptionalUser();
  const code = params.get("code");
  if (!st || !user || st.userId !== user.id || st.state !== params.get("state") || !code) {
    return back("estado");
  }
  const client = googleClient();
  if (!client) return back("configurar");

  try {
    const tokens = await exchangeCode(
      { ...client, redirectUri: `${origin}/api/gmail/callback` },
      code,
      st.verifier,
    );
    if (!hasGmailScope(tokens.scope)) {
      await revokeToken(tokens.accessToken);
      return back("escopo");
    }
    if (!tokens.refreshToken) return back("sem-acesso-continuo");
    const profile = await gmailProfile(tokens.accessToken);
    await saveGmailConnection(user.id, tokens.refreshToken, profile.email, profile.historyId);
    return back("conectado");
  } catch {
    return back("falha");
  }
}
