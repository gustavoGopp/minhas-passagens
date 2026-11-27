#!/usr/bin/env node
// Prova de que os testes de regras de acesso pegam regra quebrada (pesquisa 11.2 e 14.5).
// Para cada tabela, abre a regra de propósito e exige que todos os testes "nega:"
// daquela tabela falhem; depois retira o acesso do usuário logado e exige que
// todos os testes "permite:" falhem. Também quebra as checagens gerais (gatilho,
// tabela sem proteção, visão, função com poder de dono). Cada quebra é desfeita
// logo depois. Roda só contra o Supabase local (DB_URL em 127.0.0.1).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";

const DB_URL = process.env.DB_URL ?? "";
if (!/127\.0\.0\.1|localhost/.test(DB_URL)) {
  console.error("DB_URL precisa apontar para o Supabase local.");
  process.exit(2);
}

const raiz = path.join(import.meta.dirname, "..", "..");
const pasta = mkdtempSync(path.join(tmpdir(), "quebrar-regras-"));
const db = new pg.Pool({ connectionString: DB_URL, max: 1 });

/** Roda os testes de banco filtrados pelo nome e devolve { nome completo: passou? }. */
function rodarTestes(filtro) {
  const saida = path.join(pasta, "resultado.json");
  try {
    execFileSync(
      "npx",
      [
        "vitest",
        "run",
        "--config",
        "vitest.banco.config.mts",
        "tests/banco",
        "-t",
        filtro,
        "--reporter=json",
        `--outputFile=${saida}`,
      ],
      { cwd: raiz, stdio: "ignore", env: process.env },
    );
  } catch {
    // Falha de teste é o esperado em boa parte das quebras; o resultado está no JSON.
  }
  const json = JSON.parse(readFileSync(saida, "utf8"));
  const resultado = {};
  for (const arquivo of json.testResults)
    for (const t of arquivo.assertionResults)
      if (t.status !== "skipped" && t.status !== "pending")
        resultado[t.fullName] = t.status === "passed";
  return resultado;
}

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let problemas = 0;
let provas = 0;

/** Aplica a quebra, roda os testes e confere que os escolhidos falharam. */
async function provar({ titulo, quebrar, desfazer, filtro, devemFalhar, semAlvoOk = false }) {
  await db.query(quebrar);
  let resultado;
  try {
    resultado = rodarTestes(filtro);
  } finally {
    await db.query(desfazer);
  }
  const alvos = Object.keys(resultado).filter(devemFalhar);
  const verdes = alvos.filter((nome) => resultado[nome]);
  if (alvos.length === 0 && semAlvoOk) {
    console.log(`ok    ${titulo}: a tabela não dá acesso a ninguém logado, nada a provar`);
  } else if (alvos.length === 0) {
    problemas++;
    console.log(`ERRO  ${titulo}: nenhum teste correspondente rodou`);
  } else if (verdes.length) {
    problemas++;
    console.log(`ERRO  ${titulo}: ${verdes.length} de ${alvos.length} testes continuaram verdes:`);
    for (const nome of verdes) console.log(`      - ${nome}`);
  } else {
    provas += alvos.length;
    console.log(`ok    ${titulo}: ${alvos.length} testes falharam, como deviam`);
  }
}

