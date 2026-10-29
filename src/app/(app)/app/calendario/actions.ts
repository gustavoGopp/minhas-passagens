"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { addOverride, removeOverride } from "@/lib/holidays/repo";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

export interface AddHolidayState {
  ok?: boolean;
  error?: string;
}

export async function addCustomHolidayAction(
  _prev: AddHolidayState,
  formData: FormData,
): Promise<AddHolidayState> {
  const user = await getCurrentUser();
  const parsed = z
    .object({
      date: isoDate,
      name: z.string().trim().min(2, "Dê um nome ao feriado").max(120),
      kind: z.enum(["holiday", "optional", "observance"]),
    })
    .safeParse({
      date: formData.get("date"),
      name: formData.get("name"),
      kind: formData.get("kind"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  await addOverride(user.id, { action: "add", ...parsed.data });
  revalidatePath("/app/calendario");
  return { ok: true };
}

export async function hideHolidayAction(formData: FormData) {
  const user = await getCurrentUser();
  const date = isoDate.parse(formData.get("date"));
  const key = z.string().min(1).max(200).parse(formData.get("key"));
  await addOverride(user.id, { action: "hide", date, key });
  revalidatePath("/app/calendario");
}

export async function removeOverrideAction(formData: FormData) {
  const user = await getCurrentUser();
  const id = z.uuid().parse(formData.get("id"));
  await removeOverride(user.id, id);
  revalidatePath("/app/calendario");
}
