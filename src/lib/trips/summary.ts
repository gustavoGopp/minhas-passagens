import { airportTimeZone } from "@/lib/airports";
import { utcToLocal } from "./time";
export interface FlightLike {
  id: string;
  booking_id: string;
  departs_at: string;
  arrives_at: string | null;
}

export interface BookingLike {
  id: string;
  status: "active" | "cancelled" | "rebooked";
  amount_cents: number | null;
  miles: number | null;
  taxes_cents: number | null;
  purchased_on: string | null;
  currency: string;
}

/** Trechos ativos que ainda não terminaram, em ordem de partida. */
export function upcomingFlights<F extends FlightLike>(
  flights: F[],
  bookings: Map<string, BookingLike>,
  nowIso: string,
): F[] {
  const now = Date.parse(nowIso);
  return flights
    .filter((f) => bookings.get(f.booking_id)?.status === "active")
    .filter((f) => Date.parse(f.arrives_at ?? f.departs_at) >= now)
    .sort((a, b) => a.departs_at.localeCompare(b.departs_at));
}

export function pastFlights<F extends FlightLike>(flights: F[], nowIso: string): F[] {
  const now = Date.parse(nowIso);
  return flights
    .filter((f) => Date.parse(f.arrives_at ?? f.departs_at) < now)
    .sort((a, b) => b.departs_at.localeCompare(a.departs_at));
}

export interface MonthSpend {
  month: string; // YYYY-MM
  cents: number;
  miles: number;
}

/**
 * Gasto por mês pela data da compra (competência combinada na entrevista).
 * Dinheiro e milhas ficam separados; taxas de emissões com milhas entram em dinheiro.
 * Canceladas não entram (reembolsos chegam no M4).
 */
export function monthlySpend(bookings: BookingLike[]): MonthSpend[] {
  const map = new Map<string, MonthSpend>();
  for (const b of bookings) {
    if (b.status === "cancelled" || !b.purchased_on || b.currency !== "BRL") continue;
    const month = b.purchased_on.slice(0, 7);
    const cur = map.get(month) ?? { month, cents: 0, miles: 0 };
    cur.cents += (b.amount_cents ?? 0) + (b.taxes_cents ?? 0);
    cur.miles += b.miles ?? 0;
    map.set(month, cur);
  }
  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
}

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/** "R$ 1.234,56" ou "1234,56" → centavos. */
export function parseBRL(text: string): number | null {
  const clean = text.replace(/[^\d,.-]/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

/**
 * Agrupa trechos pelo ano local da partida, mantendo a ordem. A tela mostra o
 * ano como título quando há mais de um ano, ou quando não é o ano atual.
 */
export function groupByLocalYear<T extends { origin: string; departs_at: string }>(
  list: T[],
): { year: number; items: T[] }[] {
  const out: { year: number; items: T[] }[] = [];
  for (const f of list) {
    const year = Number(
      utcToLocal(f.departs_at, airportTimeZone(f.origin) ?? "America/Sao_Paulo").slice(0, 4),
    );
    const last = out[out.length - 1];
    if (last && last.year === year) last.items.push(f);
    else out.push({ year, items: [f] });
  }
  return out;
}
