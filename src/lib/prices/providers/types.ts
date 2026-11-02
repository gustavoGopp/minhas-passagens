import type { Offer, PriceProviderId } from "../types";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface PriceSearch {
  origin: string;
  destination: string;
  /** Datas locais YYYY-MM-DD (uma requisição por data). */
  dates: string[];
  directOnly: boolean;
  /** Fuso do aeroporto de origem, para converter horários em UTC. */
  originTimeZone: string;
}

export interface SearchResult {
  offers: Offer[];
  requests: number;
  /** Datas cuja requisição falhou (rede, limite etc.). */
  failedDates: string[];
  /** Datas que voltaram com pelo menos uma oferta, antes de qualquer filtro. */
  datesWithData: string[];
}

export type KeyCheck = { ok: true } | { ok: false; invalid: boolean; message: string };

export interface PriceProvider {
  id: PriceProviderId;
  name: string;
  search(q: PriceSearch, apiKey: string, fetchImpl?: FetchLike): Promise<SearchResult>;
  validateKey(apiKey: string, fetchImpl?: FetchLike): Promise<KeyCheck>;
}

export class ProviderAuthError extends Error {}

/** Executa tarefas com concorrência limitada, preservando a ordem. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Junta os resultados por data num SearchResult; erro de chave interrompe tudo. */
export async function searchByDate(
  dates: string[],
  run: (date: string) => Promise<Offer[]>,
  concurrency = 4,
): Promise<SearchResult> {
  const results = await mapLimit(dates, concurrency, async (date) => {
    try {
      return { date, offers: await run(date), failed: false };
    } catch (e) {
      if (e instanceof ProviderAuthError) throw e;
      return { date, offers: [] as Offer[], failed: true };
    }
  });
  return {
    offers: results.flatMap((r) => r.offers),
    requests: dates.length,
    failedDates: results.filter((r) => r.failed).map((r) => r.date),
    datesWithData: results.filter((r) => r.offers.length).map((r) => r.date),
  };
}

/** "2026-11-09T06:05:00-03:00" → data e hora locais como vieram. */
export function splitLocal(iso: string): { date: string; time: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(iso);
  return m ? { date: m[1], time: m[2] } : null;
}

/** "PT1H05M" → 65. */
export function isoDurationMinutes(d: string | null | undefined): number | null {
  if (!d) return null;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(d);
  if (!m) return null;
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function toCents(amount: number | string): number {
  return Math.round(Number(amount) * 100);
}
