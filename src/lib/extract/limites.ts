// Limites da leitura com IA (P25), decididos pelo dono em 27/11/2026. Mudar
// pede a etiqueta aprovado-pelo-dono (scripts/aprovacao-lib.mjs).

/**
 * Leituras com IA por dia (fuso de São Paulo) por conta, somando a leitura
 * automática do Gmail e o envio de print, PDF ou texto. Conta só a primeira
 * chamada de cada leitura (o reforço não conta de novo). A busca completa que o
 * dono confirma vendo o custo fica fora: ele já aprovou aquele gasto.
 */
export const TETO_DIARIO_EXTRACOES = 30;

/** Vezes que a IA pode ser chamada para o mesmo e-mail; depois ele vira erro. */
export const MAX_TENTATIVAS_POR_EMAIL = 3;
