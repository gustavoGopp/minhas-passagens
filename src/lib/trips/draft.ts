import { z } from "zod";
import { airportTimeZone } from "@/lib/airports";
import type { ExtractedBooking } from "@/lib/extract/schema";
import { parseBRL } from "./summary";
import { isLocalDateTime, localToUtc, utcToLocal } from "./time";

/** Estado do formulário de passagem (strings, como digitado). */
export interface LegDraft {
  airline: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure_local: string;
  arrival_local: string;
  passenger: string;
}

export interface BookingDraft {
  id?: string;
  locator: string;
  airline: string;
  seller: string;
  channel: "airline" | "agency" | "miles" | "corporate";
  amount: string;
  miles: string;
  taxes: string;
  purchased_on: string;
  tag: "personal" | "work";
  status: "active" | "cancelled" | "rebooked";
  source: "manual" | "text" | "image" | "email";
  notes: string;
  legs: LegDraft[];
}

export const DEFAULT_TZ = "America/Sao_Paulo";

export function emptyLeg(airline = "AD"): LegDraft {
  return {
    airline,
    flight_number: "",
    origin: "",
    destination: "",
    departure_local: "",
    arrival_local: "",
    passenger: "",
  };
}

export function emptyDraft(): BookingDraft {
  return {
    locator: "",
    airline: "AD",
    seller: "",
    channel: "airline",
    amount: "",
    miles: "",
    taxes: "",
    purchased_on: new Date().toISOString().slice(0, 10),
    tag: "personal",
    status: "active",
    source: "manual",
    notes: "",
    legs: [emptyLeg()],
  };
}

const money = (n: number | null) => (n == null ? "" : n.toFixed(2).replace(".", ","));

export function draftFromExtraction(b: ExtractedBooking, source: "text" | "image"): BookingDraft {
  return {
    locator: b.locator ?? "",
    airline: b.airline_code,
    seller: b.seller ?? "",
    channel: b.channel,
    amount: money(b.total_amount),
    miles: b.miles == null ? "" : String(Math.round(b.miles)),
    taxes: money(b.taxes_amount),
    purchased_on: b.purchased_on ?? new Date().toISOString().slice(0, 10),
    tag: "personal",
    status: "active",
    source,
    notes: "",
    legs: b.flights.map((f) => ({
      airline: f.airline_code,
      flight_number: f.flight_number ?? "",
      origin: f.origin_iata.toUpperCase(),
      destination: f.destination_iata.toUpperCase(),
      departure_local: f.departure_local,
      arrival_local: f.arrival_local ?? "",
      passenger: f.passenger ?? "",
    })),
  };
}

export interface BookingRow {
  id: string;
  locator: string | null;
  airline: string;
  seller: string | null;
  channel: BookingDraft["channel"];
  amount_cents: number | null;
  currency: string;
  miles: number | null;
  taxes_cents: number | null;
  purchased_on: string | null;
  tag: BookingDraft["tag"];
  status: BookingDraft["status"];
  source: BookingDraft["source"];
  notes: string | null;
}

export interface FlightRow {
  id: string;
  booking_id: string;
  airline: string;
  flight_number: string | null;
  origin: string;
  destination: string;
  departs_at: string;
  arrives_at: string | null;
  passenger: string | null;
  checkin_done: boolean;
}

export function draftFromRows(b: BookingRow, flights: FlightRow[]): BookingDraft {
  const cents = (c: number | null) => (c == null ? "" : money(c / 100));
  return {
    id: b.id,
    locator: b.locator ?? "",
    airline: b.airline,
    seller: b.seller ?? "",
    channel: b.channel,
    amount: cents(b.amount_cents),
    miles: b.miles == null ? "" : String(b.miles),
    taxes: cents(b.taxes_cents),
    purchased_on: b.purchased_on ?? "",
    tag: b.tag,
    status: b.status,
    source: b.source,
    notes: b.notes ?? "",
    legs: [...flights]
      .sort((x, y) => x.departs_at.localeCompare(y.departs_at))
      .map((f) => ({
        airline: f.airline,
        flight_number: f.flight_number ?? "",
        origin: f.origin,
        destination: f.destination,
        departure_local: utcToLocal(f.departs_at, airportTimeZone(f.origin) ?? DEFAULT_TZ),
        arrival_local: f.arrives_at
          ? utcToLocal(f.arrives_at, airportTimeZone(f.destination) ?? DEFAULT_TZ)
          : "",
        passenger: f.passenger ?? "",
      })),
  };
}

const iata = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .refine((s) => /^[A-Z]{3}$/.test(s), "Use o código de 3 letras do aeroporto (ex.: SDU)");

const legSchema = z.object({
  airline: z.string().trim().min(1).max(10),
  flight_number: z.string().trim().max(10),
  origin: iata,
  destination: iata,
  departure_local: z.string().refine(isLocalDateTime, "Informe data e hora de partida"),
  arrival_local: z
    .string()
    .refine((v) => v === "" || isLocalDateTime(v), "Hora de chegada inválida"),
  passenger: z.string().trim().max(120),
});

export const draftSchema = z.object({
  id: z.uuid().optional(),
  locator: z.string().trim().max(20),
  airline: z.string().trim().min(1).max(10),
  seller: z.string().trim().max(80),
  channel: z.enum(["airline", "agency", "miles", "corporate"]),
  amount: z.string(),
  miles: z.string().regex(/^\d*$/, "Milhas: só números"),
  taxes: z.string(),
  purchased_on: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  tag: z.enum(["personal", "work"]),
  status: z.enum(["active", "cancelled", "rebooked"]),
  source: z.enum(["manual", "text", "image", "email"]),
  notes: z.string().max(2000),
  legs: z.array(legSchema).min(1, "Inclua pelo menos um trecho"),
});

/** Converte o rascunho validado nas linhas do banco (horários locais → UTC pelo fuso do aeroporto). */
export function rowsFromDraft(d: z.infer<typeof draftSchema>) {
  const booking = {
    locator: d.locator || null,
    airline: d.airline,
    seller: d.seller || null,
    channel: d.channel,
    amount_cents: parseBRL(d.amount),
    currency: "BRL",
    miles: d.miles ? Number(d.miles) : null,
    taxes_cents: parseBRL(d.taxes),
    purchased_on: d.purchased_on || null,
    tag: d.tag,
    status: d.status,
    source: d.source,
    notes: d.notes || null,
  };
  const flights = d.legs.map((l) => ({
    airline: l.airline,
    flight_number: l.flight_number || null,
    origin: l.origin,
    destination: l.destination,
    departs_at: localToUtc(l.departure_local, airportTimeZone(l.origin) ?? DEFAULT_TZ),
    arrives_at: l.arrival_local
      ? localToUtc(l.arrival_local, airportTimeZone(l.destination) ?? DEFAULT_TZ)
      : null,
    passenger: l.passenger || null,
  }));
  return { booking, flights };
}
