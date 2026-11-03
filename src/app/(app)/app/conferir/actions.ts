"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { draftFromRows, draftSchema, rowsFromDraft } from "@/lib/trips/draft";
import { deleteTrip, getTrip, updateTrip } from "@/lib/trips/repo";
import { draftWithYear } from "@/lib/trips/review";
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
  await updateTrip(user.id, booking, rowsFromDraft(draftSchema.parse(draft)));
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
  await supabase
    .from("bookings")
    .update({ purchased_on: day })
    .eq("id", booking)
    .eq("user_id", user.id);
  refresh();
}

/** Apaga uma passagem repetida (a outra continua). */
export async function deleteRepeatedAction(formData: FormData) {
  const user = await getCurrentUser();
  await deleteTrip(user.id, z.uuid().parse(formData.get("booking")));
  refresh();
}
