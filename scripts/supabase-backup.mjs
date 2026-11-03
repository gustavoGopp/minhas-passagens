// Exporta o banco para JSON (uma tabela por arquivo) num diretório local.
// Uso: node scripts/supabase-backup.mjs <diretório>
// O workflow cifra o diretório antes de virar artefato. Só imprime nomes de tabela e contagens.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { listTables, qualified, safeError, tableInfo } from "./supabase-backup-lib.mjs";
import { query } from "./supabase-api.mjs";

const PAGE = 2000;
const out = process.argv[2];
if (!out) throw new Error("Informe o diretório de saída.");
mkdirSync(out, { recursive: true });

try {
  const tables = await listTables();
  const manifest = { created_at: new Date().toISOString(), format: 1, tables: [] };
  for (const t of tables) {
    const { pk } = await tableInfo(t.schema, t.name);
    const order = pk.length ? pk.map((c) => `"${c}"`).join(", ") : "ctid";
    const rows = [];
    for (let offset = 0; ; offset += PAGE) {
      const [{ rows: page }] = await query(
        `select coalesce(json_agg(x), '[]'::json) as rows from (
           select * from ${qualified(t.schema, t.name)} order by ${order} limit ${PAGE} offset ${offset}
         ) x`,
      );
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    const file = `${t.schema}.${t.name}.json`;
    writeFileSync(path.join(out, file), JSON.stringify(rows));
    manifest.tables.push({ schema: t.schema, name: t.name, file, rows: rows.length });
    console.log(`${t.schema}.${t.name}: ${rows.length} linhas`);
  }
  writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Backup com ${manifest.tables.length} tabelas.`);
} catch (e) {
  console.error(`Falha no backup: ${safeError(e)}`);
  process.exit(1);
}
