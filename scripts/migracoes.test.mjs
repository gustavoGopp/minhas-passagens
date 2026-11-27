import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// O Supabase deixou de conceder acesso automático a tabelas novas. A migração
// 20261127010000 concede para as tabelas que existiam; daqui em diante, toda
// migração que cria tabela precisa trazer o próprio GRANT (pesquisa 17.1).
const dir = path.join(import.meta.dirname, "..", "supabase", "migrations");
const migracoes = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ arquivo: f, sql: readFileSync(path.join(dir, f), "utf8").toLowerCase() }));

describe("migrações", () => {
  it("os nomes começam com data e hora e não se repetem", () => {
    const prefixos = migracoes.map((m) => m.arquivo.slice(0, 14));
    for (const p of prefixos) expect(p).toMatch(/^\d{14}$/);
    expect(new Set(prefixos).size).toBe(prefixos.length);
  });

  it("migração nova que cria tabela concede o acesso de forma explícita", () => {
    const semGrant = migracoes
      .filter((m) => m.arquivo > "20261127010000")
      .filter((m) => /create table/.test(m.sql) && !/\bgrant\b/.test(m.sql))
      .map((m) => m.arquivo);
    expect(semGrant).toEqual([]);
  });
});
