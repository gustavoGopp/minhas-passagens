// Restaura um backup já decifrado (diretório com manifest.json).
// Uso: node scripts/supabase-restore.mjs <diretório> [--simular] [--tabelas=a,b]
// --simular roda cada lote dentro de begin/rollback: valida tudo sem gravar nada.
// Em conflito de chave primária, a versão do backup sobrescreve; nada é apagado.
// Só imprime nomes de tabela e contagens.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { restoreSql, safeError, tableInfo } from "./supabase-backup-lib.mjs";
import { query } from "./supabase-api.mjs";

const BATCH = 500;
const dir = process.argv[2];
const simulate = process.argv.includes("--simular");
const only = process.argv
  .find((a) => a.startsWith("--tabelas="))
  ?.slice(10)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (!dir) throw new Error("Informe o diretório do backup decifrado.");

const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
console.log(`Backup de ${manifest.created_at}${simulate ? " (simulação, nada é gravado)" : ""}`);

let failures = 0;
for (const t of manifest.tables) {
  const label = `${t.schema}.${t.name}`;
  if (only?.length && !only.includes(t.name) && !only.includes(label)) continue;
  const rows = JSON.parse(readFileSync(path.join(dir, t.file), "utf8"));
  if (!rows.length) {
    console.log(`${label}: vazio`);
    continue;
  }
  try {
    const info = await tableInfo(t.schema, t.name);
    if (!info.columns.length) throw new Error("tabela não existe neste banco");
    for (let i = 0; i < rows.length; i += BATCH) {
      const sql = restoreSql(
        { schema: t.schema, name: t.name, ...info },
        rows.slice(i, i + BATCH),
        `r${randomBytes(6).toString("hex")}`,
      );
      await query(simulate ? `begin;\n${sql}\nrollback;` : sql);
    }
    console.log(`${label}: ${rows.length} linhas ${simulate ? "validadas" : "restauradas"}`);
  } catch (e) {
    failures++;
    console.error(`${label}: falhou: ${safeError(e)}`);
  }
}
if (failures) {
  console.error(`${failures} tabela(s) com falha.`);
  process.exit(1);
}
console.log(simulate ? "Simulação concluída sem erros." : "Restauração concluída.");
