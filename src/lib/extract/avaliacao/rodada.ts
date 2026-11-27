import { createHash } from "node:crypto";
import {
  entradaDoEmail,
  extractBookings,
  montarPedido,
  type Chamada,
  type ClienteDaExtracao,
} from "../extract";
import { MODELOS_PADRAO } from "../modelos";
import { corrigirCaso, type Correcao, type Resumo } from "./corretor";
import type { Caso } from "./gabarito";

// Uma rodada da avaliação da extração (P24). A mesma função roda o caso de
// verdade (com a chave da avaliação, gravando as respostas) e na CI (repetindo
// as respostas gravadas, sem chave): assim a CI testa o código em volta do
// modelo, e a impressão digital diz quando é preciso rodar de verdade de novo.

type Modelos = { padrao: string; reforco: string };

const EXEMPLO = {
  assunto: "Confirmação da sua compra",
  remetente: "Companhia <reservas@example.com>",
  corpo: "Localizador ABC123. Voo AD 4512 de SDU para CGH em 07/12 às 06:30.",
};

/**
 * Hash de tudo o que vai ao modelo além do e-mail: prompt, esquema de saída,
 * esforço, limite de tokens, modelos e a forma de montar a entrada. Datas do
 * dia são trocadas por um marcador: a impressão não muda de um dia para outro.
 */
export function impressaoDigital(
  montar: typeof montarPedido = montarPedido,
  modelos: Modelos = MODELOS_PADRAO,
): string {
  const pedidos = [modelos.padrao, modelos.reforco].flatMap((m) => [
    montar(m, entradaDoEmail(EXEMPLO), { allowEmpty: true, receivedOn: "2026-01-02" }),
    montar(m, { kind: "text", text: EXEMPLO.corpo }),
    montar(m, { kind: "pdf", base64: "UERG" }),
    montar(m, { kind: "image", mediaType: "image/png", base64: "UE5H" }),
  ]);
  const texto = JSON.stringify(pedidos).replace(/\d{4}-\d{2}-\d{2}/g, "DATA");
  return createHash("sha256").update(texto).digest("hex");
}

/** Respostas da API para um caso, na ordem em que foram pedidas. */
export interface Gravacao {
  caso: string;
  chamadas: { modelo: string; resposta: unknown }[];
}

const NAO_GRAVADA =
  "Resposta não gravada para esta chamada: o código em volta do modelo mudou o que pede. Rode a avaliação de verdade (workflow avaliacao-extracao).";

/** Cliente que devolve as respostas gravadas, na ordem; qualquer desvio falha. */
export function clienteGravado(g: Gravacao): ClienteDaExtracao {
  let i = 0;
  const parse = async (pedido: { model: string }) => {
    const c = g.chamadas[i++];
    if (!c || c.modelo !== pedido.model) throw new Error(NAO_GRAVADA);
    return structuredClone(c.resposta);
  };
  return { messages: { parse } } as unknown as ClienteDaExtracao;
}

/** Cliente que chama a API de verdade e guarda cada resposta em `destino`. */
export function clienteQueGrava(real: ClienteDaExtracao, destino: Gravacao): ClienteDaExtracao {
  const parse = async (pedido: Parameters<ClienteDaExtracao["messages"]["parse"]>[0]) => {
    const r = await real.messages.parse(pedido);
    const { parsed_output, stop_reason, usage } = r as unknown as Record<string, unknown>;
    destino.chamadas.push({
      modelo: pedido.model,
      resposta: structuredClone({ parsed_output, stop_reason, usage }),
    });
    return r;
  };
  return { messages: { parse } } as unknown as ClienteDaExtracao;
}

export interface CasoAvaliado {
  ok: boolean;
  erro?: string;
  correcao: Correcao;
  chamadas: Chamada[];
}

/** Roda um caso como a leitura do Gmail roda um e-mail, e corrige o resultado. */
export async function avaliarCaso(
  caso: Caso,
  cliente: ClienteDaExtracao,
  modelos: Modelos = MODELOS_PADRAO,
): Promise<CasoAvaliado> {
  const r = await extractBookings(
    "chave-da-avaliacao",
    entradaDoEmail(caso.entrada),
    { allowEmpty: true, receivedOn: caso.entrada.recebido_em },
    { cliente, modelos },
  );
  const correcao = corrigirCaso(caso.esperado, r.ok ? r.data.bookings : []);
  return r.ok
    ? { ok: true, correcao, chamadas: r.chamadas }
    : { ok: false, erro: r.error, correcao, chamadas: r.chamadas };
}

/** Resultado da última rodada de verdade (tests/avaliacao-extracao/resultado.json). */
export interface Resultado {
  impressao: string;
  gabarito: string;
  quando?: string;
  modelos?: Modelos;
  execucao?: string;
  resumo?: Resumo;
  problemas?: string[];
  custo_usd?: number;
  casos?: { id: string; tipo: string; inteiro: boolean; errados: string[] }[];
}

/** O que impede a rodada gravada de valer para o código e o gabarito atuais. */
export function conferirRodada(
  resultado: Pick<Resultado, "impressao" | "gabarito"> | null,
  atual: { impressao: string; gabarito: string },
): string[] {
  if (!resultado) return ["Nenhuma rodada de verdade gravada: rode o workflow avaliacao-extracao."];
  const problemas: string[] = [];
  if (resultado.impressao !== atual.impressao)
    problemas.push(
      "O prompt, o esquema, o esforço ou o modelo mudou depois da última avaliação de verdade: rode o workflow avaliacao-extracao antes do merge.",
    );
  if (resultado.gabarito !== atual.gabarito)
    problemas.push(
      "O gabarito ou os limites mudaram depois da última avaliação de verdade: rode o workflow avaliacao-extracao.",
    );
  return problemas;
}
