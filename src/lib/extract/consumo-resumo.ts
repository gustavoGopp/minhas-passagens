import { custoDaChamada, estimateUsd } from "@/lib/mail/cost";
import { todayInBrazil } from "@/lib/trips/draft";
import { localToUtc } from "@/lib/trips/time";

// Contas puras do consumo da leitura com IA (P25): sem banco, para testar.

/** Origens que contam no teto diário. A busca completa confirmada pelo dono fica fora. */
export const CONTAM_NO_TETO = ["automatica", "envio"];

/** Instante (UTC, ISO) em que começou o dia de `agora` no fuso de São Paulo. */
export function inicioDoDiaEmSaoPaulo(agora: number): string {
  const dia = todayInBrazil(new Date(agora).toISOString());
  return new Date(localToUtc(`${dia}T00:00`, "America/Sao_Paulo")).toISOString();
}

export interface LinhaDeConsumo {
  modelo: string;
  reforco: boolean;
  tokens_entrada: number;
  tokens_saida: number;
  tokens_cache_leitura: number;
  tokens_cache_escrita: number;
}

export interface Gasto {
  /** Leituras (primeira chamada de cada uma). */
  leituras: number;
  /** Quantas precisaram do modelo de reforço. */
  comReforco: number;
  /** Soma do custo real informado pela API, em US$. */
  realUsd: number;
  /** O que a estimativa da tela de confirmação diria para o mesmo número de leituras. */
  estimadoUsd: number;
}

export function somarGasto(linhas: LinhaDeConsumo[]): Gasto {
  const leituras = linhas.filter((l) => !l.reforco).length;
  const realUsd = linhas.reduce(
    (s, l) =>
      s +
      custoDaChamada({
        modelo: l.modelo,
        tokensEntrada: l.tokens_entrada,
        tokensSaida: l.tokens_saida,
        tokensCacheLeitura: l.tokens_cache_leitura,
        tokensCacheEscrita: l.tokens_cache_escrita,
      }),
    0,
  );
  return {
    leituras,
    comReforco: linhas.filter((l) => l.reforco).length,
    realUsd,
    estimadoUsd: estimateUsd(leituras),
  };
}

/** Leituras de hoje (São Paulo) que contam no teto, a partir das linhas da pessoa. */
export function contarHoje(
  linhas: { criado_em: string; origem: string; reforco: boolean }[],
  agora: number,
): number {
  const inicio = Date.parse(inicioDoDiaEmSaoPaulo(agora));
  return linhas.filter(
    (l) => !l.reforco && CONTAM_NO_TETO.includes(l.origem) && Date.parse(l.criado_em) >= inicio,
  ).length;
}
