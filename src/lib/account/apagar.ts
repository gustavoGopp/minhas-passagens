import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Apaga o usuário no Auth; as tabelas do app saem em cascata (ON DELETE CASCADE
 * a partir de auth.users). Exige a chave de serviço: a API de Auth não aceita o
 * cliente da pessoa. Quem chama passa o id da sessão, nunca um id do formulário.
 */
export async function apagarUsuario(userId: string): Promise<string | null> {
  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(userId);
  return error ? error.message : null;
}
