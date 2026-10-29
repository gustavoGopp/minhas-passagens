"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { profileUpdateSchema, updateProfile } from "@/lib/profiles/repo";

export interface ProfileFormState {
  ok?: boolean;
  error?: string;
}

export async function saveProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getCurrentUser();
  const parsed = profileUpdateSchema.safeParse({
    display_name: formData.get("display_name") ?? "",
    timezone: formData.get("timezone"),
    uf: formData.get("uf") ?? "",
    quiet_hours_start: formData.get("quiet_hours_start"),
    quiet_hours_end: formData.get("quiet_hours_end"),
    original_retention_days: formData.get("original_retention_days"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  await updateProfile(user.id, parsed.data);
  revalidatePath("/app/perfil");
  return { ok: true };
}
