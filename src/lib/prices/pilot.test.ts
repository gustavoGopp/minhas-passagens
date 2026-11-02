import { describe, expect, it } from "vitest";
import { coverage, runPilot } from "./pilot";
import type { Offer } from "./types";

const o = (date: string, time: string, origin = "SDU"): Offer => ({
  date,
  time,
  origin,
  destination: "CGH",
  airline: "G3",
  flightNumber: null,
  priceCents: 40000,
  currency: "BRL",
  transfers: 0,
  durationMin: 60,
  foundAt: null,
});

describe("piloto", () => {
  it("conta datas com dado, na janela e só em outro aeroporto", () => {
    const targets = [
      { date: "2026-11-08", windows: [{ from: "12:00", to: "23:59" }] },
      { date: "2026-11-09", windows: [{ from: "00:00", to: "08:00" }] },
      { date: "2026-11-15", windows: [{ from: "12:00", to: "23:59" }] },
    ];
    const c = coverage(
      targets,
      [o("2026-11-08", "18:00"), o("2026-11-09", "10:00"), o("2026-11-15", "18:00", "GIG")],
      "SDU",
      "CGH",
    );
    expect(c).toMatchObject({ withData: 2, inWindow: 1, otherAirportOnly: 1, airlines: ["G3"] });
  });

  it("consulta os dois sentidos nos dois mercados e decide pelo limite de 80%", async () => {
    const urls: string[] = [];
    const report = await runPilot({
      token: "t",
      today: "2026-11-02",
      weeks: 1,
      fetchImpl: async (url) => {
        urls.push(url);
        const u = new URL(url);
        const date = u.searchParams.get("departure_at")!;
        const origin = u.searchParams.get("origin")!;
        const destination = u.searchParams.get("destination")!;
        const market = u.searchParams.get("market");
        const data =
          market === "br"
            ? [
                {
                  origin_airport: origin,
                  destination_airport: destination,
                  price: 300,
                  airline: "AD",
                  departure_at: `${date}T${origin === "SDU" ? "07:00" : "19:00"}:00-03:00`,
                },
              ]
            : [];
        return new Response(JSON.stringify({ success: true, currency: "brl", data }));
      },
    });
    expect(urls).toHaveLength(8); // 2 datas × 2 sentidos × 2 mercados
    expect(report.bestMarket).toBe("br");
    expect(report.legs[0]).toMatchObject({ route: "SDU→CGH", targets: 2, withData: 2 });
    // Fora da janela: domingo 07:00 (12h–23h59) e sexta 19:00 (até 13h) → 2 de 4.
    expect(report.coverage).toBe(1);
    expect(report.coverageInWindow).toBe(0.5);
    expect(report.ok).toBe(true);
  });
});
