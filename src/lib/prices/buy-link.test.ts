import { describe, expect, it } from "vitest";
import { eventText } from "@/lib/notify/events";
import { alertMessage } from "./alerts";
import { aviasalesUrl, buyUrlFor, googleFlightsSearchUrl, safeBuyUrl } from "./buy-link";
import { runCheck } from "./check";
import { parseSerpApi } from "./providers/serpapi";
import { parseTravelpayouts } from "./providers/travelpayouts";
import type { PriceProvider, PriceSearch } from "./providers/types";
import { PONTE_AEREA } from "./rule";
import type { MonitorConfig, Offer } from "./types";

const q: PriceSearch = {
  origin: "SDU",
  destination: "CGH",
  dates: ["2026-11-09"],
  directOnly: true,
  originTimeZone: "America/Sao_Paulo",
};

const offer = (o: Partial<Offer>): Offer => ({
  date: "2026-11-09",
  time: "06:00",
  origin: "SDU",
  destination: "CGH",
  airline: "G3",
  flightNumber: "G3 1001",
  priceCents: 39000,
  currency: "BRL",
  transfers: 0,
  durationMin: 65,
  foundAt: null,
  ...o,
});

const GF =
  "https://www.google.com/travel/flights?tfs=CBwQAhoeEgoyMDI2LTExLTA5agcIARIDU0RVcgcIARIDQ0dI&hl=pt";

describe("safeBuyUrl", () => {
  it("aceita https no Google e no Aviasales", () => {
    expect(safeBuyUrl(GF)).toBe(GF);
    expect(safeBuyUrl("https://www.aviasales.com/search/SDU0911CGH1?t=abc")).toBe(
      "https://www.aviasales.com/search/SDU0911CGH1?t=abc",
    );
    expect(safeBuyUrl("https://aviasales.com.br/search/x")).not.toBeNull();
  });

  it("recusa http, javascript, outros domínios, credenciais, porta e links longos", () => {
    expect(safeBuyUrl("http://www.google.com/travel/flights")).toBeNull();
    expect(safeBuyUrl("javascript:alert(1)")).toBeNull();
    expect(safeBuyUrl("https://evil.com/?q=google.com")).toBeNull();
    expect(safeBuyUrl("https://google.com.evil.com/")).toBeNull();
    expect(safeBuyUrl("https://user:pw@www.google.com/")).toBeNull();
    expect(safeBuyUrl("https://www.google.com:8443/")).toBeNull();
    expect(safeBuyUrl(`https://www.google.com/${"a".repeat(1000)}`)).toBeNull();
    expect(safeBuyUrl("não é url")).toBeNull();
    expect(safeBuyUrl(null)).toBeNull();
  });
});

describe("plano B: busca do Google Flights", () => {
  it("leva rota e data", () => {
    const u = new URL(
      googleFlightsSearchUrl({ origin: "SDU", destination: "CGH", date: "2026-11-09" }),
    );
    expect(u.origin + u.pathname).toBe("https://www.google.com/travel/flights");
    expect(u.searchParams.get("q")).toBe("Voos de SDU para CGH em 2026-11-09 só ida");
    expect(u.searchParams.get("curr")).toBe("BRL");
    expect(safeBuyUrl(u.toString())).not.toBeNull();
  });

  it("buyUrlFor usa o link da fonte e, sem ele (ou inseguro), a busca", () => {
    const base = { origin: "SDU", destination: "CGH", date: "2026-11-09" };
    expect(buyUrlFor({ ...base, bookingUrl: GF })).toBe(GF);
    expect(buyUrlFor({ ...base, bookingUrl: null })).toBe(googleFlightsSearchUrl(base));
    expect(buyUrlFor({ ...base, bookingUrl: "https://evil.com/" })).toBe(
      googleFlightsSearchUrl(base),
    );
  });
});

