"use server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { disconnectGmail } from "@/lib/mail/accounts";
import { apagarUsuario } from "@/lib/account/apagar";
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
  // Revoga o acesso ao Gmail no Google antes de apagar (o resto sai em cascata).
  await disconnectGmail(user.id).catch(() => undefined);
  const erro = await apagarUsuario(user.id);
  if (erro) return { error: `Não foi possível apagar a conta: ${erro}` };
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/?conta=apagada");
}
