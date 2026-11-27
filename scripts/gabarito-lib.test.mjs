import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { problemasDoGabarito } from "./gabarito-lib.mjs";

// Trava de dado pessoal do gabarito da extração (P24). O repositório é público:
// e-mail, CPF, telefone, cartão e token não entram, nem nas respostas gravadas.

const caso = (corpo, extra = {}) => ({
  id: "01-teste",
  trocas: ["nome", "localizador"],
  entrada: { assunto: "Sua reserva", remetente: "Azul <reservas@example.com>", corpo },
  ...extra,
});

describe("problemasDoGabarito", () => {
  it("aceita texto anonimizado com e-mail de exemplo", () => {
    expect(
      problemasDoGabarito(caso("Olá, Fulano Exemplo (fulano@example.com). Localizador QWE7RT.")),
    ).toEqual([]);
  });

  it.each([
    ["e-mail de verdade", "Contato: maria.silva@gmail.com"],
    ["CPF", "CPF 123.456.789-09"],
    ["telefone", "Ligue (21) 99876-5432"],
    ["cartão", "Cartão 4111 1111 1111 1111"],
    ["cartão sem espaços", "cartao 4111111111111111 aprovado"],
    ["token", "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456"],
  ])("recusa %s", (_nome, corpo) => {
    expect(problemasDoGabarito(caso(corpo)).length).toBeGreaterThan(0);
  });

  it("não devolve o valor encontrado, só onde está", () => {
    const p = problemasDoGabarito(caso("maria.silva@gmail.com"));
    expect(JSON.stringify(p)).not.toContain("maria");
  });

  it("exige a lista de trocas", () => {
    expect(problemasDoGabarito(caso("texto", { trocas: undefined }))).toEqual([
      { caminho: "trocas", motivo: "falta a lista do que foi trocado" },
    ]);
    expect(problemasDoGabarito(caso("texto", { trocas: [] })).length).toBe(1);
  });
});

const PASTAS = ["tests/gabaritos/extracao/casos", "tests/avaliacao-extracao/respostas"];

it("gabarito e respostas gravadas não têm dado pessoal", () => {
  const achados = {};
  for (const pasta of PASTAS) {
    const arquivos = existsSync(pasta) ? readdirSync(pasta).filter((a) => a.endsWith(".json")) : [];
    for (const arquivo of arquivos) {
      const dado = JSON.parse(readFileSync(join(pasta, arquivo), "utf8"));
      const p = problemasDoGabarito(dado, { exigirTrocas: pasta.includes("gabaritos") });
      if (p.length) achados[`${pasta}/${arquivo}`] = p;
    }
  }
  expect(achados).toEqual({});
});
