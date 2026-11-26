"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { addCredit, deleteCredit, setCreditRemaining } from "@/lib/trips/credits-repo";
import { parseMoney } from "@/lib/trips/money";
import { getTrip } from "@/lib/trips/repo";
import { isRealDate } from "@/lib/trips/time";

export interface CreditFormState {
  ok?: boolean;
  error?: string;
}

const date = z.string().refine(isRealDate, "Data inválida");

function refresh(bookingId?: string | null) {
  revalidatePath("/app");
  revalidatePath("/app/creditos");
  revalidatePath("/app/gastos");
  if (bookingId) revalidatePath(`/app/passagens/${bookingId}`);
}

export async function addCreditAction(
  _prev: CreditFormState,
  fd: FormData,
): Promise<CreditFormState> {
  const user = await getCurrentUser();
  const parsed = z
    .object({
      kind: z.enum(["refund", "credit"]),
      booking_id: z.uuid().or(z.literal("")),
      provider: z.string().trim().max(80),
      amount: z.string(),
      issued_on: date,
      expires_on: date.or(z.literal("")),
      notes: z.string().trim().max(1000),
    })
    .safeParse({
      kind: fd.get("kind"),
      booking_id: fd.get("booking_id") ?? "",
      provider: fd.get("provider") ?? "",
      amount: fd.get("amount") ?? "",
      issued_on: fd.get("issued_on"),
      expires_on: fd.get("expires_on") ?? "",
      notes: fd.get("notes") ?? "",
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const amount = parseMoney(parsed.data.amount);
  if (!amount.ok) return { error: amount.message };
  const cents = amount.cents;
  if (cents == null || cents === 0) return { error: "Informe o valor." };
  const d = parsed.data;
  // Reembolso ou crédito de uma passagem em outra moeda fica nessa moeda, para
  // não ser descontado dos gastos em reais.
  const linked = d.booking_id ? await getTrip(user.id, d.booking_id) : null;
  await addCredit(user.id, {
    kind: d.kind,
    booking_id: d.booking_id || null,
    provider: d.provider || null,
    amount_cents: cents,
    remaining_cents: d.kind === "credit" ? cents : null,
    currency: linked?.booking.currency ?? "BRL",
    issued_on: d.issued_on,
    expires_on: d.kind === "credit" && d.expires_on ? d.expires_on : null,
    notes: d.notes || null,
  });
  refresh(d.booking_id);
  return { ok: true };
}

export async function updateRemainingAction(fd: FormData) {
  const user = await getCurrentUser();
  const id = z.uuid().parse(fd.get("id"));
  const remaining = parseMoney(String(fd.get("remaining") ?? ""));
  // Valor ilegível ou vazio: não grava nada (o campo volta ao saldo anterior).
  if (!remaining.ok || remaining.cents == null) return;
  const cents = remaining.cents;
  await setCreditRemaining(user.id, id, cents);
  refresh();
}

export async function deleteCreditAction(fd: FormData) {
  const user = await getCurrentUser();
  const id = z.uuid().parse(fd.get("id"));
  await deleteCredit(user.id, id);
  refresh(String(fd.get("booking_id") ?? "") || null);
}
