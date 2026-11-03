import { airportTimeZone } from "@/lib/airports";
import { DEFAULT_TZ, type BookingDraft, type BookingRow, type FlightRow } from "./draft";
import { computeAlerts } from "./rules";
import { utcToLocal } from "./time";

/**
 * Itens para o dono conferir numa tela só (pura e testada): voos com data antes
 * da compra (ano lido errado) e passagens repetidas. Cada item traz a sugestão.
 */
export type ReviewItem =
  | {
      kind: "date";
      bookingId: string;
      flightId: string;
      flightDay: string;
      purchasedOn: string;
      /** Ano sugerido quando o voo está muito antes da compra (provável ano errado). */
      suggestedYear: number | null;
    }
  | { kind: "duplicate"; bookingIds: string[]; day: string; route: string };

const localDay = (f: FlightRow) =>
  utcToLocal(f.departs_at, airportTimeZone(f.origin) ?? DEFAULT_TZ).slice(0, 10);

export function reviewItems(input: {
  bookings: BookingRow[];
  flights: FlightRow[];
  now: string;
}): ReviewItem[] {
  const out: ReviewItem[] = [];
  const byId = new Map(input.bookings.map((b) => [b.id, b]));
  for (const a of computeAlerts({
    bookings: input.bookings,
    flights: input.flights,
    now: input.now,
  })) {
    if (a.type === "check_date") {
      const f = input.flights.find((x) => x.id === a.flightIds[0]);
      const b = f ? byId.get(f.booking_id) : undefined;
      if (!f || !b?.purchased_on) continue;
      const day = localDay(f);
      const gap = (Date.parse(b.purchased_on) - Date.parse(day)) / 86_400_000;
      out.push({
        kind: "date",
        bookingId: b.id,
        flightId: f.id,
        flightDay: day,
        purchasedOn: b.purchased_on,
        // Mais de ~6 meses antes da compra: quase sempre é o ano seguinte.
        suggestedYear: gap > 180 ? Number(day.slice(0, 4)) + 1 : null,
      });
    } else if (a.type === "duplicate") {
      const [route, day] = a.key.replace(/^dup:/, "").split("|");
      out.push({ kind: "duplicate", bookingIds: a.bookingIds, day, route });
    }
  }
  // Um item de data por passagem (a correção vale para a passagem inteira).
  const seen = new Set<string>();
  return out.filter((i) => {
    if (i.kind !== "date") return true;
    if (seen.has(i.bookingId)) return false;
    seen.add(i.bookingId);
    return true;
  });
}

/** "2026-02-20T07:30" + 1 ano → "2027-02-20T07:30" (29/02 vira 28/02). */
export function shiftLocalYear(local: string, delta: number): string {
  if (!local) return local;
  const y = Number(local.slice(0, 4)) + delta;
  let rest = local.slice(4);
  if (rest.startsWith("-02-29")) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    if (!leap) rest = `-02-28${rest.slice(6)}`;
  }
  return `${y}${rest}`;
}

/** Rascunho com todos os trechos movidos para o ano `year` (mantém ids, dia e hora). */
export function draftWithYear(d: BookingDraft, fromYear: number, year: number): BookingDraft {
  const delta = year - fromYear;
  return {
    ...d,
    legs: d.legs.map((l) => ({
      ...l,
      departure_local: shiftLocalYear(l.departure_local, delta),
      arrival_local: shiftLocalYear(l.arrival_local, delta),
    })),
  };
}

/**
 * Rascunho para restaurar uma passagem importada que foi apagada: a data da
 * compra usa a do e-mail quando o rascunho guardou o dia da importação (valor
 * padrão antigo) ou uma data depois do voo.
 */
export function restoredDraft(
  d: BookingDraft,
  receivedAt: string | null,
  decidedAt: string | null,
): BookingDraft {
  const received = receivedAt?.slice(0, 10) ?? "";
  const firstDay = d.legs.map((l) => l.departure_local.slice(0, 10)).sort()[0] ?? "";
  const wrong =
    !d.purchased_on ||
    (decidedAt != null && d.purchased_on === decidedAt.slice(0, 10)) ||
    (firstDay !== "" && d.purchased_on > firstDay);
  return {
    ...d,
    id: undefined,
    legs: d.legs.map((l) => ({ ...l, id: undefined })),
    purchased_on: wrong && received ? received : d.purchased_on,
  };
}
