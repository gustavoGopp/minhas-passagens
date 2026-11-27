// Regra da checagem "Aprovação do dono" (.github/workflows/aprovacao.yml).
// O workflow roda a versão da main (evento pull_request_target): o branch do PR
// não consegue mudar esta regra para se aprovar sozinho.

/** Etiqueta que só o dono põe no PR (o agente é barrado por um hook). */
export const ETIQUETA = "aprovado-pelo-dono";

/** O que julga o trabalho: cenários aprovados, gabaritos e regras de acesso. */
const PROTEGIDOS = [/^tests\/aceitacao\//, /^tests\/gabaritos\//, /^docs\/regras-de-acesso\.md$/];

const TESTE = /(^|\/)tests\/|\.(test|spec)\.(m?[jt]sx?)$/;

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
    if (!tocados.length && TESTE.test(a.filename))
      testesAlterados.push(`${a.filename} (${a.status})`);
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
