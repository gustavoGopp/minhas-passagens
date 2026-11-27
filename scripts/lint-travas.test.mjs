import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// As duas travas de lint da etapa 2b, provadas com exemplos: o que deve ser
// recusado é recusado; o jeito certo passa.
const eslint = new ESLint({ cwd: new URL("..", import.meta.url).pathname });

async function regras(codigo, arquivo) {
  const [r] = await eslint.lintText(codigo, { filePath: arquivo });
  return r.messages.map((m) => m.ruleId);
}

describe("trava: chave de serviço só na lista curta (P20)", () => {
  const importa =
    'import { createSupabaseAdminClient } from "@/lib/supabase/admin";\nexport const x = createSupabaseAdminClient;\n';

  it("recusa o import numa ação de tela", async () => {
    expect(await regras(importa, "src/app/(app)/app/qualquer/actions.ts")).toContain(
      "no-restricted-imports",
    );
  });

  it("recusa o import por caminho relativo", async () => {
    const relativo = importa.replace("@/lib/supabase/admin", "../../lib/supabase/admin");
    expect(await regras(relativo, "src/app/api/qualquer/route.ts")).toContain(
      "no-restricted-imports",
    );
  });

  it("aceita num arquivo da lista curta", async () => {
    expect(await regras(importa, "src/lib/jobs/tick.ts")).not.toContain("no-restricted-imports");
  });
});

describe("trava: gravação no banco com o erro ignorado (P23)", () => {
  const arquivo = "src/lib/qualquer/repo.ts";
  const recusados = {
    "await solto": `export async function f(db: any) { await db.from("t").update({ a: 1 }).eq("id", 1); }`,
    "sem await": `export function f(db: any) { db.from("t").insert({ a: 1 }); }`,
    "lê só data": `export async function f(db: any) { const { data } = await db.from("t").delete().eq("id", 1); return data; }`,
    upsert: `export async function f(db: any) { await db.from("t").upsert({ a: 1 }); }`,
  };
  for (const [caso, codigo] of Object.entries(recusados)) {
    it(`recusa: ${caso}`, async () => {
      expect(await regras(codigo, arquivo)).toContain("no-restricted-syntax");
    });
  }

  const aceitos = {
    "exigir(await …)": `import { exigir } from "@/lib/supabase/exigir";\nexport async function f(db: any) { exigir(await db.from("t").update({ a: 1 }).eq("id", 1), "x"); }`,
    "lê error": `export async function f(db: any) { const { error } = await db.from("t").insert({ a: 1 }); if (error) throw error; }`,
    "guarda o resultado": `export async function f(db: any) { const r = await db.from("t").delete().eq("id", 1); return r.error; }`,
    "coluna chamada error no insert continua exigindo leitura": `export async function f(db: any) { const { error } = await db.from("t").insert({ error: "x" }); return error; }`,
    "leitura (select) não é gravação": `export async function f(db: any) { await db.from("t").select("id"); }`,
  };
  for (const [caso, codigo] of Object.entries(aceitos)) {
    it(`aceita: ${caso}`, async () => {
      expect(await regras(codigo, arquivo)).not.toContain("no-restricted-syntax");
    });
  }
});
