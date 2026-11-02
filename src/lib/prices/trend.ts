/** Tendência do menor preço entre as duas últimas checagens com preço. */
export interface Trend {
  last: number | null;
  prev: number | null;
  direction: "up" | "down" | "flat" | null;
  lastAt: string | null;
}

export function trendOf(checks: { checked_at: string; min_price_cents: number | null }[]): Trend {
  const priced = [...checks]
    .filter((c) => c.min_price_cents != null)
    .sort((a, b) => (a.checked_at < b.checked_at ? 1 : -1));
  const last = priced[0]?.min_price_cents ?? null;
  const prev = priced[1]?.min_price_cents ?? null;
  const direction =
    last == null || prev == null ? null : last < prev ? "down" : last > prev ? "up" : "flat";
  return { last, prev, direction, lastAt: priced[0]?.checked_at ?? null };
}

/** Série para o gráfico: menor preço por checagem, em ordem cronológica. */
export function chartSeries(checks: { checked_at: string; min_price_cents: number | null }[]) {
  return [...checks]
    .filter((c) => c.min_price_cents != null)
    .sort((a, b) => (a.checked_at < b.checked_at ? -1 : 1))
    .map((c) => ({ at: c.checked_at, cents: c.min_price_cents as number }));
}
