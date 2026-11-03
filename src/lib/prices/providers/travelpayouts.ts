import { utcToLocal } from "@/lib/trips/time";
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

const BASE = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";

/** Item de `prices_for_dates` (campos usados; o resto é ignorado). */
interface TpItem {
  origin?: string;
  destination?: string;
  origin_airport?: string;
  destination_airport?: string;
  price?: number;
  airline?: string;
  flight_number?: string | number;
  departure_at?: string;
  transfers?: number;
  duration_to?: number;
  duration?: number;
}

export function tpUrl(q: {
  origin: string;
  destination: string;
  date: string;
  directOnly: boolean;
  market?: string;
}) {
  const p = new URLSearchParams({
    origin: q.origin,
    destination: q.destination,
    departure_at: q.date,
    one_way: "true",
    direct: String(q.directOnly),
    currency: "brl",
    sorting: "price",
    unique: "false",
    limit: "100",
    page: "1",
  });
  if (q.market) p.set("market", q.market);
  return `${BASE}?${p}`;
}

/** Normaliza a resposta. O horário vem no fuso local da origem (ex.: "-03:00"). */
export function parseTravelpayouts(json: unknown, q: PriceSearch): Offer[] {
  const body = json as { data?: TpItem[]; currency?: string };
  const currency = (body.currency ?? "brl").toUpperCase();
  const offers: Offer[] = [];
  for (const it of body.data ?? []) {
    if (!it.departure_at || it.price == null || !it.airline) continue;
    const local = /Z$/.test(it.departure_at)
      ? splitLocal(utcToLocal(it.departure_at, q.originTimeZone))
      : splitLocal(it.departure_at);
    if (!local) continue;
    const airline = it.airline.toUpperCase();
    const fn =
      it.flight_number != null && it.flight_number !== "" ? String(it.flight_number) : null;
    offers.push({
      date: local.date,
      time: local.time,
      origin: (it.origin_airport ?? it.origin ?? q.origin).toUpperCase(),
      destination: (it.destination_airport ?? it.destination ?? q.destination).toUpperCase(),
      airline,
      flightNumber: fn
        ? `${airline} ${fn.toUpperCase().replace(new RegExp(`^${airline}\\s*`), "")}`
        : null,
      priceCents: toCents(it.price),
      currency,
      transfers: it.transfers ?? 0,
      durationMin: it.duration_to ?? it.duration ?? null,
      foundAt: null, // a API devolve só o que usuários viram nas últimas 48h
    });
  }
  return offers;
}

async function get(url: string, token: string, f: FetchLike, retryAfterMs = 1_000) {
  const once = () =>
    f(url, {
      headers: { "X-Access-Token": token, "Accept-Encoding": "gzip" },
      signal: AbortSignal.timeout(15_000),
    });
  let res = await once();
  // Limite de requisições: uma nova tentativa curta antes de contar a data como falha.
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, retryAfterMs));
    res = await once();
  }
  if (res.status === 401 || res.status === 403) throw new ProviderAuthError("Token inválido");
  if (!res.ok) throw new Error(`Travelpayouts respondeu ${res.status}`);
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (json.success === false) {
    if (/token|auth/i.test(json.error ?? "")) throw new ProviderAuthError("Token inválido");
    // Qualquer outro erro é falha da data, não "sem preço" (não distorce a cobertura).
    throw new Error(`Travelpayouts: ${(json.error ?? "erro").slice(0, 120)}`);
  }
  return json;
}

export function travelpayouts(
  opts: { market?: string; retryAfterMs?: number } = { market: "br" },
): PriceProvider {
  return {
    id: "travelpayouts",
    name: "Travelpayouts (Aviasales)",
    async search(q, token, f = fetch) {
      return searchByDate(q.dates, async (date) =>
        parseTravelpayouts(
          await get(tpUrl({ ...q, date, market: opts.market }), token, f, opts.retryAfterMs),
          q,
        ),
      );
    },
    async validateKey(token, f = fetch) {
      const month = new Date().toISOString().slice(0, 7);
      try {
        await get(
          tpUrl({
            origin: "SDU",
            destination: "CGH",
            date: month,
            directOnly: false,
            market: opts.market,
          }),
          token,
          f,
        );
        return { ok: true };
      } catch (e) {
        if (e instanceof ProviderAuthError)
          return { ok: false, invalid: true, message: "Token inválido." };
        return {
          ok: false,
          invalid: false,
          message: "Não foi possível falar com o Travelpayouts.",
        };
      }
    },
  };
}
