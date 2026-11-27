"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  draftFromRows,
  rascunhoGuardado,
  savedDraftSchema,
  rowsFromDraft,
} from "@/lib/trips/draft";
import { createTrip, deleteTrip, getTrip, updateTrip } from "@/lib/trips/repo";
import { draftWithYear, restoredDraft } from "@/lib/trips/review";
import { importadasApagadas, rascunhoApagado, religarCandidato } from "@/lib/mail/importacao";
import { exigir } from "@/lib/supabase/exigir";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const refresh = () => {
  revalidatePath("/app/conferir");
  revalidatePath("/app");
  revalidatePath("/app/calendario");
  revalidatePath("/app/gastos");
};

const yearSchema = z.object({
  booking: z.uuid(),
  from: z.coerce.number().int().min(2000).max(2100),
  to: z.coerce.number().int().min(2000).max(2100),
});

/** Move todos os trechos da passagem para outro ano (mantém dia, hora e check-in). */
export async function fixYearAction(formData: FormData) {
  const user = await getCurrentUser();
  const { booking, from, to } = yearSchema.parse({
    booking: formData.get("booking"),
    from: formData.get("from"),
    to: formData.get("to"),
  });
  const trip = await getTrip(user.id, booking);
  if (!trip) return;
  const draft = draftWithYear(draftFromRows(trip.booking, trip.flights), from, to);
  // Passagem já gravada: só o ano muda; as regras de coerência não se aplicam aqui.
  await updateTrip(user.id, booking, rowsFromDraft(savedDraftSchema.parse(draft)));
  refresh();
}

/** O voo está certo: a data da compra é que estava errada (passa a ser o dia do voo). */
export async function keepFlightDateAction(formData: FormData) {
  const user = await getCurrentUser();
  const booking = z.uuid().parse(formData.get("booking"));
  const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .parse(formData.get("day"));
  const supabase = await createSupabaseServerClient();
  exigir(
    await supabase
      .from("bookings")
      .update({ purchased_on: day })
      .eq("id", booking)
      .eq("user_id", user.id),
    "Falha ao corrigir a data da compra",
  );
  refresh();
}

/** Apaga uma passagem repetida (a outra continua). */
export async function deleteRepeatedAction(formData: FormData) {
  const user = await getCurrentUser();
  await deleteTrip(user.id, z.uuid().parse(formData.get("booking")));
  refresh();
}

/** Recria uma passagem importada que foi apagada (a partir do rascunho guardado). */
async function restoreOne(userId: string, candidateId: string): Promise<boolean> {
  const c = await rascunhoApagado(userId, candidateId);
  if (!c) return false; // já restaurada (clique repetido) ou não é desta conta
  // Já tinha sido importada antes de ser apagada: volta como estava.
  const parsed = savedDraftSchema.safeParse(
    restoredDraft(
      rascunhoGuardado(c.draft),
      c.received_at as string | null,
      c.decided_at as string | null,
    ),
  );
  if (!parsed.success) return false;
  const bookingId = await createTrip(userId, rowsFromDraft(parsed.data));
  // Só religa se ninguém religou antes (dois cliques ao mesmo tempo): senão desfaz a cópia.
  if (!(await religarCandidato(userId, candidateId, bookingId))) {
    await deleteTrip(userId, bookingId);
    return false;
  }
  return true;
}

export async function restoreDeletedAction(formData: FormData) {
  const user = await getCurrentUser();
  await restoreOne(user.id, z.uuid().parse(formData.get("candidate")));
  refresh();
}

export async function restoreAllDeletedAction() {
  const user = await getCurrentUser();
  for (const id of await importadasApagadas(user.id)) await restoreOne(user.id, id);
  refresh();
}
