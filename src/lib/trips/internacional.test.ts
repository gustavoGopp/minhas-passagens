import { describe, expect, it } from "vitest";
import { airportTimeZone, isKnownAirport, listAirports } from "@/lib/airports";
import { validationProblems, type ExtractedBooking } from "@/lib/extract/schema";
import {
  draftFromExtraction,
  draftSchema,
  emptyDraft,
  emptyLeg,
  rowsFromDraft,
  unknownAirports,
  type BookingDraft,
  type BookingRow,
} from "./draft";
import { averageByRoute, otherCurrencyTotals, spendByMonth } from "./reports";
import { formatMoney, monthlySpend } from "./summary";

// Regras aprovadas pelo dono em 26/11/2026 ("avisar e pedir conferência").
// Origem: auditoria A2.3 (voo internacional era gravado com fuso de São Paulo e
// moeda em reais, sem aviso).

function rascunho(trecho: Partial<BookingDraft["legs"][0]>, mudancas: Partial<BookingDraft> = {}) {
  return {
    ...emptyDraft(),
    purchased_on: "2026-11-01",
    legs: [
      {
        ...emptyLeg("LA"),
        origin: "GRU",
        destination: "LIS",
        departure_local: "2026-12-20T22:00",
        arrival_local: "2026-12-21T10:30",
        ...trecho,
      },
    ],
    ...mudancas,
  };
}

describe("aeroportos estrangeiros", () => {
  it("conhece o fuso dos aeroportos estrangeiros mais usados", () => {
    expect(airportTimeZone("LIS")).toBe("Europe/Lisbon");
    expect(airportTimeZone("mia")).toBe("America/New_York");
    expect(airportTimeZone("EZE")).toBe("America/Argentina/Buenos_Aires");
    expect(isKnownAirport("CDG")).toBe(true);
    expect(isKnownAirport("SDU")).toBe(true);
  });

  it("a lista de aeroportos do perfil e dos monitores continua só brasileira", () => {
    expect(listAirports().every((a) => a.tz.startsWith("America/"))).toBe(true);
    expect(listAirports().some((a) => a.iata === "LIS")).toBe(false);
  });

  it("chegada 10:30 em Lisboa fica 10:30 de Lisboa", () => {
    const r = draftSchema.safeParse(rascunho({}));
    expect(r.success).toBe(true);
    if (!r.success) return;
    const { flights } = rowsFromDraft(r.data);
    // Dezembro: Lisboa está no horário de Greenwich; São Paulo, 3 horas atrás.
    expect(flights[0].arrives_at).toBe("2026-12-21T10:30:00.000Z");
    expect(flights[0].departs_at).toBe("2026-12-21T01:00:00.000Z");
  });

  it("aeroporto fora das listas: avisa e só salva depois de 'Conferi os horários'", () => {
    const fora = rascunho({ destination: "KEF" });
    expect(isKnownAirport("KEF")).toBe(false);
    expect(unknownAirports(fora)).toEqual(["KEF"]);
    const r = draftSchema.safeParse(fora);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe(
        "Não conheço o aeroporto KEF. Informe os horários de KEF no horário de Brasília e marque “Conferi os horários”.",
      );
    }
    const conferido = draftSchema.safeParse({ ...fora, confirm_unknown_airports: true });
    expect(conferido.success).toBe(true);
    if (!conferido.success) return;
    // Conferido: os horários valem como horário de Brasília.
    expect(rowsFromDraft(conferido.data).flights[0].arrives_at).toBe("2026-12-21T13:30:00.000Z");
  });

  it("rascunho só com aeroportos conhecidos não pede conferência", () => {
    expect(unknownAirports(rascunho({}))).toEqual([]);
  });
});

const extraido: ExtractedBooking = {
  locator: "XPTO12",
  airline_code: "LA",
  seller: "LATAM",
  channel: "airline",
  total_amount: 500,
  currency: "usd",
  miles: null,
  taxes_amount: null,
  purchased_on: "2026-11-01",
  status: "active",
  flights: [
    {
      airline_code: "LA",
      flight_number: "LA 8084",
      origin_iata: "GRU",
      destination_iata: "MIA",
      departure_local: "2026-12-20T23:55",
      arrival_local: "2026-12-21T06:40",
      passenger: null,
    },
  ],
};

const linha = (mudancas: Partial<BookingRow>): BookingRow => ({
  id: "b1",
  locator: null,
  airline: "LA",
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
  ...mudancas,
});

