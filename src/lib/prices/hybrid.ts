import { addDays } from "@/lib/holidays/dates";
import { coverage } from "./pilot";
import type { SearchResult } from "./providers/types";
import type { Offer, Target } from "./types";

/**
 * Piloto híbrido (Bloco 1): as datas das próximas 2 semanas também são buscadas
 * na SerpApi (Google Flights), dentro da cota grátis; o Travelpayouts continua em
 * todas as datas. Assim dá para comparar a cobertura dos dois nas mesmas datas.
 * Puro e testado.
 */
export const NEAR_DAYS = 14;
/** Teto mensal de buscas na SerpApi (o plano grátis tem 250; sobra folga para "Verificar agora"). */
export const SERPAPI_MONTHLY_CAP = 240;
/** Máximo de datas por checagem: evita que um monitor grande estoure o tempo do agendador. */
export const MAX_TARGET_DATES = 60;

/** Datas até `days` dias à frente (inclusive hoje). */
export function nearTargets(targets: Target[], today: string, days = NEAR_DAYS): Target[] {
  const limit = addDays(today, days);
  return targets.filter((t) => t.date >= today && t.date <= limit);
}

/**
 * Quantas buscas da SerpApi ainda cabem agora: o menor entre o teto mensal menos o
 * já usado (contado no banco) e o saldo informado pela própria SerpApi (com folga de 10).
 */
export function serpapiAllowance(input: {
  usedThisMonth: number;
  searchesLeft: number | null;
  cap?: number;
}): number {
  const byCap = (input.cap ?? SERPAPI_MONTHLY_CAP) - input.usedThisMonth;
  const byAccount = input.searchesLeft == null ? Infinity : input.searchesLeft - 10;
  return Math.max(0, Math.min(byCap, byAccount));
}

/** Escolhe as datas próximas que cabem na cota (as mais próximas primeiro). */
export function pickNearDates(near: Target[], allowance: number): Target[] {
  if (allowance <= 0) return [];
  return [...near].sort((a, b) => a.date.localeCompare(b.date)).slice(0, allowance);
}

/** Une os resultados de dois provedores (ofertas, datas com dado e falhas). */
export function mergeResults(a: SearchResult, b: SearchResult): SearchResult {
  return {
    offers: [...a.offers, ...b.offers],
    requests: a.requests + b.requests,
    failedDates: [...new Set([...a.failedDates, ...b.failedDates])],
    datesWithData: [...new Set([...a.datesWithData, ...b.datesWithData])],
  };
}

export interface NearStats {
  near_provider: string;
  near_dates: number;
  near_with_data: number;
  near_in_window: number;
  near_requests: number;
  /** O mesmo, pelo Travelpayouts, nas mesmas datas (comparação justa). */
  near_tp_with_data: number;
  near_tp_in_window: number;
}

/** Cobertura de cada provedor nas datas próximas, no aeroporto exato e na janela de horário. */
export function nearStats(input: {
  provider: string;
  targets: Target[];
  nearOffers: Offer[];
  mainOffers: Offer[];
  requests: number;
  origin: string;
  destination: string;
}): NearStats {
  const dates = new Set(input.targets.map((t) => t.date));
  const near = coverage(input.targets, input.nearOffers, input.origin, input.destination);
  const tp = coverage(
    input.targets,
    input.mainOffers.filter((o) => dates.has(o.date)),
    input.origin,
    input.destination,
  );
  return {
    near_provider: input.provider,
    near_dates: input.targets.length,
    near_with_data: near.withData,
    near_in_window: near.inWindow,
    near_requests: input.requests,
    near_tp_with_data: tp.withData,
    near_tp_in_window: tp.inWindow,
  };
}

/** Início do mês (UTC) para contar as buscas usadas. */
export function monthStart(nowIso: string): string {
  return `${nowIso.slice(0, 7)}-01T00:00:00.000Z`;
}
