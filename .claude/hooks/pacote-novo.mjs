#!/usr/bin/env node
// Trava 4 (PreToolUse, Bash): pacote novo do npm.
// Modelos inventam nomes de pacote, e alguém pode registrar o nome inventado
// com código malicioso; ataques recentes rodaram na instalação.
// - pacote que não existe, ou criado há menos de 7 dias: bloqueado;
// - qualquer outro pacote que ainda não está no package.json: pede a aprovação do dono;
// - origem fora do registro do npm (endereço, repositório Git, arquivo) e comando
//   que desliga a quarentena ou liga os scripts de instalação: pede a aprovação do dono.
// Origem: pesquisa 16.5, 16.7 e 16.8; revisão de 27/11.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  chamadoDireto,
  comandosExpandidos,
  decidir,
  lerEntrada,
  nomeDoPrograma,
  pastas,
} from "./lib.mjs";

export const DIAS_DE_QUARENTENA = 7;
/** Resposta da consulta quando o registro do npm não respondeu. */
export const INDISPONIVEL = "indisponivel";

const GERENCIADORES = /^(npm|pnpm|yarn|bun|npx|bunx|pnpx)$/;
const INSTALAR = /^(install|i|in|ins|inst|insta|instal|isnt|isnta|isntal|isntall|add)$/;
const EXECUTAR = /^(exec|x|dlx)$/;
const CRIAR = /^(init|create)$/;
const COM_VALOR = new Set([
  "--prefix",
  "-C",
  "--dir",
  "--cwd",
  "--registry",
  "--userconfig",
  "--cache",
  "-w",
  "--workspace",
  "--tag",
]);
const AFROUXA = /^--(min-release-age|before)(=|$)|^--ignore-scripts=false$|^--no-ignore-scripts$/;
const AFROUXA_ENV = /^npm_config_(min_release_age|before|ignore_scripts)=/i;
const FORA_DO_REGISTRO =
  /^[./~]|^(file|git|git\+[a-z]+|github|gitlab|bitbucket|gist|https?|ssh):|\.(tgz|tar\.gz)$/;

function classificar(spec, conhecidos, novos, outros) {
  // "apelido@npm:pacote-de-verdade": o que entra é o pacote de verdade.
  const apelido = /^(?:@[^/@]+\/)?[^@/]+@npm:(.+)$/.exec(spec);
  const s = apelido ? apelido[1] : spec;
  if (FORA_DO_REGISTRO.test(s)) return void outros.add(spec);
  const nome = s.replace(/^(@[^/]+\/[^@]+|[^@]+)@.*$/, "$1");
  if (nome === "npm") return; // atualizar o próprio npm não é pacote novo do projeto
  if (!/^(@[\w.-]+\/)?[\w.-]+$/.test(nome)) return void outros.add(spec); // ex.: usuario/repositorio
  if (!conhecidos.has(nome)) novos.add(nome);
}

/** O que `npx` (ou `npm exec`) baixaria: os pacotes de -p, ou o primeiro nome. */
function pacotesDoExecutar(palavras) {
  const pedidos = [];
  for (let i = 0; i < palavras.length; i++) {
    const a = palavras[i];
    if (a === "-p" || a === "--package") pedidos.push(palavras[++i]);
    else if (a.startsWith("--package=")) pedidos.push(a.slice("--package=".length));
    else if (a === "-c" || a === "--call") return pedidos;
    else if (a === "--") return pedidos.length ? pedidos : palavras.slice(i + 1, i + 2);
    else if (!a.startsWith("-")) return pedidos.length ? pedidos : [a];
  }
  return pedidos;
}

/**
 * O que o comando traria para o projeto:
 * - novos: nomes de pacote do registro que não estão no package.json;
 * - outros: origens fora do registro (endereço, Git, arquivo, outro registro);
 * - afrouxa: opções que desligam a quarentena ou ligam os scripts de instalação.
 * binarios: programas já instalados em node_modules/.bin (para `npx tsc`).
 */
