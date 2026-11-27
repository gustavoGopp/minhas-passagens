// Regra da checagem "Aprovação do dono" (.github/workflows/aprovacao.yml).
// O workflow roda a versão da main (evento pull_request_target): o branch do PR
// não consegue mudar esta regra para se aprovar sozinho.

/** Etiqueta que só o dono põe no PR (o agente é barrado por um hook). */
export const ETIQUETA = "aprovado-pelo-dono";

/**
 * O que julga o trabalho: cenários aprovados, gabaritos, regras de acesso (o texto
 * e a tabela que os testes conferem) e a própria checagem com a sua trava. Sem os
 * últimos, um PR poderia afrouxar a regra ou esvaziar esta lista sem a etiqueta.
 */
const PROTEGIDOS = [
  /^tests\/aceitacao\//,
  /^tests\/gabaritos\//,
  /^docs\/regras-de-acesso\.md$/,
  /^tests\/banco\/tabelas\.ts$/,
  /^scripts\/aprovacao(-lib)?\.mjs$/,
  /^scripts\/cenarios\.test\.mjs$/,
  /^\.github\/workflows\/aprovacao\.yml$/,
  /^\.claude\/hooks\/etiqueta-do-dono\.mjs$/,
  // Etapa 3: teto diário e tentativas da leitura com IA; notas da última rodada de verdade.
  /^src\/lib\/extract\/limites\.ts$/,
  /^tests\/avaliacao-extracao\/resultado\.json$/,
];

/** Arquivo de teste: dentro de uma pasta tests/ ou com nome *.test.* / *.spec.*. */
const NA_PASTA_TESTS = /(?:^|\/)tests\//;
const NOME_DE_TESTE = /\.(?:test|spec)\.m?[jt]sx?$/;
const ehTeste = (caminho) => NA_PASTA_TESTS.test(caminho) || NOME_DE_TESTE.test(caminho);

const protegido = (caminho) => Boolean(caminho) && PROTEGIDOS.some((r) => r.test(caminho));

/**
 * arquivos: lista do GitHub (filename, status, previous_filename);
 * etiquetas: nomes das etiquetas do PR; evento: ação do pull_request_target.
 */
export function decidir({ arquivos, etiquetas, evento }) {
  const protegidos = [];
  const testesAlterados = [];
  for (const a of arquivos) {
    const tocados = [a.filename, a.previous_filename].filter(protegido);
    for (const t of tocados) if (!protegidos.includes(t)) protegidos.push(t);
    if (!tocados.length && ehTeste(a.filename)) testesAlterados.push(`${a.filename} (${a.status})`);
  }
  const temEtiqueta = etiquetas.includes(ETIQUETA);
  // Push novo depois da aprovação: o dono precisa olhar de novo.
  const removerEtiqueta = protegidos.length > 0 && temEtiqueta && evento === "synchronize";
  const ok = protegidos.length === 0 || (temEtiqueta && !removerEtiqueta);
  let mensagem;
  if (!protegidos.length) mensagem = "Nenhum cenário, gabarito ou regra de acesso aprovada mudou.";
  else if (ok) mensagem = `Mudança aprovada pelo dono (etiqueta "${ETIQUETA}").`;
  else if (removerEtiqueta)
    mensagem = `Houve um envio novo depois da aprovação. O dono precisa conferir e pôr a etiqueta "${ETIQUETA}" de novo.`;
  else
    mensagem = `Este PR muda o que julga o trabalho. Só o dono aprova, com a etiqueta "${ETIQUETA}".`;
  return { ok, removerEtiqueta, protegidos, testesAlterados, mensagem };
}
