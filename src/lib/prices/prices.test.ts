import { describe, expect, it } from "vitest";
import { getHolidays } from "@/lib/holidays";
import {
  evaluateAlerts,
  historyStats,
  nearThreshold,
  signalsFor,
  type HistoryPoint,
} from "./alerts";
import { runCheck } from "./check";
import { cheapestPerDate, filterOffers, normalizeAirline } from "./filter";
import { parseDuffel } from "./providers/duffel";
import { parseSerpApi } from "./providers/serpapi";
import { parseTravelpayouts, travelpayouts, tpUrl } from "./providers/travelpayouts";
import { isoDurationMinutes, type PriceProvider, type PriceSearch } from "./providers/types";
import { describeRule, expandRule, longWeekends, PONTE_AEREA } from "./rule";
import { monitorInputSchema } from "./schema";
import { estimateQuota, nextCheckAt } from "./schedule";
import type { MonitorConfig, Offer } from "./types";

const holidays = [...getHolidays(2026, { uf: "SP" }), ...getHolidays(2027, { uf: "SP" })];

const monitor: MonitorConfig = {
  id: "m1",
  origin: "SDU",
  destination: "CGH",
  rule: PONTE_AEREA.rioSp.rule,
  horizon_weeks: 3,
  target_cents: 40000,
  margin_cents: 5000,
  margin_pct: null,
  airlines: ["AD", "G3", "LA"],
  allow_connections: false,
  max_duration_min: 120,
  frequency: "daily",
  provider: "travelpayouts",
};

const offer = (o: Partial<Offer>): Offer => ({
  date: "2026-11-09",
  time: "06:00",
  origin: "SDU",
  destination: "CGH",
  airline: "G3",
  flightNumber: "G3 1001",
  priceCents: 45000,
  currency: "BRL",
  transfers: 0,
  durationMin: 65,
  foundAt: null,
  ...o,
});

const q: PriceSearch = {
  origin: "SDU",
  destination: "CGH",
  dates: ["2026-11-09"],
  directOnly: true,
  originTimeZone: "America/Sao_Paulo",
};

describe("expandRule", () => {
  it("ponte aérea RJ→SP: segundas até 8h e domingos à tarde/noite", () => {
    const t = expandRule(PONTE_AEREA.rioSp.rule, { today: "2026-11-02", horizonWeeks: 2 });
    expect(t).toEqual([
      { date: "2026-11-08", windows: [{ from: "12:00", to: "23:59" }] },
      { date: "2026-11-09", windows: [{ from: "00:00", to: "08:00" }] },
      { date: "2026-11-15", windows: [{ from: "12:00", to: "23:59" }] },
      { date: "2026-11-16", windows: [{ from: "00:00", to: "08:00" }] },
    ]);
  });

  it("ponte aérea SP→RJ: quinta a partir das 18h e sexta até 13h", () => {
    const t = expandRule(PONTE_AEREA.spRio.rule, { today: "2026-11-02", horizonWeeks: 1 });
    expect(t.map((x) => [x.date, x.windows[0].from, x.windows[0].to])).toEqual([
      ["2026-11-05", "18:00", "23:59"],
      ["2026-11-06", "00:00", "13:00"],
    ]);
  });

  it("não inclui hoje nem passa do horizonte", () => {
    const t = expandRule(
      { kind: "weekly", slots: [{ weekday: 1, from: "00:00", to: "08:00" }] },
      { today: "2026-11-02", horizonWeeks: 1 },
    );
    expect(t.map((x) => x.date)).toEqual(["2026-11-09"]);
  });

  it("datas fixas e janela de datas, cortadas pelo horizonte", () => {
    const t = expandRule(
      {
        kind: "dates",
        ranges: [
          { start: "2026-11-20", end: "2026-11-22", from: "06:00", to: "10:00" },
          { start: "2027-05-01", end: "2027-05-01", from: "06:00", to: "10:00" },
        ],
      },
      { today: "2026-11-02", horizonWeeks: 4 },
    );
    expect(t.map((x) => x.date)).toEqual(["2026-11-20", "2026-11-21", "2026-11-22"]);
  });

  it("feriado prolongado: véspera e 1º dia (ida), último dia e seguinte (volta)", () => {
    const ida = expandRule(
      { kind: "holiday", leg: "outbound", window: { from: "17:00", to: "23:59" } },
      { today: "2026-11-02", horizonWeeks: 4, holidays },
    );
    // Consciência Negra cai na sexta 20/11/2026: folga 20–22.
    expect(ida.map((x) => x.date)).toEqual(["2026-11-19", "2026-11-20"]);
    const volta = expandRule(
      { kind: "holiday", leg: "return", window: { from: "12:00", to: "23:59" } },
      { today: "2026-11-02", horizonWeeks: 4, holidays },
    );
    expect(volta.map((x) => x.date)).toEqual(["2026-11-22", "2026-11-23"]);
  });

  it("descreve a regra em texto curto", () => {
    expect(describeRule(PONTE_AEREA.rioSp.rule)).toBe(
      "segunda até 08:00 · domingo a partir de 12:00",
    );
  });
});

