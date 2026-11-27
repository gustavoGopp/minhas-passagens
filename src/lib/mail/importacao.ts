import "server-only";
import type { Candidate } from "@/lib/mail/dedupe";
import { advanceScan, latestScan, RUNNING_STATUSES, scanCounts, startScan } from "@/lib/mail/scan";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { exigir } from "@/lib/supabase/exigir";
import type { BookingDraft } from "@/lib/trips/draft";

// Importação do Gmail, do lado do servidor. As tabelas da busca e dos candidatos
// só são gravadas pelo servidor (docs/regras-de-acesso.md), por isso usam a chave
// de serviço; cada função recebe o id da pessoa da sessão e sempre filtra por ele.

export async function iniciarBusca(userId: string) {
  await startScan(createSupabaseAdminClient(), userId);
}

export interface Progresso {
  status: string;
  total: number;
  done: number;
  error?: string;
}

/** Avança a busca até o prazo e devolve o progresso para a tela. */
export async function avancarBusca(userId: string, prazo: number): Promise<Progresso> {
  const admin = createSupabaseAdminClient();
  const scan = await latestScan(admin, userId);
  if (!scan) return { status: "none", total: 0, done: 0 };
  let status = scan.status;
  let error: string | undefined;
  if (RUNNING_STATUSES.includes(status)) {
    try {
      status = await advanceScan(admin, scan, prazo);
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

/** A pessoa confirmou o custo: começa a leitura com IA e guarda a escolha da leitura automática. */
export async function confirmarBusca(userId: string, autoSync: boolean) {
  const admin = createSupabaseAdminClient();
  exigir(
    await admin.from("mail_accounts").update({ auto_sync: autoSync }).eq("user_id", userId),
    "Falha ao guardar a leitura automática",
  );
  exigir(
    await admin
      .from("mail_scans")
      .update({ status: "processing", confirmed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "awaiting_confirmation"),
    "Falha ao confirmar a busca",
  );
}

export async function cancelarBusca(userId: string) {
  exigir(
    await createSupabaseAdminClient()
      .from("mail_scans")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("status", ["listing", "filtering", "awaiting_confirmation", "processing"]),
    "Falha ao cancelar a busca",
  );
}

export async function candidatosPendentes(userId: string): Promise<Candidate[]> {
  const data = exigir(
    await createSupabaseAdminClient()
      .from("import_candidates")
      .select("id, received_at, draft")
      .eq("user_id", userId)
      .eq("status", "pending"),
    "Falha ao ler as passagens encontradas",
  );
  return (data ?? []).map((c) => ({
    id: c.id as string,
    receivedAt: (c.received_at as string) ?? "",
    draft: c.draft as BookingDraft,
  }));
}

/** Registra a decisão sobre um candidato (importado ou descartado). */
export async function marcarCandidato(
  userId: string,
  candidateId: string,
  status: "imported" | "dismissed",
  bookingId: string | null,
  quando: string,
) {
  exigir(
    await createSupabaseAdminClient()
      .from("import_candidates")
      .update({ status, booking_id: bookingId, decided_at: quando })
      .eq("id", candidateId)
      .eq("user_id", userId),
    "Falha ao marcar a passagem encontrada",
  );
}

export async function descartarPendentes(userId: string) {
  exigir(
    await createSupabaseAdminClient()
      .from("import_candidates")
      .update({ status: "dismissed", decided_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "pending"),
    "Falha ao descartar as passagens encontradas",
  );
}

/** Importadas que a pessoa apagou depois (podem ser recriadas na tela Conferir). */
export async function importadasApagadas(userId: string): Promise<string[]> {
  const data = exigir(
    await createSupabaseAdminClient()
      .from("import_candidates")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "imported")
      .is("booking_id", null),
    "Falha ao ler as passagens apagadas",
  );
  return (data ?? []).map((c) => c.id as string);
}

/** Rascunho guardado de uma importada que foi apagada; null se não houver (ou não for desta pessoa). */
export async function rascunhoApagado(userId: string, candidateId: string) {
  return exigir(
    await createSupabaseAdminClient()
      .from("import_candidates")
      .select("id, draft, received_at, decided_at")
      .eq("id", candidateId)
      .eq("user_id", userId)
      .eq("status", "imported")
      .is("booking_id", null)
      .maybeSingle(),
    "Falha ao ler a passagem apagada",
  );
}

/**
 * Religa o candidato à passagem recriada, só se ninguém religou antes (dois cliques
 * ao mesmo tempo). Devolve false quando outro clique chegou primeiro.
 */
export async function religarCandidato(
  userId: string,
  candidateId: string,
  bookingId: string,
): Promise<boolean> {
  const data = exigir(
    await createSupabaseAdminClient()
      .from("import_candidates")
      .update({ booking_id: bookingId })
      .eq("id", candidateId)
      .eq("user_id", userId)
      .is("booking_id", null)
      .select("id"),
    "Falha ao religar a passagem restaurada",
  );
  return Boolean(data?.length);
}
