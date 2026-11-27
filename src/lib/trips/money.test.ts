import { describe, expect, it } from "vitest";
import { parseMoney } from "./money";

// Tabela aprovada pelo dono em 26/11/2026. O teste nasce dela: não altere os
// resultados esperados sem aprovação dele. Origem: auditoria A2.2
// ("R$ 1.000" era gravado como R$ 1,00).
const ACEITOS: [digitado: string, centavos: number | null][] = [
  ["250", 25000],
  ["1.000", 100000],
  ["12.500", 1250000],
  ["1.250,50", 125050],
  ["R$ 1.234,56", 123456],
  ["459,9", 45990],
  ["459.9", 45990],
  ["459.90", 45990],
  ["1,5", 150],
  ["", null],
  ["   ", null],
  // Mesma regra, outros tamanhos.
  ["1.234.567", 123456700],
  ["1.234.567,89", 123456789],
  ["0", 0],
  ["0,50", 50],
  ["R$250", 25000],
];

const RECUSADOS: [digitado: string, motivo: string][] = [
  ["abc", "não é número"],
  ["1,234", "vírgula seguida de 3 dígitos é ambíguo"],
  ["1.23.4", "pontos fora do lugar"],
  ["0.500", "milhar começando com zero"],
  ["-50", "valor negativo"],
  ["1.2345", "ponto seguido de 4 dígitos"],
  ["12,3,4", "duas vírgulas"],
  ["1.000.00", "pontos fora do lugar"],
  ["R$", "só o símbolo"],
];

describe("leitura de valores em reais", () => {
  it.each(ACEITOS)("aceita %j", (digitado, centavos) => {
    expect(parseMoney(digitado)).toEqual({ ok: true, cents: centavos });
  });

  it.each(RECUSADOS)("recusa %j (%s)", (digitado) => {
    const r = parseMoney(digitado);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("1.250,50");
  });
});
