#!/usr/bin/env node
// Segunda aplicação de todas as migrações (pesquisa A1.4 e 11.7).
// O `supabase start` já aplicou cada arquivo uma vez, do zero. Aqui cada arquivo roda
// de novo, em ordem, e o esquema do banco é comparado antes e depois: a segunda
// aplicação não pode dar erro nem mudar a estrutura. Isso garante que uma migração
// interrompida no meio possa ser rodada de novo em produção.
//
// Usa o psql e o pg_dump de dentro do contêiner do banco, que têm a mesma versão
// do servidor. Imprime só nomes de arquivos e contagens.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const CONTEINER = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_minhas-passagens";
const raiz = path.join(import.meta.dirname, "..", "..");
const pasta = path.join(raiz, "supabase", "migrations");

function noBanco(args, entrada) {
  return execFileSync("docker", ["exec", "-i", CONTEINER, ...args], {
    input: entrada,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** Esquema sem linhas de comentário nem as que variam a cada dump. */
export function esquemaNormalizado(dump) {
  return dump
    .split("\n")
    .filter(
      (l) => !l.startsWith("--") && !l.startsWith("\\restrict") && !l.startsWith("\\unrestrict"),
    )
    .join("\n");
}

function esquema() {
  return esquemaNormalizado(noBanco(["pg_dump", "-U", "postgres", "--schema-only", "postgres"]));
}

if (process.argv[1] === import.meta.filename) {
  const arquivos = readdirSync(pasta)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const antes = esquema();
  let falhas = 0;
  for (const arquivo of arquivos) {
    const sql = readFileSync(path.join(pasta, arquivo), "utf8");
    try {
      noBanco(["psql", "-U", "postgres", "-d", "postgres", "-q", "-v", "ON_ERROR_STOP=1"], sql);
      console.log(`ok   ${arquivo}`);
    } catch (e) {
      falhas++;
      console.log(`ERRO ${arquivo}`);
      console.log(String(e.stderr ?? e.message).trim());
    }
  }
  const depois = esquema();
  console.log(`\n${arquivos.length} migrações aplicadas pela segunda vez; ${falhas} com erro.`);
  if (antes !== depois) {
    const a = new Set(antes.split("\n"));
    const d = new Set(depois.split("\n"));
    const sumiram = [...a].filter((l) => !d.has(l));
    const novas = [...d].filter((l) => !a.has(l));
    console.log("O esquema mudou na segunda aplicação:");
    for (const l of sumiram.slice(0, 40)) console.log(`- ${l}`);
    for (const l of novas.slice(0, 40)) console.log(`+ ${l}`);
    falhas++;
  } else {
    console.log("Esquema idêntico antes e depois da segunda aplicação.");
  }
  process.exit(falhas ? 1 : 0);
}
