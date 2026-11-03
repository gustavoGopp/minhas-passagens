import { describe, expect, it } from "vitest";
import {
  buildCalendar,
  escapeText,
  feedFlights,
  flightTitle,
  foldLine,
  icsDate,
  type FeedBooking,
  type FeedFlight,
} from "./ics";

const NOW = "2026-11-03T12:00:00.000Z";
const APP = "https://minhas-passagens.vercel.app";

const bookings: FeedBooking[] = [
  { id: "b1", locator: "ABC123", status: "active" },
  { id: "b2", locator: "XYZ999", status: "cancelled" },
  { id: "b3", locator: "RRR111", status: "rebooked" },
];
const flight = (o: Partial<FeedFlight>): FeedFlight => ({
  id: "f1",
  booking_id: "b1",
  airline: "LA",
  flight_number: "3001",
  origin: "SDU",
  destination: "CGH",
  departs_at: "2026-11-09T09:05:00+00:00",
  arrives_at: "2026-11-09T10:10:00+00:00",
  updated_at: "2026-11-02T15:00:00.000Z",
  ...o,
});

/** Desdobra as linhas (RFC 5545) para conferir o conteúdo. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("partes do .ics", () => {
  it("datas em UTC no formato básico", () => {
    expect(icsDate("2026-11-09T06:05:00-03:00")).toBe("20261109T090500Z");
  });

  it("escapa barra, ponto e vírgula, vírgula e quebra de linha", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("dobra em 75 octetos sem quebrar acentos", () => {
    const line = `DESCRIPTION:${"é".repeat(80)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(unfold(folded)).toBe(line);
    expect(foldLine("CURTA")).toBe("CURTA");
  });

  it("título com voo, sem número e sem companhia", () => {
    expect(flightTitle(flight({}))).toBe("SDU → CGH · LA 3001");
    expect(flightTitle(flight({ flight_number: "LA 3001" }))).toBe("SDU → CGH · LA 3001");
    expect(flightTitle(flight({ flight_number: "la3001" }))).toBe("SDU → CGH · LA 3001");
    expect(flightTitle(flight({ flight_number: null }))).toBe("SDU → CGH · LATAM");
    expect(flightTitle(flight({ airline: "OTHER", flight_number: "" }))).toBe("SDU → CGH");
  });

  it("só passagens ativas, do último ano em diante, em ordem", () => {
    const list = feedFlights(
      [
        flight({ id: "late", departs_at: "2026-12-01T10:00:00Z" }),
        flight({ id: "cancel", booking_id: "b2" }),
        flight({ id: "rebooked", booking_id: "b3" }),
        flight({ id: "old", departs_at: "2025-10-01T10:00:00Z" }),
        flight({ id: "past", departs_at: "2026-01-10T10:00:00Z" }),
        flight({ id: "f1" }),
      ],
      bookings,
      NOW,
    );
    expect(list.map((f) => f.id)).toEqual(["past", "f1", "late"]);
  });
});

describe("buildCalendar", () => {
  const ics = buildCalendar({
    flights: [
      flight({}),
      flight({ id: "f2", arrives_at: null, departs_at: "2026-11-12T21:00:00Z" }),
      flight({ id: "f3", booking_id: "b2" }),
    ],
    bookings,
    appUrl: APP,
    now: NOW,
  });
  const text = unfold(ics);

  it("é um VCALENDAR com CRLF e um evento por trecho ativo", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n/);
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(text).not.toContain("f3@");
  });

  it("UID estável, horários em UTC, título, localizador e link da passagem", () => {
    expect(text).toContain("UID:f1@minhas-passagens");
    expect(text).toContain("DTSTART:20261109T090500Z");
    expect(text).toContain("DTEND:20261109T101000Z");
    expect(text).toContain("SUMMARY:SDU → CGH · LA 3001");
    expect(text).toContain(
      `DESCRIPTION:Localizador: ABC123\\nPassagem no app: ${APP}/app/passagens/b1`,
    );
    expect(text).toContain(`URL:${APP}/app/passagens/b1`);
    expect(text).toContain("DTSTAMP:20261102T150000Z");
    expect(text).toMatch(/LOCATION:.*\(SDU\)/);
  });

  it("sem chegada, usa 1 h de duração", () => {
    expect(text).toContain("DTSTART:20261112T210000Z\r\nDTEND:20261112T220000Z");
  });

  it("mesma entrada gera o mesmo arquivo (o calendário não vê mudança à toa)", () => {
    const again = buildCalendar({
      flights: [
        flight({}),
        flight({ id: "f2", arrives_at: null, departs_at: "2026-11-12T21:00:00Z" }),
        flight({ id: "f3", booking_id: "b2" }),
      ],
      bookings,
      appUrl: APP,
      now: "2026-11-04T08:00:00.000Z",
    });
    expect(again).toBe(ics);
  });

  it("calendário vazio continua válido", () => {
    const empty = buildCalendar({ flights: [], bookings: [], appUrl: APP, now: NOW });
    expect(empty).toContain("BEGIN:VCALENDAR");
    expect(empty).not.toContain("BEGIN:VEVENT");
  });
});
