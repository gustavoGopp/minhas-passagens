import "server-only";
import { serverEnv } from "@/lib/env";
import { decryptSecret, encryptSecret, keyHint } from "@/lib/crypto/byok";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const PROVIDERS = ["anthropic", "travelpayouts", "duffel", "serpapi"] as const;
export type Provider = (typeof PROVIDERS)[number];

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
      encrypted_key: encryptSecret(plainKey, serverEnv().BYOK_MASTER_KEY),
      key_hint: keyHint(plainKey),
      status: validated ? "active" : "invalid",
      validated_at: validated ? new Date().toISOString() : null,
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error(`Falha ao salvar a chave: ${error.message}`);
}

export async function removeIntegration(userId: string, provider: Provider): Promise<void> {
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
export async function getDecryptedKey(userId: string, provider: Provider): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_integrations")
    .select("encrypted_key")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler a chave: ${error.message}`);
  if (!data) return null;
  return decryptSecret(data.encrypted_key as string, serverEnv().BYOK_MASTER_KEY);
}
