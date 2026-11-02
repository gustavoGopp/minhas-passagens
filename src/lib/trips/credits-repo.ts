import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CreditRow } from "./rules";

const COLS =
  "id, booking_id, kind, provider, amount_cents, remaining_cents, currency, issued_on, expires_on, notes";

export async function listCredits(userId: string): Promise<CreditRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("refunds_credits")
    .select(COLS)
    .eq("user_id", userId)
    .order("issued_on", { ascending: false });
  if (error) throw new Error(`Falha ao ler créditos: ${error.message}`);
  return (data ?? []) as CreditRow[];
}

export async function addCredit(userId: string, c: Omit<CreditRow, "id">): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("refunds_credits").insert({ ...c, user_id: userId });
  if (error) throw new Error(`Falha ao salvar: ${error.message}`);
}

export async function setCreditRemaining(
  userId: string,
  id: string,
  remainingCents: number,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("refunds_credits")
    .update({ remaining_cents: remainingCents })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`Falha ao atualizar o saldo: ${error.message}`);
}

export async function deleteCredit(userId: string, id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("refunds_credits")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`Falha ao apagar: ${error.message}`);
}