describe("link vindo dos provedores", () => {
  it("SerpApi: google_flights_url de search_metadata em todas as ofertas da data", () => {
    const offers = parseSerpApi(
      {
        search_metadata: { google_flights_url: GF },
        best_flights: [
          {
            flights: [
              {
                departure_airport: { id: "SDU", time: "2026-11-09 06:05" },
                arrival_airport: { id: "CGH", time: "2026-11-09 07:10" },
                flight_number: "LA 3001",
              },
            ],
            total_duration: 65,
            price: 289,
          },
        ],
      },
      q,
    );
    expect(offers).toHaveLength(1);
    expect(offers[0].bookingUrl).toBe(GF);
  });

  it("SerpApi sem search_metadata ou com link estranho: sem link", () => {
    const item = {
      flights: [
        {
          departure_airport: { id: "SDU", time: "2026-11-09 06:05" },
          arrival_airport: { id: "CGH", time: "2026-11-09 07:10" },
          flight_number: "LA 3001",
        },
      ],
      price: 289,
    };
    expect(parseSerpApi({ best_flights: [item] }, q)[0].bookingUrl).toBeNull();
    expect(
      parseSerpApi(
        { search_metadata: { google_flights_url: "https://evil.com" }, best_flights: [item] },
        q,
      )[0].bookingUrl,
    ).toBeNull();
  });

  it("Travelpayouts: link relativo vira URL do Aviasales; sem link, null", () => {
    const base = {
      origin_airport: "SDU",
      destination_airport: "CGH",
      price: 289,
      airline: "G3",
      flight_number: 1001,
      departure_at: "2026-11-09T06:05:00-03:00",
      transfers: 0,
      duration_to: 65,
    };
    const offers = parseTravelpayouts(
      {
        success: true,
        currency: "brl",
        data: [
          {
            ...base,
            link: "/search/SDU0911CGH1?t=G317628020001762806300000065SDUCGH_abc&search_date=02112026&expected_price_uuid=x&expected_price_source=share&expected_price_currency=brl&expected_price=289",
          },
          { ...base },
          { ...base, link: "//evil.com/x" },
        ],
      },
      q,
    );
    expect(offers[0].bookingUrl).toMatch(/^https:\/\/www\.aviasales\.com\/search\/SDU0911CGH1\?t=/);
    expect(offers[1].bookingUrl).toBeNull();
    expect(offers[2].bookingUrl).toBeNull();
    expect(aviasalesUrl(42)).toBeNull();
  });
});

describe("avisos com o link", () => {
  const mon = { id: "m1", origin: "SDU", destination: "CGH" };

  it("alertMessage traz o link da melhor oferta", () => {
    const msg = alertMessage(mon, [
      { date: "2026-11-09", signals: ["near_target"], offer: offer({ priceCents: 45000 }) },
      {
        date: "2026-11-16",
        signals: ["at_target"],
        offer: offer({ date: "2026-11-16", priceCents: 30000, bookingUrl: GF }),
      },
    ]);
    expect(msg.buyUrl).toBe(GF);
    expect(msg.path).toBe("/app/monitor/m1");
  });

  it("sem link da fonte, alertMessage usa a busca do Google Flights", () => {
    const msg = alertMessage(mon, [
      { date: "2026-11-09", signals: ["at_target"], offer: offer({}) },
    ]);
    expect(msg.buyUrl).toBe(
      googleFlightsSearchUrl({ origin: "SDU", destination: "CGH", date: "2026-11-09" }),
    );
  });

  it("texto de e-mail e Telegram: link da oferta e do app, rotulados", () => {
    expect(eventText({ body: "b", buyUrl: GF }, "https://app/x")).toBe(
      `b\n\nVer onde comprar: ${GF}\n\nAbrir no app: https://app/x`,
    );
    // Outros avisos ficam como antes.
    expect(eventText({ body: "b" }, "https://app/x")).toBe("b\n\nhttps://app/x");
  });
});

describe("runCheck grava o link", () => {
  it("observações e avisos levam o link da oferta", async () => {
    const monitor: MonitorConfig = {
      id: "m1",
      origin: "SDU",
      destination: "CGH",
      rule: PONTE_AEREA.rioSp.rule,
      horizon_weeks: 3,
      target_cents: 40000,
      margin_cents: 5000,
      margin_pct: null,
      airlines: [],
      allow_connections: false,
      max_duration_min: null,
      frequency: "daily",
      provider: "travelpayouts",
    };
    const fake: PriceProvider = {
      id: "travelpayouts",
      name: "fake",
      validateKey: async () => ({ ok: true }),
      search: async (s) => ({
        offers: [
          offer({ bookingUrl: GF }),
          offer({ date: "2026-11-22", time: "18:00", priceCents: 52000 }),
        ],
        requests: s.dates.length,
        failedDates: [],
        datesWithData: ["2026-11-09", "2026-11-22"],
      }),
    };
    const r = await runCheck({
      monitor,
      provider: fake,
      apiKey: "x",
      originTimeZone: "America/Sao_Paulo",
      today: "2026-11-02",
      now: "2026-11-02T10:00:00Z",
      holidays: [],
      history: [],
      lastAlerted: new Map(),
    });
    expect(r.observations.find((o) => o.flight_date === "2026-11-09")?.booking_url).toBe(GF);
    expect(r.observations.find((o) => o.flight_date === "2026-11-22")?.booking_url).toBeNull();
    expect(r.alerts[0].offer.bookingUrl).toBe(GF);
  });
});
