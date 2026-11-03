/**
 * Estimativa de custo da leitura com IA (Haiku 5.5: US$ 0,10 por milhão de tokens
 * de entrada e US$ 0,50 de saída; reforço com Sonnet 5.5 em parte dos casos).
 * Mostrada antes do clique em "Confirmar". Valores de 11/2026: conferir na
 * página de preços da Anthropic se mudarem.
 */
export const HAIKU_IN_PER_MTOK = 0.1;
export const HAIKU_OUT_PER_MTOK = 0.5;
export const SONNET_IN_PER_MTOK = 2;
export const SONNET_OUT_PER_MTOK = 10;
/** Média de tokens de um e-mail limpo (texto) e da resposta. */
export const TOKENS_IN = 5_000;
export const TOKENS_OUT = 600;
/** Fração estimada de e-mails que precisam do reforço. */
export const RETRY_SHARE = 0.05;

/** Custo máximo estimado (US$) para ler `emails` e-mails. */
export function estimateUsd(emails: number): number {
  const haiku = (TOKENS_IN * HAIKU_IN_PER_MTOK + TOKENS_OUT * HAIKU_OUT_PER_MTOK) / 1_000_000;
  const sonnet = (TOKENS_IN * SONNET_IN_PER_MTOK + TOKENS_OUT * SONNET_OUT_PER_MTOK) / 1_000_000;
  return emails * (haiku + RETRY_SHARE * sonnet);
}

export function formatUsd(v: number): string {
  return v < 0.01 ? "menos de US$ 0,01" : `US$ ${v.toFixed(2).replace(".", ",")}`;
}