describe("longWeekends", () => {
  it("emenda feriado de terça com a segunda", () => {
    // Carnaval 2027: segunda 08 e terça 09/02, Cinzas (facultativo) na quarta → sáb 06 a qua 10.
    const lw = longWeekends(holidays, "2027-02-01", "2027-02-15");
    expect(lw[0]).toMatchObject({ start: "2027-02-06", end: "2027-02-10" });
    // Tiradentes 2027 numa quarta: não emenda, não é prolongado.
    expect(longWeekends(holidays, "2027-04-19", "2027-04-23")).toEqual([]);
  });

  it("ignora fins de semana comuns", () => {
    expect(longWeekends(holidays, "2026-11-04", "2026-11-12")).toEqual([]);
  });
});

describe("filtro no cliente", () => {
  const targets = expandRule(monitor.rule, { today: "2026-11-02", horizonWeeks: 3 });

  it("aplica aeroporto exato, janela, companhia, conexão e duração", () => {
    const offers = [
      offer({}),
      offer({ time: "09:30" }), // fora da janela de segunda
      offer({ origin: "GIG" }), // aeroporto diferente
      offer({ airline: "TP" }), // companhia não permitida
      offer({ transfers: 1 }), // conexão
      offer({ durationMin: 180 }), // longo demais
      offer({ date: "2026-11-10" }), // não é data-alvo
      offer({ airline: "JJ", flightNumber: "JJ 3000" }), // LATAM antiga, aceita
    ];
    expect(filterOffers(offers, monitor, targets).map((o) => o.airline)).toEqual(["G3", "JJ"]);
    expect(normalizeAirline("jj")).toBe("LA");
  });

  it("guarda as mais baratas por data sem repetir o mesmo voo", () => {
    const m = cheapestPerDate([
      offer({ priceCents: 500 }),
      offer({ priceCents: 400 }),
      offer({ priceCents: 300, flightNumber: "G3 2" }),
    ]);
    expect(m.get("2026-11-09")!.map((o) => o.priceCents)).toEqual([300, 400]);
  });
});

describe("avaliação de alerta", () => {
  const hist = (n: number, price: number, near = false): HistoryPoint[] =>
    Array.from({ length: n }, (_, i) => ({
      flight_date: "2026-11-09",
      price_cents: price,
      observed_at: `2026-10-${String(10 + (i % 20)).padStart(2, "0")}T10:00:00Z`,
      near_holiday: near,
    }));

  it("no alvo, perto do alvo por R$ e por %", () => {
    expect(signalsFor(40000, monitor, { min: null, avg30: null, count: 0 })).toEqual(["at_target"]);
    expect(signalsFor(44000, monitor, { min: null, avg30: null, count: 0 })).toEqual([
      "near_target",
    ]);
    expect(signalsFor(46000, monitor, { min: null, avg30: null, count: 0 })).toEqual([]);
    expect(nearThreshold({ target_cents: 40000, margin_cents: null, margin_pct: 10 })).toBe(44000);
  });

  it("média de 30 dias ignora observações perto de feriado", () => {
    const s = historyStats([...hist(10, 60000), ...hist(10, 20000, true)], "2026-11-02T10:00:00Z");
    expect(s.avg30).toBe(60000);
    expect(s.min).toBe(20000);
  });

  it("menor já visto e abaixo da média", () => {
    const stats = historyStats(hist(10, 60000), "2026-11-02T10:00:00Z");
    expect(signalsFor(53000, monitor, stats)).toEqual(["lowest_seen", "below_avg30"]);
    expect(signalsFor(59000, monitor, stats)).toEqual(["lowest_seen"]);
  });

  it("só repete aviso da mesma data com nova queda relevante", () => {
    const base = { monitor, history: [], now: "2026-11-02T10:00:00Z" };
    const best = new Map([["2026-11-09", offer({ priceCents: 39500 })]]);
    expect(evaluateAlerts({ ...base, best, lastAlerted: new Map() })).toHaveLength(1);
    expect(
      evaluateAlerts({ ...base, best, lastAlerted: new Map([["2026-11-09", 40000]]) }),
    ).toHaveLength(0);
    expect(
      evaluateAlerts({ ...base, best, lastAlerted: new Map([["2026-11-09", 41000]]) }),
    ).toHaveLength(1);
  });
});

