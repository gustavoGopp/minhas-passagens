import { airlineName, CHANNELS } from "./airlines";
import type { BookingRow, FlightRow } from "./draft";
import type { CreditRow } from "./rules";

export interface SpendLine {
  label: string;
  cents: number;
  miles: number;
  count: number;
}

const cashOf = (b: BookingRow) => (b.amount_cents ?? 0) + (b.taxes_cents ?? 0);

function group(bookings: BookingRow[], keyOf: (b: BookingRow) => string): SpendLine[] {
  const map = new Map<string, SpendLine>();
  for (const b of bookings) {
    if (b.status === "cancelled" || b.currency !== "BRL") continue;
    const label = keyOf(b);
    const cur = map.get(label) ?? { label, cents: 0, miles: 0, count: 0 };
    cur.cents += cashOf(b);
    cur.miles += b.miles ?? 0;
    cur.count += 1;
    map.set(label, cur);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents);
}

export const spendByAirline = (b: BookingRow[]) => group(b, (x) => airlineName(x.airline));
export const spendByChannel = (b: BookingRow[]) =>
  group(b, (x) => CHANNELS.find((c) => c.code === x.channel)?.name ?? x.channel);
export const spendByTag = (b: BookingRow[]) =>
  group(b, (x) => (x.tag === "work" ? "Trabalho" : "Pessoal"));

export interface MonthLine {
  month: string;
  cents: number;
  refundsCents: number;
  netCents: number;
  miles: number;
}

/** Gasto por mês da compra menos reembolsos em dinheiro no mês em que foram recebidos. */
export function spendByMonth(bookings: BookingRow[], credits: CreditRow[] = []): MonthLine[] {
  const map = new Map<string, MonthLine>();
  const get = (month: string) => {
    const cur = map.get(month) ?? { month, cents: 0, refundsCents: 0, netCents: 0, miles: 0 };
    map.set(month, cur);
    return cur;
  };
  for (const b of bookings) {
    if (!b.purchased_on || b.currency !== "BRL") continue;
    // Canceladas continuam no mês da compra: o dinheiro saiu; o reembolso entra separado.
    const m = get(b.purchased_on.slice(0, 7));
    m.cents += cashOf(b);
    m.miles += b.miles ?? 0;
  }
  for (const c of credits) {
    if (c.kind !== "refund" || c.currency !== "BRL") continue;
    get(c.issued_on.slice(0, 7)).refundsCents += c.amount_cents;
  }
  for (const m of map.values()) m.netCents = m.cents - m.refundsCents;
  return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
}

export interface RouteLine {
  route: string;
  legs: number;
  avgCents: number;
}

/**
 * Preço médio pago por trecho em cada rota. O valor da reserva é dividido
 * igualmente entre os trechos (aproximação útil para ida e volta).
 */
export function averageByRoute(bookings: BookingRow[], flights: FlightRow[]): RouteLine[] {
  const byBooking = new Map<string, FlightRow[]>();
  for (const f of flights) byBooking.set(f.booking_id, [...(byBooking.get(f.booking_id) ?? []), f]);
  const acc = new Map<string, { sum: number; legs: number }>();
  for (const b of bookings) {
    if (b.status === "cancelled" || b.channel === "miles" || b.amount_cents == null) continue;
    const legs = byBooking.get(b.id) ?? [];
    if (!legs.length) continue;
    const share = b.amount_cents / legs.length;
    for (const f of legs) {
      const r = `${f.origin}→${f.destination}`;
      const cur = acc.get(r) ?? { sum: 0, legs: 0 };
      cur.sum += share;
      cur.legs += 1;
      acc.set(r, cur);
    }
  }
  return [...acc.entries()]
    .map(([route, v]) => ({ route, legs: v.legs, avgCents: Math.round(v.sum / v.legs) }))
    .sort((a, b) => b.legs - a.legs);
}

/** Saldo de créditos ativos (não vencidos) por fornecedor. */
export function creditBalances(credits: CreditRow[], todayIso: string): SpendLine[] {
  const map = new Map<string, SpendLine>();
  for (const c of credits) {
    if (c.kind !== "credit") continue;
    if (c.expires_on && c.expires_on < todayIso) continue;
    const left = c.remaining_cents ?? c.amount_cents;
    if (left <= 0) continue;
    const label = c.provider ?? "Sem fornecedor";
    const cur = map.get(label) ?? { label, cents: 0, miles: 0, count: 0 };
    cur.cents += left;
    cur.count += 1;
    map.set(label, cur);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents);
}
