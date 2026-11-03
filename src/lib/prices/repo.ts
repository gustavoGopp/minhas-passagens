import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { airportTimeZone } from "@/lib/airports";
import { holidaysAround, overridesFromRows, type HolidayEvent } from "@/lib/holidays";
import { getDecryptedKeyWith } from "@/lib/integrations/repo";
import { holidayPreferences, type Profile } from "@/lib/profiles/repo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { utcToLocal } from "@/lib/trips/time";
import type { HistoryPoint } from "./alerts";
import { runCheck, type CheckResult } from "./check";
import { monthStart, serpapiAllowance } from "./hybrid";
import { getProvider, ProviderAuthError, type PriceProvider } from "./providers";
import { serpapiSearchesLeft } from "./providers/serpapi";
import { nextCheckAt } from "./schedule";
import type { MonitorInput } from "./schema";
import type { MonitorConfig, MonitorKind, MonitorRule } from "./types";

export interface MonitorRow extends MonitorConfig {
  user_id: string;
  name: string | null;
  kind: MonitorKind;
  active: boolean;
  next_check_at: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  created_at: string;
  /** 1º dia do feriadão, nos monitores criados por "Monitorar este feriadão". */
  long_weekend: string | null;
}

export interface CheckRow {
  id: string;
  monitor_id: string;
  provider: string;
  checked_at: string;
  target_dates: number;
  dates_with_data: number;
  dates_in_window: number;
  dates_matched: number;
  requests: number;
  failed: number;
  min_price_cents: number | null;
  min_near_holiday: boolean;
  error: string | null;
}

export interface ObservationView {
  check_id: string | null;
  flight_date: string;
  departs_local: string;
  airline: string;
  flight_number: string | null;
  price_cents: number;
  transfers: number;
  duration_min: number | null;
  near_holiday: boolean;
  observed_at: string;
}

const MONITOR_COLS =
  "id, user_id, name, kind, origin, destination, rule, horizon_weeks, target_cents, margin_cents, margin_pct, airlines, allow_connections, max_duration_min, frequency, provider, active, next_check_at, last_checked_at, last_error, created_at, long_weekend";
const CHECK_COLS =
  "id, monitor_id, provider, checked_at, target_dates, dates_with_data, dates_in_window, dates_matched, requests, failed, min_price_cents, min_near_holiday, error";

function toRow(r: Record<string, unknown>): MonitorRow {
  return {
    ...(r as unknown as MonitorRow),
    origin: String(r.origin).trim(),
    destination: String(r.destination).trim(),
    rule: r.rule as MonitorRule,
    target_cents: Number(r.target_cents),
    margin_cents: r.margin_cents == null ? null : Number(r.margin_cents),
    margin_pct: r.margin_pct == null ? null : Number(r.margin_pct),
    airlines: (r.airlines as string[]) ?? [],
    long_weekend: (r.long_weekend as string | null) ?? null,
  };
}

export async function listMonitors(userId: string): Promise<MonitorRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("price_monitors")
    .select(MONITOR_COLS)
    .eq("user_id", userId)
    .order("created_at");
  if (error) throw new Error(`Falha ao listar monitores: ${error.message}`);
  return (data ?? []).map(toRow);
}

