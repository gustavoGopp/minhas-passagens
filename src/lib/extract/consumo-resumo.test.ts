import { describe, expect, it } from "vitest";
import { contarHoje, inicioDoDiaEmSaoPaulo, somarGasto } from "./consumo-resumo";

describe("inicioDoDiaEmSaoPaulo", () => {
  it.each([
    // 27/11 às 02:30 UTC ainda é 26/11 em São Paulo (UTC-3).
    ["2026-11-27T02:30:00Z", "2026-11-26T03:00:00.000Z"],
    ["2026-11-27T03:00:00Z", "2026-11-27T03:00:00.000Z"],
    ["2026-11-27T23:59:00Z", "2026-11-27T03:00:00.000Z"],
  ])("%s → %s", (agora, inicio) => {
    expect(inicioDoDiaEmSaoPaulo(Date.parse(agora))).toBe(inicio);
  });
});

const linha = (modelo: string, reforco: boolean, entrada: number, saida: number) => ({
  modelo,
  reforco,
  tokens_entrada: entrada,
  tokens_saida: saida,
  tokens_cache_leitura: 0,
  tokens_cache_escrita: 0,
});

describe("somarGasto", () => {
  it("conta leituras (sem o reforço), reforços, gasto real e o estimado para o mesmo número", () => {
    const r = somarGasto([
      linha("claude-haiku-5-5", false, 5000, 600),
      linha("claude-haiku-5-5", false, 2000, 100),
      linha("claude-sonnet-5-5", true, 5000, 600),
    ]);
    expect(r.leituras).toBe(2);
    expect(r.comReforco).toBe(1);
    expect(r.realUsd).toBeCloseTo(0.0008 + 0.00025 + 0.016, 8);
    expect(r.estimadoUsd).toBeCloseTo(2 * (0.0008 + 0.05 * 0.016), 8);
  });

  it("sem leituras, tudo zero", () => {
    expect(somarGasto([])).toEqual({ leituras: 0, comReforco: 0, realUsd: 0, estimadoUsd: 0 });
  });
});

describe("contarHoje", () => {
  const agora = Date.parse("2026-11-27T15:00:00Z");
  const l = (criado_em: string, origem: string, reforco = false) => ({
    criado_em,
    origem,
    reforco,
  });
  it("conta só as leituras de hoje em São Paulo, sem reforço e fora da busca completa", () => {
    expect(
      contarHoje(
        [
          l("2026-11-27T03:00:00Z", "automatica"),
          l("2026-11-27T14:00:00Z", "envio"),
          l("2026-11-27T14:00:01Z", "envio", true),
          l("2026-11-27T14:00:02Z", "varredura"),
          l("2026-11-27T02:59:59Z", "automatica"),
        ],
        agora,
      ),
    ).toBe(2);
  });
});
