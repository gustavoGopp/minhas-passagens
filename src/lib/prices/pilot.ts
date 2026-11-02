import { travelpayouts } from "./providers/travelpayouts";
import type { FetchLike } from "./providers/types";
import { expandRule, inWindows, PONTE_AEREA } from "./rule";
import type { Offer, Target } from "./types";

/** Cobertura mínima para adotar o Travelpayouts como fonte principal. */
export const PILOT_THRESHOLD = 0.8;

export interface PilotLeg {
  route: string;
  market: string;
  targets: number;
  /** Datas com preço no aeroporto exato (a API só devolve o visto nas últimas 48h). */
  withData: number;
  /** Datas com preço dentro da janela de horário. */
  inWindow: number;
  /** Datas que só tiveram preço em outro aeroporto da cidade (GIG, GRU...). */
  otherAirportOnly: number;
  failed: number;
  requests: number;
  airlines: string[];
  minPriceCents: number | null;
}

export interface PilotReport {
  at: string;
  weeks: number;
  legs: PilotLeg[];
  /** Melhor mercado pela cobertura na janela. */
  bestMarket: string;
  coverage: number;
  coverageInWindow: number;
  ok: boolean;
}

/** Métrica pura de cobertura a partir das ofertas recebidas. */
export function coverage(
  targets: Target[],
  offers: Offer[],
  origin: string,
  destination: string,
): Pick<PilotLeg, "withData" | "inWindow" | "otherAirportOnly" | "airlines" | "minPriceCents"> {
  const exact = offers.filter((o) => o.origin === origin && o.destination === destination);
  const withData = new Set<string>();
  const inWindow = new Set<string>();
  for (const t of targets) {
    const day = exact.filter((o) => o.date === t.date);
    if (day.length) withData.add(t.date);
    if (day.some((o) => inWindows(o.time, t.windows))) inWindow.add(t.date);
  }
  const anyDates = new Set(offers.map((o) => o.date));
  const otherAirportOnly = targets.filter(
    (t) => anyDates.has(t.date) && !withData.has(t.date),
  ).length;
  const prices = exact.filter((o) => inWindow.has(o.date)).map((o) => o.priceCents);
  return {
    withData: withData.size,
    inWindow: inWindow.size,
    otherAirportOnly,
    airlines: [...new Set(exact.map((o) => o.airline))].sort(),
    minPriceCents: prices.length ? Math.min(...prices) : null,
  };
}

/** Mede a cobertura do Travelpayouts para a ponte aérea SDU↔CGH (mercado "br" e padrão). */
export async function runPilot(opts: {
  token: string;
  today: string;
  weeks: number;
  fetchImpl?: FetchLike;
}): Promise<PilotReport> {
  const legs: PilotLeg[] = [];
  for (const market of ["br", ""]) {
    const provider = travelpayouts({ market: market || undefined });
    for (const leg of [PONTE_AEREA.rioSp, PONTE_AEREA.spRio]) {
      const targets = expandRule(leg.rule, { today: opts.today, horizonWeeks: opts.weeks });
      const res = await provider.search(
        {
          origin: leg.origin,
          destination: leg.destination,
          dates: targets.map((t) => t.date),
          directOnly: false,
          originTimeZone: "America/Sao_Paulo",
        },
        opts.token,
        opts.fetchImpl,
      );
      legs.push({
        route: `${leg.origin}→${leg.destination}`,
        market: market || "padrão",
        targets: targets.length,
        failed: res.failedDates.length,
        requests: res.requests,
        ...coverage(targets, res.offers, leg.origin, leg.destination),
      });
    }
  }
  const byMarket = new Map<string, { t: number; d: number; w: number }>();
  for (const l of legs) {
    const m = byMarket.get(l.market) ?? { t: 0, d: 0, w: 0 };
    byMarket.set(l.market, { t: m.t + l.targets, d: m.d + l.withData, w: m.w + l.inWindow });
  }
  const [bestMarket, best] = [...byMarket].sort((a, b) => b[1].w - a[1].w || b[1].d - a[1].d)[0];
  const cov = best.t ? best.d / best.t : 0;
  const covWin = best.t ? best.w / best.t : 0;
  return {
    at: new Date().toISOString(),
    weeks: opts.weeks,
    legs,
    bestMarket,
    coverage: cov,
    coverageInWindow: covWin,
    ok: cov >= PILOT_THRESHOLD,
  };
}