describe("agenda e cota", () => {
  it("diário às 7h em São Paulo (10h UTC), com desvio por monitor", () => {
    expect(nextCheckAt("daily", "2026-11-02T09:00:00Z", "America/Sao_Paulo")).toBe(
      "2026-11-02T10:00:00.000Z",
    );
    expect(nextCheckAt("daily", "2026-11-02T10:00:00Z", "America/Sao_Paulo")).toBe(
      "2026-11-03T10:00:00.000Z",
    );
  });

  it("2× ao dia às 7h e 19h; semanal na segunda", () => {
    expect(nextCheckAt("twice_daily", "2026-11-02T10:30:00Z", "America/Sao_Paulo")).toBe(
      "2026-11-02T22:00:00.000Z",
    );
    expect(nextCheckAt("weekly", "2026-11-02T10:30:00Z", "America/Sao_Paulo")).toBe(
      "2026-11-09T10:00:00.000Z",
    );
    const spread = nextCheckAt("daily", "2026-11-02T09:00:00Z", "America/Sao_Paulo", "abc");
    expect(Date.parse(spread) - Date.parse("2026-11-02T10:00:00Z")).toBeLessThan(25 * 60_000);
  });

  it("estima a cota por mês", () => {
    expect(estimateQuota(16, "daily", "serpapi")).toMatchObject({ perCheck: 16, perMonth: 480 });
    expect(estimateQuota(16, "daily", "serpapi").shareOfFree).toBeCloseTo(1.92);
    expect(estimateQuota(16, "weekly", "travelpayouts")).toMatchObject({
      perMonth: 69,
      usdPerMonth: null,
    });
    expect(estimateQuota(10, "daily", "duffel").usdPerMonth).toBe(1.5);
  });
});