export async function getMonitor(userId: string, id: string): Promise<MonitorRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("price_monitors")
    .select(MONITOR_COLS)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler o monitor: ${error.message}`);
  return data ? toRow(data) : null;
}

/** Últimas checagens dos monitores (mais recentes primeiro). */
export async function listChecks(
  userId: string,
  monitorIds: string[],
  sinceDays = 60,
): Promise<CheckRow[]> {
  if (!monitorIds.length) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("price_checks")
    .select(CHECK_COLS)
    .eq("user_id", userId)
    .in("monitor_id", monitorIds)
    .gte("checked_at", new Date(Date.now() - sinceDays * 86_400_000).toISOString())
    .order("checked_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`Falha ao ler checagens: ${error.message}`);
  return (data ?? []).map((c) => ({
    ...(c as CheckRow),
    min_price_cents: numOrNull(c.min_price_cents),
    min_near_holiday: Boolean(c.min_near_holiday),
  }));
}

export async function listObservations(
  userId: string,
  monitorId: string,
  checkId: string,
): Promise<ObservationView[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("price_observations")
    .select(
      "check_id, flight_date, departs_local, airline, flight_number, price_cents, transfers, duration_min, near_holiday, observed_at",
    )
    .eq("user_id", userId)
    .eq("monitor_id", monitorId)
    .eq("check_id", checkId)
    .order("flight_date")
    .order("price_cents");
  if (error) throw new Error(`Falha ao ler observações: ${error.message}`);
  return (data ?? []).map((o) => ({
    ...(o as ObservationView),
    price_cents: Number(o.price_cents),
  }));
}

function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

export async function saveMonitor(
  userId: string,
  input: MonitorInput,
  timeZone: string,
  id?: string,
  extra: { long_weekend?: string } = {},
): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const row = {
    user_id: userId,
    name: input.name || null,
    kind: input.kind,
    origin: input.origin,
    destination: input.destination,
    rule: input.rule,
    horizon_weeks: input.horizon_weeks,
    target_cents: input.target_cents,
    margin_cents: input.margin_cents,
    margin_pct: input.margin_pct,
    airlines: input.airlines,
    allow_connections: input.allow_connections,
    max_duration_min: input.max_duration_min,
    frequency: input.frequency,
    provider: input.provider,
    active: input.active,
  };
  if (id) {
    const { error } = await supabase
      .from("price_monitors")
      .update({
        ...row,
        next_check_at: nextCheckAt(input.frequency, new Date().toISOString(), timeZone, id),
      })
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw new Error(`Falha ao salvar o monitor: ${error.message}`);
    return id;
  }
  // Primeira checagem no próximo ciclo do agendador.
  const { data, error } = await supabase
    .from("price_monitors")
    .insert({
      ...row,
      long_weekend: extra.long_weekend ?? null,
      next_check_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar o monitor: ${error.message}`);
  return data.id as string;
}

export async function deleteMonitor(userId: string, id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("price_monitors")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(`Falha ao apagar o monitor: ${error.message}`);
}

export async function setMonitorActive(userId: string, id: string, active: boolean) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("price_monitors")
    .update({ active, next_check_at: active ? new Date().toISOString() : null })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(`Falha ao atualizar o monitor: ${error.message}`);
}

/** Antecipa a checagem dos monitores ativos de um provedor (ex.: logo após salvar a chave). */
export async function checkMonitorsSoon(userId: string, provider: string) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("price_monitors")
    .update({ next_check_at: new Date().toISOString(), last_error: null })
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("active", true);
}

/** Feriados do ano corrente e do seguinte conforme as preferências do usuário. */
export async function holidaysFor(
  client: SupabaseClient,
  userId: string,
  profile: Profile | null,
  today: string,
): Promise<HolidayEvent[]> {
  const { data } = await client
    .from("holiday_overrides")
    .select("action, date, event_key, name, kind")
    .eq("user_id", userId);
  return holidaysAround(today, holidayPreferences(profile), overridesFromRows(data ?? []));
}

export type PerformResult =
  | { ok: true; result: CheckResult; checkId: string }
  | { ok: false; error: string; needsKey?: boolean };

/**
 * Executa e grava uma checagem: price_checks, price_observations, price_alerts
 * e o próximo horário no monitor. Funciona com o cliente do usuário (RLS) ou
 * com o service role (agendador).
 */
