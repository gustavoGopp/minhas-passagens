import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// Regras dos workflows que antes eram só texto (auditoria A1.1, A1.2 e A2.17).
// Se um workflow novo quebrar uma delas, este teste falha antes do merge.

const dir = path.join(import.meta.dirname, "..", ".github", "workflows");
const workflows = readdirSync(dir)
  .filter((f) => f.endsWith(".yml"))
  .map((f) => {
    const texto = readFileSync(path.join(dir, f), "utf8");
    return { arquivo: f, texto, yaml: parse(texto) };
  });

const SEGREDOS_DE_PRODUCAO = ["SUPABASE_ACCESS_TOKEN", "BACKUP_PASSPHRASE", "TELEGRAM_BOT_TOKEN"];
const AMBIENTES = ["producao-rotina", "producao-risco"];
// Tudo o que grava em produção fora do fluxo normal espera a aprovação do dono.
const SO_COM_APROVACAO = ["supabase-restore.yml", "supabase-setup-jobs.yml", "supabase-auth.yml"];

describe("workflows do GitHub", () => {
  it("existe pelo menos a CI e os workflows do Supabase", () => {
    expect(workflows.length).toBeGreaterThanOrEqual(6);
  });

  it("todo job que usa credencial de produção roda num ambiente restrito à main", () => {
    const semAmbiente = [];
    for (const w of workflows) {
      for (const [nome, job] of Object.entries(w.yaml.jobs)) {
        const usaSegredo = SEGREDOS_DE_PRODUCAO.some((s) =>
          JSON.stringify(job).includes(`secrets.${s}`),
        );
        if (usaSegredo && !AMBIENTES.includes(job.environment)) {
          semAmbiente.push(`${w.arquivo}: ${nome}`);
        }
      }
    }
    expect(semAmbiente).toEqual([]);
  });

  it("restauração, agendador e ajustes de login esperam a aprovação do dono", () => {
    for (const arquivo of SO_COM_APROVACAO) {
      const w = workflows.find((x) => x.arquivo === arquivo);
      expect(w, `${arquivo} deveria existir`).toBeTruthy();
      for (const job of Object.values(w.yaml.jobs)) {
        expect(job.environment, arquivo).toBe("producao-risco");
      }
    }
  });

  it("o diagnóstico não altera a configuração de login", () => {
    const w = workflows.find((x) => x.arquivo === "supabase-diagnostico.yml");
    expect(w.texto).not.toMatch(/supabase-auth-(urls|signup)\.mjs/);
  });

  it("todo workflow declara as permissões do token do GitHub", () => {
    const semPermissao = workflows.filter((w) => !w.yaml.permissions).map((w) => w.arquivo);
    expect(semPermissao).toEqual([]);
  });

  it("a CI tem um job final 'gate' que sempre roda e depende de todos os outros", () => {
    const ci = workflows.find((x) => x.arquivo === "ci.yml").yaml;
    const outros = Object.keys(ci.jobs).filter((j) => j !== "gate");
    expect(ci.jobs.gate, "falta o job gate").toBeTruthy();
    expect(String(ci.jobs.gate.if)).toContain("always()");
    expect([ci.jobs.gate.needs].flat().sort()).toEqual(outros.sort());
  });
});