describe("provedores", () => {
  it("Travelpayouts: horário local da origem e aeroporto exato", () => {
    const offers = parseTravelpayouts(
      {
        success: true,
        currency: "brl",
        data: [
          {
            origin: "RIO",
            destination: "SAO",
            origin_airport: "SDU",
            destination_airport: "CGH",
            price: 389,
            airline: "G3",
            flight_number: "1001",
            departure_at: "2026-11-09T06:05:00-03:00",
            transfers: 0,
            duration_to: 65,
          },
          { price: 1, airline: "G3" }, // incompleto: ignorado
        ],
      },
      q,
    );
    expect(offers).toEqual([
      offer({ time: "06:05", priceCents: 38900, flightNumber: "G3 1001", durationMin: 65 }),
    ]);
    expect(
      tpUrl({
        origin: "SDU",
        destination: "CGH",
        date: "2026-11-09",
        directOnly: true,
        market: "br",
      }),
    ).toContain("departure_at=2026-11-09&one_way=true&direct=true&currency=brl");
  });

  it("Travelpayouts: token vai no cabeçalho e 401 vira chave inválida", async () => {
    const seen: string[] = [];
    const ok = await travelpayouts().validateKey("tok", async (url, init) => {
      seen.push(url);
      expect((init?.headers as Record<string, string>)["X-Access-Token"]).toBe("tok");
      return new Response("{}", { status: 401 });
    });
    expect(ok).toEqual({ ok: false, invalid: true, message: "Token inválido." });
    expect(seen[0]).not.toContain("tok");
  });

  it("Travelpayouts: success:false conta como falha da data, não como 'sem preço'", async () => {
    const r = await travelpayouts({ market: "br", retryAfterMs: 0 }).search(
      {
        origin: "SDU",
        destination: "CGH",
        dates: ["2026-11-09", "2026-11-10"],
        directOnly: true,
        originTimeZone: "America/Sao_Paulo",
      },
      "tok",
      async (url) =>
        String(url).includes("2026-11-09")
          ? Response.json({ success: false, error: "invalid params" })
          : Response.json({ success: true, data: [] }),
    );
    expect(r.failedDates).toEqual(["2026-11-09"]);
    expect(r.datesWithData).toEqual([]);
  });

  it("Travelpayouts: 429 tenta mais uma vez antes de falhar", async () => {
    let calls = 0;
    const r = await travelpayouts({ market: "br", retryAfterMs: 0 }).search(
      {
        origin: "SDU",
        destination: "CGH",
        dates: ["2026-11-09"],
        directOnly: true,
        originTimeZone: "America/Sao_Paulo",
      },
      "tok",
      async () =>
        ++calls === 1
          ? new Response("", { status: 429 })
          : Response.json({ success: true, data: [] }),
    );
    expect(calls).toBe(2);
    expect(r.failedDates).toEqual([]);
  });

  it("Duffel: offers com segmentos", () => {
    const [o] = parseDuffel(
      {
        data: {
          offers: [
            {
              total_amount: "412.30",
              total_currency: "BRL",
              slices: [
                {
                  duration: "PT1H5M",
                  segments: [
                    {
                      departing_at: "2026-11-09T06:05:00",
                      origin: { iata_code: "SDU" },
                      destination: { iata_code: "CGH" },
                      marketing_carrier: { iata_code: "LA" },
                      marketing_carrier_flight_number: "3001",
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      q,
    );
    expect(o).toMatchObject({
      airline: "LA",
      flightNumber: "LA 3001",
      priceCents: 41230,
      durationMin: 65,
      time: "06:05",
    });
    expect(isoDurationMinutes("PT2H")).toBe(120);
  });

  it("SerpApi: best_flights e other_flights", () => {
    const offers = parseSerpApi(
      {
        best_flights: [
          {
            flights: [
              {
                departure_airport: { id: "SDU", time: "2026-11-09 07:10" },
                arrival_airport: { id: "CGH", time: "2026-11-09 08:15" },
                flight_number: "AD 4500",
              },
            ],
            total_duration: 65,
            price: 350,
          },
        ],
        other_flights: [],
      },
      q,
    );
    expect(offers[0]).toMatchObject({
      airline: "AD",
      time: "07:10",
      priceCents: 35000,
      transfers: 0,
    });
  });
});

describe("runCheck", () => {
  it("filtra, marca feriado, resume a cobertura e gera aviso", async () => {
    const fake: PriceProvider = {
      id: "travelpayouts",
      name: "fake",
      validateKey: async () => ({ ok: true }),
      search: async (s) => ({
        offers: [
          offer({ priceCents: 39000 }),
          offer({ date: "2026-11-16", time: "10:00", priceCents: 30000 }), // fora da janela
          offer({ date: "2026-11-22", time: "18:00", priceCents: 52000 }),
        ],
        requests: s.dates.length,
        failedDates: [],
        datesWithData: ["2026-11-09", "2026-11-16", "2026-11-22"],
      }),
    };
    const r = await runCheck({
      monitor,
      provider: fake,
      apiKey: "x",
      originTimeZone: "America/Sao_Paulo",
      today: "2026-11-02",
      now: "2026-11-02T10:00:00Z",
      holidays,
      history: [],
      lastAlerted: new Map(),
    });
    expect(r.summary).toMatchObject({
      target_dates: 6,
      dates_with_data: 3,
      dates_in_window: 2,
      dates_matched: 2,
      requests: 6,
      min_price_cents: 39000,
      min_near_holiday: false,
    });
    expect(r.observations.find((o) => o.flight_date === "2026-11-22")?.near_holiday).toBe(true);
    expect(r.observations.find((o) => o.flight_date === "2026-11-09")?.near_holiday).toBe(false);
    expect(r.alerts.map((a) => [a.date, a.signals])).toEqual([["2026-11-09", ["at_target"]]]);
  });

  it("marca quando o menor preço da checagem cai perto de feriado", async () => {
    const fake: PriceProvider = {
      id: "travelpayouts",
      name: "fake",
      validateKey: async () => ({ ok: true }),
      search: async (s) => ({
        offers: [
          offer({ priceCents: 39000 }),
          offer({ date: "2026-11-22", time: "18:00", priceCents: 31000 }),
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
      holidays,
      history: [],
      lastAlerted: new Map(),
    });
    expect(r.summary).toMatchObject({ min_price_cents: 31000, min_near_holiday: true });
  });
});

describe("schema do monitor", () => {
  it("aceita a ponte aérea e recusa janela invertida", () => {
    const base = {
      name: "",
      kind: "weekly",
      origin: "sdu",
      destination: "CGH",
      rule: PONTE_AEREA.rioSp.rule,
      horizon_weeks: 8,
      target_cents: 40000,
      margin_cents: 5000,
      margin_pct: null,
      airlines: ["G3"],
      allow_connections: false,
      max_duration_min: null,
      frequency: "daily",
      provider: "travelpayouts",
      active: true,
    };
    expect(monitorInputSchema.parse(base).origin).toBe("SDU");
    expect(
      monitorInputSchema.safeParse({
        ...base,
        rule: { kind: "weekly", slots: [{ weekday: 1, from: "10:00", to: "08:00" }] },
      }).success,
    ).toBe(false);
  });
});

describe("tendência", () => {
  it("compara as duas últimas checagens com preço", async () => {
    const { trendOf, chartSeries } = await import("./trend");
    const checks = [
      { checked_at: "2026-11-01T10:00:00Z", min_price_cents: 50000, min_near_holiday: true },
      { checked_at: "2026-11-03T10:00:00Z", min_price_cents: null },
      { checked_at: "2026-11-02T10:00:00Z", min_price_cents: 45000 },
    ];
    expect(trendOf(checks)).toMatchObject({ last: 45000, prev: 50000, direction: "down" });
    expect(chartSeries(checks).map((p) => [p.cents, p.nearHoliday])).toEqual([
      [50000, true],
      [45000, false],
    ]);
    expect(trendOf([]).direction).toBeNull();
  });
});
