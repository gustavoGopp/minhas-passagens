#!/usr/bin/env node
// Checagem "Aprovação do dono", chamada por .github/workflows/aprovacao.yml.
// Lê a lista de arquivos e as etiquetas do PR pela API do GitHub (gh) e aplica a
// regra de aprovacao-lib.mjs. Nunca baixa nem executa o código do PR.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { decidir, ETIQUETA } from "./aprovacao-lib.mjs";

const { REPO, PR, EVENTO, GITHUB_STEP_SUMMARY } = process.env;
if (!REPO || !/^\d+$/.test(PR ?? "")) {
  console.error("Faltam REPO e PR.");
  process.exit(2);
}

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" });
const arquivos = JSON.parse(gh("api", "--paginate", "--slurp", `repos/${REPO}/pulls/${PR}/files`))
  .flat()
  .map((a) => ({ filename: a.filename, status: a.status, previous_filename: a.previous_filename }));
const etiquetas = JSON.parse(gh("api", `repos/${REPO}/issues/${PR}/labels`)).map((l) => l.name);

const r = decidir({ arquivos, etiquetas, evento: EVENTO });
if (r.removerEtiqueta) {
  gh("api", "-X", "DELETE", `repos/${REPO}/issues/${PR}/labels/${ETIQUETA}`);
}

const linhas = [`## Aprovação do dono`, "", r.mensagem];
if (r.protegidos.length)
  linhas.push("", "Arquivos protegidos alterados:", ...r.protegidos.map((f) => `- ${f}`));
if (r.testesAlterados.length) {
  linhas.push("", "Aviso: testes alterados neste PR (conferir se nenhum foi enfraquecido):");
  linhas.push(...r.testesAlterados.map((f) => `- ${f}`));
  for (const f of r.testesAlterados) console.log(`::warning::Teste alterado: ${f}`);
}
console.log(linhas.join("\n"));
if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `${linhas.join("\n")}\n`);
if (!r.ok) {
  console.log(`::error::${r.mensagem}`);
  process.exit(1);
}
