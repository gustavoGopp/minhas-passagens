import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_ATTEMPTS, type AttemptState } from "@/lib/notify/delivery";
import type { NotifyEvent } from "@/lib/notify/events";
import type { Profile } from "@/lib/profiles/repo";
import { utcToLocal } from "@/lib/trips/time";
import { alertMessage, type PriceAlertItem, type Signal } from "./alerts";
import { performCheck, type MonitorRow } from "./repo";

/** Monitores por tick: cada checagem faz ~1 requisição por data-alvo. */
export const MONITORS_PER_TICK = 5;

/** Se a checagem quebrar no meio, o monitor volta a ficar vencido depois disto. */
export const CLAIM_MINUTES = 30;

/**
 * Roda as checagens vencidas (next_check_at <= agora), em lote. Cada monitor é
 * reservado antes (update condicional), então dois ticks não checam o mesmo e uma
 * falha no meio não o deixa vencido para sempre. Para de começar checagens novas
 * quando `deadline` (epoch ms) passa, para o tick não estourar o tempo da função.
 */
export async function runDueMonitors(
  admin: SupabaseClient,
  now: string,
  limit = MONITORS_PER_TICK,
  deadline = Number.POSITIVE_INFINITY,
  clock: () => number = Date.now,
) {
  const { data, error } = await admin
    .from("price_monitors")
    .select(
      "id, user_id, name, kind, origin, destination, rule, horizon_weeks, target_cents, margin_cents, margin_pct, airlines, allow_connections, max_duration_min, frequency, provider, active, next_check_at, last_checked_at, last_error, created_at",
    )
    .eq("active", true)
    .lte("next_check_at", now)
    .order("next_check_at")
    .limit(limit);
  if (error) throw new Error(error.message);
  const monitors = (data ?? []) as unknown as MonitorRow[];
  if (!monitors.length) return { checked: 0, failed: 0, skipped: 0 };

  const userIds = [...new Set(monitors.map((m) => m.user_id))];
  const { data: profiles } = await admin.from("profiles").select("*").in("id", userIds);
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p as Profile]));

  let checked = 0;
  let failed = 0;
  let skipped = 0;
  for (const raw of monitors) {
    if (clock() > deadline) {
      skipped++;
      continue; // fica para o próximo tick
    }
    if (!(await claimMonitor(admin, raw.id, now))) continue;
    const m: MonitorRow = {
      ...raw,
      origin: raw.origin.trim(),
      destination: raw.destination.trim(),
      target_cents: Number(raw.target_cents),
      margin_cents: raw.margin_cents == null ? null : Number(raw.margin_cents),
      margin_pct: raw.margin_pct == null ? null : Number(raw.margin_pct),
    };
    try {
      const r = await performCheck(admin, m, byId.get(m.user_id) ?? null, now);
      if (r.ok) checked++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { checked, failed, skipped };
}

/** Reserva o monitor: só quem conseguir mover next_check_at para a frente checa. */
export async function claimMonitor(admin: SupabaseClient, id: string, now: string) {
  const until = new Date(Date.parse(now) + CLAIM_MINUTES * 60_000).toISOString();
  const { data, error } = await admin
    .from("price_monitors")
    .update({ next_check_at: until })
    .eq("id", id)
    .lte("next_check_at", now)
    .select("id");
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

export interface PendingPriceEvent {
  userId: string;
  alertIds: string[];
  /** Data do voo já passou: marca como resolvido sem enviar. */
  expired: boolean;
  /** Tentativas anteriores (canais que falharam), para a espera crescente. */
  attempt?: AttemptState;
  event: NotifyEvent;
}

/** Avisos de preço ainda não enviados, agrupados num aviso por monitor. */
export async function pendingPriceEvents(
  admin: SupabaseClient,
  now: string,
  timeZoneOf: (userId: string) => string,
): Promise<PendingPriceEvent[]> {
  const { data, error } = await admin
    .from("price_alerts")
    .select(
      "id, monitor_id, user_id, flight_date, departs_local, airline, flight_number, price_cents, signals, attempts, last_attempt_at, price_monitors(origin, destination)",
    )
    .is("sent_at", null)
    .order("flight_date")
    .limit(200);
  if (error) throw new Error(error.message);

  const groups = new Map<string, NonNullable<typeof data>>();
  for (const a of data ?? []) {
    const k = a.monitor_id as string;
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }

  const out: PendingPriceEvent[] = [];
  for (const [monitorId, rows] of groups) {
    const userId = rows[0].user_id as string;
    const today = utcToLocal(now, timeZoneOf(userId)).slice(0, 10);
    const mon = rows[0].price_monitors as unknown as { origin: string; destination: string } | null;
    // Só o aviso mais recente de cada data vale.
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) latest.set(r.flight_date as string, r);
    const live = [...latest.values()].filter((r) => (r.flight_date as string) >= today);
    const items: PriceAlertItem[] = live.map((r) => ({
      date: r.flight_date as string,
      signals: r.signals as Signal[],
      offer: {
        date: r.flight_date as string,
        time: String(r.departs_local).slice(11, 16),
        origin: mon?.origin.trim() ?? "",
        destination: mon?.destination.trim() ?? "",
        airline: r.airline as string,
        flightNumber: (r.flight_number as string | null) ?? null,
        priceCents: Number(r.price_cents),
        currency: "BRL",
        transfers: 0,
        durationMin: null,
        foundAt: null,
      },
    }));
    const ids = rows.map((r) => r.id as string);
    const attempts = Math.max(0, ...rows.map((r) => Number(r.attempts ?? 0)));
    const lastAttempt = rows
      .map((r) => r.last_attempt_at as string | null)
      .filter((v): v is string => Boolean(v))
      .sort()
      .pop();
    const attempt: AttemptState | undefined = attempts
      ? { status: "failed", attempts, last_attempt_at: lastAttempt ?? null }
      : undefined;
    if (!items.length || !mon) {
      out.push({ userId, alertIds: ids, expired: true, event: emptyEvent(monitorId) });
      continue;
    }
    const msg = alertMessage(
      { id: monitorId, origin: mon.origin.trim(), destination: mon.destination.trim() },
      items,
    );
    out.push({
      userId,
      alertIds: ids,
      expired: false,
      attempt,
      event: { key: `price:${ids[0]}`, ...msg, urgent: false },
    });
  }
  return out;
}

function emptyEvent(monitorId: string): NotifyEvent {
  return { key: `price-expired:${monitorId}`, title: "", body: "", path: "", urgent: false };
}

/** Marca avisos de preço como enviados (ou resolvidos). */
export async function markPriceAlertsSent(
  admin: SupabaseClient,
  ids: string[],
  channels: string[],
  now: string,
) {
  const { error } = await admin
    .from("price_alerts")
    .update({ sent_at: now, channels, last_error: null })
    .in("id", ids);
  if (error) throw new Error(`price_alerts: ${error.message}`);
}

/**
 * Registra uma tentativa sem entrega. Depois de MAX_ATTEMPTS (ou sem canal, com
 * `resolve`), o aviso é encerrado com `sent_at` e canais vazios, e o motivo fica em last_error.
 */
export async function markPriceAlertsFailed(
  admin: SupabaseClient,
  ids: string[],
  prev: AttemptState | undefined,
  error: string,
  now: string,
  resolve: boolean,
) {
  const attempts = (prev?.attempts ?? 0) + (resolve ? 0 : 1);
  const giveUp = resolve || attempts >= MAX_ATTEMPTS;
  const res = await admin
    .from("price_alerts")
    .update({
      attempts,
      last_error: error.slice(0, 300),
      last_attempt_at: now,
      ...(giveUp ? { sent_at: now, channels: [] } : {}),
    })
    .in("id", ids);
  if (res.error) throw new Error(`price_alerts: ${res.error.message}`);
}
