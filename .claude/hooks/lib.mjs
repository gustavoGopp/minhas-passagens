// Utilitários dos hooks do Claude Code deste repositório.
// Cada hook lê um JSON da entrada padrão e, para bloquear, imprime a decisão
// no formato da documentação (hookSpecificOutput.permissionDecision).
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function lerEntrada() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

/** Imprime a decisão de um hook PreToolUse. decisao: "deny" | "ask". */
export function decidir(decisao, motivo) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decisao,
        permissionDecisionReason: motivo,
      },
    }),
  );
}

/** Caminho real (sem atalhos). Para arquivo que ainda não existe, resolve a pasta mais próxima que existe. */
export function caminhoReal(caminho) {
  const absoluto = path.resolve(caminho);
  try {
    return realpathSync(absoluto);
  } catch {
    const pai = path.dirname(absoluto);
    return pai === absoluto ? absoluto : path.join(caminhoReal(pai), path.basename(absoluto));
  }
}

/** Verdadeiro quando o arquivo foi chamado direto (e não importado por um teste). */
export function chamadoDireto(metaUrl) {
  if (!process.argv[1]) return false;
  return caminhoReal(process.argv[1]) === caminhoReal(fileURLToPath(metaUrl));
}

/** Pasta do projeto e pasta em que o comando roda, a partir da entrada do hook. */
export function pastas(entrada) {
  const raiz = caminhoReal(process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd());
  return { raiz, cwd: caminhoReal(entrada.cwd || raiz) };
}

/** Roda o git e devolve a saída, ou null se o comando falhar. */
export function git(raiz, ...args) {
  try {
    return execFileSync("git", args, {
      cwd: raiz,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * O arquivo já existe na main? true, false, ou null quando não há main para conferir.
 * Olha primeiro a main do GitHub (origin/main) e depois a local.
 */
export function existeNaMain(rel, raiz) {
  let haMain = false;
  for (const ref of ["origin/main", "main"]) {
    if (git(raiz, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`) === null) continue;
    haMain = true;
    if (git(raiz, "cat-file", "-e", `${ref}:${rel}`) !== null) return true;
  }
  return haMain ? false : null;
}

const SEPARADORES = new Set(["\n", ";", "&", "|", "(", ")", "`"]);

/**
 * Quebra um comando do shell em comandos simples, cada um com as suas palavras
 * (já sem aspas) e os arquivos para onde a saída é redirecionada.
 * Não é um interpretador de shell: basta para reconhecer o que as travas procuram.
 */
export function comandosSimples(texto) {
  const comandos = [];
  let atual = { palavras: [], redirecionamentos: [] };
  let palavra = null;
  let aspa = null;
  let redireciona = false;
  const s = String(texto ?? "");

  const fechaPalavra = () => {
    if (palavra === null) return;
    (redireciona ? atual.redirecionamentos : atual.palavras).push(palavra);
    palavra = null;
    redireciona = false;
  };
  const fechaComando = () => {
    fechaPalavra();
    redireciona = false;
    if (atual.palavras.length || atual.redirecionamentos.length) comandos.push(atual);
    atual = { palavras: [], redirecionamentos: [] };
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (aspa) {
      if (ch === aspa) aspa = null;
      else if (ch === "\\" && aspa === '"' && i + 1 < s.length) palavra += s[++i];
      else palavra += ch;
    } else if (ch === "'" || ch === '"') {
      aspa = ch;
      palavra ??= "";
    } else if (ch === "\\" && i + 1 < s.length) {
      if (s[i + 1] === "\n") i++;
      else palavra = (palavra ?? "") + s[++i];
    } else if (ch === "#" && palavra === null) {
      while (i + 1 < s.length && s[i + 1] !== "\n") i++;
    } else if (SEPARADORES.has(ch)) {
      fechaComando();
    } else if (ch === ">" || ch === "<") {
      // "2>" e "&>" são redirecionamentos: o número não é uma palavra do comando.
      if (palavra !== null && /^\d+$/.test(palavra)) palavra = null;
      fechaPalavra();
      redireciona = ch === ">";
    } else if (/\s/.test(ch)) {
      fechaPalavra();
    } else {
      palavra = (palavra ?? "") + ch;
    }
  }
  fechaComando();
  return comandos;
}

const INTERPRETADORES = /^(sh|bash|zsh|dash)$/;
const PREFIXOS = /^(sudo|command|exec|time|nohup|env|xargs)$/;
export const nomeDoPrograma = (palavra) => path.basename(String(palavra ?? ""));

/**
 * Comandos simples de um texto, incluindo os que estão dentro de `sh -c '...'`
 * e `eval`. Tira prefixos como `sudo` e separa as atribuições (VAR=valor) do começo.
 */
export function comandosExpandidos(texto, nivel = 0) {
  const todos = [];
  for (const c of comandosSimples(texto)) {
    const atribuicoes = [];
    let p = [...c.palavras];
    for (;;) {
      if (p.length && /^[A-Za-z_]\w*=/.test(p[0])) atribuicoes.push(p.shift());
      else if (p.length > 1 && PREFIXOS.test(nomeDoPrograma(p[0]))) {
        p.shift();
        while (p.length && p[0].startsWith("-")) p.shift();
      } else break;
    }
    todos.push({ palavras: p, atribuicoes, redirecionamentos: c.redirecionamentos });
    if (nivel >= 3 || !p.length) continue;
    const programa = nomeDoPrograma(p[0]);
    const iC = p.indexOf("-c");
    if (INTERPRETADORES.test(programa) && iC > 0 && p[iC + 1])
      todos.push(...comandosExpandidos(p[iC + 1], nivel + 1));
    if (programa === "eval") todos.push(...comandosExpandidos(p.slice(1).join(" "), nivel + 1));
  }
  return todos;
}

/** O caminho aponta para um arquivo .env (que não seja o .env.example)? Aceita curingas. */
export function arquivoDeSegredo(caminho) {
  const nome = String(caminho ?? "")
    .split("/")
    .pop();
  return /^\.env([.*?[].*)?$/.test(nome) && nome !== ".env.example";
}
