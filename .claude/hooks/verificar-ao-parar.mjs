#!/usr/bin/env node
// Trava 5 (Stop): o agente só termina o turno com a verificação rápida verde
// (lint, formatação, tipos e testes). Instrução em texto para "verificar antes
// de dizer pronto" depende do modelo; o hook vale sempre.
// - só roda quando o código mudou desde a última verificação que passou;
// - depois de 3 bloqueios seguidos, libera e avisa, para não prender o turno.
// Origem: pesquisa 1.5, 2.2 e 6.4.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { lerEntrada } from "./lib.mjs";

const MAX_BLOQUEIOS = 3;
const entrada = lerEntrada();
const raiz = process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd();
const git = (...args) => execFileSync("git", args, { cwd: raiz, encoding: "utf8" });

if (
  !existsSync(path.join(raiz, "node_modules")) ||
  !existsSync(path.join(raiz, "scripts/verificar.sh"))
)
  process.exit(0); // sem dependências instaladas não há como verificar

// Estado do código: commit atual, mudanças em arquivos versionados e o
// conteúdo dos arquivos novos ainda não versionados (ignorados ficam de fora).
let estado;
try {
  const h = createHash("sha256")
    .update(git("rev-parse", "HEAD"))
    .update(git("status", "--porcelain"))
    .update(git("diff", "HEAD"));
  for (const novo of git("ls-files", "--others", "--exclude-standard", "-z").split("\0")) {
    if (!novo) continue;
    try {
      h.update(novo).update(readFileSync(path.join(raiz, novo)));
    } catch {
      // arquivo sumiu no meio do caminho: o nome já entrou no estado
    }
  }
  estado = h.digest("hex");
} catch {
  process.exit(0); // fora de um repositório Git
}

const pasta = path.join(raiz, "node_modules", ".cache", "verificar");
mkdirSync(pasta, { recursive: true });
const arquivoOk = path.join(pasta, "ultimo-ok");
const arquivoBloqueios = path.join(pasta, "bloqueios");
const ler = (f) => (existsSync(f) ? readFileSync(f, "utf8").trim() : "");

if (ler(arquivoOk) === estado) process.exit(0); // nada mudou desde a última verificação verde

const r = spawnSync("bash", ["scripts/verificar.sh", "rapido"], { cwd: raiz, encoding: "utf8" });
if (r.status === 0) {
  writeFileSync(arquivoOk, estado);
  writeFileSync(arquivoBloqueios, "0");
  process.exit(0);
}

const bloqueios = Number(ler(arquivoBloqueios) || 0) + 1;
writeFileSync(arquivoBloqueios, String(bloqueios));
if (bloqueios > MAX_BLOQUEIOS) {
  writeFileSync(arquivoBloqueios, "0");
  console.error(
    "A verificação continua falhando depois de 3 tentativas. Turno liberado: diga ao dono, sem rodeios, o que está falhando.",
  );
  process.exit(0);
}
console.error(
  `A verificação rápida falhou (tentativa ${bloqueios} de ${MAX_BLOQUEIOS}). Corrija antes de terminar:\n${r.stdout}${r.stderr}`,
);
process.exit(2);
