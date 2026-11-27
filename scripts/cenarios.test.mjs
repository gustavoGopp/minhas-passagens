import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Ligação entre os cenários aprovados pelo dono (tests/aceitacao/cenarios.md) e os
// testes que os provam (pesquisa 14.11). Cada cenário precisa de pelo menos um
// teste cujo título comece com "C<n> — <título do cenário>", igual ao arquivo.
// Um cenário sem teste, ou um teste com código que não existe, reprova.

const raiz = path.join(import.meta.dirname, "..");
const texto = readFileSync(path.join(raiz, "tests", "aceitacao", "cenarios.md"), "utf8");
const cenarios = [...texto.matchAll(/^## (C\d+) — (.+)$/gm)].map((m) => ({
  codigo: m[1],
  titulo: m[2].trim(),
}));

function arquivos(pasta) {
  const cheio = path.join(raiz, pasta);
  return readdirSync(cheio).flatMap((f) => {
    const p = path.join(cheio, f);
    if (statSync(p).isDirectory()) return arquivos(path.join(pasta, f));
    return /\.(test|spec)\.ts$/.test(f) ? [p] : [];
  });
}

const titulos = [...arquivos("tests/e2e"), ...arquivos("tests/integracao")].flatMap((f) =>
  [
    ...readFileSync(f, "utf8").matchAll(/(?:test|it|describe)\(\s*["'`](C\d+) — ([^"'`]+)["'`]/g),
  ].map((m) => ({ arquivo: path.relative(raiz, f), codigo: m[1], titulo: m[2].trim() })),
);

describe("cenários de aceitação", () => {
  it("o arquivo tem os cenários numerados em ordem", () => {
    expect(cenarios.length).toBeGreaterThanOrEqual(5);
    expect(cenarios.map((c) => c.codigo)).toEqual(cenarios.map((_, i) => `C${i + 1}`));
  });

  it("cada cenário tem um teste com o mesmo código e o mesmo título", () => {
    const semTeste = cenarios
      .filter((c) => !titulos.some((t) => t.codigo === c.codigo && t.titulo === c.titulo))
      .map((c) => `${c.codigo} — ${c.titulo}`);
    expect(semTeste).toEqual([]);
  });

  it("nenhum teste cita um cenário que não existe ou com título diferente", () => {
    const soltos = titulos
      .filter((t) => !cenarios.some((c) => c.codigo === t.codigo && c.titulo === t.titulo))
      .map((t) => `${t.arquivo}: ${t.codigo} — ${t.titulo}`);
    expect(soltos).toEqual([]);
  });
});
