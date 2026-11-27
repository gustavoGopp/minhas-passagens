import "server-only";
import { getProfile } from "@/lib/profiles/repo";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { performCheck, type MonitorRow, type PerformResult } from "./repo";

/**
 * "Verificar agora": grava a checagem pelo servidor. O histórico de preço só é
 * gravado pelo servidor (regra aprovada em 27/11), e a chave cifrada do provedor
 * só é lida aqui. Quem chama já confirmou que o monitor é da pessoa da sessão;
 * a conferência abaixo repete isso antes de usar a chave de serviço.
 */
export async function verificarAgora(userId: string, monitor: MonitorRow): Promise<PerformResult> {
  if (monitor.user_id !== userId) return { ok: false, error: "Monitor não encontrado." };
  return performCheck(createSupabaseAdminClient(), monitor, await getProfile(userId));
}
