import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A documentação que orienta o agente tem teto. No projeto anterior do dono, o
// arquivo de instruções passou de 1.752 para 15.498 palavras sem ninguém notar.
const raiz = path.join(import.meta.dirname, "..");
const ler = (p) => readFileSync(path.join(raiz, p), "utf8");
const linhas = (p) => ler(p).trimEnd().split("\n").length;

export const TETO_ESTADO = 60;
export const TETO_CLAUDE = 100;

describe("documentos que o agente lê", () => {
  it(`docs/ESTADO.md cabe numa tela (até ${TETO_ESTADO} linhas)`, () => {
    expect(linhas("docs/ESTADO.md")).toBeLessThanOrEqual(TETO_ESTADO);
  });

  it(`CLAUDE.md é curto (até ${TETO_CLAUDE} linhas) e importa o AGENTS.md`, () => {
    expect(linhas("CLAUDE.md")).toBeLessThanOrEqual(TETO_CLAUDE);
    expect(ler("CLAUDE.md").startsWith("@AGENTS.md\n")).toBe(true);
  });

  it("todo caminho citado no CLAUDE.md e no ESTADO.md existe", () => {
    const faltando = [];
    for (const doc of ["CLAUDE.md", "docs/ESTADO.md"]) {
      for (const [, trecho] of ler(doc).matchAll(/`([^`\n]+)`/g)) {
        const caminho = trecho.replace(/\/$/, "");
        const pareceCaminho =
          /^([\w.-]+\/)+[\w.-]*$/.test(trecho) || /^[\w.-]+\.(md|mjs|ts|json|yml)$/.test(trecho);
        if (!pareceCaminho || caminho.startsWith("node_modules")) continue;
        const candidatos = [caminho, path.join("docs", caminho)];
        if (!candidatos.some((c) => existsSync(path.join(raiz, c))))
          faltando.push(`${doc}: ${trecho}`);
      }
    }
    expect(faltando).toEqual([]);
  });
});

describe("skills e travas", () => {
  const pasta = path.join(raiz, ".claude", "skills");

  it("cada skill tem nome igual ao da pasta e uma descrição de quando usar", () => {
    const skills = readdirSync(pasta);
    expect(skills.length).toBeGreaterThanOrEqual(3);
    for (const s of skills) {
      const texto = readFileSync(path.join(pasta, s, "SKILL.md"), "utf8");
      const cabecalho = /^---\n([\s\S]*?)\n---\n/.exec(texto)?.[1] ?? "";
      expect(cabecalho, s).toContain(`name: ${s}`);
      expect(/description: .{40,}/.test(cabecalho), `${s}: descrição curta demais`).toBe(true);
    }
  });

  it("todo hook citado no settings.json existe", () => {
    const settings = JSON.parse(ler(".claude/settings.json"));
    const comandos = Object.values(settings.hooks)
      .flat()
      .flatMap((g) => g.hooks.map((h) => h.command));
    expect(comandos.length).toBeGreaterThanOrEqual(5);
    for (const c of comandos) {
      const arquivo = /\.claude\/hooks\/[\w.-]+/.exec(c)?.[0];
      expect(arquivo, c).toBeTruthy();
      expect(existsSync(path.join(raiz, arquivo)), arquivo).toBe(true);
    }
  });

  it("a versão fixada do npm é a mesma na CI, no agendador e no início de sessão", () => {
    const versoes = [
      ".github/workflows/ci.yml",
      ".github/workflows/supabase-setup-jobs.yml",
      ".claude/hooks/instalar-pacotes.sh",
    ].map((f) => /npm@(\d+\.\d+\.\d+)/.exec(ler(f))?.[1]);
    expect(new Set(versoes).size).toBe(1);
    expect(versoes[0]).toBeTruthy();
  });
});
