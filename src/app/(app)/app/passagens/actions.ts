"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { extractBookings, type ExtractInput } from "@/lib/extract/extract";
import { getDecryptedKey } from "@/lib/integrations/repo";
import {
  draftFromExtraction,
  draftSchema,
  rowsFromDraft,
  type BookingDraft,
} from "@/lib/trips/draft";
import {
  createTrip,
  deleteTrip,
  setCheckin,
  setIgnoreMissingLeg,
  setIgnoreMissingReturn,
  setTripStatus,
  updateTrip,
} from "@/lib/trips/repo";

export interface ExtractState {
  drafts?: BookingDraft[];
  warnings?: string[];
  error?: string;
  model?: string;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const MAX_BYTES = 3_800_000;

export async function extractAction(
  _prev: ExtractState,
  formData: FormData,
): Promise<ExtractState> {
  const user = await getCurrentUser();
  const apiKey = await getDecryptedKey(user.id, "anthropic");
  if (!apiKey)
    return {
      error:
        "Cadastre sua chave da Anthropic em Mais → Integrações para usar a leitura automática.",
    };

  let input: ExtractInput;
  let source: "text" | "image" = "text";
  const file = formData.get("file");
  const text = String(formData.get("text") ?? "").trim();
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES)
      return { error: "Arquivo muito grande (máx. ~3,8 MB). Tente um print menor." };
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    source = "image";
    if (file.type === "application/pdf") input = { kind: "pdf", base64 };
    else if ((IMAGE_TYPES as readonly string[]).includes(file.type))
      input = { kind: "image", mediaType: file.type as (typeof IMAGE_TYPES)[number], base64 };
    else return { error: "Envie uma imagem (JPG, PNG, WEBP) ou PDF." };
  } else if (text.length >= 20) {
    input = { kind: "text", text };
  } else {
    return { error: "Cole o texto da confirmação ou escolha um print/PDF." };
  }

  const result = await extractBookings(apiKey, input);
  if (!result.ok) return { error: result.error };
  if (result.data.bookings.length === 0) {
    return { error: "Não encontrei passagens nesse conteúdo.", warnings: result.data.warnings };
  }
  return {
    drafts: result.data.bookings.map((b) => draftFromExtraction(b, source)),
    warnings: result.data.warnings,
    model: result.model,
  };
}

export interface SaveState {
  error?: string;
  savedId?: string;
}

export async function saveBookingAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const user = await getCurrentUser();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Dados do formulário inválidos." };
  }
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue ? `${issue.message}` : "Verifique os campos." };
  }
  const rows = rowsFromDraft(parsed.data);
  let id = parsed.data.id;
  try {
    if (id) await updateTrip(user.id, id, rows);
    else id = await createTrip(user.id, rows);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao salvar." };
  }
  revalidatePath("/app");
  revalidatePath(`/app/passagens/${id}`);
  return { savedId: id };
}

const idSchema = z.uuid();

export async function setStatusAction(formData: FormData) {
  const user = await getCurrentUser();
  const id = idSchema.parse(formData.get("id"));
  const status = z.enum(["active", "cancelled", "rebooked"]).parse(formData.get("status"));
  await setTripStatus(user.id, id, status);
  revalidatePath("/app");
  revalidatePath(`/app/passagens/${id}`);
}

export async function deleteBookingAction(formData: FormData) {
  const user = await getCurrentUser();
  const id = idSchema.parse(formData.get("id"));
  await deleteTrip(user.id, id);
  revalidatePath("/app");
  redirect("/app");
}

export async function toggleCheckinAction(formData: FormData) {
  const user = await getCurrentUser();
  const flightId = idSchema.parse(formData.get("flight_id"));
  await setCheckin(user.id, flightId, formData.get("done") === "true");
  revalidatePath("/app");
}

export async function ignoreMissingReturnAction(formData: FormData) {
  const user = await getCurrentUser();
  const flightId = idSchema.parse(formData.get("flight_id"));
  await setIgnoreMissingReturn(user.id, flightId, formData.get("value") !== "false");
  revalidatePath("/app");
}

export async function ignoreMissingLegAction(formData: FormData) {
  const user = await getCurrentUser();
  const flightId = idSchema.parse(formData.get("flight_id"));
  await setIgnoreMissingLeg(user.id, flightId, formData.get("value") !== "false");
  revalidatePath("/app");
}