export async function performCheck(
  client: SupabaseClient,
  monitor: MonitorRow,
  profile: Profile | null,
  now = new Date().toISOString(),
): Promise<PerformResult> {
  const tz = profile?.timezone ?? "America/Sao_Paulo";
  const today = utcToLocal(now, tz).slice(0, 10);
  const next = nextCheckAt(monitor.frequency, now, tz, monitor.id);

  const finish = async (error: string | null) => {
    await client
      .from("price_monitors")
      .update({ last_checked_at: now, next_check_at: next, last_error: error })
      .eq("id", monitor.id);
  };

  const apiKey = await getDecryptedKeyWith(client, monitor.user_id, monitor.provider);
  if (!apiKey) {
    const error = "Configure a chave do provedor em Mais → Integrações.";
    await finish(error);
    return { ok: false, error, needsKey: true };
  }

  const since = new Date(Date.parse(now) - 90 * 86_400_000).toISOString();
  const [holidays, hist, alerted] = await Promise.all([
    holidaysFor(client, monitor.user_id, profile, today),
    client
      .from("price_observations")
      .select("flight_date, price_cents, observed_at, near_holiday")
      .eq("monitor_id", monitor.id)
      .gte("observed_at", since)
      .order("observed_at", { ascending: false })
      .limit(5000),
    client
      .from("price_alerts")
      .select("flight_date, price_cents, created_at")
      .eq("monitor_id", monitor.id)
      .gte("flight_date", today)
      .order("created_at", { ascending: false }),
  ]);
  const history: HistoryPoint[] = (hist.data ?? []).map((h) => ({
    flight_date: h.flight_date as string,
    price_cents: Number(h.price_cents),
    observed_at: h.observed_at as string,
    near_holiday: Boolean(h.near_holiday),
  }));
  const lastAlerted = new Map<string, number>();
  for (const a of alerted.data ?? []) {
    const d = a.flight_date as string;
    if (!lastAlerted.has(d)) lastAlerted.set(d, Number(a.price_cents));
  }

  const near = await nearProvider(client, monitor, now);

  let result: CheckResult;
  try {
    result = await runCheck({
      near: near.use,
      nearSkipped: near.skipped,
      monitor,
      provider: getProvider(monitor.provider),
      apiKey,
      originTimeZone: airportTimeZone(monitor.origin) ?? "America/Sao_Paulo",
      today,
      now,
      holidays,
      history,
      lastAlerted,
    });
  } catch (e) {
    const error =
      e instanceof ProviderAuthError
        ? "O provedor recusou a chave. Confira em Mais → Integrações."
        : `Falha na consulta: ${(e as Error).message}`.slice(0, 500);
    await client.from("price_checks").insert({
      monitor_id: monitor.id,
      user_id: monitor.user_id,
      provider: monitor.provider,
      checked_at: now,
      error,
    });
    await finish(error);
    return { ok: false, error };
  }

  const s = result.summary;
  const base = {
    monitor_id: monitor.id,
    user_id: monitor.user_id,
    provider: s.provider,
    checked_at: now,
    target_dates: s.target_dates,
    dates_with_data: s.dates_with_data,
    dates_in_window: s.dates_in_window,
    dates_matched: s.dates_matched,
    requests: s.requests,
    failed: s.failed,
    min_price_cents: s.min_price_cents,
    min_near_holiday: s.min_near_holiday,
    error: s.failed && s.failed === s.requests ? "Todas as consultas falharam." : null,
  };
  const insertCheck = (row: Record<string, unknown>) =>
    client.from("price_checks").insert(row).select("id").single();
  let { data: check, error: checkErr } = await insertCheck({
    ...base,
    ...(s.near ?? {}),
    near_skipped: s.near_skipped,
  });
  // Deploy antes da migração do piloto: grava sem as colunas novas em vez de perder a checagem.
  if (checkErr && /near_/.test(checkErr.message))
    ({ data: check, error: checkErr } = await insertCheck(base));
  if (checkErr || !check) {
    const msg = checkErr?.message ?? "falha ao gravar a checagem";
    await finish(msg);
    return { ok: false, error: msg };
  }
  const checkId = check.id as string;

  if (result.observations.length) {
    await client.from("price_observations").insert(
      result.observations.map((o) => ({
        ...o,
        monitor_id: monitor.id,
        check_id: checkId,
        user_id: monitor.user_id,
        provider: s.provider,
        observed_at: now,
      })),
    );
  }
  if (result.alerts.length) {
    await client.from("price_alerts").insert(
      result.alerts.map((a) => ({
        monitor_id: monitor.id,
        user_id: monitor.user_id,
        flight_date: a.date,
        departs_local: `${a.date}T${a.offer.time}`,
        airline: a.offer.airline,
        flight_number: a.offer.flightNumber,
        price_cents: a.offer.priceCents,
        signals: a.signals,
        created_at: now,
      })),
    );
  }
  await finish(s.failed && s.failed === s.requests ? "Todas as consultas falharam." : null);
  return { ok: true, result, checkId };
}

