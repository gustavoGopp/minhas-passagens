import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import { getDecryptedKeyWith, saveSecretWith } from "@/lib/integrations/repo";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OAuthError, refreshAccessToken, revokeToken } from "./google-oauth";
import { GMAIL_HEALTH_EVERY_HOURS, maskEmail } from "./status";

export { gmailExpiredEvent, maskEmail } from "./status";

/** Conexão do Gmail como a UI vê (sem token). */
export interface MailAccount {
  email: string | null;
  status: "active" | "expired";
  connected_at: string;
  last_refresh_ok_at: string | null;
  last_error: string | null;
}

/** Credenciais do cliente OAuth do Google (variáveis da Vercel). Null se faltarem. */
export function googleClient(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Segredo do cookie de estado do OAuth, derivado da chave mestra (não precisa de variável nova). */
export function oauthStateSecret(): string {
  return createHash("sha256")
    .update(`gmail-oauth-state:${serverEnv().BYOK_MASTER_KEY}`)
    .digest("base64url");
}

export async function getMailAccount(userId: string): Promise<MailAccount | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("mail_accounts")
    .select("email, status, connected_at, last_refresh_ok_at, last_error")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler a conexão do Gmail: ${error.message}`);
  return (data as MailAccount | null) ?? null;
}

/** Grava a conexão (callback do OAuth): token cifrado + estado. */
export async function saveGmailConnection(
  userId: string,
  refreshToken: string,
  email: string,
  historyId: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  await saveSecretWith(admin, userId, "gmail", refreshToken, maskEmail(email));
  const now = new Date().toISOString();
  const { error } = await admin.from("mail_accounts").upsert(
    {
      user_id: userId,
      provider: "gmail",
      email,
      history_id: historyId || null,
      status: "active",
      connected_at: now,
      last_refresh_ok_at: now,
      last_error: null,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`Falha ao salvar a conexão do Gmail: ${error.message}`);
}

/** Desconecta: revoga no Google (melhor esforço) e apaga token e estado. */
export async function disconnectGmail(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const token = await getDecryptedKeyWith(admin, userId, "gmail").catch(() => null);
  if (token) await revokeToken(token);
  await admin.from("user_integrations").delete().eq("user_id", userId).eq("provider", "gmail");
  await admin.from("mail_accounts").delete().eq("user_id", userId);
}

/**
 * Saúde das conexões (agendador): renova o access token de cada conta ativa que
 * não foi renovada nas últimas 20 h. `invalid_grant` marca a conta como expirada.
 */
export async function gmailHealth(
  admin: SupabaseClient,
  now: string,
  f: typeof fetch = fetch,
): Promise<{ checked: number; expired: number; failed: number } | null> {
  const client = googleClient();
  if (!client) return null;
  const cutoff = new Date(Date.parse(now) - GMAIL_HEALTH_EVERY_HOURS * 3_600_000).toISOString();
  const { data, error } = await admin
    .from("mail_accounts")
    .select("user_id, last_refresh_ok_at")
    .eq("status", "active")
    .or(`last_refresh_ok_at.is.null,last_refresh_ok_at.lt."${cutoff}"`)
    .limit(20);
  if (error) throw new Error(`mail_accounts: ${error.message}`);
  let checked = 0;
  let expired = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const userId = row.user_id as string;
    try {
      const token = await getDecryptedKeyWith(admin, userId, "gmail");
      if (!token) throw new OAuthError("invalid_grant", "sem token");
      await refreshAccessToken(client, token, f);
      await admin
        .from("mail_accounts")
        .update({ last_refresh_ok_at: now, last_error: null })
        .eq("user_id", userId);
      checked++;
    } catch (e) {
      const revoked = e instanceof OAuthError && e.revoked;
      await admin
        .from("mail_accounts")
        .update({
          ...(revoked ? { status: "expired" } : {}),
          last_error: (e as Error).message.slice(0, 300),
        })
        .eq("user_id", userId);
      if (revoked) expired++;
      else failed++;
    }
  }
  return { checked, expired, failed };
}
