import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarFalha } from "@/lib/falhas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CONTAM_NO_TETO,
  contarHoje,
  inicioDoDiaEmSaoPaulo,
  somarGasto,
  type Gasto,
  type LinhaDeConsumo,
} from "./consumo-resumo";
import type { Chamada } from "./extract";
import { TETO_DIARIO_EXTRACOES } from "./limites";

// Consumo da leitura com IA (P25). A tabela `extracoes` só o servidor grava
// (docs/regras-de-acesso.md): por isso a chave de serviço, sempre filtrando pela
// pessoa. A pessoa lê as próprias linhas pelo cliente dela (resumoDoGasto).

export type OrigemDaExtracao = "automatica" | "varredura" | "envio";

export const DIAS_DE_CONSUMO = 400;

export const MENSAGEM_DO_TETO = `Teto diário de ${TETO_DIARIO_EXTRACOES} leituras com IA atingido. Continua amanhã.`;

/** Grava uma linha por chamada à API. Nunca lança: o registro não derruba a leitura. */
export async function registrarChamadas(
  userId: string,
  origem: OrigemDaExtracao,
  chamadas: Chamada[],
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<void> {
  if (!chamadas.length) return;
  const { error } = await admin.from("extracoes").insert(
    chamadas.map((c) => ({
      user_id: userId,
      origem,
      modelo: c.modelo.slice(0, 100),
      reforco: c.reforco,
      resultado: c.resultado,
      motivo_parada: c.motivoParada?.slice(0, 40) ?? null,
      tokens_entrada: c.tokensEntrada,
      tokens_saida: c.tokensSaida,
      tokens_cache_leitura: c.tokensCacheLeitura,
      tokens_cache_escrita: c.tokensCacheEscrita,
    })),
  );
  if (error) await registrarFalha("extracao:registrar-consumo", error);
}

/** Leituras de hoje (fuso de São Paulo) que contam no teto. */
export async function leiturasDeHoje(
  userId: string,
  agora: number = Date.now(),
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<number> {
  const { count, error } = await admin
    .from("extracoes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("reforco", false)
    .in("origem", CONTAM_NO_TETO)
    .gte("criado_em", inicioDoDiaEmSaoPaulo(agora));
  if (error) throw new Error(`extracoes: ${error.message}`);
  return count ?? 0;
}

/** Ainda cabe uma leitura hoje nesta origem? */
export async function cabeNoTeto(
  userId: string,
  origem: OrigemDaExtracao,
  agora: number = Date.now(),
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<boolean> {
  if (!CONTAM_NO_TETO.includes(origem)) return true;
  return (await leiturasDeHoje(userId, agora, admin)) < TETO_DIARIO_EXTRACOES;
}

/** Gasto dos últimos 30 dias, lido pelo cliente da própria pessoa. */
export async function resumoDoGasto(
  cliente: SupabaseClient,
  userId: string,
  agora: number = Date.now(),
): Promise<Gasto & { hoje: number }> {
  const desde = new Date(agora - 30 * 86_400_000).toISOString();
  const { data, error } = await cliente
    .from("extracoes")
    .select(
      "criado_em, origem, modelo, reforco, tokens_entrada, tokens_saida, tokens_cache_leitura, tokens_cache_escrita",
    )
    .eq("user_id", userId)
    .gte("criado_em", desde)
    .limit(5000);
  if (error) throw new Error(`extracoes: ${error.message}`);
  const linhas = (data ?? []) as (LinhaDeConsumo & { criado_em: string; origem: string })[];
  return { ...somarGasto(linhas), hoje: contarHoje(linhas, agora) };
}

/** Limpeza da rotina diária: apaga o consumo com mais de DIAS_DE_CONSUMO dias. */
export async function limparConsumoAntigo(
  now: string,
  admin: SupabaseClient = createSupabaseAdminClient(),
): Promise<number> {
  const corte = new Date(Date.parse(now) - DIAS_DE_CONSUMO * 86_400_000).toISOString();
  const { count, error } = await admin
    .from("extracoes")
    .delete({ count: "exact" })
    .lt("criado_em", corte);
  if (error) throw new Error(`Falha ao limpar o consumo da IA: ${error.message}`);
  return count ?? 0;
}
