import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
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

/** Comparação em tempo constante para segredos (compara hashes: não revela o tamanho). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Reserva atômica de um intervalo: grava `nowIso` na chave só se o valor
 * anterior for mais velho que `minutes` (ou não existir). Duas chamadas
 * simultâneas não conseguem reservar o mesmo intervalo.
 */
export async function claimInterval(
  key: ConfigKey,
  nowIso: string,
  minutes: number,
): Promise<{ claimed: true; previous: string | null } | { claimed: false }> {
  const admin = createSupabaseAdminClient();
  const { data: cur, error: readErr } = await admin
    .from("app_config")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (readErr) throw new Error(`Falha ao ler app_config: ${readErr.message}`);
  const row = { key, value: nowIso, updated_at: nowIso };
  if (!cur) {
    const ins = await admin
      .from("app_config")
      .upsert(row, { onConflict: "key", ignoreDuplicates: true })
      .select("key");
    if (ins.error) throw new Error(`Falha ao gravar app_config: ${ins.error.message}`);
    if (ins.data?.length) return { claimed: true, previous: null };
  }
  const cutoff = new Date(Date.parse(nowIso) - minutes * 60_000).toISOString();
  const up = await admin
    .from("app_config")
    .update(row)
    .eq("key", key)
    .lt("value", cutoff)
    .select("key");
  if (up.error) throw new Error(`Falha ao gravar app_config: ${up.error.message}`);
  return up.data?.length
    ? { claimed: true, previous: (cur?.value as string) ?? null }
    : { claimed: false };
}
