import { describe, expect, it } from "vitest";
import { custoDaChamada } from "./cost";

// Custo real de uma chamada (P25), pelos preços de 11/2026 por milhão de tokens:
// Haiku 5.5 US$ 0,10 entrada e 0,50 saída; Sonnet 5.5 US$ 2 e 10. Leitura de cache
// custa 10% da entrada; escrita de cache, 125%.
const chamada = (modelo: string, entrada: number, saida: number, leitura = 0, escrita = 0) => ({
  modelo,
  tokensEntrada: entrada,
  tokensSaida: saida,
  tokensCacheLeitura: leitura,
  tokensCacheEscrita: escrita,
});

describe("custoDaChamada", () => {
  it.each([
    ["claude-haiku-5-5", 5000, 600, 0.0008],
    ["claude-sonnet-5-5", 5000, 600, 0.016],
    ["claude-haiku-5-5", 0, 0, 0],
  ])("%s com %i de entrada e %i de saída custa US$ %f", (modelo, entrada, saida, usd) => {
    expect(custoDaChamada(chamada(modelo, entrada, saida))).toBeCloseTo(usd, 8);
  });

  it("cache: leitura a 10% e escrita a 125% do preço de entrada", () => {
    expect(custoDaChamada(chamada("claude-haiku-5-5", 0, 0, 1_000_000, 0))).toBeCloseTo(0.01, 8);
    expect(custoDaChamada(chamada("claude-haiku-5-5", 0, 0, 0, 1_000_000))).toBeCloseTo(0.125, 8);
  });

  it("modelo desconhecido usa o preço do Sonnet (nunca subestima)", () => {
    expect(custoDaChamada(chamada("modelo-novo", 5000, 600))).toBeCloseTo(0.016, 8);
  });
});
