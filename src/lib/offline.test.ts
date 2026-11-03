import { describe, expect, it } from "vitest";
import type { FlightRow } from "@/lib/trips/draft";
import { OFFLINE_MAX_FLIGHTS, offlineSnapshot } from "./offline";

const f = (id: string, departs: string): FlightRow => ({
  id,
  booking_id: `b-${id}`,
  airline: "LA",
  flight_number: "LA3901",
  origin: "SDU",
  destination: "CGH",
  departs_at: departs,
  arrives_at: "2026-11-09T10:25:00.000Z",
  passenger: "NOME QUE NÃO VAI PARA O APARELHO",
  checkin_done: false,
});

describe("dados para abrir sem internet", () => {
  it("guarda só o necessário dos próximos voos, já no fuso do aeroporto", () => {
    const s = offlineSnapshot(
      [f("1", "2026-11-09T09:20:00.000Z")],
      new Map([["b-1", { locator: "XKQ7PZ" }]]),
      "2026-11-03T12:00:00.000Z",
    );
    expect(s.flights[0]).toEqual({
      origin: "SDU",
      destination: "CGH",
      originCity: "Rio de Janeiro",
      destinationCity: "São Paulo",
      when: "seg., 09/11 às 06:20",
      arrives: "07:25",
      airline: "LATAM",
      flightNumber: "LA3901",
      airport: "Santos Dumont",
      locator: "XKQ7PZ",
    });
    expect(JSON.stringify(s)).not.toContain("NOME");
  });

  it(`no máximo ${OFFLINE_MAX_FLIGHTS} voos`, () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      f(String(i), `2026-11-${10 + i}T09:20:00.000Z`),
    );
    expect(offlineSnapshot(many, new Map(), "2026-11-03T12:00:00.000Z").flights).toHaveLength(
      OFFLINE_MAX_FLIGHTS,
    );
  });
});
