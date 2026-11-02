import type { HolidayEvent } from "@/lib/holidays/types";
import { evaluateAlerts, nearHolidayDates, type HistoryPoint, type PriceAlertItem } from "./alerts";
import { cheapestPerDate, filterOffers } from "./filter";
import type { FetchLike, PriceProvider } from "./providers";
import { expandRule, inWindows } from "./rule";
import type { MonitorConfig, Offer, Target } from "./types";

export interface ObservationRow {
  flight_date: string;
  departs_local: string;
  airline: string;
  flight_number: string | null;
  price_cents: number;
  currency: string;
  transfers: number;
  duration_min: number | null;
  found_at: string | null;
  near_holiday: boolean;
}

export interface CheckSummary {
  provider: string;
  target_dates: number;
  /** Datas com alguma oferta do provedor (antes dos filtros) — mede a cobertura. */
  dates_with_data: number;
  /** Datas com oferta dentro da janela de horário (ignorando companhia/conexão). */
  dates_in_window: number;
  /** Datas com oferta que passou em todos os filtros. */
  dates_matched: number;
  requests: number;
  failed: number;
  min_price_cents: number | null;
}

export interface CheckResult {
  targets: Target[];
  observations: ObservationRow[];
  summary: CheckSummary;
  alerts: PriceAlertItem[];
}

/**
 * Uma checagem completa de um monitor, sem banco: expande a regra, consulta o
 * provedor, filtra, marca feriados e avalia os avisos contra o histórico.
 */
export async function runCheck(input: {
  monitor: MonitorConfig;
  provider: PriceProvider;
  apiKey: string;
  originTimeZone: string;
  today: string;
  now: string;
  holidays: HolidayEvent[];
  history: HistoryPoint[];
  lastAlerted: Map<string, number>;
  fetchImpl?: FetchLike;
}): Promise<CheckResult> {
  const m = input.monitor;
  const targets = expandRule(m.rule, {
    today: input.today,
    horizonWeeks: m.horizon_weeks,
    holidays: input.holidays,
  });
  const result = await input.provider.search(
    {
      origin: m.origin,
      destination: m.destination,
      dates: targets.map((t) => t.date),
      directOnly: !m.allow_connections,
      originTimeZone: input.originTimeZone,
    },
    input.apiKey,
    input.fetchImpl,
  );

  const brl = result.offers.filter((o) => o.currency === "BRL");
  const matched = filterOffers(brl, m, targets);
  const perDate = cheapestPerDate(matched);
  const nearHoliday = nearHolidayDates(
    targets.map((t) => t.date),
    input.holidays,
  );

  const observations: ObservationRow[] = [...perDate.values()].flat().map((o) => ({
    flight_date: o.date,
    departs_local: `${o.date}T${o.time}`,
    airline: o.airline,
    flight_number: o.flightNumber,
    price_cents: o.priceCents,
    currency: o.currency,
    transfers: o.transfers,
    duration_min: o.durationMin,
    found_at: o.foundAt,
    near_holiday: nearHoliday.has(o.date),
  }));

  const best = new Map<string, Offer>([...perDate].map(([d, list]) => [d, list[0]]));
  const alerts = evaluateAlerts({
    monitor: m,
    best,
    history: input.history,
    lastAlerted: input.lastAlerted,
    now: input.now,
  });

  const windowsByDate = new Map(targets.map((t) => [t.date, t.windows]));
  const inWindowDates = new Set(
    result.offers
      .filter(
        (o) =>
          o.origin === m.origin &&
          o.destination === m.destination &&
          inWindows(o.time, windowsByDate.get(o.date) ?? []),
      )
      .map((o) => o.date),
  );
  const prices = [...best.values()].map((o) => o.priceCents);

  return {
    targets,
    observations,
    alerts,
    summary: {
      provider: input.provider.id,
      target_dates: targets.length,
      dates_with_data: new Set(result.datesWithData).size,
      dates_in_window: inWindowDates.size,
      dates_matched: best.size,
      requests: result.requests,
      failed: result.failedDates.length,
      min_price_cents: prices.length ? Math.min(...prices) : null,
    },
  };
}
