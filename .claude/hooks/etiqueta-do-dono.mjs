#!/usr/bin/env node
// Trava 7 (PreToolUse, Bash e ferramentas do GitHub): a etiqueta
// "aprovado-pelo-dono" só o dono põe. Ela libera mudança em cenários de aceitação,
// gabaritos e regras de acesso (.github/workflows/aprovacao.yml). O agente age
// com a conta do dono, então o GitHub sozinho não distingue quem pôs a etiqueta.
// Origem: pesquisa 14.3 e 14.4 (o agente não pode alterar o que julga o trabalho).
import { chamadoDireto, decidir, lerEntrada } from "./lib.mjs";

const ETIQUETA = "aprovado-pelo-dono";
const MOTIVO = `A etiqueta "${ETIQUETA}" só o dono põe, no GitHub. Peça a ele que confira a mudança e ponha a etiqueta.`;

export function avaliar(ferramenta, entrada) {
  const e = entrada ?? {};
  if (ferramenta === "Bash") {
    const cmd = String(e.command ?? "");
    const falaComGitHub = /\b(gh|curl|wget)\b/.test(cmd);
    return falaComGitHub && cmd.includes(ETIQUETA) && /label/i.test(cmd) ? MOTIVO : null;
  }
  if (!String(ferramenta ?? "").startsWith("mcp__github__")) return null;
  const etiquetas = Array.isArray(e.labels) ? e.labels.map(String) : [];
  if (etiquetas.includes(ETIQUETA)) return MOTIVO;
  if (/label/i.test(ferramenta) && JSON.stringify(e).includes(ETIQUETA)) return MOTIVO;
  return null;
}

if (chamadoDireto(import.meta.url)) {
  const entrada = lerEntrada();
  const motivo = avaliar(entrada.tool_name, entrada.tool_input);
  if (motivo) decidir("deny", motivo);
}
