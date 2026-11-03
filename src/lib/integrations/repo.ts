import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import { decryptSecret, encryptSecret, keyHint, secretContext } from "@/lib/crypto/byok";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const PROVIDERS = ["anthropic", "travelpayouts", "resend", "duffel", "serpapi"] as const;
export type Provider = (typeof PROVIDERS)[number];
/** Segredos guardados em user_integrations: chaves coladas e o acesso ao Gmail (OAuth). */
export type SecretProvider = Provider | "gmail";

/** Forma segura para a UI: nunca inclui a chave cifrada. */
export interface IntegrationPublic {
  provider: Provider;
  key_hint: string;
  status: "active" | "invalid";
  validated_at: string | null;
  updated_at: string;
}

export async function listIntegrationsPublic(userId: string): Promise<IntegrationPublic[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_integrations")
    .select("provider, key_hint, status, validated_at, updated_at")
    .eq("user_id", userId)
    .order("provider");
  if (error) throw new Error(`Falha ao listar integrações: ${error.message}`);
  return (data ?? []) as IntegrationPublic[];
}

export async function saveIntegration(
  userId: string,
  provider: Provider,
  plainKey: string,
  validated: boolean,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("user_integrations").upsert(
    {
      user_id: userId,
      provider,
      encrypted_key: encryptSecret(
        plainKey,
        serverEnv().BYOK_MASTER_KEY,
        secretContext(userId, provider),
      ),
      key_hint: keyHint(plainKey),
      status: validated ? "active" : "invalid",
      validated_at: validated ? new Date().toISOString() : null,
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error(`Falha ao salvar a chave: ${error.message}`);
}

export async function removeIntegration(userId: string, provider: SecretProvider): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("user_integrations")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw new Error(`Falha ao remover a chave: ${error.message}`);
}

/**
 * Chave em claro para uso no servidor (extração, monitor de preços).
 * Devolve null se o usuário não configurou o provedor.
 */
export async function getDecryptedKey(
  userId: string,
  provider: SecretProvider,
): Promise<string | null> {
  return getDecryptedKeyWith(await createSupabaseServerClient(), userId, provider);
}

/** Chaves de um provedor para todos os usuários (agendador, service role). */
export async function listDecryptedKeys(
  client: SupabaseClient,
  provider: SecretProvider,
): Promise<Map<string, string>> {
  const { data, error } = await client
    .from("user_integrations")
    .select("user_id, encrypted_key")
    .eq("provider", provider);
  if (error) throw new Error(`Falha ao ler chaves: ${error.message}`);
  const out = new Map<string, string>();
  for (const r of data ?? []) {
    try {
      out.set(
        r.user_id as string,
        decryptSecret(
          r.encrypted_key as string,
          serverEnv().BYOK_MASTER_KEY,
          secretContext(r.user_id as string, provider),
        ),
      );
    } catch {
      // chave corrompida: ignora este usuário
    }
  }
  return out;
}

/** Igual a getDecryptedKey, com um cliente dado (ex.: service role no agendador). */
export async function getDecryptedKeyWith(
  client: SupabaseClient,
  userId: string,
  provider: SecretProvider,
): Promise<string | null> {
  const { data, error } = await client
    .from("user_integrations")
    .select("encrypted_key")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler a chave: ${error.message}`);
  if (!data) return null;
  return decryptSecret(
    data.encrypted_key as string,
    serverEnv().BYOK_MASTER_KEY,
    secretContext(userId, provider),
  );
}

/** Grava um segredo com um cliente dado (ex.: token do Gmail, gravado no callback do OAuth). */
export async function saveSecretWith(
  client: SupabaseClient,
  userId: string,
  provider: SecretProvider,
  plain: string,
  hint: string,
): Promise<void> {
  const { error } = await client.from("user_integrations").upsert(
    {
      user_id: userId,
      provider,
      encrypted_key: encryptSecret(
        plain,
        serverEnv().BYOK_MASTER_KEY,
        secretContext(userId, provider),
      ),
      key_hint: hint,
      status: "active",
      validated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error(`Falha ao salvar o acesso: ${error.message}`);
}
