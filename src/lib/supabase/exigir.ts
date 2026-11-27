/**
 * Resposta do supabase-js: o erro vem no resultado, não como exceção. Esquecer de
 * ler `error` faz uma gravação falha parecer sucesso (pesquisa A2.7). `exigir`
 * transforma o erro em exceção, com o contexto em português, e devolve `data`.
 * Uma regra de lint (eslint.config.mjs) reprova gravação com o resultado descartado.
 */
export function exigir<T>(
  resposta: { data: T; error: { message: string } | null },
  contexto: string,
): T {
  if (resposta.error) throw new Error(`${contexto}: ${resposta.error.message}`);
  return resposta.data;
}
