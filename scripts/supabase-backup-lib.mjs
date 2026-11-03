// Funções comuns ao backup e à restauração do banco (via Management API).
// ATENÇÃO: logs públicos. Nada aqui imprime linhas do banco; erros passam por safeError().
import { query } from "./supabase-api.mjs";

/** Tabelas copiadas: todo o schema public + usuários e identidades do Auth. */
export const AUTH_TABLES = ["users", "identities"];

export const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
export const qualified = (schema, table) => `${ident(schema)}.${ident(table)}`;

/** Mensagem de erro sem valores (DETAIL, trecho da SQL, e-mails), para log público. */
export function safeError(e) {
  return String(e?.message ?? e)
    .replace(/DETAIL[\s\S]*/i, "")
    .replace(/LINE \d+:[\s\S]*/i, "")
    .replace(/\(([^)]*)\)=\(([^)]*)\)/g, "(…)=(…)")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<e-mail>")
    .slice(0, 300)
    .trim();
}

/** Tabelas a copiar, na ordem de restauração (pais antes dos filhos). */
export async function listTables() {
  const rows = await query(`
    select table_schema as schema, table_name as name
    from information_schema.tables
    where table_type = 'BASE TABLE'
      and (table_schema = 'public'
        or (table_schema = 'auth' and table_name in (${AUTH_TABLES.map((t) => `'${t}'`).join(", ")})))
    order by 1, 2`);
  const fks = await query(`
    select ch.relname as child, pa.relname as parent
    from pg_constraint c
    join pg_class ch on ch.oid = c.conrelid
    join pg_class pa on pa.oid = c.confrelid
    join pg_namespace n on n.oid = ch.relnamespace
    join pg_namespace pn on pn.oid = pa.relnamespace
    where c.contype = 'f' and n.nspname = 'public' and pn.nspname = 'public'`);
  return orderTables(rows, fks);
}

/** Ordenação topológica: auth primeiro, depois public com pais antes dos filhos. */
export function orderTables(tables, fks) {
  const auth = tables
    .filter((t) => t.schema === "auth")
    .sort((a, b) => AUTH_TABLES.indexOf(a.name) - AUTH_TABLES.indexOf(b.name));
  const pub = tables.filter((t) => t.schema === "public").map((t) => t.name);
  const parents = new Map(pub.map((n) => [n, new Set()]));
  for (const { child, parent } of fks) {
    if (child !== parent && parents.has(child) && parents.has(parent))
      parents.get(child).add(parent);
  }
  const done = [];
  const seen = new Set();
  const visit = (n, path = new Set()) => {
    if (seen.has(n) || path.has(n)) return;
    path.add(n);
    for (const p of parents.get(n)) visit(p, path);
    seen.add(n);
    done.push(n);
  };
  for (const n of [...pub].sort()) visit(n);
  return [...auth, ...done.map((name) => ({ schema: "public", name }))];
}

/** Colunas graváveis (sem colunas geradas) e a chave primária da tabela. */
export async function tableInfo(schema, table) {
  const cols = await query(`
    select column_name as name from information_schema.columns
    where table_schema = '${schema}' and table_name = '${table}'
      and is_generated = 'NEVER' and coalesce(identity_generation, '') <> 'ALWAYS'
    order by ordinal_position`);
  const pk = await query(`
    select a.attname as name
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = '${qualified(schema, table)}'::regclass and i.indisprimary
    order by array_position(i.indkey, a.attnum)`);
  return { columns: cols.map((c) => c.name), pk: pk.map((c) => c.name) };
}

/**
 * SQL de restauração de um lote: insere as linhas do JSON e, em conflito na chave
 * primária, sobrescreve com a versão do backup (tabelas do Auth: só insere o que falta).
 * Linhas mais novas que o backup não são apagadas.
 */
export function restoreSql({ schema, name, columns, pk }, rows, tag) {
  const cols = columns.map(ident).join(", ");
  const json = JSON.stringify(rows);
  if (json.includes(`$${tag}$`)) throw new Error("marcador de texto colidiu; tente de novo");
  const updatable = columns.filter((c) => !pk.includes(c));
  const conflict =
    schema === "auth" || !pk.length
      ? "on conflict do nothing"
      : updatable.length
        ? `on conflict (${pk.map(ident).join(", ")}) do update set ${updatable
            .map((c) => `${ident(c)} = excluded.${ident(c)}`)
            .join(", ")}`
        : "on conflict do nothing";
  return `insert into ${qualified(schema, name)} (${cols})
select ${cols} from json_populate_recordset(null::${qualified(schema, name)}, $${tag}$${json}$${tag}$::json)
${conflict};`;
}
