import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lerGabarito, PASTA_GABARITO } from "./gabarito";

const limites = {
  campos_minimos: { aeroportos: 1 },
  caso_inteiro_minimo: 0.9,
  injecao_casos_minimo: 5,
  propaganda_inventadas_maximo: 0,
};

const caso = {
  id: "01-azul",
  tipo: "compra",
  descricao: "Compra no site da Azul, ida e volta",
  trocas: ["nome", "localizador"],
  entrada: {
    assunto: "Sua reserva",
    remetente: "Azul <a@example.com>",
    recebido_em: "2026-11-02",
    corpo: "Localizador QWE7RT",
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
          { origem: "SDU", destino: "CGH", partida: "2026-12-07T06:30", chegada: null, voo: null },
        ],
      },
    ],
  },
};

function pasta(casos: unknown[], lim: unknown = limites) {
  const raiz = mkdtempSync(join(tmpdir(), "gabarito-"));
  mkdirSync(join(raiz, "casos"));
  writeFileSync(join(raiz, "limites.json"), JSON.stringify(lim));
  casos.forEach((c, i) => writeFileSync(join(raiz, "casos", `${i}.json`), JSON.stringify(c)));
  return raiz;
}

describe("lerGabarito", () => {
  it("lê casos e limites, com um hash que muda quando o gabarito muda", () => {
    const a = lerGabarito(pasta([caso]));
    expect(a.casos).toHaveLength(1);
    expect(a.limites.caso_inteiro_minimo).toBe(0.9);
    const b = lerGabarito(pasta([{ ...caso, descricao: "outra" }]));
    expect(b.hash).not.toBe(a.hash);
    expect(lerGabarito(pasta([caso])).hash).toBe(a.hash);
  });

  it.each([
    ["tipo desconhecido", { ...caso, tipo: "outro" }],
    [
      "data sem hora",
      {
        ...caso,
        esperado: {
          reservas: [
            {
              ...caso.esperado.reservas[0],
              trechos: [{ ...caso.esperado.reservas[0].trechos[0], partida: "2026-12-07" }],
            },
          ],
        },
      },
    ],
    [
      "aeroporto com 4 letras",
      {
        ...caso,
        esperado: {
          reservas: [
            {
              ...caso.esperado.reservas[0],
              trechos: [{ ...caso.esperado.reservas[0].trechos[0], origem: "SBRJ" }],
            },
          ],
        },
      },
    ],
    ["sem lista de trocas", { ...caso, trocas: undefined }],
  ])("recusa caso com %s, dizendo qual arquivo", (_nome, ruim) => {
    expect(() => lerGabarito(pasta([ruim]))).toThrow(/0\.json/);
  });

  it("lê as taxas em dinheiro de uma emissão com pontos e recusa taxa negativa", () => {
    const comPontos = (taxas: number) => ({
      ...caso,
      esperado: {
        reservas: [{ ...caso.esperado.reservas[0], valor: null, milhas: 15360, taxas }],
      },
    });
    expect(lerGabarito(pasta([comPontos(102.04)])).casos[0].esperado.reservas[0].taxas).toBe(
      102.04,
    );
    expect(() => lerGabarito(pasta([comPontos(-1)]))).toThrow(/0\.json/);
  });

  it("recusa ids repetidos", () => {
    expect(() => lerGabarito(pasta([caso, caso]))).toThrow(/repetido/);
  });

  it("recusa limite fora de 0 a 1", () => {
    expect(() => lerGabarito(pasta([caso], { ...limites, caso_inteiro_minimo: 90 }))).toThrow(
      /limites/,
    );
  });

  it("o gabarito do repositório é válido", () => {
    expect(() => lerGabarito(PASTA_GABARITO)).not.toThrow();
  });
});
