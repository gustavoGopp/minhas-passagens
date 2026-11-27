"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { decideCandidates } from "@/lib/mail/dedupe";
import {
  avancarBusca,
  cancelarBusca,
  candidatosPendentes,
  confirmarBusca,
  descartarPendentes,
  iniciarBusca,
  marcarCandidato,
  type Progresso,
} from "@/lib/mail/importacao";
import { draftFromRows, draftSchema, rowsFromDraft } from "@/lib/trips/draft";
import { createTrip, getTrip, listTrips, setTripStatus, updateTrip } from "@/lib/trips/repo";

const PATH = "/app/passagens/importar";

export async function startScanAction() {
  const user = await getCurrentUser();
  await iniciarBusca(user.id);
  revalidatePath(PATH);
}

/**
 * Aeroporto fora das listas e moeda não reconhecida pedem uma conferência que
 * esta tela não tem: a mensagem manda para o formulário, onde dá para conferir.
 */
function importMessage(message: string): string {
  if (!/Conferi os horários|Escolha a moeda/.test(message)) return message;
  return `${message.split(". ")[0]}. Cadastre esta passagem pelo formulário (Passagens → Nova) para conferir os horários e a moeda.`;
}

export type ProgressState = Progresso;

/** Avança a varredura por até ~40 s (a tela chama em sequência enquanto estiver aberta). */
export async function advanceScanAction(): Promise<ProgressState> {
  const user = await getCurrentUser();
  return avancarBusca(user.id, Date.now() + 40_000);
}

/** O dono confirmou o custo: começa a leitura com IA (chave dele). */
export async function confirmScanAction(formData: FormData) {
  const user = await getCurrentUser();
  // Na mesma confirmação, o dono decide se os e-mails novos serão lidos sozinhos.
  await confirmarBusca(user.id, formData.get("auto_sync") === "on");
  revalidatePath(PATH);
}

export async function cancelScanAction() {
  const user = await getCurrentUser();
  await cancelarBusca(user.id);
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
  const selected = new Set(idsSchema.parse(formData.getAll("candidate")));
  let candidates;
  try {
    candidates = await candidatosPendentes(user.id);
  } catch (e) {
    return { errors: [(e as Error).message] };
  }
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
      marcarCandidato(user.id, d.id, status, bookingId, now);
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
      out.errors.push(
        `${c.draft.locator || "sem localizador"}: ${importMessage((e as Error).message)}`,
      );
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
  await descartarPendentes(user.id);
  revalidatePath(PATH);
}
