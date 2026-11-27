import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { origemValida, textoDaFalha, type LinhaDeFalha } from "./falhas-resumo";

// Registro de falhas do servidor (P23; decisão do dono de 27/11: só no banco, com
// resumo no e-mail do vigia diário). A tabela é só do servidor
// (docs/regras-de-acesso.md); a limpeza de 30 dias roda na rotina diária do agendador.

export const DIAS_NO_REGISTRO = 30;

/**
 * Grava uma falha. Nunca lança: registrar não pode derrubar quem já está lidando
 * com um erro. Se nem o banco responder, sobra o registro da Vercel (1 hora).
 */
export async function registrarFalha(origem: string, erro: unknown): Promise<void> {
  const linha = { origem: origemValida(origem), mensagem: textoDaFalha(erro) };
  console.error(`[falha] ${linha.origem}: ${linha.mensagem}`);
  try {
    const { error } = await createSupabaseAdminClient().from("registro_falhas").insert(linha);
    if (error) console.error(`[falha] não gravada no registro: ${error.message}`);
  } catch (e) {
    console.error(`[falha] não gravada no registro: ${textoDaFalha(e)}`);
  }
}

/** Falhas gravadas a partir de `desde` (para o resumo do vigia diário). */
export async function falhasDesde(desde: string): Promise<LinhaDeFalha[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from("registro_falhas")
    .select("origem, mensagem, criado_em")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Falha ao ler o registro de falhas: ${error.message}`);
  return (data ?? []) as LinhaDeFalha[];
}

/** Apaga as falhas com mais de DIAS_NO_REGISTRO dias; devolve quantas saíram. */
export async function limparFalhasAntigas(now: string): Promise<number> {
  const corte = new Date(Date.parse(now) - DIAS_NO_REGISTRO * 86_400_000).toISOString();
  const { count, error } = await createSupabaseAdminClient()
    .from("registro_falhas")
    .delete({ count: "exact" })
    .lt("criado_em", corte);
  if (error) throw new Error(`Falha ao limpar o registro de falhas: ${error.message}`);
  return count ?? 0;
}
