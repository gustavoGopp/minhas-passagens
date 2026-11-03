import type { HolidayEvent } from "@/lib/holidays/types";
import { evaluateAlerts, nearHolidayDates, type HistoryPoint, type PriceAlertItem } from "./alerts";
import { cheapestPerDate, filterOffers } from "./filter";
import {
  MAX_TARGET_DATES,
  mergeResults,
  nearStats,
  nearTargets,
  pickNearDates,
  type NearStats,
} from "./hybrid";
import { ProviderAuthError, type FetchLike, type PriceProvider } from "./providers";
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
  /** O menor preço caiu numa data perto de feriado (fica fora da média de 30 dias). */
  min_near_holiday: boolean;
  /** Piloto híbrido: cobertura do provedor das datas próximas × Travelpayouts. */
  near: NearStats | null;
  /** Motivo de não usar o provedor das datas próximas (ex.: cota do mês). */
  near_skipped: string | null;
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
  /** Piloto híbrido: as datas próximas também vão a outro provedor, até `allowance` buscas. */
  near?: { provider: PriceProvider; apiKey: string; allowance: number } | null;
  nearSkipped?: string | null;
}): Promise<CheckResult> {
  const m = input.monitor;
  const targets = expandRule(m.rule, {
    today: input.today,
    horizonWeeks: m.horizon_weeks,
    holidays: input.holidays,
  }).slice(0, MAX_TARGET_DATES);
  const query = (dates: string[]) => ({
    origin: m.origin,
    destination: m.destination,
    dates,
    directOnly: !m.allow_connections,
    originTimeZone: input.originTimeZone,
  });
  const main = await input.provider.search(
    query(targets.map((t) => t.date)),
    input.apiKey,
    input.fetchImpl,
  );

  let result = main;
  let near: NearStats | null = null;
  let nearSkipped = input.nearSkipped ?? null;
  const nearAll = input.near ? nearTargets(targets, input.today) : [];
  const nearPick = input.near ? pickNearDates(nearAll, input.near.allowance) : [];
  if (nearAll.length && !nearPick.length && !nearSkipped) nearSkipped = "cota do mês";
  if (input.near && nearPick.length) {
    try {
      const extra = await input.near.provider.search(
        query(nearPick.map((t) => t.date)),
        input.near.apiKey,
        input.fetchImpl,
      );
      result = mergeResults(main, extra);
      near = nearStats({
        provider: input.near.provider.id,
        targets: nearPick,
        nearOffers: extra.offers,
        mainOffers: main.offers,
        requests: extra.requests,
        origin: m.origin,
        destination: m.destination,
      });
    } catch (e) {
      // O piloto nunca derruba a checagem principal.
      nearSkipped = e instanceof ProviderAuthError ? "chave recusada" : "falha na consulta";
    }
  }

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
  const cheapest = [...best.values()].sort((a, b) => a.priceCents - b.priceCents)[0];

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
      min_price_cents: cheapest?.priceCents ?? null,
      min_near_holiday: cheapest ? nearHoliday.has(cheapest.date) : false,
      near,
      near_skipped: nearSkipped,
    },
  };
}
