#!/usr/bin/env node
// Trava 5 (Stop): o agente só termina o turno com a verificação rápida verde
// (lint, formatação, tipos e testes). Instrução em texto para "verificar antes
// de dizer pronto" depende do modelo; o hook vale sempre.
// - só roda quando o código mudou desde a última verificação que passou;
// - depois de 3 bloqueios seguidos, libera e avisa o dono na tela, para não
//   prender o turno; com o mesmo código, não bloqueia de novo, só repete o aviso.
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
const arquivoLiberado = path.join(pasta, "liberado");
const ler = (f) => (existsSync(f) ? readFileSync(f, "utf8").trim() : "");

// Aviso para o dono: "systemMessage" é o campo que o Claude Code mostra na tela.
// (O que um hook de parada escreve na saída de erro com código 0 ninguém vê.)
function liberarComAviso() {
  console.log(
    JSON.stringify({
      systemMessage:
        "A verificação automática (lint, formatação, tipos e testes) continua falhando depois de 3 tentativas de correção. O agente foi liberado para não ficar preso, mas o trabalho NÃO está verificado. Peça a ele que diga o que está falhando.",
    }),
  );
  process.exit(0);
}

if (ler(arquivoOk) === estado) {
  writeFileSync(arquivoBloqueios, "0");
  process.exit(0); // nada mudou desde a última verificação verde
}
// Já liberado com este mesmo código: não prende o turno de novo, só repete o aviso.
if (ler(arquivoLiberado) === estado) liberarComAviso();

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
  writeFileSync(arquivoLiberado, estado);
  liberarComAviso();
}
console.error(
  `A verificação rápida falhou (tentativa ${bloqueios} de ${MAX_BLOQUEIOS}). Corrija antes de terminar:\n${r.stdout}${r.stderr}`,
);
process.exit(2);
