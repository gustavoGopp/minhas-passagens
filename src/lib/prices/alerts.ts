import { airlineName } from "@/lib/trips/airlines";
import { formatBRL } from "@/lib/trips/summary";
import { weekday } from "@/lib/holidays/dates";
import { holidaysNear, type HolidayEvent } from "@/lib/holidays";
import { buyUrlFor } from "./buy-link";
import { normalizeAirline } from "./filter";
import type { MonitorConfig, Offer } from "./types";

export type Signal = "at_target" | "near_target" | "lowest_seen" | "below_avg30";

export const SIGNAL_LABEL: Record<Signal, string> = {
  at_target: "no alvo",
  near_target: "perto do alvo",
  lowest_seen: "menor preço já visto",
  below_avg30: "abaixo da média de 30 dias",
};

/** Ajustes dos sinais de histórico, num lugar só. */
export const ALERT_RULES = {
  /** Observações mínimas para "menor já visto" (evita alarme na 1ª checagem). */
  minHistoryForLowest: 5,
  /** Observações mínimas (fora de feriado) para usar a média de 30 dias. */
  minHistoryForAverage: 10,
  /** Quanto abaixo da média conta como sinal (10%). */
  belowAverageRatio: 0.9,
  /** Nova queda relevante para repetir o aviso da mesma data: R$ 10 ou 3%. */
  minDropCents: 1000,
  minDropRatio: 0.03,
};

export interface HistoryPoint {
  flight_date: string;
  price_cents: number;
  observed_at: string;
  near_holiday: boolean;
}

export interface PriceStats {
  min: number | null;
  avg30: number | null;
  count: number;
}

/** Mínimo de todo o histórico e média dos últimos 30 dias sem as datas perto de feriado. */
export function historyStats(history: HistoryPoint[], nowIso: string): PriceStats {
  const since = Date.parse(nowIso) - 30 * 86_400_000;
  const min = history.length ? Math.min(...history.map((h) => h.price_cents)) : null;
  const recent = history.filter((h) => !h.near_holiday && Date.parse(h.observed_at) >= since);
  const avg30 =
    recent.length >= ALERT_RULES.minHistoryForAverage
      ? Math.round(recent.reduce((s, h) => s + h.price_cents, 0) / recent.length)
      : null;
  return {
    min: history.length >= ALERT_RULES.minHistoryForLowest ? min : null,
    avg30,
    count: history.length,
  };
}

export function nearThreshold(
  m: Pick<MonitorConfig, "target_cents" | "margin_cents" | "margin_pct">,
) {
  const margin =
    m.margin_cents != null
      ? m.margin_cents
      : m.margin_pct != null
        ? Math.round((m.target_cents * m.margin_pct) / 100)
        : 0;
  return m.target_cents + margin;
}

export function signalsFor(
  price: number,
  monitor: Pick<MonitorConfig, "target_cents" | "margin_cents" | "margin_pct">,
  stats: PriceStats,
): Signal[] {
  const s: Signal[] = [];
  if (price <= monitor.target_cents) s.push("at_target");
  else if (price <= nearThreshold(monitor)) s.push("near_target");
  if (stats.min != null && price < stats.min) s.push("lowest_seen");
  if (stats.avg30 != null && price <= stats.avg30 * ALERT_RULES.belowAverageRatio)
    s.push("below_avg30");
  return s;
}

export interface PriceAlertItem {
  date: string;
  offer: Offer;
  signals: Signal[];
}

/**
 * Datas que merecem aviso nesta checagem: algum sinal e, se a data já foi
 * avisada, uma nova queda relevante em relação ao último preço avisado.
 */
export function evaluateAlerts(input: {
  monitor: Pick<MonitorConfig, "target_cents" | "margin_cents" | "margin_pct">;
  best: Map<string, Offer>;
  history: HistoryPoint[];
  lastAlerted: Map<string, number>;
  now: string;
}): PriceAlertItem[] {
  const stats = historyStats(input.history, input.now);
  const items: PriceAlertItem[] = [];
  for (const [date, offer] of [...input.best.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const signals = signalsFor(offer.priceCents, input.monitor, stats);
    if (!signals.length) continue;
    const last = input.lastAlerted.get(date);
    if (last != null) {
      const drop = Math.max(ALERT_RULES.minDropCents, Math.round(last * ALERT_RULES.minDropRatio));
      if (offer.priceCents > last - drop) continue;
    }
    items.push({ date, offer, signals });
  }
  return items;
}

const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function formatFlightDate(date: string, time?: string): string {
  return `${WD[weekday(date)]}, ${date.slice(8, 10)}/${date.slice(5, 7)}${time ? ` ${time}` : ""}`;
}

/** Um aviso por monitor por checagem, com até 5 datas. */
export function alertMessage(
  monitor: { id: string; origin: string; destination: string },
  items: PriceAlertItem[],
): { title: string; body: string; path: string; buyUrl: string } {
  const best = items.reduce((a, b) => (b.offer.priceCents < a.offer.priceCents ? b : a));
  const title = `Preço ${monitor.origin} → ${monitor.destination}: ${formatBRL(best.offer.priceCents)} (${SIGNAL_LABEL[best.signals[0]]})`;
  const lines = items.slice(0, 5).map((i) => {
    const o = i.offer;
    const flight = [airlineName(normalizeAirline(o.airline)), o.flightNumber]
      .filter(Boolean)
      .join(" ");
    return `${formatFlightDate(i.date, o.time)} · ${flight} · ${formatBRL(o.priceCents)} · ${i.signals.map((s) => SIGNAL_LABEL[s]).join(", ")}`;
  });
  if (items.length > 5) lines.push(`+${items.length - 5} datas`);
  // Link da melhor oferta: o da fonte ou, sem ele, a busca do Google Flights.
  const buyUrl = buyUrlFor({
    bookingUrl: best.offer.bookingUrl,
    origin: monitor.origin,
    destination: monitor.destination,
    date: best.date,
  });
  return { title, body: lines.join("\n"), path: `/app/monitor/${monitor.id}`, buyUrl };
}

/** Datas a até `days` dias de um feriado (via holidaysNear); ficam fora da média. */
export function nearHolidayDates(dates: string[], holidays: HolidayEvent[], days = 2): Set<string> {
  return new Set(dates.filter((d) => holidaysNear(holidays, d, days).length > 0));
}
