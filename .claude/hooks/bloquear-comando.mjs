#!/usr/bin/env node
// Trava 1 (PreToolUse, Bash): comandos que não admitem exceção.
// Lê o comando inteiro, comando por comando, porque uma regra "deny" simples
// deixa passar o mesmo comando escrito de outra forma (git -C, sh -c, /bin/rm,
// aspas, parênteses, várias linhas).
// É uma proteção contra descuido, não um cofre: a regra da main no GitHub e os
// ambientes de produção são a barreira de verdade.
// Origem: auditoria de 26/11 (A1.1, A1.14), pesquisa 16.2 e revisão de 27/11.
import path from "node:path";
import {
  arquivoDeSegredo,
  chamadoDireto,
  comandosExpandidos,
  decidir,
  existeNaMain,
  git,
  lerEntrada,
  nomeDoPrograma,
  pastas,
} from "./lib.mjs";
import { avaliar as avaliarMigracao } from "./proteger-migracoes.mjs";

const PODE_DISPARAR = new Set([
  "supabase-diagnostico.yml",
  "supabase-backup.yml",
  "ci.yml",
  "codeql.yml",
]);
const PASTAS_DO_PROJETO = [".claude", ".github", "docs", "public", "scripts", "src", "supabase"];

const MOTIVO = {
  forcado:
    "Push forçado é proibido: reescreve o histórico de forma irreversível. Use --force-with-lease só para recomeçar o branch depois do merge.",
  main: "Push direto na main é proibido: toda mudança entra por pull request, e quem junta é o dono.",
  juntar: "Quem junta pull request é o dono, nunca o agente.",
  rm: "Apagar pastas inteiras do projeto de forma recursiva é proibido. Apague arquivos específicos.",
  clean:
    "git clean com -x apaga os arquivos ignorados, inclusive segredos locais e dependências. Apague arquivos específicos.",
  env: "Arquivos .env guardam segredos e não podem ser lidos nem alterados pelo agente. O .env.example é liberado.",
  banco:
    "O banco de produção só é alcançado pelos workflows do GitHub (ambientes producao-rotina e producao-risco), nunca direto da sessão.",
  dono: "Restauração, migração manual, agendador e ajustes de login só o dono dispara. O agente dispara o diagnóstico e o backup, pelo nome do arquivo (supabase-diagnostico.yml, supabase-backup.yml).",
};

function subcomandoGit(p) {
  if (nomeDoPrograma(p[0]) !== "git") return null;
  let i = 1;
  while (i < p.length && p[i].startsWith("-"))
    i += ["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(p[i]) ? 2 : 1;
  return { sub: p[i], args: p.slice(i + 1) };
}

const PUSH_COM_VALOR = new Set(["--repo", "-o", "--push-option", "--receive-pack", "--exec"]);

function push(args, ramoAtual) {
  const opcoes = [];
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith("-")) pos.push(args[i]);
    else {
      opcoes.push(args[i]);
      if (PUSH_COM_VALOR.has(args[i])) i++;
    }
  }
  const refs = pos.slice(1);
  const forcado =
    opcoes.some(
      (o) => o === "--force" || o === "--mirror" || (/^-[a-zA-Z]+$/.test(o) && o.includes("f")),
    ) || refs.some((r) => r.startsWith("+"));
  if (forcado) return MOTIVO.forcado;
  if (opcoes.some((o) => o === "--all" || o === "--branches")) return MOTIVO.main;
  // Sem destino escrito (ou HEAD), o git envia para o branch em que a sessão está.
  const destinos = refs.length
    ? refs.map((r) => {
        const d = r.includes(":") ? r.slice(r.lastIndexOf(":") + 1) : r;
        return /^(HEAD|@)$/.test(d) ? ramoAtual() : d;
      })
    : [ramoAtual()];
  return destinos.some((d) => /^(refs\/heads\/)?(main|master)$/.test(String(d ?? "")))
    ? MOTIVO.main
    : null;
}

