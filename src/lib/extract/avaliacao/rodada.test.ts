import { describe, expect, it, vi } from "vitest";
import type { Extraction } from "../schema";
import type { Caso } from "./gabarito";

vi.mock("server-only", () => ({}));
const { montarPedido } = await import("../extract");
const { avaliarCaso, clienteGravado, clienteQueGrava, conferirRodada, impressaoDigital } =
  await import("./rodada");
const { MODELOS_PADRAO } = await import("../modelos");

// Trava "prompt mudou sem avaliação" e repetição das respostas gravadas (P24).

const caso: Caso = {
  id: "01-azul",
  tipo: "compra",
  descricao: "Compra Azul",
  trocas: ["nome"],
  entrada: {
    assunto: "Sua reserva",
    remetente: "Azul <a@example.com>",
    recebido_em: "2026-11-02",
    corpo: "Localizador QWE7RT. Voo AD 4512 SDU 07/12 06:30 → CGH 07:35. Total R$ 459,90",
  },
  esperado: {
    reservas: [
      {
        localizador: "QWE7RT",
        companhia: "AD",
        status: "active",
        valor: 459.9,
        moeda: "BRL",
        milhas: null,
        trechos: [
          {
            origem: "SDU",
            destino: "CGH",
            partida: "2026-12-07T06:30",
            chegada: "2026-12-07T07:35",
            voo: "AD 4512",
          },
        ],
      },
    ],
  },
};

const saida: Extraction = {
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
      purchased_on: null,
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

const resposta = {
  parsed_output: saida,
  stop_reason: "end_turn",
  usage: {
    input_tokens: 4000,
    output_tokens: 500,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
};

describe("impressaoDigital", () => {
  it("é estável e muda quando o pedido ao modelo muda", () => {
    const a = impressaoDigital();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(impressaoDigital()).toBe(a);
    const outroPrompt: typeof montarPedido = (...args) => ({
      ...montarPedido(...args),
      system: "outro prompt",
    });
    expect(impressaoDigital(outroPrompt)).not.toBe(a);
    const outroModelo = { ...MODELOS_PADRAO, padrao: "outro-modelo" };
    expect(impressaoDigital(montarPedido, outroModelo)).not.toBe(a);
  });
});

describe("respostas gravadas", () => {
  it("grava a chamada de verdade e repete a mesma resposta depois", async () => {
    const real = { messages: { parse: vi.fn(async () => resposta) } };
    const gravacao = { caso: caso.id, chamadas: [] };
    const gravado = await avaliarCaso(caso, clienteQueGrava(real as never, gravacao));
    expect(gravacao.chamadas).toEqual([{ modelo: MODELOS_PADRAO.padrao, resposta }]);
    expect(gravado.correcao.inteiro).toBe(true);

    const repetido = await avaliarCaso(caso, clienteGravado(gravacao));
    expect(repetido.correcao).toEqual(gravado.correcao);
    expect(repetido.chamadas).toEqual(gravado.chamadas);
  });

  it("chamada que não foi gravada falha pedindo a avaliação de verdade", async () => {
    const r = await avaliarCaso(caso, clienteGravado({ caso: caso.id, chamadas: [] }));
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/avaliação de verdade/);
  });

  it("modelo diferente do gravado também falha", async () => {
    const g = { caso: caso.id, chamadas: [{ modelo: "outro", resposta }] };
    const r = await avaliarCaso(caso, clienteGravado(g));
    expect(r.erro).toMatch(/avaliação de verdade/);
  });
});

describe("conferirRodada", () => {
  const atual = { impressao: "a".repeat(64), gabarito: "b".repeat(64) };
  it("rodada do mesmo prompt e do mesmo gabarito passa", () => {
    expect(conferirRodada({ ...atual }, atual)).toEqual([]);
  });
  it("prompt, esquema ou modelo mudou depois da última rodada", () => {
    expect(conferirRodada({ ...atual, impressao: "c".repeat(64) }, atual).join()).toMatch(/prompt/);
  });
  it("gabarito mudou depois da última rodada", () => {
    expect(conferirRodada({ ...atual, gabarito: "c".repeat(64) }, atual).join()).toMatch(
      /gabarito/,
    );
  });
  it("sem rodada gravada", () => {
    expect(conferirRodada(null, atual).join()).toMatch(/nenhuma rodada/i);
  });
});
