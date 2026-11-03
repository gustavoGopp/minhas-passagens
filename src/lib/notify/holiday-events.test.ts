import { describe, expect, it } from "vitest";
import { holidaysAround, overridesFromRows } from "@/lib/holidays";
import {
  bridgeSuggestion,
  describeLongWeekend,
  expandRule,
  horizonFor,
  longWeekendPlan,
  longWeekends,
  PONTE_AEREA,
  upcomingLongWeekends,
} from "@/lib/prices/rule";
import { monitorInputSchema } from "@/lib/prices/schema";
import type { BookingRow, FlightRow } from "@/lib/trips/draft";
import { holidayEvents, holidaysNearFlight, type HolidayMonitor } from "./holiday-events";

const prefs = { uf: "SP", showOptional: true, showJewish: true };
const holidays = holidaysAround("2026-11-03", prefs);

const booking = (id: string, status: BookingRow["status"] = "active"): BookingRow =>
  ({ id, status }) as BookingRow;
const flight = (id: string, departs_at: string, booking_id = "b1"): FlightRow =>
  ({
    id,
    booking_id,
    airline: "G3",
    flight_number: "G3 1000",
    origin: "CGH",
    destination: "SDU",
    departs_at,
    arrives_at: null,
    passenger: null,
    checkin_done: false,
    ignore_missing_leg: false,
  }) as FlightRow;

const ponte = (id: string): HolidayMonitor => ({
  id,
  name: "Ponte aérea SP → RJ",
  kind: "weekly",
  origin: "CGH",
  destination: "SDU",
  rule: PONTE_AEREA.spRio.rule,
  horizon_weeks: 8,
  active: true,
  long_weekend: null,
});

describe("feriados do usuário", () => {
  it("aplica ajustes vindos do banco", () => {
    const hidden = holidaysAround(
      "2026-11-03",
      prefs,
      overridesFromRows([{ action: "hide", date: "2026-11-20", event_key: null }]),
    );
    expect(hidden.some((h) => h.date === "2026-11-20")).toBe(false);
    const added = holidaysAround(
      "2026-11-03",
      {},
      overridesFromRows([{ action: "add", date: "2026-11-11", name: "Aniversário da cidade" }]),
    );
    expect(added.find((h) => h.date === "2026-11-11")?.source).toBe("custom");
  });
});

describe("feriadões e emendas", () => {
  it("lista os próximos feriadões das próximas 8 semanas", () => {
    const lw = upcomingLongWeekends(holidays, "2026-11-03", 8);
    expect(lw.map((x) => [x.start, x.end])).toEqual([
      ["2026-11-20", "2026-11-22"],
      ["2026-12-25", "2026-12-27"],
    ]);
    expect(describeLongWeekend(lw[0])).toBe("sex 20/11 a dom 22/11");
    expect(bridgeSuggestion(lw[0])).toBeNull();
  });

  it("marca a emenda (sexta depois de Corpus Christi, segunda antes de terça)", () => {
    const y = holidaysAround("2027-01-01", prefs);
    const all = longWeekends(y, "2027-05-01", "2027-10-31");
    const corpus = all.find((x) => x.start === "2027-05-27")!;
    expect(corpus.bridges).toEqual(["2027-05-28"]);
    expect(bridgeSuggestion(corpus)).toBe("Emende sexta 28/05 e folgue 4 dias seguidos.");
    expect(all.find((x) => x.start === "2027-09-04")?.bridges).toEqual(["2027-09-06"]);
  });

  it("não repete feriadão que já começou", () => {
    expect(upcomingLongWeekends(holidays, "2026-11-21", 8)[0].start).toBe("2026-12-25");
  });
});