describe("valor em outra moeda", () => {
  it("guarda a moeda original que a extração encontrou", () => {
    const d = draftFromExtraction(extraido, "text");
    expect(d.currency).toBe("USD");
    const r = draftSchema.safeParse(d);
    expect(r.success).toBe(true);
    if (!r.success) return;
    const { booking } = rowsFromDraft(r.data);
    expect(booking.currency).toBe("USD");
    expect(booking.amount_cents).toBe(50000);
  });

  it("sem moeda informada vale real; rascunho antigo sem o campo também", () => {
    expect(draftFromExtraction({ ...extraido, currency: null }, "text").currency).toBe("BRL");
    const antigo = draftSchema.safeParse({ ...rascunho({}), currency: undefined });
    expect(antigo.success && antigo.data.currency).toBe("BRL");
  });

  // Revisão de 26/11: moeda fora do padrão virava real em silêncio.
  it("entende os símbolos comuns de moeda", () => {
    const moeda = (c: string) => draftFromExtraction({ ...extraido, currency: c }, "text").currency;
    expect(moeda("US$")).toBe("USD");
    expect(moeda("u$s")).toBe("USD");
    expect(moeda("€")).toBe("EUR");
    expect(moeda("£")).toBe("GBP");
    expect(moeda("R$")).toBe("BRL");
    expect(moeda(" eur ")).toBe("EUR");
  });

  it("moeda que não dá para entender nunca vira real: fica para o dono escolher", () => {
    const d = draftFromExtraction({ ...extraido, currency: "dólares" }, "text");
    expect(d.currency).toBe("");
    const r = draftSchema.safeParse(d);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Escolha a moeda do valor");
    expect(
      validationProblems({ warnings: [], bookings: [{ ...extraido, currency: "dólares" }] }),
    ).toContain("moeda não reconhecida");
    expect(validationProblems({ warnings: [], bookings: [extraido] })).toEqual([]);
  });

  it("milhas contam mesmo quando a taxa foi paga em outra moeda", () => {
    const emissao = linha({
      id: "m",
      channel: "miles",
      amount_cents: null,
      miles: 50000,
      taxes_cents: 8000,
      currency: "USD",
    });
    const mes = spendByMonth([linha({ id: "a", amount_cents: 30000 }), emissao])[0];
    expect(mes.cents).toBe(30000);
    expect(mes.miles).toBe(50000);
    expect(monthlySpend([emissao])[0]).toEqual({ month: "2026-11", cents: 0, miles: 50000 });
  });

  it("não entra na soma em reais e aparece numa linha à parte", () => {
    const lista = [
      linha({ id: "a", amount_cents: 30000 }),
      linha({ id: "b", currency: "USD", amount_cents: 50000, taxes_cents: 1000 }),
      linha({ id: "c", currency: "USD", amount_cents: 20000 }),
      linha({ id: "d", currency: "EUR", amount_cents: 12000 }),
      linha({ id: "e", currency: "USD", amount_cents: 99900, status: "cancelled" }),
    ];
    expect(spendByMonth(lista)[0].cents).toBe(30000);
    expect(otherCurrencyTotals(lista)).toEqual([
      { currency: "EUR", cents: 12000, count: 1 },
      { currency: "USD", cents: 71000, count: 2 },
    ]);
    expect(otherCurrencyTotals([linha({})])).toEqual([]);
  });

  it("preço médio por rota não mistura dólares com reais", () => {
    const voo = (id: string, booking_id: string) => ({
      id,
      booking_id,
      airline: "LA",
      flight_number: null,
      origin: "GRU",
      destination: "MIA",
      departs_at: "2026-12-21T02:55:00.000Z",
      arrives_at: null,
      passenger: null,
      checkin_done: false,
    });
    const rotas = averageByRoute(
      [
        linha({ id: "a", amount_cents: 300000 }),
        linha({ id: "b", currency: "USD", amount_cents: 50000 }),
      ],
      [voo("f1", "a"), voo("f2", "b")],
    );
    expect(rotas).toHaveLength(1);
    expect(rotas[0].avgCents).toBe(300000);
    expect(rotas[0].legs).toBe(1);
  });

  it("mostra o valor com o código da moeda", () => {
    expect(formatMoney(50000, "USD")).toMatch(/^USD\s500,00$/);
    expect(formatMoney(123456, "BRL")).toMatch(/^R\$\s1\.234,56$/);
  });
});
