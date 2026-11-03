"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { decideCandidates, type Candidate } from "@/lib/mail/dedupe";
import { advanceScan, latestScan, RUNNING_STATUSES, scanCounts, startScan } from "@/lib/mail/scan";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { draftFromRows, draftSchema, rowsFromDraft, type BookingDraft } from "@/lib/trips/draft";
import { createTrip, getTrip, listTrips, setTripStatus, updateTrip } from "@/lib/trips/repo";

const PATH = "/app/passagens/importar";

export async function startScanAction() {
  const user = await getCurrentUser();
  await startScan(createSupabaseAdminClient(), user.id);
  revalidatePath(PATH);
}

export interface ProgressState {
  status: string;
  total: number;
  done: number;
  error?: string;
}

/** Avança a varredura por até ~40 s (a tela chama em sequência enquanto estiver aberta). */
export async function advanceScanAction(): Promise<ProgressState> {
  const user = await getCurrentUser();
  const admin = createSupabaseAdminClient();
  const scan = await latestScan(admin, user.id);
  if (!scan) return { status: "none", total: 0, done: 0 };
  let status = scan.status;
  let error: string | undefined;
  if (RUNNING_STATUSES.includes(status)) {
    try {
      status = await advanceScan(admin, scan, Date.now() + 40_000);
    } catch (e) {
      error = (e as Error).message;
    }
  }
  const c = await scanCounts(admin, scan.id);
  const done =
    status === "processing"
      ? (c.extracted ?? 0) + (c.not_booking ?? 0) + (c.error ?? 0)
      : c.total - (c.listed ?? 0);
  const total = status === "processing" ? done + (c.candidate ?? 0) + (c.processing ?? 0) : c.total;
  return { status, total, done, error };
}

/** O dono confirmou o custo: começa a leitura com IA (chave dele). */
export async function confirmScanAction(formData: FormData) {
  const user = await getCurrentUser();
  const admin = createSupabaseAdminClient();
  // Na mesma confirmação, o dono decide se os e-mails novos serão lidos sozinhos.
  await admin
    .from("mail_accounts")
    .update({ auto_sync: formData.get("auto_sync") === "on" })
    .eq("user_id", user.id);
  await admin
    .from("mail_scans")
    .update({ status: "processing", confirmed_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "awaiting_confirmation");
  revalidatePath(PATH);
}

export async function cancelScanAction() {
  const user = await getCurrentUser();
  await createSupabaseAdminClient()
    .from("mail_scans")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .in("status", ["listing", "filtering", "awaiting_confirmation", "processing"]);
  revalidatePath(PATH);
}

export interface ImportState {
  imported?: number;
  updated?: number;
  cancelled?: number;
  skipped?: number;
  errors?: string[];
}

const idsSchema = z.array(z.uuid()).max(500);

/** Importa os candidatos marcados (novas, atualizações e cancelamentos). Duplicadas são descartadas. */
export async function importCandidatesAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await getCurrentUser();
  const admin = createSupabaseAdminClient();
  const selected = new Set(idsSchema.parse(formData.getAll("candidate")));
  const { data, error } = await admin
    .from("import_candidates")
    .select("id, received_at, draft")
    .eq("user_id", user.id)
    .eq("status", "pending");
  if (error) return { errors: [error.message] };
  const candidates: Candidate[] = (data ?? []).map((c) => ({
    id: c.id as string,
    receivedAt: (c.received_at as string) ?? "",
    draft: c.draft as BookingDraft,
  }));
  const trips = await listTrips(user.id);
  const decisions = decideCandidates({ candidates, ...trips });
  const out: Required<ImportState> = {
    imported: 0,
    updated: 0,
    cancelled: 0,
    skipped: 0,
    errors: [],
  };
  const now = new Date().toISOString();

  for (const d of decisions) {
    if (!selected.has(d.id)) continue;
    const c = candidates.find((x) => x.id === d.id)!;
    const mark = (status: "imported" | "dismissed", bookingId: string | null) =>
      admin
        .from("import_candidates")
        .update({ status, booking_id: bookingId, decided_at: now })
        .eq("id", d.id)
        .eq("user_id", user.id);
    try {
      if (d.kind === "duplicate") {
        await mark(
          "dismissed",
          d.coveredBy && trips.bookings.some((b) => b.id === d.coveredBy) ? d.coveredBy : null,
        );
        out.skipped++;
        continue;
      }
      if (d.kind === "cancel" && d.bookingId) {
        await setTripStatus(user.id, d.bookingId, "cancelled");
        await mark("imported", d.bookingId);
        out.cancelled++;
        continue;
      }
      if (d.kind === "update" && d.bookingId) {
        // Remarcação: troca só os trechos e mantém valores e etiquetas da compra.
        const current = await getTrip(user.id, d.bookingId);
        if (!current) throw new Error("passagem não encontrada");
        const used = new Set<string>();
        const legs = c.draft.legs.map((l) => {
          const same = current.flights.find(
            (f) =>
              !used.has(f.id) &&
              f.origin === l.origin.toUpperCase() &&
              f.destination === l.destination.toUpperCase(),
          );
          if (same) used.add(same.id);
          return { ...l, id: same?.id };
        });
        const merged = { ...draftFromRows(current.booking, current.flights), legs };
        const parsed = draftSchema.safeParse(merged);
        if (!parsed.success)
          throw new Error(parsed.error.issues[0]?.message ?? "rascunho inválido");
        await updateTrip(user.id, d.bookingId, rowsFromDraft(parsed.data));
        await mark("imported", d.bookingId);
        out.updated++;
        continue;
      }
      const parsed = draftSchema.safeParse(c.draft);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "rascunho inválido");
      const id = await createTrip(user.id, rowsFromDraft(parsed.data));
      await mark("imported", id);
      out.imported++;
    } catch (e) {
      out.errors.push(`${c.draft.locator || "sem localizador"}: ${(e as Error).message}`);
    }
  }
  revalidatePath(PATH);
  revalidatePath("/app");
  revalidatePath("/app/gastos");
  return out;
}

/** Descarta os candidatos que sobraram (não importa nada). */
export async function dismissPendingAction() {
  const user = await getCurrentUser();
  await createSupabaseAdminClient()
    .from("import_candidates")
    .update({ status: "dismissed", decided_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "pending");
  revalidatePath(PATH);
}
