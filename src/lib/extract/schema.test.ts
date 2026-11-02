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
});

describe("cleanText", () => {
  it("remove HTML, estilos e espaços", () => {
    expect(cleanText("<style>x{}</style><p>Voo&nbsp;AD 4512</p><div>SDU → CGH</div>")).toBe(
      "Voo AD 4512\n SDU → CGH",
    );
  });
});
