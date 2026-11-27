/** Leitura de valores em reais digitados. Sem dependências: usado no servidor e no navegador. */

export type MoneyResult = { ok: true; cents: number | null } | { ok: false; message: string };

export const MONEY_HINT = "Informe um valor em reais, como 1.250,50";

// Milhar à brasileira: "0", "250", "1.000", "12.500", "1.234.567".
const THOUSANDS = /^(0|[1-9]\d{0,2}(\.\d{3})*)$/;

/**
 * Lê um valor em reais como digitado. Regra aprovada pelo dono (tabela em
 * money.test.ts): vírgula é centavo; ponto seguido de 3 dígitos é milhar; ponto
 * seguido de 1 ou 2 dígitos é centavo ("459.9"); vazio é "sem valor"; o que
 * for ambíguo ou não for número é recusado, nunca gravado como outro valor.
 */
export function parseMoney(text: string): MoneyResult {
  const invalid: MoneyResult = { ok: false, message: MONEY_HINT };
  if (text.trim() === "") return { ok: true, cents: null };
  const raw = text.replace(/R\$/i, "").replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(raw)) return invalid;
  let whole: string;
  let decimals = "";
  if (raw.includes(",")) {
    const parts = raw.split(",");
    if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1])) return invalid;
    if (!THOUSANDS.test(parts[0]) && !/^\d+$/.test(parts[0])) return invalid;
    [whole, decimals] = parts;
  } else if (raw.includes(".")) {
    if (THOUSANDS.test(raw)) {
      whole = raw;
    } else {
      const m = /^(\d+)\.(\d{1,2})$/.exec(raw);
      if (!m) return invalid;
      [, whole, decimals] = m;
    }
  } else {
    whole = raw;
  }
  const cents = Number(whole.replace(/\./g, "")) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? { ok: true, cents } : invalid;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  R$: "BRL",
  US$: "USD",
  U$S: "USD",
  U$: "USD",
  "€": "EUR",
  "£": "GBP",
};

/**
 * Código ISO da moeda a partir do que a extração devolveu. Vazio ou ausente
 * vale real (compra feita no Brasil). Símbolos comuns são traduzidos. O que
 * não der para entender devolve "" e nunca vira real: o dono escolhe.
 */
export function currencyCode(input: string | null | undefined): string {
  const up = (input ?? "").trim().toUpperCase();
  if (up === "") return "BRL";
  if (/^[A-Z]{3}$/.test(up)) return up;
  return CURRENCY_SYMBOLS[up] ?? "";
}
