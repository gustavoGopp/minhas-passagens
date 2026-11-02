// Aplica em ordem as migrações de supabase/migrations ainda não registradas em
// public.app_migrations. As migrações do projeto são idempotentes.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { query } from "./supabase-api.mjs";

const dir = path.join(import.meta.dirname, "..", "supabase", "migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

await query(`create table if not exists public.app_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table public.app_migrations enable row level security;`);

const applied = new Set((await query("select name from public.app_migrations")).map((r) => r.name));
let count = 0;
for (const f of files) {
  if (applied.has(f)) continue;
  console.log(`Aplicando ${f}...`);
  await query(readFileSync(path.join(dir, f), "utf8"));
  await query(`insert into public.app_migrations (name) values ('${f.replace(/'/g, "''")}')`);
  count++;
}
console.log(count ? `${count} migração(ões) aplicada(s).` : "Nada a aplicar: banco em dia.");
