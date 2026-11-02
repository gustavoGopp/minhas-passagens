import { describe, expect, it } from "vitest";
import {
  formatBRL,
  monthlySpend,
  parseBRL,
  pastFlights,
  upcomingFlights,
  type BookingLike,
} from "./summary";
import { formatInZone, localToUtc, utcToLocal } from "./time";

describe("horário local ↔ UTC", () => {
  it("converte horário de São Paulo (UTC-3, sem horário de verão)", () => {
    expect(localToUtc("2026-11-10T07:30", "America/Sao_Paulo")).toBe("2026-11-10T10:30:00.000Z");
    expect(utcToLocal("2026-11-10T10:30:00.000Z", "America/Sao_Paulo")).toBe("2026-11-10T07:30");
  });

  it("respeita fusos diferentes no Brasil", () => {
    expect(localToUtc("2026-11-10T07:30", "America/Manaus")).toBe("2026-11-10T11:30:00.000Z");
    expect(localToUtc("2026-11-10T07:30", "America/Noronha")).toBe("2026-11-10T09:30:00.000Z");
  });

  it("lida com horário de verão em outros países", () => {
    expect(localToUtc("2026-07-01T12:00", "Europe/Lisbon")).toBe("2026-07-01T11:00:00.000Z");
    expect(localToUtc("2026-01-15T12:00", "Europe/Lisbon")).toBe("2026-01-15T12:00:00.000Z");
  });

  it("rejeita formato inválido", () => {
    expect(() => localToUtc("10/11/2026 07:30", "America/Sao_Paulo")).toThrow();
  });

  it("formata em pt-BR no fuso do aeroporto", () => {
    expect(formatInZone("2026-11-10T10:30:00.000Z", "America/Sao_Paulo")).toBe(
      "ter., 10/11 às 07:30",
    );
  });
});

const booking = (over: Partial<BookingLike> & { id: string }): BookingLike => ({
  status: "active",
  amount_cents: null,
  miles: null,
  taxes_cents: null,
  purchased_on: null,
  currency: "BRL",
  ...over,
});

describe("próximos voos e gastos", () => {
  const bookings = new Map([
    ["a", booking({ id: "a" })],
    ["c", booking({ id: "c", status: "cancelled" })],
  ]);
  const flights = [
    {
      id: "1",
      booking_id: "a",
      departs_at: "2026-11-10T10:30:00.000Z",
      arrives_at: "2026-11-10T11:30:00.000Z",
    },
    {
      id: "2",
      booking_id: "a",
      departs_at: "2026-11-05T21:00:00.000Z",
      arrives_at: "2026-11-05T22:00:00.000Z",
    },
    { id: "3", booking_id: "c", departs_at: "2026-11-06T10:00:00.000Z", arrives_at: null },
    {
      id: "4",
      booking_id: "a",
      departs_at: "2026-10-01T10:00:00.000Z",
      arrives_at: "2026-10-01T11:00:00.000Z",
    },
  ];

  it("ordena próximos e ignora cancelados", () => {
    expect(upcomingFlights(flights, bookings, "2026-11-02T12:00:00.000Z").map((f) => f.id)).toEqual(
      ["2", "1"],
    );
  });

  it("voo em andamento ainda conta como próximo", () => {
    expect(upcomingFlights(flights, bookings, "2026-11-05T21:30:00.000Z")[0].id).toBe("2");
  });

  it("lista passados do mais recente para o mais antigo, incluindo cancelados", () => {
    expect(pastFlights(flights, "2026-11-08T00:00:00.000Z").map((f) => f.id)).toEqual([
      "3",
      "2",
      "4",
    ]);
  });

  it("soma gasto por mês da compra, separando milhas e ignorando canceladas", () => {
    const list = [
      booking({ id: "1", purchased_on: "2026-11-01", amount_cents: 45000 }),
      booking({ id: "2", purchased_on: "2026-11-20", miles: 12000, taxes_cents: 4590 }),
      booking({ id: "3", purchased_on: "2026-10-03", amount_cents: 30000 }),
      booking({ id: "4", purchased_on: "2026-11-02", amount_cents: 99999, status: "cancelled" }),
    ];
    expect(monthlySpend(list)).toEqual([
      { month: "2026-11", cents: 49590, miles: 12000 },
      { month: "2026-10", cents: 30000, miles: 0 },
    ]);
  });

  it("formata e interpreta reais", () => {
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(parseBRL("R$ 1.234,56")).toBe(123456);
    expect(parseBRL("459.9")).toBe(45990);
    expect(parseBRL("")).toBeNull();
  });
});
