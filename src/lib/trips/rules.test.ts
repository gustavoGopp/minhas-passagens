import { describe, expect, it } from "vitest";
import { checkinReminderTimes, checkinState } from "./checkin";
import type { BookingRow, FlightRow } from "./draft";
import { averageByRoute, creditBalances, spendByAirline, spendByMonth } from "./reports";
import { computeAlerts, type CreditRow } from "./rules";

let n = 0;
const booking = (over: Partial<BookingRow> = {}): BookingRow => ({
  id: `b${++n}`,
  locator: `L${n}`,
  airline: "AD",
  seller: null,
  channel: "airline",
  amount_cents: 50000,
  currency: "BRL",
  miles: null,
  taxes_cents: null,
  purchased_on: "2026-11-01",
  tag: "personal",
  status: "active",
  source: "manual",
  notes: null,
  ...over,
});
const flight = (
  b: BookingRow,
  origin: string,
  destination: string,
  dep: string,
  arr: string | null,
  over: Partial<FlightRow> = {},
): FlightRow => ({
  id: `f${++n}`,
  booking_id: b.id,
  airline: b.airline,
  flight_number: null,
  origin,
  destination,
  departs_at: dep,
  arrives_at: arr,
  passenger: null,
  checkin_done: false,
  ignore_missing_leg: false,
  ...over,
});

describe("check-in", () => {
  const f = { airline: "AD", departs_at: "2026-11-10T10:30:00.000Z", checkin_done: false };

  it("Azul abre 72h antes e fecha 1h antes", () => {
    expect(checkinState(f, "2026-11-07T10:00:00.000Z")).toEqual({
      state: "not_open",
      opensAt: "2026-11-07T10:30:00.000Z",
    });
    expect(checkinState(f, "2026-11-08T10:00:00.000Z")).toMatchObject({
      state: "open",
      urgent: false,
    });
    expect(checkinState(f, "2026-11-09T12:00:00.000Z")).toMatchObject({
      state: "open",
      urgent: true,
    });
    expect(checkinState(f, "2026-11-10T09:45:00.000Z")).toEqual({ state: "closed" });
    expect(checkinState({ ...f, checkin_done: true }, "2026-11-09T12:00:00.000Z")).toEqual({
      state: "done",
    });
  });

  it("Gol e LATAM abrem 48h antes", () => {
    expect(checkinState({ ...f, airline: "G3" }, "2026-11-08T09:00:00.000Z").state).toBe(
      "not_open",
    );
    expect(checkinState({ ...f, airline: "LA" }, "2026-11-08T11:00:00.000Z").state).toBe("open");
  });

  it("calcula os dois avisos", () => {
    expect(checkinReminderTimes({ airline: "G3", departs_at: "2026-11-10T10:30:00.000Z" })).toEqual(
      {
        opensAt: "2026-11-08T10:30:00.000Z",
        dayBefore: "2026-11-09T10:30:00.000Z",
      },
    );
  });
});

