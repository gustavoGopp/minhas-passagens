import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotifyEvent } from "@/lib/notify/events";
import type { Profile } from "@/lib/profiles/repo";
import { utcToLocal } from "@/lib/trips/time";
import { alertMessage, type PriceAlertItem, type Signal } from "./alerts";
import { performCheck, type MonitorRow } from "./repo";

/** Monitores por tick: cada checagem faz ~1 requisição por data-alvo. */
export const MONITORS_PER_TICK = 5;

/** Roda as checagens vencidas (next_check_at <= agora), em lote. */
export async function runDueMonitors(
  admin: SupabaseClient,
  now: string,
  limit = MONITORS_PER_TICK,
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
  if (!monitors.length) return { checked: 0, failed: 0 };

  const userIds = [...new Set(monitors.map((m) => m.user_id))];
  const { data: profiles } = await admin.from("profiles").select("*").in("id", userIds);
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p as Profile]));

  let checked = 0;
  let failed = 0;
  for (const raw of monitors) {
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
  return { checked, failed };
}

export interface PendingPriceEvent {
  userId: string;
  alertIds: string[];
  /** Data do voo já passou: marca como resolvido sem enviar. */
  expired: boolean;
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
      "id, monitor_id, user_id, flight_date, departs_local, airline, flight_number, price_cents, signals, price_monitors(origin, destination)",
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
  await admin.from("price_alerts").update({ sent_at: now, channels }).in("id", ids);
}