/**
 * Piloto híbrido: decide se as datas próximas também vão à SerpApi. Só com chave
 * do próprio usuário, monitor no Travelpayouts e cota grátis do mês sobrando.
 * Na dúvida (erro ao contar), não usa: nunca passa do plano grátis.
 */
async function nearProvider(
  client: SupabaseClient,
  monitor: MonitorRow,
  now: string,
): Promise<{
  use: { provider: PriceProvider; apiKey: string; allowance: number } | null;
  skipped: string | null;
}> {
  if (monitor.provider !== "travelpayouts") return { use: null, skipped: null };
  const key = await getDecryptedKeyWith(client, monitor.user_id, "serpapi").catch(() => null);
  if (!key) return { use: null, skipped: null };
  const { data, error } = await client
    .from("price_checks")
    .select("near_requests")
    .eq("user_id", monitor.user_id)
    .eq("near_provider", "serpapi")
    .gte("checked_at", monthStart(now));
  if (error) return { use: null, skipped: "não deu para contar a cota" };
  const used = (data ?? []).reduce((n, r) => n + Number(r.near_requests ?? 0), 0);
  const allowance = serpapiAllowance({
    usedThisMonth: used,
    searchesLeft: await serpapiSearchesLeft(key),
  });
  return { use: { provider: getProvider("serpapi"), apiKey: key, allowance }, skipped: null };
}

export interface PilotComparisonRow {
  route: string;
  checks: number;
  nearDates: number;
  serpInWindow: number;
  tpInWindow: number;
}

/** Comparação do piloto híbrido (últimos 7 dias) e buscas da SerpApi usadas no mês. */
export async function pilotComparison(
  userId: string,
  now = new Date().toISOString(),
): Promise<{ rows: PilotComparisonRow[]; serpUsedThisMonth: number; skipped: string[] }> {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.parse(now) - 7 * 86_400_000).toISOString();
  const [recent, month, monitors] = await Promise.all([
    supabase
      .from("price_checks")
      .select(
        "monitor_id, near_provider, near_dates, near_in_window, near_tp_in_window, near_skipped",
      )
      .eq("user_id", userId)
      .gte("checked_at", since),
    supabase
      .from("price_checks")
      .select("near_requests")
      .eq("user_id", userId)
      .eq("near_provider", "serpapi")
      .gte("checked_at", monthStart(now)),
    supabase.from("price_monitors").select("id, origin, destination").eq("user_id", userId),
  ]);
  if (recent.error) throw new Error(`Falha ao ler o piloto: ${recent.error.message}`);
  const routeOf = new Map(
    (monitors.data ?? []).map((m) => [
      m.id as string,
      `${String(m.origin).trim()} → ${String(m.destination).trim()}`,
    ]),
  );
  const by = new Map<string, PilotComparisonRow>();
  const skipped = new Set<string>();
  for (const c of recent.data ?? []) {
    if (c.near_skipped) skipped.add(c.near_skipped as string);
    if (c.near_provider !== "serpapi") continue;
    const route = routeOf.get(c.monitor_id as string) ?? "—";
    const row = by.get(route) ?? { route, checks: 0, nearDates: 0, serpInWindow: 0, tpInWindow: 0 };
    row.checks++;
    row.nearDates += Number(c.near_dates ?? 0);
    row.serpInWindow += Number(c.near_in_window ?? 0);
    row.tpInWindow += Number(c.near_tp_in_window ?? 0);
    by.set(route, row);
  }
  const serpUsedThisMonth = (month.data ?? []).reduce(
    (n, r) => n + Number(r.near_requests ?? 0),
    0,
  );
  return {
    rows: [...by.values()].sort((a, b) => a.route.localeCompare(b.route)),
    serpUsedThisMonth,
    skipped: [...skipped],
  };
}
