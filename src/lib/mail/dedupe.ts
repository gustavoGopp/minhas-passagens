import { airportTimeZone } from "@/lib/airports";
import { DEFAULT_TZ, type BookingDraft, type BookingRow, type FlightRow } from "@/lib/trips/draft";
import { utcToLocal } from "@/lib/trips/time";

/**
 * Deduplicação da importação (pura): compara cada passagem extraída com o que já
 * existe e com as outras extraídas. Chave: localizador + trechos (origem, destino,
 * dia local). Mesmo localizador com outros horários = atualização (remarcação).
 */

export type CandidateKind = "new" | "update" | "duplicate" | "cancel";

export interface Candidate {
  id: string;
  receivedAt: string;
  draft: BookingDraft;
}

export interface CandidateDecision {
  id: string;
  kind: CandidateKind;
  /** Passagem existente a atualizar ou cancelar. */
  bookingId: string | null;
  /** Para duplicadas: o que já cobre esta (passagem existente ou outro candidato). */
  coveredBy: string | null;
}

const legKey = (origin: string, destination: string, localDeparture: string) =>
  `${origin.trim().toUpperCase()}-${destination.trim().toUpperCase()}-${localDeparture.slice(0, 10)}`;

const draftLegs = (d: BookingDraft) =>
  d.legs.map((l) => legKey(l.origin, l.destination, l.departure_local)).sort();

const rowLegs = (flights: FlightRow[]) =>
  flights
    .map((f) =>
      legKey(
        f.origin,
        f.destination,
        utcToLocal(f.departs_at, airportTimeZone(f.origin) ?? DEFAULT_TZ),
      ),
    )
    .sort();

const sameTimes = (d: BookingDraft, flights: FlightRow[]) => {
  const a = d.legs
    .map(
      (l) =>
        `${legKey(l.origin, l.destination, l.departure_local)}T${l.departure_local.slice(11, 16)}`,
    )
    .sort();
  const b = flights
    .map((f) => {
      const local = utcToLocal(f.departs_at, airportTimeZone(f.origin) ?? DEFAULT_TZ);
      return `${legKey(f.origin, f.destination, local)}T${local.slice(11, 16)}`;
    })
    .sort();
  return a.join("|") === b.join("|");
};

export function decideCandidates(input: {
  candidates: Candidate[];
  bookings: BookingRow[];
  flights: FlightRow[];
}): CandidateDecision[] {
  const flightsBy = new Map<string, FlightRow[]>();
  for (const f of input.flights)
    flightsBy.set(f.booking_id, [...(flightsBy.get(f.booking_id) ?? []), f]);
  const byLocator = new Map<string, BookingRow>();
  for (const b of input.bookings) if (b.locator) byLocator.set(b.locator.trim().toUpperCase(), b);
  const existingLegSets = input.bookings.map((b) => ({
    id: b.id,
    legs: rowLegs(flightsBy.get(b.id) ?? []).join("|"),
  }));

  // O e-mail mais recente de cada localizador vale (remarcação depois da compra).
  const sorted = [...input.candidates].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const seenLocator = new Map<string, string>();
  const seenLegs = new Map<string, string>();
  const out = new Map<string, CandidateDecision>();

  for (const c of sorted) {
    const loc = c.draft.locator.trim().toUpperCase();
    const legs = draftLegs(c.draft).join("|");
    const decide = (kind: CandidateKind, bookingId: string | null, coveredBy: string | null) =>
      out.set(c.id, { id: c.id, kind, bookingId, coveredBy });

    if (loc && seenLocator.has(loc)) {
      decide("duplicate", null, seenLocator.get(loc)!);
      continue;
    }
    if (!loc && seenLegs.has(legs)) {
      decide("duplicate", null, seenLegs.get(legs)!);
      continue;
    }
    if (loc) seenLocator.set(loc, c.id);
    seenLegs.set(legs, c.id);

    const existing = loc ? byLocator.get(loc) : undefined;
    if (existing) {
      if (c.draft.status === "cancelled") {
        decide(existing.status === "cancelled" ? "duplicate" : "cancel", existing.id, existing.id);
      } else if (sameTimes(c.draft, flightsBy.get(existing.id) ?? [])) {
        decide("duplicate", null, existing.id);
      } else {
        decide("update", existing.id, null);
      }
      continue;
    }
    const sameLegs = !loc && existingLegSets.find((e) => e.legs === legs);
    if (sameLegs) {
      decide("duplicate", null, sameLegs.id);
      continue;
    }
    decide("new", null, null);
  }
  return input.candidates.map((c) => out.get(c.id)!);
}
