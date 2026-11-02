import { describe, expect, it } from "vitest";
import type { BookingRow, FlightRow } from "@/lib/trips/draft";
import { dueEvents, isQuietHours } from "./events";

const b: BookingRow = {
  id: "b1",
  locator: "X",
  airline: "G3",
  seller: null,
  channel: "airline",
  amount_cents: 1,
  currency: "BRL",
  miles: null,
  taxes_cents: null,
  purchased_on: "2026-11-01",
  tag: "personal",
  status: "active",
  source: "manual",
  notes: null,
};
const f: FlightRow = {
  id: "f1",
  booking_id: "b1",
  airline: "G3",
  flight_number: "G3 1",
  origin: "CGH",
  destination: "SDU",
  departs_at: "2026-11-10T21:00:00.000Z",
  arrives_at: null,
  passenger: null,
  checkin_done: false,
  ignore_missing_leg: false,
};

describe("dueEvents", () => {
  const run = (now: string, flight = f) =>
    dueEvents({ bookings: [b], flights: [flight], credits: [], now });

  it("nada antes de abrir o check-in", () => {
    expect(run("2026-11-08T20:00:00.000Z")).toEqual([]);
  });

  it("primeiro aviso quando abre (48h Gol), segundo nas últimas 24h", () => {
    expect(run("2026-11-08T22:00:00.000Z").map((e) => e.key)).toEqual(["checkin-open:f1"]);
    const last = run("2026-11-10T00:00:00.000Z");
    expect(last.map((e) => [e.key, e.urgent])).toEqual([["checkin-24h:f1", true]]);
    expect(last[0].body).toContain("voegol.com.br");
  });

  it("não avisa se o check-in já foi feito", () => {
    expect(run("2026-11-10T00:00:00.000Z", { ...f, checkin_done: true })).toEqual([]);
  });
});

describe("isQuietHours", () => {
  it("23h–7h em São Paulo cruza a meia-noite", () => {
    expect(isQuietHours("2026-11-03T02:30:00.000Z", "America/Sao_Paulo", "23:00", "07:00")).toBe(
      true,
    ); // 23:30
    expect(
      isQuietHours("2026-11-03T09:59:00.000Z", "America/Sao_Paulo", "23:00:00", "07:00:00"),
    ).toBe(true); // 06:59
    expect(isQuietHours("2026-11-03T10:00:00.000Z", "America/Sao_Paulo", "23:00", "07:00")).toBe(
      false,
    ); // 07:00
    expect(isQuietHours("2026-11-03T18:00:00.000Z", "America/Sao_Paulo", "23:00", "07:00")).toBe(
      false,
    );
  });

  it("início igual ao fim desliga a janela", () => {
    expect(isQuietHours("2026-11-03T02:30:00.000Z", "America/Sao_Paulo", "00:00", "00:00")).toBe(
      false,
    );
  });
});
