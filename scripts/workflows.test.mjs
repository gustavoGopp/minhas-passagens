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

// Os segredos de produção têm nomes que só existem nos ambientes do GitHub
// (PROD_...). Assim, sem o ambiente configurado o job falha em vez de rodar
// com um segredo geral do repositório, e nenhum branch consegue lê-los.
const SEGREDOS_DE_PRODUCAO = [
  "PROD_SUPABASE_ACCESS_TOKEN",
  "PROD_BACKUP_PASSPHRASE",
  "PROD_TELEGRAM_BOT_TOKEN",
];
const SEGREDOS_GERAIS_ANTIGOS = [
  "SUPABASE_ACCESS_TOKEN",
  "BACKUP_PASSPHRASE",
  "TELEGRAM_BOT_TOKEN",
];
const AMBIENTES = ["producao-rotina", "producao-risco"];
// Tudo o que grava em produção fora do fluxo normal espera a aprovação do dono.
const SO_COM_APROVACAO = ["supabase-restore.yml", "supabase-setup-jobs.yml", "supabase-auth.yml"];

describe("workflows do GitHub", () => {
  it("existe pelo menos a CI e os workflows do Supabase", () => {
    expect(workflows.length).toBeGreaterThanOrEqual(6);
  });

  it("nenhum workflow lê os segredos gerais antigos do repositório", () => {
    const usos = [];
    for (const w of workflows) {
      for (const s of SEGREDOS_GERAIS_ANTIGOS) {
        if (new RegExp(`secrets\\.${s}\\b`).test(w.texto)) usos.push(`${w.arquivo}: ${s}`);
      }
    }
    expect(usos).toEqual([]);
  });

  it("todo job que usa credencial de produção declara um dos dois ambientes", () => {
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

  it("toda ação de terceiros é fixada por SHA, não por etiqueta que pode mudar", () => {
    const soltas = [];
    for (const w of workflows) {
      for (const m of w.texto.matchAll(/uses:\s*([^\s#]+)/g)) {
        if (!/@[0-9a-f]{40}$/.test(m[1])) soltas.push(`${w.arquivo}: ${m[1]}`);
      }
    }
    expect(soltas).toEqual([]);
  });

  it("a CI roda o banco de teste e os testes de ponta a ponta, sem credencial de produção", () => {
    const ci = workflows.find((x) => x.arquivo === "ci.yml");
    expect(Object.keys(ci.yaml.jobs)).toEqual(
      expect.arrayContaining(["verify", "banco", "ponta-a-ponta", "gate"]),
    );
    expect(ci.texto).not.toMatch(/secrets\.PROD_/);
    for (const [nome, job] of Object.entries(ci.yaml.jobs)) {
      expect(job.environment, `ci.yml: ${nome}`).toBeUndefined();
    }
  });

  it("o job do banco reaplica as migrações, prova as regras quebrando-as e sonda com a chave pública", () => {
    const passos = JSON.stringify(workflows.find((x) => x.arquivo === "ci.yml").yaml.jobs.banco);
    for (const script of [
      "reaplicar-migracoes.mjs",
      "quebrar-regras.mjs",
      "sonda-chave-publica.mjs --como-producao",
      "test:banco",
    ]) {
      expect(passos).toContain(script);
    }
  });

  it("a CI tem um job final 'gate' que sempre roda e depende de todos os outros", () => {
    const ci = workflows.find((x) => x.arquivo === "ci.yml").yaml;
    const outros = Object.keys(ci.jobs).filter((j) => j !== "gate");
    expect(ci.jobs.gate, "falta o job gate").toBeTruthy();
    expect(String(ci.jobs.gate.if)).toContain("always()");
    expect([ci.jobs.gate.needs].flat().sort()).toEqual(outros.sort());
  });
});
