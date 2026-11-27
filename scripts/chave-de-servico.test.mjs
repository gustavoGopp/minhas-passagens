import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { USOS_DA_CHAVE_DE_SERVICO } from "./chave-de-servico.mjs";

// P20: a chave de serviço do Supabase (ignora as regras de acesso) só é usada nos
// arquivos da lista curta. O lint recusa o import; este teste confere o resultado
// final, inclusive import dinâmico e caminho relativo, que o lint não pega.
const raiz = path.join(import.meta.dirname, "..");

function arquivos(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return arquivos(p);
    return /\.(ts|tsx|mjs|js)$/.test(nome) && !/\.test\./.test(nome) ? [p] : [];
  });
}

const USA_A_CHAVE = /supabase\/admin["']|createSupabaseAdminClient|SUPABASE_SERVICE_ROLE_KEY/;

describe("chave de serviço", () => {
  const usos = arquivos(path.join(raiz, "src"))
    .filter((p) => USA_A_CHAVE.test(readFileSync(p, "utf8")))
    .map((p) => path.relative(raiz, p).split(path.sep).join("/"))
    .filter((p) => p !== "src/lib/supabase/admin.ts" && p !== "src/lib/env.ts")
    .sort();

  it("só os arquivos da lista curta usam a chave de serviço", () => {
    const fora = usos.filter((p) => !(p in USOS_DA_CHAVE_DE_SERVICO));
    expect(fora, "uso novo da chave de serviço: veja scripts/chave-de-servico.mjs").toEqual([]);
  });

  it("a lista não tem sobra: cada arquivo dela existe e usa a chave", () => {
    const sobra = Object.keys(USOS_DA_CHAVE_DE_SERVICO).filter((p) => !usos.includes(p));
    expect(sobra).toEqual([]);
  });

  it("nenhuma ação de tela ('use server' em src/app) usa a chave de serviço", () => {
    const acoes = usos.filter((p) => p.startsWith("src/app/") && p.endsWith("actions.ts"));
    expect(acoes).toEqual([]);
  });
});
