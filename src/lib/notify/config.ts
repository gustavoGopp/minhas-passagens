import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ConfigKey =
  | "vapid_public_key"
  | "vapid_private_key"
  | "jobs_secret"
  | "app_url"
  | "telegram_bot_token"
  | "telegram_bot_username"
  | "telegram_webhook_secret"
  // Saúde do agendador (M8): horário do último tick, retenção diária e vigia.
  | "last_tick_at"
  | "retention_last_run"
  | "watchdog_alert_at"
  | "watchdog_run_at";

/** Lê chaves internas de public.app_config (só o service role tem acesso). */
export async function getConfig<K extends ConfigKey>(
  keys: K[],
): Promise<Partial<Record<K, string>>> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("app_config").select("key, value").in("key", keys);
  if (error) throw new Error(`Falha ao ler app_config: ${error.message}`);
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Partial<
    Record<K, string>
  >;
}

/** Grava chaves internas em public.app_config (upsert). */
export async function setConfig(values: Partial<Record<ConfigKey, string>>): Promise<void> {
  const rows = Object.entries(values).map(([key, value]) => ({
    key,
    value: value as string,
    updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("app_config").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(`Falha ao gravar app_config: ${error.message}`);
}

/** Comparação em tempo constante para segredos. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
