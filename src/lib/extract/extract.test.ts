import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Extraction } from "./schema";

vi.mock("server-only", () => ({}));
const { extractBookings, tempoDaChamada } = await import("./extract");

// O código em volta do modelo (P24, P25): decisão de reforço, consumo de cada
// chamada e tradução de erros. O modelo é trocado por respostas fixas.

const valida: Extraction = {
  warnings: [],
  bookings: [
    {
      locator: "QWE7RT",
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
          departure_local: "2026-12-07T06:30",
          arrival_local: "2026-12-07T07:35",
          passenger: null,
        },
      ],
    },
  ],
};
const invalida: Extraction = {
  ...valida,
  bookings: [
    { ...valida.bookings[0], flights: [{ ...valida.bookings[0].flights[0], origin_iata: "XX" }] },
  ],
};
const vazia: Extraction = { warnings: [], bookings: [] };

const uso = (entrada: number, saida: number) => ({
  input_tokens: entrada,
  output_tokens: saida,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
});

type Resposta = { parsed_output: Extraction | null; stop_reason: string; usage: object } | Error;
let respostas: Resposta[];
const parse = vi.fn(async (_params: Record<string, unknown>) => {
  const r = respostas.shift();
  if (!r) throw new Error("teste: chamada a mais");
  if (r instanceof Error) throw r;
  return r;
});
const cliente = { messages: { parse } } as unknown as Anthropic;
const deps = { cliente, modelos: { padrao: "modelo-barato", reforco: "modelo-forte" } };
const texto = { kind: "text" as const, text: "Localizador QWE7RT, voo AD 4512 SDU-CGH" };

beforeEach(() => {
  parse.mockClear();
});

describe("extractBookings", () => {
  it("resposta válida: uma chamada, com o consumo devolvido", async () => {
    respostas = [{ parsed_output: valida, stop_reason: "end_turn", usage: uso(4800, 550) }];
    const r = await extractBookings("sk-teste", texto, {}, deps);
    expect(r.ok).toBe(true);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(r.chamadas).toEqual([
      expect.objectContaining({
        modelo: "modelo-barato",
        reforco: false,
        resultado: "ok",
        tokensEntrada: 4800,
        tokensSaida: 550,
      }),
    ]);
  });

  it("resposta com problema: tenta com o modelo de reforço e devolve as duas chamadas", async () => {
    respostas = [
      { parsed_output: invalida, stop_reason: "end_turn", usage: uso(4800, 550) },
      { parsed_output: valida, stop_reason: "end_turn", usage: uso(4800, 700) },
    ];
    const r = await extractBookings("sk-teste", texto, {}, deps);
    expect(r.ok && r.model).toBe("modelo-forte");
    expect(parse.mock.calls[1][0].model).toBe("modelo-forte");
    expect(r.chamadas.map((c) => [c.reforco, c.resultado])).toEqual([
      [false, "invalido"],
      [true, "ok"],
    ]);
  });

  it("e-mail sem passagem com allowEmpty: não paga o reforço", async () => {
    respostas = [{ parsed_output: vazia, stop_reason: "end_turn", usage: uso(3000, 40) }];
    const r = await extractBookings("sk-teste", texto, { allowEmpty: true }, deps);
    expect(r.ok && r.data.bookings).toEqual([]);
    expect(r.chamadas.map((c) => c.resultado)).toEqual(["vazio"]);
  });

  it("o modelo nunca recebe ferramentas", async () => {
    respostas = [{ parsed_output: valida, stop_reason: "end_turn", usage: uso(1, 1) }];
    await extractBookings("sk-teste", texto, {}, deps);
    expect(parse.mock.calls[0][0]).not.toHaveProperty("tools");
    expect(parse.mock.calls[0][0]).not.toHaveProperty("tool_choice");
  });

  it("chave recusada: mensagem em português e a chamada registrada como erro", async () => {
    respostas = [new Anthropic.AuthenticationError(401, {}, "invalid x-api-key", new Headers())];
    const r = await extractBookings("sk-teste", texto, {}, deps);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/chave/) });
    expect(r.chamadas).toEqual([
      expect.objectContaining({ resultado: "erro", tokensEntrada: 0, tokensSaida: 0 }),
    ]);
  });

  it("recusa do modelo vira erro", async () => {
    respostas = [{ parsed_output: null, stop_reason: "refusal", usage: uso(10, 0) }];
    const r = await extractBookings("sk-teste", texto, {}, deps);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/recusou/) });
    expect(r.chamadas[0]).toMatchObject({ resultado: "erro", tokensEntrada: 10 });
  });
});

describe("tempoDaChamada", () => {
  // A função da Vercel tem 60 s; a chamada precisa acabar antes, com folga.
  it.each([
    [undefined, 0, 90_000],
    [60_000, 0, 57_000],
    [10_000, 0, 7_000],
    [4_000, 0, 5_000],
  ])("prazo %s, agora %i → %i ms", (prazo, agora, ms) => {
    expect(tempoDaChamada(prazo, agora)).toBe(ms);
  });
});
