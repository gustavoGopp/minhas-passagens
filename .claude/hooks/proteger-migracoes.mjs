#!/usr/bin/env node
// Trava 2 (PreToolUse, Edit|Write): migração que já está na main não se edita.
// Ela já rodou em produção; mudar o arquivo não muda o banco e engana quem lê.
// Origem: auditoria A1.4 (três migrações foram editadas depois de aplicadas).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chamadoDireto, decidir, lerEntrada } from "./lib.mjs";

/** Caminho relativo da migração dentro do repositório, ou null se não for migração. */
export function migracao(arquivo, raiz) {
  if (!arquivo) return null;
  const rel = path.relative(raiz, path.resolve(raiz, arquivo)).split(path.sep).join("/");
  return /^supabase\/migrations\/[^/]+\.sql$/.test(rel) ? rel : null;
}

function existeNaMain(rel, raiz) {
  for (const ref of ["origin/main", "main"]) {
    try {
      execFileSync("git", ["cat-file", "-e", `${ref}:${rel}`], { cwd: raiz, stdio: "ignore" });
      return true;
    } catch {
      // tenta a próxima referência
    }
  }
  return false;
}

export function avaliar(arquivo, raiz, jaAplicada = existeNaMain) {
  const rel = migracao(arquivo, raiz);
  if (!rel || !jaAplicada(rel, raiz)) return null;
  return `A migração ${rel} já está na main e já rodou em produção. Não edite: crie uma migração nova com a correção.`;
}

if (chamadoDireto(import.meta.url)) {
  const entrada = lerEntrada();
  const raiz = process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd();
  const motivo = avaliar(entrada.tool_input?.file_path, raiz);
  if (motivo) decidir("deny", motivo);
}
