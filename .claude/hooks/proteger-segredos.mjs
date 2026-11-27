#!/usr/bin/env node
// Trava 6 (PreToolUse, Read|Edit|Write): arquivos .env guardam segredos e não
// são lidos, criados nem alterados pelo agente. O .env.example é liberado.
// As permissões negadas do settings.json cobrem nomes fixos; este hook cobre
// qualquer nome (.env.test, .env.staging) e também a escrita.
// Origem: revisão de 27/11.
import { arquivoDeSegredo, chamadoDireto, decidir, lerEntrada } from "./lib.mjs";

export function avaliar(arquivo) {
  if (!arquivo || !arquivoDeSegredo(arquivo)) return null;
  return "Arquivos .env guardam segredos e não podem ser lidos nem alterados pelo agente. O .env.example é liberado.";
}

if (chamadoDireto(import.meta.url)) {
  const motivo = avaliar(lerEntrada().tool_input?.file_path);
  if (motivo) decidir("deny", motivo);
}
