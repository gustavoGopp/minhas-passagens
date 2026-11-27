import { describe, expect, it, vi } from "vitest";
import { coerencia, validationProblems, type Extraction } from "./schema";

vi.mock("server-only", () => ({}));
const { cleanText } = await import("./extract");

const ok: Extraction = {
  warnings: [],
  bookings: [
    {
      locator: "ABC123",
      airline_code: "AD",
      seller: "Azul",
      channel: "airline",
      total_amount: 459.9,
      currency: "BRL",
      miles: null,
      taxes_amount: null,
      purchased_on: "2026-11-02",
      status: "active",
      flights: [
        {
          airline_code: "AD",
          flight_number: "AD 4512",
          origin_iata: "SDU",
          destination_iata: "CGH",
          departure_local: "2026-11-09T06:30",
          arrival_local: "2026-11-09T07:35",
          passenger: null,
        },
      ],
    },
  ],
};

describe("validação da extração", () => {
  it("aceita extração completa", () => {
    expect(validationProblems(ok)).toEqual([]);
  });

  it("aponta reserva vazia, aeroporto e data inválidos", () => {
    expect(validationProblems({ warnings: [], bookings: [] })).toContain(
      "nenhuma reserva encontrada",
    );
    const bad = structuredClone(ok);
    bad.bookings[0].flights[0].origin_iata = "Santos Dumont";
    bad.bookings[0].flights[0].departure_local = "09/11 06:30";
    expect(validationProblems(bad)).toEqual(["aeroporto inválido", "data de partida inválida"]);
  });

  // Tabela aprovada pelo dono em 26/11/2026 (auditoria A2.1): estes problemas
  // fazem o app tentar de novo com o modelo mais forte em vez de aceitar.
  it("aponta data e hora que não existem", () => {
    const bad = structuredClone(ok);
    bad.bookings[0].flights[0].departure_local = "2026-02-31T10:00";
    bad.bookings[0].flights[0].arrival_local = "2026-11-09T25:99";
    bad.bookings[0].purchased_on = "2026-99-99";
    expect(validationProblems(bad)).toEqual([
      "data de partida inválida",
      "data de chegada inválida",
      "data da compra inválida",
    ]);
  });

  it("aponta origem igual ao destino e chegada antes da partida", () => {
    const mesmo = structuredClone(ok);
    mesmo.bookings[0].flights[0].destination_iata = "SDU";
    expect(validationProblems(mesmo)).toEqual(["origem igual ao destino"]);

    const antes = structuredClone(ok);
    antes.bookings[0].flights[0].arrival_local = "2026-11-09T05:30";
    expect(validationProblems(antes)).toEqual(["chegada antes da partida"]);
  });

  // Revisão de 26/11.
  it("não compara horários quando não sabe o fuso de um dos aeroportos", () => {
    const voo = structuredClone(ok);
    Object.assign(voo.bookings[0].flights[0], {
      origin_iata: "LAX",
      destination_iata: "SEA",
      departure_local: "2026-11-09T20:00",
      arrival_local: "2026-11-09T22:50",
    });
    expect(validationProblems(voo)).toEqual([]);
    const cruzaData = structuredClone(ok);
    Object.assign(cruzaData.bookings[0].flights[0], {
      origin_iata: "SYD",
      destination_iata: "HNL",
      departure_local: "2026-11-09T21:00",
      arrival_local: "2026-11-09T10:00",
    });
    expect(validationProblems(cruzaData)).toEqual([]);
  });

  it("aponta compra depois do voo (quase sempre é o ano lido errado)", () => {
    const bad = structuredClone(ok);
    bad.bookings[0].purchased_on = "2026-12-01";
    expect(validationProblems(bad)).toEqual(["compra depois do voo"]);
  });

  it("aponta valor, taxa ou milhas negativos", () => {
    const bad = structuredClone(ok);
    bad.bookings[0].total_amount = -50;
    bad.bookings[0].taxes_amount = -1;
    bad.bookings[0].miles = -1000;
    expect(validationProblems(bad)).toEqual(["valor negativo"]);
  });
});

describe("cleanText", () => {
  it("remove HTML, estilos e espaços", () => {
    expect(cleanText("<style>x{}</style><p>Voo&nbsp;AD 4512</p><div>SDU → CGH</div>")).toBe(
      "Voo AD 4512\nSDU → CGH",
    );
  });
});

// P25: o que o modelo devolveu bate com o texto do e-mail? Problemas fazem o app
// tentar com o modelo de reforço; avisos só pedem conferência do dono.
describe("coerência com o texto de origem", () => {
  const texto = "Sua reserva QWE7RT está confirmada. Voo AD4512 de SDU para CGH em 09/11.";
  const comLocalizador = (locator: string | null, voo: string | null = "AD 4512") => {
    const x = structuredClone(ok);
    x.bookings[0].locator = locator;
    x.bookings[0].flights[0].flight_number = voo;
    return x;
  };

  it("localizador e número do voo presentes no texto: nada a apontar", () => {
    expect(coerencia(comLocalizador("QWE7RT"), texto)).toEqual({ problemas: [], avisos: [] });
    expect(coerencia(comLocalizador(" qwe7rt "), texto).problemas).toEqual([]);
  });

  it("localizador que não está no texto é problema (inventado ou vindo de texto injetado)", () => {
    expect(coerencia(comLocalizador("ZZZ999"), texto).problemas).toEqual([
      "localizador não aparece no texto",
    ]);
  });

  it("número de voo que não está no texto é problema; 4512 dentro de 14512 não conta", () => {
    expect(coerencia(comLocalizador("QWE7RT", "AD 9999"), texto).problemas).toEqual([
      "número do voo não aparece no texto",
    ]);
    expect(coerencia(comLocalizador("QWE7RT", "AD 4512"), "QWE7RT voo 14512").problemas).toEqual([
      "número do voo não aparece no texto",
    ]);
  });

  it("sem texto (print ou PDF) ou sem localizador e voo, não confere presença", () => {
    expect(coerencia(comLocalizador("ZZZ999"), undefined).problemas).toEqual([]);
    expect(coerencia(comLocalizador(null, null), texto).problemas).toEqual([]);
  });

  it("aeroporto fora das listas do app vira aviso para conferir, sem reforço", () => {
    const x = comLocalizador("QWE7RT");
    x.bookings[0].flights[0].destination_iata = "SEA";
    expect(coerencia(x, texto)).toEqual({
      problemas: [],
      avisos: [
        "Conferir: aeroporto SEA fora das listas do app (horário tratado como de Brasília).",
      ],
    });
  });
});
