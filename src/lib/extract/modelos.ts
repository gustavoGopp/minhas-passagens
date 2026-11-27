/**
 * Modelos da extração (decisão de 29/10: Haiku, com reforço do Sonnet). A
 * avaliação (tests/gabaritos/extracao) mede estes; trocar exige uma rodada de
 * verdade antes do merge. As variáveis EXTRACTION_MODEL_* da Vercel substituem
 * estes valores em produção: trocar por lá também pede uma rodada antes.
 */
export const MODELOS_PADRAO = {
  padrao: "claude-haiku-5-5",
  reforco: "claude-sonnet-5-5",
} as const;