export function analisar(comando, conhecidos, binarios = new Set()) {
  const novos = new Set();
  const outros = new Set();
  const afrouxa = new Set();
  const instalados = new Set([...conhecidos, ...binarios]);

  for (const c of comandosExpandidos(comando)) {
    const p = c.palavras;
    const gerenciador = nomeDoPrograma(p[0]);
    if (!GERENCIADORES.test(gerenciador)) continue;

    for (const a of c.atribuicoes)
      if (AFROUXA_ENV.test(a) && !/ignore_scripts=true$/i.test(a)) afrouxa.add(a);
    const resto = p.slice(1);
    for (const a of resto) if (AFROUXA.test(a)) afrouxa.add(a);

    if (/^(npx|bunx|pnpx)$/.test(gerenciador)) {
      for (const s of pacotesDoExecutar(resto)) classificar(s, instalados, novos, outros);
      continue;
    }

    const pos = [];
    for (let i = 0; i < resto.length; i++) {
      if (!resto[i].startsWith("-")) pos.push({ palavra: resto[i], i });
      else if (COM_VALOR.has(resto[i])) i++;
    }
    const acao = pos[0]?.palavra ?? "";
    if (acao === "config" && pos[1]?.palavra === "set") {
      const chave = pos[2]?.palavra ?? "";
      if (/^(min-release-age|before|ignore-scripts)/.test(chave))
        afrouxa.add(`config set ${chave}`);
    } else if (INSTALAR.test(acao)) {
      if (resto.some((a) => a === "--registry" || a.startsWith("--registry=")))
        outros.add("outro registro (--registry)");
      for (const { palavra } of pos.slice(1)) classificar(palavra, conhecidos, novos, outros);
    } else if (EXECUTAR.test(acao)) {
      for (const s of pacotesDoExecutar(resto.slice(pos[0].i + 1)))
        classificar(s, instalados, novos, outros);
    } else if (CRIAR.test(acao) && pos[1]) {
      // "npm create x" baixa e roda o pacote "create-x".
      const nome = pos[1].palavra;
      if (/^[\w.-]+(@.*)?$/.test(nome)) classificar(`create-${nome}`, conhecidos, novos, outros);
      else outros.add(nome);
    }
  }
  return { novos: [...novos], outros: [...outros], afrouxa: [...afrouxa] };
}

/** Nomes de pacote que o comando instalaria e que ainda não estão no package.json. */
export function pacotesNovos(comando, conhecidos) {
  return analisar(comando, conhecidos).novos;
}

function criadoEm(nome) {
  const r = spawnSync("npm", ["view", nome, "time.created"], {
    encoding: "utf8",
    timeout: 15_000,
  });
  if (r.status === 0) return r.stdout.trim() || null;
  return /E404/.test(r.stderr ?? "") ? null : INDISPONIVEL;
}

/**
 * Decisão para o resultado de analisar() (ou uma lista de pacotes novos).
 * consulta(nome) devolve a data de criação, null se o pacote não existe, ou INDISPONIVEL.
 */
export function avaliar(analise, consulta = criadoEm, agora = Date.now()) {
  const a = Array.isArray(analise) ? { novos: analise, outros: [], afrouxa: [] } : analise;
  if (!a.novos.length && !a.outros.length && !a.afrouxa.length) return null;
  for (const nome of a.novos) {
    const criado = consulta(nome);
    if (criado === INDISPONIVEL)
      return {
        decisao: "deny",
        motivo: `Não consegui consultar o registro do npm sobre o pacote "${nome}" (sem resposta). Tente de novo; sem a consulta, pacote novo não entra.`,
      };
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
  const partes = [];
  if (a.afrouxa.length)
    partes.push(`O comando desliga uma proteção da instalação (${a.afrouxa.join(", ")}).`);
  if (a.novos.length) partes.push(`Pacote novo: ${a.novos.join(", ")}.`);
  if (a.outros.length) partes.push(`Origem fora do registro do npm: ${a.outros.join(", ")}.`);
  return {
    decisao: "ask",
    motivo: `${partes.join(" ")} Entra só com a aprovação do dono e uma frase dizendo para que serve.`,
  };
}

if (chamadoDireto(import.meta.url)) {
  const entrada = lerEntrada();
  const { raiz } = pastas(entrada);
  let conhecidos = new Set();
  let binarios = new Set();
  try {
    const pkg = JSON.parse(readFileSync(path.join(raiz, "package.json"), "utf8"));
    conhecidos = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);
    binarios = new Set(readdirSync(path.join(raiz, "node_modules", ".bin")));
  } catch {
    // sem package.json ou sem dependências instaladas: todo pacote é novo
  }
  const resultado = avaliar(analisar(entrada.tool_input?.command, conhecidos, binarios));
  if (resultado) decidir(resultado.decisao, resultado.motivo);
}
