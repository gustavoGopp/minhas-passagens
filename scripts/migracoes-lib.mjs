// Lógica do migrador de produção (scripts/supabase-migrate.mjs), separada para
// ser testada sem credencial: aqui com exemplos e em tests/banco/migrador.test.ts
// contra um Postgres de verdade.

/** Tabela de registro das migrações aplicadas (a mesma em produção e nos testes). */
export const DDL_APP_MIGRATIONS = `create table if not exists public.app_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table public.app_migrations enable row level security;`;

/**
 * A migração e o seu registro num envio só. Vários comandos num mesmo envio
 * (protocolo simples do Postgres) rodam como uma transação: se a migração falha
 * no meio, nada dela fica e o registro também não. Antes eram duas chamadas, e
 * uma queda entre elas deixava a migração aplicada sem registro (auditoria A1.4).
 * O ";" em linha própria fecha a migração mesmo que ela termine num comentário.
 */
export function sqlComRegistro(nome, sql) {
  return `${sql}\n;\ninsert into public.app_migrations (name) values ('${nome.replace(/'/g, "''")}');`;
}

/**
 * Aplica em ordem as migrações ainda não registradas. `executar(sql)` devolve as
 * linhas do último comando. Para na primeira falha; devolve quantas aplicou.
 */
export async function aplicarPendentes({ executar, arquivos, log = console.log }) {
  await executar(DDL_APP_MIGRATIONS);
  const aplicadas = new Set(
    (await executar("select name from public.app_migrations")).map((r) => r.name),
  );
  const pendentes = arquivos
    .filter((a) => !aplicadas.has(a.nome))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  for (const a of pendentes) {
    log(`Aplicando ${a.nome}...`);
    try {
      await executar(sqlComRegistro(a.nome, a.sql));
    } catch (e) {
      throw new Error(`${a.nome}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return pendentes.length;
}

/** Nomes das migrações ainda não registradas, em ordem. */
export async function listarPendentes({ executar, arquivos }) {
  const existe = await executar("select to_regclass('public.app_migrations') is not null as ok");
  if (!existe[0]?.ok) return arquivos.map((a) => a.nome).sort();
  const aplicadas = new Set(
    (await executar("select name from public.app_migrations")).map((r) => r.name),
  );
  return arquivos
    .map((a) => a.nome)
    .filter((n) => !aplicadas.has(n))
    .sort();
}

/** Tira comentários de linha e blocos do $$ … $$ (onde begin/end são do PL/pgSQL). */
function semComentariosNemBlocos(sql) {
  return sql
    .toLowerCase()
    .replace(/--[^\n]*/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "$$$$");
}

const MARCA_SEGUNDA_ENTREGA = /--\s*segunda entrega:/i;
const ESTRUTURA =
  /\b(create\s+(table|index|unique\s+index|type|function|or\s+replace\s+function|trigger|view)|alter\s+table|drop\s+(table|column|index|function|trigger|view|type))\b/;
const DADOS =
  /(^|;|\b(then|loop|begin))\s*(update\s+[\w."]+(\s+(as\s+)?\w+)?\s+set|delete\s+from|insert\s+into)\b/m;

/**
 * Regras para migração nova (P18). Devolve a lista de problemas, vazia se ok.
 * - Sem begin/commit/rollback nem índice "concurrently": o migrador já roda
 *   cada migração numa transação.
 * - Só acrescenta: apagar ou renomear coluna ou tabela é a segunda entrega de
 *   uma mudança em duas etapas e leva a marca "-- segunda entrega: <motivo>".
 * - Correção de dados vai num arquivo próprio, sem mudança de estrutura.
 */
export function problemasDaMigracaoNova(sql) {
  const problemas = [];
  const limpo = semComentariosNemBlocos(sql);
  if (/(^|;)\s*(begin|commit|rollback|start\s+transaction)\s*;/m.test(limpo))
    problemas.push("tem begin/commit/rollback: o migrador já roda cada migração numa transação");
  if (/\bconcurrently\b/.test(limpo))
    problemas.push('tem "concurrently", que não roda dentro de transação');
  const apaga =
    /\bdrop\s+(table|column)\b/.test(limpo) ||
    /\balter\s+table\s+[\w."]+\s+drop\s+(?!constraint|policy|default|not\s+null)/.test(limpo) ||
    /\brename\b/.test(limpo);
  if (apaga && !MARCA_SEGUNDA_ENTREGA.test(sql))
    problemas.push(
      'apaga ou renomeia coluna ou tabela: só como segunda entrega, com a marca "-- segunda entrega: <motivo>"',
    );
  // Dentro de blocos do $$ … $$ também conta: correção de dados costuma vir num bloco.
  const comBlocos = sql.toLowerCase().replace(/--[^\n]*/g, "");
  if (DADOS.test(comBlocos) && ESTRUTURA.test(comBlocos))
    problemas.push("mistura correção de dados com mudança de estrutura: separe em dois arquivos");
  return problemas;
}
