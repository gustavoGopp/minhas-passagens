import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { conferirLimites } from "./corretor";
import { lerGabarito } from "./gabarito";
import type { Gravacao, Resultado } from "./rodada";

vi.mock("server-only", () => ({}));
const { avaliarCaso, clienteGravado, conferirRodada, impressaoDigital } = await import("./rodada");

// Teste de repetição da avaliação da extração (P24). Roda em toda CI, sem chave:
// confere que a última rodada de verdade (tests/avaliacao-extracao, gravada pelo
// workflow avaliacao-extracao) vale para o prompt e o gabarito atuais, que as
// notas dela atingem os limites aprovados e que o código em volta do modelo,
// repetindo as respostas gravadas, chega à mesma nota caso a caso.

const PASTA_RODADA = "tests/avaliacao-extracao";

function lerJson<T>(caminho: string): T | null {
  return existsSync(caminho) ? (JSON.parse(readFileSync(caminho, "utf8")) as T) : null;
}

const gabarito = lerGabarito();
const resultado = lerJson<Resultado>(join(PASTA_RODADA, "resultado.json"));

describe("última rodada de verdade da extração", () => {
  it("vale para o prompt, o modelo e o gabarito atuais", () => {
    const atual = { impressao: impressaoDigital(), gabarito: gabarito.hash };
    expect(conferirRodada(resultado, atual)).toEqual([]);
  });

  it("atinge os limites aprovados pelo dono", () => {
    expect(resultado?.resumo, "Nenhuma rodada de verdade gravada.").toBeTruthy();
    expect(conferirLimites(resultado!.resumo!, gabarito.limites)).toEqual([]);
    expect(resultado!.problemas ?? []).toEqual([]);
  });

  it.each(gabarito.casos.map((c) => [c.id, c] as const))(
    "%s: as respostas gravadas dão a mesma nota",
    async (id, caso) => {
      const gravacao = lerJson<Gravacao>(join(PASTA_RODADA, "respostas", `${id}.json`));
      expect(
        gravacao,
        `Sem resposta gravada para ${id}: rode a avaliação de verdade.`,
      ).toBeTruthy();
      const gravado = resultado?.casos?.find((c) => c.id === id);
      expect(gravado, `${id} não está no resultado da última rodada.`).toBeTruthy();

      const r = await avaliarCaso(caso, clienteGravado(gravacao!));
      const errados = r.correcao.itens
        .filter((i) => !i.certo)
        .map((i) => `${i.campo} (${i.detalhe})`);
      expect({ inteiro: r.correcao.inteiro, errados }).toEqual({
        inteiro: gravado!.inteiro,
        errados: gravado!.errados,
      });
    },
  );
});