try {
  const { rows: tabelas } = await db.query(
    `select c.relname as nome from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') order by 1`,
  );
  for (const { nome } of tabelas) {
    const filtro = `^tabela ${escapar(nome)} `;
    const nomeDaTabela = (n) => n.startsWith(`tabela ${nome} `);
    // Concessões como estavam antes de qualquer quebra: cada desfazer volta a elas.
    const { rows: concessoes } = await db.query(
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'public' and table_name = $1 and grantee in ('anon', 'authenticated')`,
      [nome],
    );
    // Concessões por coluna (ex.: user_integrations sem a chave cifrada). O revoke de
    // tabela também as retira, então voltam junto.
    const { rows: porColuna } = await db.query(
      `select grantee, privilege_type, column_name from information_schema.column_privileges
       where table_schema = 'public' and table_name = $1 and grantee in ('anon', 'authenticated')
         and not exists (select 1 from information_schema.role_table_grants g
           where g.table_schema = 'public' and g.table_name = $1
             and g.grantee = column_privileges.grantee
             and g.privilege_type = column_privileges.privilege_type)`,
      [nome],
    );
    const devolver =
      `revoke all on public.${nome} from anon, authenticated;` +
      concessoes
        .map((c) => `grant ${c.privilege_type} on public.${nome} to ${c.grantee};`)
        .join("") +
      porColuna
        .map(
          (c) => `grant ${c.privilege_type} (${c.column_name}) on public.${nome} to ${c.grantee};`,
        )
        .join("");
    await provar({
      titulo: `${nome}, regra aberta`,
      quebrar: `create policy quebra_aberta on public.${nome} for all to public using (true) with check (true);
                grant select, insert, update, delete on public.${nome} to anon, authenticated;`,
      desfazer: `drop policy if exists quebra_aberta on public.${nome}; ${devolver}`,
      filtro,
      devemFalhar: (n) => nomeDaTabela(n) && / nega: /.test(n),
    });

    await provar({
      titulo: `${nome}, acesso do usuário logado retirado`,
      quebrar: `revoke all on public.${nome} from authenticated;`,
      desfazer: devolver,
      filtro,
      devemFalhar: (n) => nomeDaTabela(n) && / permite: /.test(n),
      semAlvoOk: true,
    });
  }

  const gerais = "^todas as tabelas ";
  await provar({
    titulo: "gatilho de tabela nova desligado",
    quebrar: "alter event trigger ligar_rls_em_tabela_nova disable;",
    desfazer: "alter event trigger ligar_rls_em_tabela_nova enable;",
    filtro: gerais,
    devemFalhar: (n) => n.includes("tabela nova nasce com a proteção ligada"),
  });
  await provar({
    titulo: "tabela sem proteção",
    quebrar: `create table public.quebra_sem_protecao (id int);
              alter table public.quebra_sem_protecao disable row level security;`,
    desfazer: "drop table if exists public.quebra_sem_protecao;",
    filtro: gerais,
    devemFalhar: (n) =>
      n.includes("nenhuma tabela está sem a proteção") || n.includes("tem a sua regra escrita"),
  });
  await provar({
    titulo: "visão que fura a proteção",
    quebrar: "create view public.quebra_visao as select id, user_id from public.bookings;",
    desfazer: "drop view if exists public.quebra_visao;",
    filtro: gerais,
    devemFalhar: (n) => n.includes("nenhuma visão"),
  });
  await provar({
    titulo: "função com poder de dono",
    quebrar:
      "create function public.quebra_definer() returns int language sql security definer as 'select 1';",
    desfazer: "drop function if exists public.quebra_definer();",
    filtro: gerais,
    devemFalhar: (n) => n.includes("só funções conhecidas"),
  });

  // A sonda com a chave pública também tem de perceber uma tabela aberta.
  await db.query(
    "create policy quebra_aberta on public.bookings for all to public using (true) with check (true);",
  );
  let sondaPercebeu = false;
  try {
    execFileSync("node", ["scripts/banco-teste/sonda-chave-publica.mjs", "--como-producao"], {
      cwd: raiz,
      stdio: "ignore",
      env: process.env,
    });
  } catch {
    sondaPercebeu = true;
  } finally {
    await db.query("drop policy if exists quebra_aberta on public.bookings;");
  }
  if (sondaPercebeu) {
    provas++;
    console.log("ok    sonda com a chave pública, bookings aberta: a sonda reprovou, como devia");
  } else {
    problemas++;
    console.log("ERRO  sonda com a chave pública, bookings aberta: a sonda não percebeu");
  }

  const final = rodarTestes(".");
  const vermelhos = Object.entries(final).filter(([, ok]) => !ok);
  if (vermelhos.length) {
    problemas++;
    console.log(
      `ERRO  depois de desfazer as quebras, ${vermelhos.length} testes ficaram vermelhos`,
    );
  } else {
    console.log(
      `ok    depois de desfazer as quebras, os ${Object.keys(final).length} testes voltaram a passar`,
    );
  }
} finally {
  await db.end();
  rmSync(pasta, { recursive: true, force: true });
}

console.log(`\n${provas} provas de que um teste pega a regra quebrada; ${problemas} problemas.`);
process.exit(problemas ? 1 : 0);
