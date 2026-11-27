import { describe, expect, it } from "vitest";
import { decidir, ETIQUETA } from "./aprovacao-lib.mjs";

// Regra da checagem "Aprovação do dono" (P16, pesquisa 14.3 e 14.4): cenários de
// aceitação, gabaritos e regras de acesso aprovadas só mudam com a etiqueta do dono.
// Um push novo que mexa neles derruba a etiqueta. Teste comum alterado vira aviso.

const arq = (filename, extra = {}) => ({ filename, status: "modified", ...extra });

describe("aprovação do dono", () => {
  it("PR sem arquivo protegido passa, com ou sem etiqueta", () => {
    for (const etiquetas of [[], [ETIQUETA]]) {
      const r = decidir({ arquivos: [arq("src/app/page.tsx")], etiquetas, evento: "opened" });
      expect(r.ok).toBe(true);
      expect(r.removerEtiqueta).toBe(false);
    }
  });

  it.each([
    "tests/aceitacao/cenarios.md",
    "tests/gabaritos/gmail/1.json",
    "docs/regras-de-acesso.md",
    "tests/banco/tabelas.ts",
    "scripts/aprovacao-lib.mjs",
    "scripts/aprovacao.mjs",
    "scripts/cenarios.test.mjs",
    ".github/workflows/aprovacao.yml",
    ".claude/hooks/etiqueta-do-dono.mjs",
  ])("mexer em %s sem a etiqueta reprova", (f) => {
    const r = decidir({ arquivos: [arq(f)], etiquetas: [], evento: "opened" });
    expect(r.ok).toBe(false);
    expect(r.protegidos).toEqual([f]);
  });

  it("apagar ou renomear um arquivo protegido também conta", () => {
    const r = decidir({
      arquivos: [
        arq("tests/outro/cenarios.md", {
          status: "renamed",
          previous_filename: "tests/aceitacao/cenarios.md",
        }),
      ],
      etiquetas: [],
      evento: "opened",
    });
    expect(r.ok).toBe(false);
    expect(r.protegidos).toEqual(["tests/aceitacao/cenarios.md"]);
  });

  it("com a etiqueta do dono, passa", () => {
    const r = decidir({
      arquivos: [arq("tests/aceitacao/cenarios.md")],
      etiquetas: [ETIQUETA],
      evento: "labeled",
    });
    expect(r.ok).toBe(true);
    expect(r.removerEtiqueta).toBe(false);
  });

  it("push novo num PR com arquivo protegido derruba a etiqueta e reprova", () => {
    const r = decidir({
      arquivos: [arq("tests/aceitacao/cenarios.md")],
      etiquetas: [ETIQUETA],
      evento: "synchronize",
    });
    expect(r.ok).toBe(false);
    expect(r.removerEtiqueta).toBe(true);
  });

  it("parecido não é protegido: só os caminhos exatos", () => {
    const r = decidir({
      arquivos: [arq("tests/aceitacao-velha/x.md"), arq("docs/regras-de-acesso.md.bak")],
      etiquetas: [],
      evento: "opened",
    });
    expect(r.ok).toBe(true);
  });

  it("teste comum alterado não reprova, mas aparece como aviso", () => {
    const r = decidir({
      arquivos: [
        arq("tests/e2e/cenarios.spec.ts"),
        arq("src/lib/trips/money.test.ts"),
        arq("scripts/hooks.test.mjs", { status: "removed" }),
        arq("src/app/page.tsx"),
      ],
      etiquetas: [],
      evento: "opened",
    });
    expect(r.ok).toBe(true);
    expect(r.testesAlterados).toEqual([
      "tests/e2e/cenarios.spec.ts (modified)",
      "src/lib/trips/money.test.ts (modified)",
      "scripts/hooks.test.mjs (removed)",
    ]);
  });
});
