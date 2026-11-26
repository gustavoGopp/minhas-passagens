import { describe, expect, it, vi } from "vitest";
import { validationProblems, type Extraction } from "./schema";

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
