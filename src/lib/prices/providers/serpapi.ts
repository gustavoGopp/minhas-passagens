import type { Offer } from "../types";
import {
  ProviderAuthError,
  searchByDate,
  splitLocal,
  toCents,
  type FetchLike,
  type PriceProvider,
  type PriceSearch,
} from "./types";

interface SerpLeg {
  departure_airport?: { id?: string; time?: string };
  arrival_airport?: { id?: string; time?: string };
  flight_number?: string;
}
interface SerpItinerary {
  flights?: SerpLeg[];
  total_duration?: number;
  price?: number;
}

export function serpUrl(
  q: { origin: string; destination: string; date: string; directOnly: boolean },
  key: string,
) {
  const p = new URLSearchParams({
    engine: "google_flights",
    departure_id: q.origin,
    arrival_id: q.destination,
    outbound_date: q.date,
    type: "2", // só ida
    currency: "BRL",
    hl: "pt",
    gl: "br",
    api_key: key,
  });
  if (q.directOnly) p.set("stops", "1");
  return `https://serpapi.com/search.json?${p}`;
}

/** Normaliza `best_flights` + `other_flights` do Google Flights (preço total em BRL). */
export function parseSerpApi(json: unknown, q: PriceSearch): Offer[] {
  const body = json as { best_flights?: SerpItinerary[]; other_flights?: SerpItinerary[] };
  const out: Offer[] = [];
  for (const it of [...(body.best_flights ?? []), ...(body.other_flights ?? [])]) {
    const legs = it.flights ?? [];
    const first = legs[0];
    const last = legs[legs.length - 1];
    const local = first?.departure_airport?.time ? splitLocal(first.departure_airport.time) : null;
    if (!local || it.price == null) continue;
    const fn = first.flight_number?.trim() ?? null;
    out.push({
      date: local.date,
      time: local.time,
      origin: (first.departure_airport?.id ?? q.origin).toUpperCase(),
      destination: (last?.arrival_airport?.id ?? q.destination).toUpperCase(),
      airline: (fn?.split(/\s+/)[0] ?? "").toUpperCase(),
      flightNumber: fn,
      priceCents: toCents(it.price),
      currency: "BRL",
      transfers: Math.max(0, legs.length - 1),
      durationMin: it.total_duration ?? null,
      foundAt: new Date().toISOString(),
    });
  }
  return out;
}

export function serpapi(): PriceProvider {
  return {
    id: "serpapi",
    name: "SerpApi (Google Flights)",
    async search(q, key, f: FetchLike = fetch) {
      return searchByDate(
        q.dates,
        async (date) => {
          const res = await f(serpUrl({ ...q, date }, key), {
            signal: AbortSignal.timeout(30_000),
          });
          if (res.status === 401 || res.status === 403)
            throw new ProviderAuthError("Chave inválida");
          if (!res.ok) throw new Error(`SerpApi respondeu ${res.status}`);
          return parseSerpApi(await res.json(), q);
        },
        2,
      );
    },
    async validateKey(key, f: FetchLike = fetch) {
      // account.json não consome buscas.
      try {
        const res = await f(`https://serpapi.com/account.json?api_key=${encodeURIComponent(key)}`, {
          signal: AbortSignal.timeout(15_000),
        });
        if (res.status === 401 || res.status === 403)
          return { ok: false, invalid: true, message: "Chave inválida." };
        return res.ok
          ? { ok: true }
          : { ok: false, invalid: false, message: `SerpApi respondeu ${res.status}.` };
      } catch {
        return { ok: false, invalid: false, message: "Não foi possível falar com a SerpApi." };
      }
    },
  };
}
