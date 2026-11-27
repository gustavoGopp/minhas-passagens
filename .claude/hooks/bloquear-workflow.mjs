#!/usr/bin/env node
// Trava 3 (PreToolUse, disparo de workflow pelo GitHub): o agente dispara
// diagnóstico (só leitura), backup e CI. Restauração, migração manual,
// agendador e ajustes de login só o dono dispara.
// Segunda camada: os ambientes do GitHub já exigem a main e a aprovação dele.
// Origem: auditoria A1.1 e A2.17.
import { chamadoDireto, decidir, lerEntrada } from "./lib.mjs";

const SO_O_DONO = [
  "supabase-restore.yml",
  "supabase-auth.yml",
  "supabase-setup-jobs.yml",
  "supabase-migrate.yml",
];

export function avaliar(entrada) {
  const { method, workflow_id: workflow, ref } = entrada ?? {};
  if (method !== "run_workflow") return null;
  const nome = String(workflow ?? "");
  if (SO_O_DONO.includes(nome))
    return `O workflow ${nome} mexe em produção e só o dono dispara (Actions → ${nome} → Run workflow).`;
  if (nome.startsWith("supabase-") && ref && ref !== "main")
    return "Workflows do Supabase só rodam a partir da main: a consulta precisa entrar na main antes.";
  return null;
}

if (chamadoDireto(import.meta.url)) {
  const motivo = avaliar(lerEntrada().tool_input);
  if (motivo) decidir("deny", motivo);
}
