/**
 * Calendário assinado (.ics, RFC 5545), puro e testado. Um evento por trecho de
 * passagem ativa, horários em UTC, UID estável (o id do trecho, mantido ao editar
 * a passagem). Sem nome do passageiro nem valores: só rota, voo, localizador e o
 * link da passagem no app.
 */
import { findAirport } from "@/lib/airports";
import { airlineName } from "@/lib/trips/airlines";

export interface FeedBooking {
  id: string;
  locator: string | null;
  status: "active" | "cancelled" | "rebooked";
}

export interface FeedFlight {
  id: string;
  booking_id: string;
  airline: string;
  flight_number: string | null;
  origin: string;
  destination: string;
  departs_at: string;
  arrives_at: string | null;
  updated_at?: string | null;
}

/** Voos passados que ainda entram no calendário. */
export const FEED_PAST_DAYS = 365;
/** Duração usada quando o trecho não tem horário de chegada. */
export const DEFAULT_DURATION_MIN = 60;
const UID_DOMAIN = "minhas-passagens";

/** "2026-11-09T09:05:00.000Z" → "20261109T090500Z". */
export function icsDate(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Escapa um valor TEXT: barra, ponto e vírgula, vírgula e quebras de linha. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Dobra linhas com mais de 75 octetos (UTF-8), sem quebrar caracteres no meio. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = "";
      curBytes = 0;
      limit = 74; // a linha de continuação começa com um espaço
    }
    cur += ch;
    curBytes += b;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

/** "SDU → CGH · LA 3001"; sem número, o nome da companhia; sem companhia, só a rota. */
export function flightTitle(
  f: Pick<FeedFlight, "airline" | "flight_number" | "origin" | "destination">,
) {
  const route = `${f.origin.trim()} → ${f.destination.trim()}`;
  const code = f.airline.trim().toUpperCase();
  const known = code && code !== "OTHER";
  let num = (f.flight_number ?? "").trim().toUpperCase();
  // "LA 3001" ou "LA3001" guardados com o código: não repete a companhia.
  if (known && num.startsWith(code)) num = num.slice(code.length).trim();
  if (num) return `${route} · ${known ? `${code} ${num}` : num}`;
  if (known) return `${route} · ${airlineName(code)}`;
  return route;
}

/** Trechos que entram no calendário: passagem ativa, do último ano em diante. */
export function feedFlights(
  flights: FeedFlight[],
  bookings: FeedBooking[],
  nowIso: string,
): FeedFlight[] {
  const active = new Set(bookings.filter((b) => b.status === "active").map((b) => b.id));
  const since = Date.parse(nowIso) - FEED_PAST_DAYS * 86_400_000;
  return flights
    .filter((f) => active.has(f.booking_id) && Date.parse(f.departs_at) >= since)
    .sort((a, b) => a.departs_at.localeCompare(b.departs_at));
}

export function buildCalendar(input: {
  flights: FeedFlight[];
  bookings: FeedBooking[];
  /** Origem pública do app, sem barra no fim (ex.: https://minhas-passagens.vercel.app). */
  appUrl: string;
  now: string;
}): string {
  const byId = new Map(input.bookings.map((b) => [b.id, b]));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//minhas-passagens//Calendario de voos//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Minhas passagens",
    "X-WR-CALDESC:Voos das passagens ativas (atualiza sozinho)",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const f of feedFlights(input.flights, input.bookings, input.now)) {
    const b = byId.get(f.booking_id);
    const start = Date.parse(f.departs_at);
    const endIso =
      f.arrives_at && Date.parse(f.arrives_at) > start
        ? f.arrives_at
        : new Date(start + DEFAULT_DURATION_MIN * 60_000).toISOString();
    const link = `${input.appUrl}/app/passagens/${f.booking_id}`;
    const desc = [b?.locator ? `Localizador: ${b.locator}` : null, `Passagem no app: ${link}`]
      .filter(Boolean)
      .join("\n");
    const stamp = icsDate(f.updated_at ?? input.now);
    const airport = findAirport(f.origin);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${f.id}@${UID_DOMAIN}`,
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${stamp}`,
      `DTSTART:${icsDate(f.departs_at)}`,
      `DTEND:${icsDate(endIso)}`,
      `SUMMARY:${escapeText(flightTitle(f))}`,
      `DESCRIPTION:${escapeText(desc)}`,
      ...(airport ? [`LOCATION:${escapeText(`${airport.name} (${airport.iata})`)}`] : []),
      `URL:${link}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
