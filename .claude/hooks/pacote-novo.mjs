#!/usr/bin/env node
// Trava 4 (PreToolUse, Bash): pacote novo do npm.
// Modelos inventam nomes de pacote, e alguém pode registrar o nome inventado
// com código malicioso; ataques recentes rodaram na instalação.
// - pacote que não existe, ou criado há menos de 7 dias: bloqueado;
// - qualquer outro pacote que ainda não está no package.json: pede a aprovação do dono.
// Origem: pesquisa 16.5, 16.7 e 16.8.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chamadoDireto, decidir, lerEntrada } from "./lib.mjs";

export const DIAS_DE_QUARENTENA = 7;

/** Nomes de pacote que o comando instalaria e que ainda não estão no package.json. */
export function pacotesNovos(comando, conhecidos) {
  const novos = new Set();
  for (const trecho of String(comando ?? "").split(/&&|\|\||;|\|/)) {
    const partes = trecho.trim().split(/\s+/);
    const i = partes.findIndex((p) => /^(npm|pnpm|yarn|npx|bunx|bun)$/.test(p));
    if (i < 0) continue;
    const gerenciador = partes[i];
    const acao = partes[i + 1] ?? "";
    let candidatos = [];
    if (gerenciador === "npx" || gerenciador === "bunx") {
      candidatos = partes
        .slice(i + 1)
        .filter((p) => !p.startsWith("-"))
        .slice(0, 1);
    } else if (/^(install|i|add|exec|x|dlx)$/.test(acao)) {
      candidatos = partes.slice(i + 2).filter((p) => !p.startsWith("-"));
      if (/^(exec|x|dlx)$/.test(acao)) candidatos = candidatos.slice(0, 1);
    }
    for (const c of candidatos) {
      if (/^[./~]|^(file|git|https?):/.test(c)) continue; // caminho local ou URL: outra conversa
      const nome = c.replace(/^(@[^/]+\/[^@]+|[^@]+)@.*$/, "$1");
      if (nome === "npm") continue; // atualizar o próprio npm não é pacote novo do projeto
      if (/^(@[\w.-]+\/)?[\w.-]+$/.test(nome) && !conhecidos.has(nome)) novos.add(nome);
    }
  }
  return [...novos];
}

function criadoEm(nome) {
  try {
    const saida = execFileSync("npm", ["view", nome, "time.created"], {
      encoding: "utf8",
      timeout: 15_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return saida || null;
  } catch {
    return null;
  }
}

/** Decisão para uma lista de pacotes novos. consulta(nome) devolve a data de criação ou null. */
export function avaliar(novos, consulta = criadoEm, agora = Date.now()) {
  if (!novos.length) return null;
  for (const nome of novos) {
    const criado = consulta(nome);
    if (!criado)
      return {
        decisao: "deny",
        motivo: `O pacote "${nome}" não foi encontrado no npm. Confira o nome: pode ter sido inventado.`,
      };
    const dias = (agora - Date.parse(criado)) / 86_400_000;
    if (!(dias >= DIAS_DE_QUARENTENA))
      return {
        decisao: "deny",
        motivo: `O pacote "${nome}" foi criado há menos de ${DIAS_DE_QUARENTENA} dias. Pacote novo demais não entra.`,
      };
  }
  return {
    decisao: "ask",
    motivo: `Pacote novo: ${novos.join(", ")}. Entra só com a aprovação do dono e uma frase dizendo para que serve.`,
  };
}

if (chamadoDireto(import.meta.url)) {
  const entrada = lerEntrada();
  const raiz = process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd();
  let conhecidos = new Set();
  try {
    const pkg = JSON.parse(readFileSync(path.join(raiz, "package.json"), "utf8"));
    conhecidos = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);
  } catch {
    // sem package.json: todo pacote é novo
  }
  const resultado = avaliar(pacotesNovos(entrada.tool_input?.command, conhecidos));
  if (resultado) decidir(resultado.decisao, resultado.motivo);
}
