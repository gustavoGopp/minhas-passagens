import { describe, expect, it } from "vitest";
import { getHolidays } from "@/lib/holidays";
import { runCheck } from "./check";
import {
  mergeResults,
  monthStart,
  nearTargets,
  pickNearDates,
  serpapiAllowance,
  SERPAPI_MONTHLY_CAP,
} from "./hybrid";
import { ProviderAuthError, type PriceProvider } from "./providers";
import { PONTE_AEREA } from "./rule";
import type { MonitorConfig, Offer } from "./types";

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
const provider = (id: "travelpayouts" | "serpapi", offers: Offer[], seen: string[][] = []) =>
  ({
    id,
    name: id,
    validateKey: async () => ({ ok: true }),
    search: async (s) => {
      seen.push(s.dates);
      return {
        offers,
        requests: s.dates.length,
        failedDates: [],
        datesWithData: [...new Set(offers.map((o) => o.date))],
      };
    },
  }) satisfies PriceProvider;

const base = {
  monitor,
  apiKey: "x",
  originTimeZone: "America/Sao_Paulo",
  today: "2026-11-02",
  now: "2026-11-02T10:00:00Z",
  holidays: [...getHolidays(2026, { uf: "SP" })],
  history: [],
  lastAlerted: new Map<string, number>(),
};

describe("piloto híbrido: cota e datas", () => {
  it("cota: o menor entre o teto do mês e o saldo da conta (com folga de 10)", () => {
    expect(serpapiAllowance({ usedThisMonth: 0, searchesLeft: null })).toBe(SERPAPI_MONTHLY_CAP);
    expect(serpapiAllowance({ usedThisMonth: 230, searchesLeft: null })).toBe(10);
    expect(serpapiAllowance({ usedThisMonth: 0, searchesLeft: 15 })).toBe(5);
    expect(serpapiAllowance({ usedThisMonth: 300, searchesLeft: 250 })).toBe(0);
  });

  it("datas próximas: até 14 dias, as mais próximas primeiro quando a cota aperta", () => {
    const t = ["2026-11-08", "2026-11-09", "2026-11-15", "2026-11-16", "2026-11-22"].map(
      (date) => ({
        date,
        windows: [],
      }),
    );
    expect(nearTargets(t, "2026-11-02").map((x) => x.date)).toEqual([
      "2026-11-08",
      "2026-11-09",
      "2026-11-15",
      "2026-11-16",
    ]);
    expect(pickNearDates(nearTargets(t, "2026-11-02"), 2).map((x) => x.date)).toEqual([
      "2026-11-08",
      "2026-11-09",
    ]);
    expect(pickNearDates(t, 0)).toEqual([]);
  });

  it("une resultados sem repetir datas", () => {
    const r = mergeResults(
      { offers: [offer({})], requests: 2, failedDates: ["a"], datesWithData: ["x"] },
      { offers: [offer({})], requests: 1, failedDates: ["a", "b"], datesWithData: ["x", "y"] },
    );
    expect(r).toMatchObject({ requests: 3, failedDates: ["a", "b"], datesWithData: ["x", "y"] });
    expect(r.offers).toHaveLength(2);
    expect(monthStart("2026-11-17T12:00:00.000Z")).toBe("2026-11-01T00:00:00.000Z");
  });
});

describe("runCheck com piloto híbrido", () => {
  it("datas próximas vão aos dois provedores; a cobertura de cada um fica registrada", async () => {
    const serpSeen: string[][] = [];
    const r = await runCheck({
      ...base,
      provider: provider("travelpayouts", [offer({ date: "2026-11-16", time: "10:00" })]), // fora da janela
      near: {
        provider: provider(
          "serpapi",
          [offer({ date: "2026-11-16", time: "07:10", priceCents: 38000 })],
          serpSeen,
        ),
        apiKey: "k",
        allowance: 10,
      },
    });
    expect(serpSeen).toEqual([["2026-11-08", "2026-11-09", "2026-11-15", "2026-11-16"]]);
    expect(r.summary.near).toEqual({
      near_provider: "serpapi",
      near_dates: 4,
      near_with_data: 1,
      near_in_window: 1,
      near_requests: 4,
      near_tp_with_data: 1,
      near_tp_in_window: 0,
    });
    expect(r.summary.provider).toBe("travelpayouts");
    expect(r.summary.dates_matched).toBe(1);
    expect(r.summary.min_price_cents).toBe(38000);
    expect(r.alerts.map((a) => a.date)).toEqual(["2026-11-16"]);
  });

  it("sem cota no mês, não chama a SerpApi e registra o motivo", async () => {
    const serpSeen: string[][] = [];
    const r = await runCheck({
      ...base,
      provider: provider("travelpayouts", []),
      near: { provider: provider("serpapi", [], serpSeen), apiKey: "k", allowance: 0 },
    });
    expect(serpSeen).toEqual([]);
    expect(r.summary.near).toBeNull();
    expect(r.summary.near_skipped).toBe("cota do mês");
  });

  it("chave da SerpApi recusada não derruba a checagem principal", async () => {
    const bad: PriceProvider = {
      ...provider("serpapi", []),
      search: async () => {
        throw new ProviderAuthError("x");
      },
    };
    const r = await runCheck({
      ...base,
      provider: provider("travelpayouts", [offer({})]),
      near: { provider: bad, apiKey: "k", allowance: 10 },
    });
    expect(r.summary.near_skipped).toBe("chave recusada");
    expect(r.summary.dates_matched).toBe(1);
  });
});
