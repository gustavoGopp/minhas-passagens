#!/usr/bin/env node
// Trava 2 (PreToolUse, Edit|Write): migração que já está na main não se edita.
// Ela já rodou em produção; mudar o arquivo não muda o banco e engana quem lê.
// A trava 1 usa a mesma regra para comandos (sed -i, mv, rm, redirecionamento),
// e a CI recusa o pull request que altere migração da main.
// Origem: auditoria A1.4 (três migrações foram editadas depois de aplicadas).
import { existsSync } from "node:fs";
import path from "node:path";
import { caminhoReal, chamadoDireto, decidir, existeNaMain, lerEntrada, pastas } from "./lib.mjs";

/** Caminho relativo da migração dentro do repositório, ou null se não for migração. */
export function migracao(arquivo, raiz) {
  if (!arquivo) return null;
  const base = caminhoReal(raiz);
  const rel = path
    .relative(base, caminhoReal(path.resolve(base, arquivo)))
    .split(path.sep)
    .join("/");
  return /^supabase\/migrations\/[^/]+\.sql$/.test(rel) ? rel : null;
}

/** jaAplicada(rel, raiz) devolve true, false, ou null quando não há main para conferir. */
export function avaliar(arquivo, raiz, jaAplicada = existeNaMain) {
  const rel = migracao(arquivo, raiz);
  if (!rel) return null;
  const naMain = jaAplicada(rel, raiz);
  if (naMain)
    return `A migração ${rel} já está na main e já rodou em produção. Não edite: crie uma migração nova com a correção.`;
  if (naMain === null && existsSync(path.join(caminhoReal(raiz), rel)))
    return `Não consegui conferir se a migração ${rel} já está na main (o repositório não tem a main aqui). Rode "git fetch origin main" e tente de novo.`;
  return null;
}

if (chamadoDireto(import.meta.url)) {
  const entrada = lerEntrada();
  const motivo = avaliar(entrada.tool_input?.file_path, pastas(entrada).raiz);
  if (motivo) decidir("deny", motivo);
}