describe("alertas de passagens", () => {
  const now = "2026-11-02T12:00:00.000Z";

  it("semana típica da ponte aérea não gera alertas", () => {
    const ida = booking();
    const volta = booking({ airline: "G3" });
    const alerts = computeAlerts({
      bookings: [ida, volta],
      flights: [
        flight(ida, "SDU", "CGH", "2026-11-16T09:30:00.000Z", "2026-11-16T10:35:00.000Z"),
        flight(volta, "CGH", "SDU", "2026-11-19T21:00:00.000Z", "2026-11-19T22:05:00.000Z"),
      ],
      now,
    });
    expect(alerts).toEqual([]);
  });

  it("aponta trecho faltando quando chega num aeroporto e sai de outro", () => {
    const a = booking();
    const b = booking();
    const fa = flight(a, "SDU", "CGH", "2026-11-16T09:30:00.000Z", "2026-11-16T10:35:00.000Z");
    const fb = flight(b, "GRU", "SDU", "2026-11-19T21:00:00.000Z", null);
    const alerts = computeAlerts({ bookings: [a, b], flights: [fa, fb], now });
    expect(alerts.map((x) => x.type)).toEqual(["missing_leg"]);
    expect(alerts[0].title).toBe("Trecho faltando: CGH → GRU");
    // "Cheguei por outro meio" silencia.
    expect(
      computeAlerts({ bookings: [a, b], flights: [fa, { ...fb, ignore_missing_leg: true }], now }),
    ).toEqual([]);
  });

  it("detecta sobreposição e conexão curta", () => {
    const a = booking();
    const b = booking();
    const over = computeAlerts({
      bookings: [a, b],
      flights: [
        flight(a, "SDU", "CGH", "2026-11-16T09:30:00.000Z", "2026-11-16T10:35:00.000Z"),
        flight(b, "SDU", "BSB", "2026-11-16T10:00:00.000Z", null),
      ],
      now,
    });
    expect(over.map((x) => x.type)).toContain("conflict");
    const tight = computeAlerts({
      bookings: [a, b],
      flights: [
        flight(a, "SDU", "CGH", "2026-11-16T09:30:00.000Z", "2026-11-16T10:35:00.000Z"),
        flight(b, "CGH", "POA", "2026-11-16T11:00:00.000Z", null),
      ],
      now,
    });
    expect(tight.map((x) => x.type)).toEqual(["tight_connection"]);
  });

  it("detecta compra duplicada no mesmo dia local e ignora cancelada", () => {
    const a = booking();
    const b = booking({ seller: "123milhas", channel: "agency" });
    const flights = [
      flight(a, "SDU", "CGH", "2026-11-16T09:30:00.000Z", "2026-11-16T10:35:00.000Z"),
      flight(b, "SDU", "CGH", "2026-11-16T20:00:00.000Z", "2026-11-16T21:05:00.000Z"),
    ];
    expect(computeAlerts({ bookings: [a, b], flights, now }).map((x) => x.type)).toContain(
      "duplicate",
    );
    expect(
      computeAlerts({ bookings: [a, { ...b, status: "cancelled" }], flights, now }).map(
        (x) => x.type,
      ),
    ).not.toContain("duplicate");
  });

  it("avisa crédito vencendo em até 30 dias", () => {
    const credit: CreditRow = {
      id: "c1",
      booking_id: null,
      kind: "credit",
      provider: "Azul",
      amount_cents: 30000,
      remaining_cents: 30000,
      currency: "BRL",
      issued_on: "2026-06-01",
      expires_on: "2026-11-08",
      notes: null,
    };
    const alerts = computeAlerts({ bookings: [], flights: [], credits: [credit], now });
    expect(alerts[0]).toMatchObject({
      type: "credit_expiring",
      severity: "high",
      title: "Crédito vence em 6 dias",
    });
    expect(
      computeAlerts({
        bookings: [],
        flights: [],
        credits: [{ ...credit, expires_on: "2027-01-30" }],
        now,
      }),
    ).toEqual([]);
  });

  it("check-in aberto aparece como alerta", () => {
    const a = booking({ airline: "LA" });
    const alerts = computeAlerts({
      bookings: [a],
      flights: [flight(a, "CGH", "SDU", "2026-11-03T21:00:00.000Z", null)],
      now,
    });
    expect(alerts[0]).toMatchObject({ type: "checkin", severity: "medium" });
  });
});

describe("relatórios", () => {
  it("gasto por mês desconta reembolso no mês em que foi recebido", () => {
    const a = booking({ purchased_on: "2026-10-05", amount_cents: 40000, status: "cancelled" });
    const b = booking({ purchased_on: "2026-11-01", amount_cents: 50000 });
    const refund: CreditRow = {
      id: "r",
      booking_id: a.id,
      kind: "refund",
      provider: "Azul",
      amount_cents: 30000,
      remaining_cents: null,
      currency: "BRL",
      issued_on: "2026-11-10",
      expires_on: null,
      notes: null,
    };
    expect(spendByMonth([a, b], [refund])).toEqual([
      { month: "2026-11", cents: 50000, refundsCents: 30000, netCents: 20000, miles: 0 },
      { month: "2026-10", cents: 40000, refundsCents: 0, netCents: 40000, miles: 0 },
    ]);
  });

  it("agrupa por companhia e calcula preço médio por rota", () => {
    const a = booking({ airline: "AD", amount_cents: 60000 });
    const b = booking({ airline: "G3", amount_cents: 40000 });
    const flights = [
      flight(a, "SDU", "CGH", "2026-11-16T09:30:00.000Z", null),
      flight(a, "CGH", "SDU", "2026-11-19T21:00:00.000Z", null),
      flight(b, "SDU", "CGH", "2026-11-23T09:30:00.000Z", null),
    ];
    expect(spendByAirline([a, b]).map((l) => [l.label, l.cents])).toEqual([
      ["Azul", 60000],
      ["Gol", 40000],
    ]);
    expect(averageByRoute([a, b], flights)).toEqual([
      { route: "SDU→CGH", legs: 2, avgCents: 35000 },
      { route: "CGH→SDU", legs: 1, avgCents: 30000 },
    ]);
  });

  it("soma saldo de créditos válidos por fornecedor", () => {
    const base: CreditRow = {
      id: "x",
      booking_id: null,
      kind: "credit",
      provider: "LATAM",
      amount_cents: 20000,
      remaining_cents: 15000,
      currency: "BRL",
      issued_on: "2026-01-01",
      expires_on: "2026-12-31",
      notes: null,
    };
    expect(
      creditBalances(
        [
          base,
          { ...base, id: "y", expires_on: "2026-10-01" },
          { ...base, id: "z", remaining_cents: 0 },
        ],
        "2026-11-02",
      ),
    ).toEqual([{ label: "LATAM", cents: 15000, miles: 0, count: 1 }]);
  });
});
