#!/usr/bin/env node
// Trava 1 (PreToolUse, Bash): comandos que não admitem exceção.
// Lê o comando inteiro, porque uma regra "deny" simples deixa passar o mesmo
// comando escrito de outra forma (git -C, sh -c, /bin/rm).
// Origem: auditoria de 26/11 (A1.1, A1.14) e pesquisa 16.2.
import { chamadoDireto, decidir, lerEntrada } from "./lib.mjs";

const PERIGOSOS = ["/", "~", "$HOME", ".", "..", "*", ".git", "src", "supabase", "node_modules/.."];
const WORKFLOWS_DE_RISCO = /supabase-(restore|auth|setup-jobs|migrate)\.yml/;

function rmPerigoso(comando) {
  const partes = comando.split(/\s+/);
  for (let i = 0; i < partes.length; i++) {
    if (!/(^|\/)rm$/.test(partes[i])) continue;
    let recursivo = false;
    const alvos = [];
    for (let j = i + 1; j < partes.length && !/^(&&|\|\||;|\|)$/.test(partes[j]); j++) {
      const p = partes[j].replace(/^["']|["';]+$/g, "");
      if (/^--recursive$/.test(p) || /^-[a-zA-Z]*[rR]/.test(p)) recursivo = true;
      else if (!p.startsWith("-")) alvos.push(p.replace(/\/+$/, "") || "/");
    }
    if (
      recursivo &&
      alvos.some((a) => PERIGOSOS.includes(a) || a.startsWith("supabase/migrations"))
    )
      return true;
  }
  return false;
}

/** Devolve o motivo do bloqueio, ou null se o comando pode seguir. */
export function avaliar(comando) {
  const c = String(comando ?? "");
  const pushes = c.match(/\bgit\b[^|;&]*\bpush\b[^|;&]*/g) ?? [];
  for (const p of pushes) {
    if (/\s(--force(?!-with-lease)|-[a-zA-Z]*f[a-zA-Z]*)(\s|=|$)/.test(p))
      return "Push forçado é proibido: reescreve o histórico de forma irreversível. Use --force-with-lease só para recomeçar o branch depois do merge.";
    if (/(\s|:|\/)(main|master)(\s|$)/.test(p))
      return "Push direto na main é proibido: toda mudança entra por pull request, e quem junta é o dono.";
  }
  if (rmPerigoso(c))
    return "Apagar pastas inteiras do projeto de forma recursiva é proibido. Apague arquivos específicos.";
  if (/(^|[\s"'=/(<])\.env(\.(?!example\b)[\w.-]+)?(?=$|[\s"';|&)>])/.test(c))
    return "Arquivos .env guardam segredos e não podem ser lidos nem alterados pelo agente. O .env.example é liberado.";
  if (/api\.supabase\.com/.test(c))
    return "O banco de produção só é alcançado pelos workflows do GitHub (ambientes producao-rotina e producao-risco), nunca direto da sessão.";
  if (/\bgh\s+workflow\s+run\b|\/dispatches\b/.test(c) && WORKFLOWS_DE_RISCO.test(c))
    return "Restauração, migração manual, agendador e ajustes de login só o dono dispara.";
  return null;
}

if (chamadoDireto(import.meta.url)) {
  const motivo = avaliar(lerEntrada().tool_input?.command);
  if (motivo) decidir("deny", motivo);
}