/** O alvo é a pasta do projeto, uma pasta acima dela, a .git ou uma pasta principal versionada? */
function pastaPerigosa(alvo, cwd, ctx) {
  if (/^(\/\*?|~\/?\*?|\$HOME\/?\*?|\$\{HOME\}\/?\*?)$/.test(alvo)) return true;
  let a = alvo.replace(/(\/\*|\/\.|\/)+$/, "");
  if (a === "*" || a === "") a = ".";
  if (/[$`~]/.test(a)) return false; // variável que a trava não sabe resolver
  if (!path.isAbsolute(a) && cwd === null) return false;
  const abs = path.resolve(cwd ?? "/", a);
  const rel = path.relative(ctx.raiz, abs).split(path.sep).join("/");
  if (rel === "") return true;
  if (rel.startsWith("..")) return ctx.raiz.startsWith(abs === "/" ? "/" : abs + path.sep);
  if (rel === ".git" || rel.startsWith(".git/")) return true;
  return ctx.pastas.includes(rel) || rel === "supabase/migrations";
}

const semOpcoes = (palavras) => palavras.filter((x) => !x.startsWith("-"));
const ALTERA = /^(rm|mv|tee|truncate|shred)$/;
const SO_OLHA = /^(ls|test|\[|\[\[|stat)$/;
const BUSCA = /^(grep|egrep|fgrep|rg)$/;

/** Devolve o motivo do bloqueio, ou null se o comando pode seguir. */
export function avaliar(comando, ctx) {
  const texto = String(comando ?? "");
  let cwd = ctx.cwd;

  for (const c of comandosExpandidos(texto)) {
    const p = c.palavras;
    const programa = nomeDoPrograma(p[0]);
    const g = subcomandoGit(p);

    if (programa === "cd") {
      const alvo = p[1];
      if (!alvo || /^-$|[$`~]/.test(alvo) || (cwd === null && !path.isAbsolute(alvo))) cwd = null;
      else cwd = path.resolve(cwd ?? "/", alvo);
      continue;
    }

    // 1. Git: push forçado, push na main, limpeza de arquivos ignorados.
    if (g?.sub === "push") {
      const motivo = push(g.args, ctx.ramoAtual);
      if (motivo) return motivo;
    }
    if (g?.sub === "clean" && g.args.some((a) => /^-[a-zA-Z]*[xX]/.test(a))) return MOTIVO.clean;

    // 2. GitHub pela linha de comando: juntar pull request e disparar workflow.
    if (programa === "gh") {
      const pos = semOpcoes(p.slice(1));
      if (pos[0] === "pr" && pos[1] === "merge") return MOTIVO.juntar;
      if (pos[0] === "workflow" && pos[1] === "run" && !PODE_DISPARAR.has(pos[2]))
        return MOTIVO.dono;
    }
    if (p.some((x) => /\/pulls\/\d+\/merge\b/.test(x))) return MOTIVO.juntar;
    if (
      p.some((x) => /\/dispatches\b/.test(x)) &&
      !p.some((x) => [...PODE_DISPARAR].some((w) => x.includes(`/workflows/${w}/dispatches`)))
    )
      return MOTIVO.dono;

    // 3. Apagar pastas do projeto.
    if (programa === "rm" && p.some((x) => x === "--recursive" || /^-[a-zA-Z]*[rR]/.test(x))) {
      if (semOpcoes(p.slice(1)).some((a) => pastaPerigosa(a, cwd, ctx))) return MOTIVO.rm;
    }
    if (programa === "find") {
      const apaga =
        p.includes("-delete") ||
        p.some((x, i) => /^-(exec|execdir|ok)$/.test(x) && nomeDoPrograma(p[i + 1]) === "rm");
      const fim = p.findIndex((x, i) => i > 0 && /^[-!]/.test(x));
      const inicios = p.slice(1, fim < 0 ? undefined : fim);
      if (apaga && (inicios.length ? inicios : ["."]).some((a) => pastaPerigosa(a, cwd, ctx)))
        return MOTIVO.rm;
    }

    // 4. Arquivos de segredo.
    let lidos = [...p.slice(1), ...c.atribuicoes];
    if (SO_OLHA.test(programa) || /^(check-ignore|ls-files)$/.test(g?.sub ?? "")) lidos = [];
    else if (BUSCA.test(programa)) {
      const padrao = p.findIndex((x, i) => i > 0 && !x.startsWith("-"));
      lidos = p.filter((_, i) => i > 0 && i !== padrao);
    }
    const candidatos = [...lidos, ...c.redirecionamentos].flatMap((x) =>
      x.includes("=") ? [x, x.slice(x.indexOf("=") + 1)] : [x],
    );
    if (candidatos.some(arquivoDeSegredo)) return MOTIVO.env;

    // 5. Migração que já está na main, alterada por comando em vez de pela ferramenta de edição.
    const editaNoLugar =
      /^(sed|perl)$/.test(programa) &&
      p.some((x) => /^-[a-zA-Z]*i/.test(x) || x.startsWith("--in-place"));
    const alterados = [
      ...(ALTERA.test(programa) || editaNoLugar ? p.slice(1) : []),
      ...(g && /^(rm|mv)$/.test(g.sub ?? "") ? g.args : []),
      ...(programa === "cp" ? p.slice(-1) : []),
      ...c.redirecionamentos,
    ];
    for (const a of alterados) {
      if (a.startsWith("-") || /[$`~]/.test(a) || (cwd === null && !path.isAbsolute(a))) continue;
      const motivo = avaliarMigracao(path.resolve(cwd ?? "/", a), ctx.raiz, ctx.migracaoNaMain);
      if (motivo) return motivo;
    }
  }

  if (/api\.supabase\.com/.test(texto)) return MOTIVO.banco;
  return null;
}

/** Contexto de verdade: pastas da sessão, branch atual e pastas principais versionadas. */
export function contexto(entrada) {
  const { raiz, cwd } = pastas(entrada);
  const versionadas = (git(raiz, "ls-tree", "-d", "--name-only", "HEAD") ?? "").split("\n");
  return {
    raiz,
    cwd,
    ramoAtual: () => git(cwd, "symbolic-ref", "--short", "-q", "HEAD"),
    pastas: [...new Set([...PASTAS_DO_PROJETO, ...versionadas.filter(Boolean)])],
    migracaoNaMain: existeNaMain,
  };
}

if (chamadoDireto(import.meta.url)) {
  const entrada = lerEntrada();
  const motivo = avaliar(entrada.tool_input?.command, contexto(entrada));
  if (motivo) decidir("deny", motivo);
}
