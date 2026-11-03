import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_EXPORT_TABLES, EXTRA_EXPORT_COLUMNS } from "./export-tables";

const dir = path.join(import.meta.dirname, "..", "..", "..", "supabase", "migrations");

/** Tabelas criadas nas migrações que pertencem a um usuário (user_id ou id → auth.users). */
function userTables(): string[] {
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
  const out: string[] = [];
  for (const m of sql.matchAll(/create table if not exists public\.(\w+) \(([\s\S]*?)\n\);/g)) {
    if (/references auth\.users/.test(m[2])) out.push(m[1]);
  }
  return out;
}

describe("exportação de dados", () => {
  it("cobre todas as tabelas do usuário criadas nas migrações", () => {
    const exported = new Set<string>([...CORE_EXPORT_TABLES, ...Object.keys(EXTRA_EXPORT_COLUMNS)]);
    const tables = userTables();
    expect(tables.length).toBeGreaterThanOrEqual(13);
    expect(tables.filter((t) => !exported.has(t))).toEqual([]);
  });

  it("não exporta segredos do push nem o token do Telegram", () => {
    expect(EXTRA_EXPORT_COLUMNS.push_subscriptions).not.toMatch(/endpoint|p256dh|auth/);
    expect(EXTRA_EXPORT_COLUMNS.telegram_links).not.toMatch(/link_token/);
  });
});
