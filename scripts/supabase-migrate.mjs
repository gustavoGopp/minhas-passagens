// Aplica em ordem as migrações de supabase/migrations ainda não registradas em
// public.app_migrations. Cada migração e o seu registro rodam numa transação só
// (scripts/migracoes-lib.mjs). Roda no workflow "Supabase — migrações e publicação",
// depois da CI verde na main e do clique do dono (ambiente producao-risco).
//
// --pendentes: só lista o que falta, sem gravar (consulta somente leitura), e
// escreve a contagem em GITHUB_OUTPUT ("quantas=N") para o workflow decidir se
// precisa da aprovação.
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { aplicarPendentes, listarPendentes } from "./migracoes-lib.mjs";
import { query, queryReadOnly } from "./supabase-api.mjs";

const dir = path.join(import.meta.dirname, "..", "supabase", "migrations");
const arquivos = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((nome) => ({ nome, sql: readFileSync(path.join(dir, nome), "utf8") }));

if (process.argv.includes("--pendentes")) {
  const pendentes = await listarPendentes({ executar: queryReadOnly, arquivos });
  console.log(
    pendentes.length
      ? `${pendentes.length} migração(ões) a aplicar:\n${pendentes.join("\n")}`
      : "Nenhuma migração a aplicar: banco em dia.",
  );
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `quantas=${pendentes.length}\n`);
} else {
  const n = await aplicarPendentes({ executar: query, arquivos });
  console.log(n ? `${n} migração(ões) aplicada(s).` : "Nada a aplicar: banco em dia.");
}
