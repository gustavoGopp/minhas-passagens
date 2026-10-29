"use server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface DeleteAccountState {
  error?: string;
}

/**
 * Apaga a conta do próprio usuário. Exige digitar "APAGAR" para confirmar.
 * As tabelas do app têm ON DELETE CASCADE a partir de auth.users.
 */
export async function deleteAccountAction(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const user = await getCurrentUser();
  if (
    String(formData.get("confirmacao") ?? "")
      .trim()
      .toUpperCase() !== "APAGAR"
  ) {
    return { error: "Digite APAGAR para confirmar." };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: `Não foi possível apagar a conta: ${error.message}` };
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/?conta=apagada");
}
