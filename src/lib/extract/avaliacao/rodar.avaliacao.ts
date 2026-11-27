import Anthropic from "@anthropic-ai/sdk";
import { appendFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { problemasDoGabarito } from "../../../../scripts/gabarito-lib.mjs";
import { custoDaChamada } from "@/lib/mail/cost";
import { MODELOS_PADRAO } from "../modelos";
import { conferirLimites, resumir, type CasoCorrigido } from "./corretor";
import { lerGabarito } from "./gabarito";
import type { Gravacao, Resultado } from "./rodada";

// Rodada de verdade (P24). Roda só no workflow avaliacao-extracao.yml, depois do
// clique do dono, com a chave ANTHROPIC_API_KEY_AVALIACAO. Grava as respostas
// (para a CI repetir sem chave) e o resultado com a impressão digital.
// Nada aqui imprime o texto dos e-mails: só ids, campos e números.

vi.mock("server-only", () => ({}));
const { avaliarCaso, clienteQueGrava, impressaoDigital } = await import("./rodada");

export const PASTA_RODADA = "tests/avaliacao-extracao";

const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;

it("rodada de verdade da avaliação da extração", async () => {
  const chave = process.env.ANTHROPIC_API_KEY_AVALIACAO;
  if (!chave) throw new Error("Falta ANTHROPIC_API_KEY_AVALIACAO (ambiente avaliacao-ia).");
  const gabarito = lerGabarito();
  if (gabarito.casos.length === 0) throw new Error("O gabarito não tem casos.");

  const real = new Anthropic({ apiKey: chave, maxRetries: 2, timeout: 120_000 });
  const pastaRespostas = join(PASTA_RODADA, "respostas");
  // As respostas só substituem as da rodada anterior no fim, com tudo conferido:
  // uma rodada interrompida não deixa no branch metade nova e metade velha.
  const gravacoes: Gravacao[] = [];

  const corrigidos: CasoCorrigido[] = [];
  const erros: string[] = [];
  let custo = 0;
  for (const caso of gabarito.casos) {
    const gravacao: Gravacao = { caso: caso.id, chamadas: [] };
    const r = await avaliarCaso(caso, clienteQueGrava(real, gravacao), MODELOS_PADRAO);
    custo += r.chamadas.reduce((s, c) => s + custoDaChamada(c), 0);
    if (!r.ok) erros.push(`${caso.id}: ${r.erro}`);
    corrigidos.push({ id: caso.id, tipo: caso.tipo, ...r.correcao });
    const vazamento = problemasDoGabarito(gravacao, { exigirTrocas: false });
    if (vazamento.length)
      throw new Error(
        `${caso.id}: a resposta gravada tem formato de dado pessoal; nada foi gravado.`,
      );
    gravacoes.push(gravacao);
  }

  mkdirSync(pastaRespostas, { recursive: true });
  for (const a of readdirSync(pastaRespostas)) rmSync(join(pastaRespostas, a));
  for (const g of gravacoes)
    writeFileSync(join(pastaRespostas, `${g.caso}.json`), JSON.stringify(g, null, 2) + "\n");

  const resumo = resumir(corrigidos);
  const problemas = conferirLimites(resumo, gabarito.limites);
  const resultado: Resultado = {
    impressao: impressaoDigital(),
    gabarito: gabarito.hash,
    quando: new Date().toISOString(),
    modelos: { ...MODELOS_PADRAO },
    execucao: process.env.EXECUCAO,
    resumo,
    problemas: [...problemas, ...erros],
    custo_usd: Math.round(custo * 10_000) / 10_000,
    casos: corrigidos.map((c) => ({
      id: c.id,
      tipo: c.tipo,
      inteiro: c.inteiro,
      errados: c.itens.filter((i) => !i.certo).map((i) => `${i.campo} (${i.detalhe})`),
    })),
  };
  writeFileSync(join(PASTA_RODADA, "resultado.json"), JSON.stringify(resultado, null, 2) + "\n");

  const linhas = [
    `## Avaliação da extração: ${resumo.casos} casos, US$ ${resultado.custo_usd}`,
    "",
    "| Campo | Acerto | Itens |",
    "| --- | --- | --- |",
    ...Object.entries(resumo.porCampo).map(
      ([campo, t]) => `| ${campo} | ${pct(t.taxa)} | ${t.certos}/${t.total} |`,
    ),
    "",
    `Caso inteiro certo: ${pct(resumo.casoInteiro)}. Injeção sem efeito: ${resumo.injecao.semEfeito}/${resumo.injecao.casos}. Propaganda com passagem inventada: ${resumo.propagandaInventadas}.`,
    "",
    problemas.length
      ? `**Abaixo do limite:**\n- ${problemas.join("\n- ")}`
      : "**Todos os limites atingidos.**",
    ...(erros.length ? ["", `Erros: ${erros.length}`, ...erros.map((e) => `- ${e}`)] : []),
    "",
    "Casos com erro: " +
      (resultado
        .casos!.filter((c) => !c.inteiro)
        .map((c) => `${c.id} [${c.errados.join("; ")}]`)
        .join(", ") || "nenhum"),
  ].join("\n");
  console.log(linhas);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, linhas + "\n");

  // As notas ficam gravadas mesmo abaixo do limite; a CI do PR é que reprova.
  expect(resultado.impressao).toMatch(/^[0-9a-f]{64}$/);
});
