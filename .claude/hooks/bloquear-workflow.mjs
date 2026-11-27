#!/usr/bin/env node
// Trava 3 (PreToolUse, disparo de workflow pelo GitHub): o agente dispara só
// o que está na lista abaixo. Restauração, migração manual, agendador, ajustes
// de login e qualquer workflow que a lista não conhece: só o dono.
// Segunda camada: os ambientes do GitHub já exigem a main e, nos de risco, a
// aprovação dele. Repetir uma execução antiga (rerun) passa por aqui sem
// conferência do nome; nesse caso a barreira é o ambiente.
// Origem: auditoria A1.1 e A2.17; revisão de 27/11 (lista do que pode, não do que não pode).
import { chamadoDireto, decidir, lerEntrada } from "./lib.mjs";

/** Workflow → só a partir da main? */
const PODE_DISPARAR = new Map([
  ["supabase-diagnostico.yml", true],
  ["supabase-backup.yml", true],
  ["ci.yml", false],
  ["codeql.yml", false],
]);

export function avaliar(entrada) {
  const { method, workflow_id: workflow, ref } = entrada ?? {};
  if (method !== "run_workflow") return null;
  const nome = String(workflow ?? "");
  if (!PODE_DISPARAR.has(nome))
    return `O workflow "${nome}" só o dono dispara (Actions → Run workflow). O agente dispara pelo nome do arquivo: ${[...PODE_DISPARAR.keys()].join(", ")}.`;
  if (PODE_DISPARAR.get(nome) && ref && !/^(refs\/heads\/)?main$/.test(ref))
    return "Workflows do Supabase só rodam a partir da main: a consulta precisa entrar na main antes.";
  return null;
}

if (chamadoDireto(import.meta.url)) {
  const motivo = avaliar(lerEntrada().tool_input);
  if (motivo) decidir("deny", motivo);
}
