#!/usr/bin/env node
// Sonda com a chave pública (pesquisa 7.2): faz pela API o que qualquer pessoa na
// internet consegue fazer com a chave que vai no navegador. Para cada tabela do
// banco, tenta ler, criar, alterar e apagar sem login. Falha se alguma leitura
// devolver linha ou se alguma gravação não for recusada pela proteção de acesso.
// Imprime só nomes de tabela e contagens, nunca dados.
//
// Uso: API_URL, ANON_KEY e DB_URL (para listar as tabelas) do Supabase local.
// Com --como-producao, antes concede tudo ao visitante, como o padrão antigo do
// Supabase fazia em produção: quem barra tem de ser a regra por linha.
import pg from "pg";

const { API_URL, ANON_KEY, DB_URL } = process.env;
if (!API_URL || !ANON_KEY || !DB_URL) {
  console.error("Faltam API_URL, ANON_KEY ou DB_URL (veja supabase status -o env).");
  process.exit(2);
}
if (!/127\.0\.0\.1|localhost/.test(DB_URL) || !/127\.0\.0\.1|localhost/.test(API_URL)) {
  console.error("A sonda deste script só roda contra o Supabase local.");
  process.exit(2);
}

const comoProducao = process.argv.includes("--como-producao");
const db = new pg.Pool({ connectionString: DB_URL, max: 1 });
const cabecalhos = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

/** Recusa pela proteção: 401/403, ou o código 42501 do Postgres. */
async function recusado(resp) {
  if (resp.status === 401 || resp.status === 403) return true;
  const corpo = await resp.json().catch(() => ({}));
  return corpo?.code === "42501";
}

let problemas = 0;
try {
  const { rows } = await db.query(
    `select c.relname as nome from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm') order by 1`,
  );
  const tabelas = rows.map((r) => r.nome);
  if (comoProducao) {
    await db.query("grant select, insert, update, delete on all tables in schema public to anon");
  }
  for (const nome of tabelas) {
    const url = `${API_URL}/rest/v1/${nome}`;
    const falhas = [];

    const leitura = await fetch(`${url}?select=*&limit=50`, { headers: cabecalhos });
    if (leitura.ok) {
      const linhas = await leitura.json();
      if (Array.isArray(linhas) && linhas.length) falhas.push(`leu ${linhas.length} linha(s)`);
    }

    const criar = await fetch(url, { method: "POST", headers: cabecalhos, body: "{}" });
    if (criar.ok || !(await recusado(criar))) falhas.push(`criar respondeu ${criar.status}`);

    // Alterar e apagar sem filtro: com proteção, nenhuma linha é afetada.
    const alterar = await fetch(`${url}?select=*`, {
      method: "PATCH",
      headers: cabecalhos,
      body: "{}",
    });
    if (alterar.ok) {
      const linhas = await alterar.json().catch(() => []);
      if (Array.isArray(linhas) && linhas.length) falhas.push(`alterou ${linhas.length} linha(s)`);
    }
    const apagar = await fetch(`${url}?select=*`, { method: "DELETE", headers: cabecalhos });
    if (apagar.ok) {
      const linhas = await apagar.json().catch(() => []);
      if (Array.isArray(linhas) && linhas.length) falhas.push(`apagou ${linhas.length} linha(s)`);
    }

    if (falhas.length) {
      problemas++;
      console.log(`ABERTA   ${nome}: ${falhas.join("; ")}`);
    } else {
      console.log(`fechada  ${nome}`);
    }
  }
  console.log(
    `\n${tabelas.length} tabelas sondadas com a chave pública${comoProducao ? " (concessões como em produção)" : ""}; ${problemas} abertas.`,
  );
} finally {
  if (comoProducao) {
    await db.query("revoke all on all tables in schema public from anon");
  }
  await db.end();
}
process.exit(problemas ? 1 : 0);