describe("monitor do feriadão", () => {
  const [lw] = upcomingLongWeekends(holidays, "2026-11-03", 8);
  const [ida, volta] = longWeekendPlan(lw);

  it("usa as janelas da ponte aérea para ida e volta", () => {
    expect(ida).toMatchObject({ origin: "CGH", destination: "SDU", name: "Feriadão 20/11 · ida" });
    expect(ida.rule.ranges).toEqual([
      { start: "2026-11-19", end: "2026-11-19", from: "18:00", to: "23:59" },
      { start: "2026-11-20", end: "2026-11-20", from: "00:00", to: "13:00" },
    ]);
    expect(volta).toMatchObject({ origin: "SDU", destination: "CGH" });
    expect(volta.rule.ranges).toEqual([
      { start: "2026-11-22", end: "2026-11-22", from: "12:00", to: "23:59" },
      { start: "2026-11-23", end: "2026-11-23", from: "00:00", to: "08:00" },
    ]);
  });

  it("o horizonte cobre a volta e o monitor passa no schema", () => {
    const h = horizonFor(lw, "2026-11-03");
    expect(h).toBe(3);
    const targets = expandRule(volta.rule, { today: "2026-11-03", horizonWeeks: h });
    expect(targets.map((t) => t.date)).toEqual(["2026-11-22", "2026-11-23"]);
    const parsed = monitorInputSchema.safeParse({
      name: ida.name,
      kind: "dates",
      origin: ida.origin,
      destination: ida.destination,
      rule: ida.rule,
      horizon_weeks: h,
      target_cents: 25000,
      margin_cents: 5000,
      margin_pct: null,
      airlines: ["AD", "G3", "LA"],
      allow_connections: false,
      max_duration_min: null,
      frequency: "daily",
      provider: "travelpayouts",
      active: true,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("avisos de feriado", () => {
  const now = "2026-11-03T12:00:00Z";
  const today = "2026-11-03";

  it("avisa feriado a até 3 dias de um voo meu, pela data local da origem", () => {
    // Quinta 19/11 às 22h em SP (01h UTC de 20/11): véspera da Consciência Negra.
    const f = flight("f1", "2026-11-20T01:00:00Z");
    expect(holidaysNearFlight(holidays, f).map((h) => h.date)).toContain("2026-11-20");
    const ev = holidayEvents({
      bookings: [booking("b1")],
      flights: [f],
      monitors: [],
      holidays,
      today,
      now,
    }).filter((e) => e.key.startsWith("holiday-flight"));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      key: "holiday-flight:f1:2026-11-19",
      urgent: false,
      path: "/app/passagens/b1",
    });
    expect(ev[0].body).toContain("Dia da Consciência Negra (20/11)");
  });

  it("não põe selo nem avisa por data comemorativa (Chanucá)", () => {
    expect(holidaysNearFlight(holidays, flight("f", "2026-12-08T12:00:00Z"))).toEqual([]);
  });

  it("ignora voo longe de feriado, cancelado, passado ou além de 30 dias", () => {
    const ev = holidayEvents({
      bookings: [booking("b1"), booking("b2", "cancelled")],
      flights: [
        flight("longe", "2026-11-10T12:00:00Z"),
        flight("cancelado", "2026-11-20T12:00:00Z", "b2"),
        flight("passado", "2026-11-02T12:00:00Z"),
        flight("distante", "2026-12-24T12:00:00Z"),
      ],
      monitors: [],
      holidays,
      today,
      now,
    });
    expect(ev.filter((e) => e.key.startsWith("holiday-flight"))).toEqual([]);
  });

  it("avisa feriado em data monitorada, um aviso por bloco, com a tendência de alta", () => {
    const ev = holidayEvents({
      bookings: [],
      flights: [],
      monitors: [ponte("m1")],
      holidays,
      today,
      now,
    }).filter((e) => e.key.startsWith("holiday-monitor"));
    const keys = ev.map((e) => e.key);
    expect(keys.slice(0, 2)).toEqual([
      "holiday-monitor:m1:2026-11-13",
      "holiday-monitor:m1:2026-11-19",
    ]);
    expect(new Set(keys).size).toBe(keys.length);
    // Chanucá (data comemorativa, 05 a 12/12) não gera aviso; Natal sim; nada além de 8 semanas.
    expect(keys.slice(2)).toEqual(["holiday-monitor:m1:2026-12-24"]);
    const nov = ev.find((e) => e.key === "holiday-monitor:m1:2026-11-19")!;
    expect(nov.body).toContain("19/11, 20/11");
    expect(nov.body).toContain("tende a subir");
  });

  it("não avisa de monitor pausado, de feriado prolongado ou criado para o feriadão", () => {
    const ev = holidayEvents({
      bookings: [],
      flights: [],
      monitors: [
        { ...ponte("pausado"), active: false },
        {
          ...ponte("feriado"),
          kind: "holiday",
          rule: { kind: "holiday", leg: "outbound", window: { from: "17:00", to: "23:59" } },
        },
        { ...ponte("feriadao"), long_weekend: "2026-11-20" },
      ],
      holidays,
      today,
      now,
    });
    expect(ev.filter((e) => e.key.startsWith("holiday-monitor"))).toEqual([]);
  });

  it("avisa cada feriadão das próximas 8 semanas uma vez", () => {
    const ev = holidayEvents({ bookings: [], flights: [], monitors: [], holidays, today, now });
    const lw = ev.filter((e) => e.key.startsWith("long-weekend"));
    expect(lw.map((e) => e.key)).toEqual(["long-weekend:2026-11-20", "long-weekend:2026-12-25"]);
    expect(lw[0].title).toBe("Feriadão: sex 20/11 a dom 22/11 (3 dias)");
    expect(lw.every((e) => !e.urgent)).toBe(true);
  });

  it("sugere a emenda no aviso do feriadão", () => {
    const y = holidaysAround("2027-04-20", prefs);
    const ev = holidayEvents({
      bookings: [],
      flights: [],
      monitors: [],
      holidays: y,
      today: "2027-04-20",
      now: "2027-04-20T12:00:00Z",
    });
    const corpus = ev.find((e) => e.key === "long-weekend:2027-05-27")!;
    expect(corpus.body).toContain("Emende sexta 28/05");
  });
});
