import type { Offer } from "../types";
import {
  isoDurationMinutes,
  ProviderAuthError,
  searchByDate,
  splitLocal,
  toCents,
  type FetchLike,
  type PriceProvider,
  type PriceSearch,
} from "./types";

const API = "https://api.duffel.com";

interface DuffelSegment {
  departing_at?: string;
  origin?: { iata_code?: string };
  destination?: { iata_code?: string };
  marketing_carrier?: { iata_code?: string };
  marketing_carrier_flight_number?: string;
}
interface DuffelOffer {
  total_amount?: string;
  total_currency?: string;
  owner?: { iata_code?: string };
  slices?: { duration?: string; segments?: DuffelSegment[] }[];
}

function headers(key: string) {
  return {
    Authorization: `Bearer ${key}`,
    "Duffel-Version": "v2",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/** Normaliza offers de `POST /air/offer_requests` (horários locais, sem fuso). */
export function parseDuffel(json: unknown, q: PriceSearch): Offer[] {
  const offers = ((json as { data?: { offers?: DuffelOffer[] } }).data?.offers ??
    []) as DuffelOffer[];
  const out: Offer[] = [];
  for (const o of offers) {
    const slice = o.slices?.[0];
    const segs = slice?.segments ?? [];
    const first = segs[0];
    const lastSeg = segs[segs.length - 1];
    const local = first?.departing_at ? splitLocal(first.departing_at) : null;
    if (!local || !o.total_amount) continue;
    const airline = (first.marketing_carrier?.iata_code ?? o.owner?.iata_code ?? "").toUpperCase();
    out.push({
      date: local.date,
      time: local.time,
      origin: (first.origin?.iata_code ?? q.origin).toUpperCase(),
      destination: (lastSeg?.destination?.iata_code ?? q.destination).toUpperCase(),
      airline,
      flightNumber: first.marketing_carrier_flight_number
        ? `${airline} ${first.marketing_carrier_flight_number}`
        : null,
      priceCents: toCents(o.total_amount),
      currency: (o.total_currency ?? "BRL").toUpperCase(),
      transfers: Math.max(0, segs.length - 1),
      durationMin: isoDurationMinutes(slice?.duration),
      foundAt: new Date().toISOString(),
    });
  }
  return out;
}

export function duffel(): PriceProvider {
  return {
    id: "duffel",
    name: "Duffel",
    async search(q, key, f: FetchLike = fetch) {
      return searchByDate(
        q.dates,
        async (date) => {
          const res = await f(
            `${API}/air/offer_requests?return_offers=true&supplier_timeout=20000`,
            {
              method: "POST",
              headers: headers(key),
              body: JSON.stringify({
                data: {
                  slices: [{ origin: q.origin, destination: q.destination, departure_date: date }],
                  passengers: [{ type: "adult" }],
                  cabin_class: "economy",
                  max_connections: q.directOnly ? 0 : 1,
                },
              }),
              signal: AbortSignal.timeout(30_000),
            },
          );
          if (res.status === 401 || res.status === 403)
            throw new ProviderAuthError("Chave inválida");
          if (!res.ok) throw new Error(`Duffel respondeu ${res.status}`);
          return parseDuffel(await res.json(), q);
        },
        2,
      );
    },
    async validateKey(key, f: FetchLike = fetch) {
      try {
        const res = await f(`${API}/air/airlines?limit=1`, {
          headers: headers(key),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.status === 401 || res.status === 403)
          return { ok: false, invalid: true, message: "Chave inválida." };
        return res.ok
          ? { ok: true }
          : { ok: false, invalid: false, message: `Duffel respondeu ${res.status}.` };
      } catch {
        return { ok: false, invalid: false, message: "Não foi possível falar com a Duffel." };
      }
    },
  };
}
