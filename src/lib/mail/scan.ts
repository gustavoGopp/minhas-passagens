import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractBookings } from "@/lib/extract/extract";
import { getDecryptedKeyWith } from "@/lib/integrations/repo";
import { draftFromExtraction } from "@/lib/trips/draft";
import { googleClient } from "./accounts";
import {
  getBody,
  getMeta,
  GmailError,
  listHistory,
  listMessageIds,
  recentQueries,
  scanQueries,
} from "./gmail";
import { OAuthError, refreshAccessToken } from "./google-oauth";
import { bodyDecision, classify, headerDecision, senderDomain } from "./prefilter";

/**
 * Varredura do Gmail em etapas curtas (cabe no tempo de uma função da Vercel e
 * pode ser retomada por qualquer chamada: a tela ou o agendador):
 * listing (ids) → filtering (cabeçalhos, sem IA) → awaiting_confirmation (o dono
 * confirma o custo) → processing (corpo, pré-filtro e extração com a chave dele) → review.
 * Nada do conteúdo do e-mail é gravado: só metadados e o rascunho da passagem.
 */
export type ScanStatus =
  | "listing"
  | "filtering"
  | "awaiting_confirmation"
  | "processing"
  | "review"
  | "cancelled"
  | "error";

export const ACTIVE_STATUSES: ScanStatus[] = [
  "listing",
  "filtering",
  "awaiting_confirmation",
  "processing",
];
/** Estados que avançam sozinhos (sem esperar o dono). */
export const RUNNING_STATUSES: ScanStatus[] = ["listing", "filtering", "processing"];

export interface ScanRow {
  id: string;
  user_id: string;
  /** full: varredura histórica (pede confirmação); sync: e-mails novos (leitura automática ligada). */
  kind?: "full" | "sync";
  status: ScanStatus;
  query_index: number;
  page_token: string | null;
  last_error: string | null;
  created_at: string;
  confirmed_at: string | null;
  finished_at: string | null;
}

const SCAN_COLS =
  "id, user_id, kind, status, query_index, page_token, last_error, created_at, confirmed_at, finished_at";
/** Mensagens "processing" paradas há mais que isto voltam para a fila (queda no meio). */
const STALE_PROCESSING_MS = 10 * 60_000;
/** Texto máximo enviado à IA por e-mail (~5 mil tokens). */
const MAX_CHARS = 20_000;

export async function latestScan(admin: SupabaseClient, userId: string): Promise<ScanRow | null> {
  const { data, error } = await admin
    .from("mail_scans")
    .select(SCAN_COLS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`mail_scans: ${error.message}`);
  return (data as ScanRow | null) ?? null;
}

/** Começa uma varredura (uma ativa por usuário; o índice único garante). */
export async function startScan(admin: SupabaseClient, userId: string): Promise<void> {
  const current = await latestScan(admin, userId);
  if (current && ACTIVE_STATUSES.includes(current.status)) return;
  const { error } = await admin.from("mail_scans").insert({ user_id: userId, status: "listing" });
  if (error && !/duplicate key/i.test(error.message))
    throw new Error(`mail_scans: ${error.message}`);
}

async function setScan(admin: SupabaseClient, id: string, patch: Partial<ScanRow>) {
  const { error } = await admin.from("mail_scans").update(patch).eq("id", id);
  if (error) throw new Error(`mail_scans: ${error.message}`);
}

/** Conta mensagens por estado (para a tela e para decidir a próxima etapa). */
export async function scanCounts(admin: SupabaseClient, scanId: string) {
  const { data, error } = await admin.from("mail_messages").select("status").eq("scan_id", scanId);
  if (error) throw new Error(`mail_messages: ${error.message}`);
  const c: Record<string, number> = {};
  for (const r of data ?? []) c[r.status as string] = (c[r.status as string] ?? 0) + 1;
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  return { total, ...c } as { total: number } & Record<string, number>;
}

async function accessToken(admin: SupabaseClient, userId: string, f: typeof fetch) {
  const client = googleClient();
  if (!client) throw new Error("Cliente OAuth do Google não configurado.");
  const refresh = await getDecryptedKeyWith(admin, userId, "gmail");
  if (!refresh) throw new OAuthError("invalid_grant", "Gmail não conectado.");
  try {
    return (await refreshAccessToken(client, refresh, f)).accessToken;
  } catch (e) {
    if (e instanceof OAuthError && e.revoked) {
      await admin
        .from("mail_accounts")
        .update({ status: "expired", last_error: e.message.slice(0, 300) })
        .eq("user_id", userId);
    }
    throw e;
  }
}

/**
 * Avança a varredura até `deadline` (epoch ms). Devolve o estado ao final.
 * Etapas idempotentes: pode ser chamada em paralelo pela tela e pelo agendador
 * (cada mensagem é reservada antes da extração, para não pagar duas vezes).
 */
export async function advanceScan(
  admin: SupabaseClient,
  scan: ScanRow,
  deadline: number,
  f: typeof fetch = fetch,
  clock: () => number = Date.now,
): Promise<ScanStatus> {
  if (!RUNNING_STATUSES.includes(scan.status)) return scan.status;
  let token: string;
  try {
    token = await accessToken(admin, scan.user_id, f);
  } catch (e) {
    await setScan(admin, scan.id, {
      status: "error",
      last_error: (e as Error).message.slice(0, 300),
    });
    return "error";
  }
  let status = scan.status;
  let queryIndex = scan.query_index;
  let pageToken = scan.page_token;

  while (clock() < deadline) {
    // Relê o estado a cada passo: "Cancelar" na tela (ou outra chamada) vale na hora.
    const fresh = await admin.from("mail_scans").select("status").eq("id", scan.id).maybeSingle();
    if (fresh.data && fresh.data.status !== status) return fresh.data.status as ScanStatus;
    if (status === "listing") {
      const queries = scanQueries();
      const page = await listMessageIds(token, queries[queryIndex], pageToken, f);
      if (page.ids.length) {
        // Mensagens já vistas numa varredura anterior ficam como estão (não reprocessa).
        const { error } = await admin.from("mail_messages").upsert(
          page.ids.map((id) => ({
            user_id: scan.user_id,
            scan_id: scan.id,
            provider_message_id: id,
            status: "listed",
          })),
          { onConflict: "user_id,provider_message_id", ignoreDuplicates: true },
        );
        if (error) throw new Error(`mail_messages: ${error.message}`);
      }
      pageToken = page.nextPageToken;
      if (!pageToken) queryIndex++;
      if (queryIndex >= queries.length) status = "filtering";
      await setScan(admin, scan.id, { status, query_index: queryIndex, page_token: pageToken });
      continue;
    }

    if (status === "filtering") {
      const { data, error } = await admin
        .from("mail_messages")
        .select("id, provider_message_id")
        .eq("scan_id", scan.id)
        .eq("status", "listed")
        .limit(25);
      if (error) throw new Error(`mail_messages: ${error.message}`);
      if (!data?.length) {
        const counts = await scanCounts(admin, scan.id);
        // Sincronização: o dono já autorizou a leitura automática; varredura cheia pede confirmação.
        status =
          (counts.candidate ?? 0) === 0
            ? "review"
            : scan.kind === "sync"
              ? "processing"
              : "awaiting_confirmation";
        await setScan(admin, scan.id, {
          status,
          ...(status === "review" ? { finished_at: new Date().toISOString() } : {}),
        });
        if (status !== "processing") return status;
        continue;
      }
      for (const m of data) {
        if (clock() >= deadline) break;
        const meta = await getMeta(token, m.provider_message_id as string, f);
        await admin
          .from("mail_messages")
          .update({
            status: headerDecision(meta) === "candidate" ? "candidate" : "skipped",
            received_at: meta.receivedAt,
            sender_domain: senderDomain(meta.from).slice(0, 255) || null,
            class: classify(meta.subject, ""),
          })
          .eq("id", m.id);
      }
      continue;
    }

    if (status === "processing") {
      const apiKey = await getDecryptedKeyWith(admin, scan.user_id, "anthropic").catch(() => null);
      if (!apiKey) {
        await setScan(admin, scan.id, {
          status: "error",
          last_error: "Falta a chave da Anthropic em Integrações.",
        });
        return "error";
      }
      // Reservas antigas (queda no meio) voltam para a fila.
      await admin
        .from("mail_messages")
        .update({ status: "candidate" })
        .eq("scan_id", scan.id)
        .eq("status", "processing")
        .lt("updated_at", new Date(clock() - STALE_PROCESSING_MS).toISOString());

      const { data: next, error } = await admin
        .from("mail_messages")
        .select("id, provider_message_id, received_at")
        .eq("scan_id", scan.id)
        .eq("status", "candidate")
        .order("received_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(`mail_messages: ${error.message}`);
      const m = next?.[0];
      if (!m) {
        const counts = await scanCounts(admin, scan.id);
        if ((counts.processing ?? 0) > 0) return status; // outra chamada está terminando
        await setScan(admin, scan.id, { status: "review", finished_at: new Date().toISOString() });
        return "review";
      }
      // Reserva: só quem mudar candidate → processing extrai (não paga duas vezes).
      const claimed = await admin
        .from("mail_messages")
        .update({ status: "processing" })
        .eq("id", m.id)
        .eq("status", "candidate")
        .select("id");
      if (!claimed.data?.length) continue;
      if ((await processMessage(admin, scan, m, token, apiKey, f)) === "stop") return "error";
      continue;
    }
    break;
  }
  return status;
}

async function processMessage(
  admin: SupabaseClient,
  scan: ScanRow,
  m: { id: string; provider_message_id: string; received_at: string | null },
  token: string,
  apiKey: string,
  f: typeof fetch,
): Promise<"ok" | "stop"> {
  const done = (patch: Record<string, unknown>) =>
    admin.from("mail_messages").update(patch).eq("id", m.id);
  try {
    const { meta, text } = await getBody(token, m.provider_message_id, f);
    if (bodyDecision(text) === "skip") {
      await done({ status: "not_booking" });
      return "ok";
    }
    const receivedOn = (meta.receivedAt || m.received_at || "").slice(0, 10) || undefined;
    const r = await extractBookings(
      apiKey,
      {
        kind: "text",
        text: `Assunto: ${meta.subject}\nDe: ${meta.from}\n\n${text}`.slice(0, MAX_CHARS),
      },
      { allowEmpty: true, receivedOn },
    );
    if (!r.ok) {
      await done({ status: "error", error: r.error.slice(0, 300) });
      // Chave recusada ou sem crédito: para a varredura em vez de errar cada e-mail.
      if (/chave|créditos/i.test(r.error)) {
        await setScan(admin, scan.id, { status: "error", last_error: r.error.slice(0, 300) });
        return "stop";
      }
      return "ok";
    }
    const bookings = r.data.bookings.filter((b) => b.flights.length > 0);
    if (!bookings.length) {
      await done({ status: "not_booking", class: classify(meta.subject, text) });
      return "ok";
    }
    const { error } = await admin.from("import_candidates").insert(
      bookings.map((b) => ({
        user_id: scan.user_id,
        message_id: m.id,
        received_at: meta.receivedAt || m.received_at,
        draft: draftFromExtraction(b, "email", receivedOn),
      })),
    );
    if (error) throw new Error(`import_candidates: ${error.message}`);
    await done({ status: "extracted", class: classify(meta.subject, text) });
    return "ok";
  } catch (e) {
    await done({ status: "error", error: (e as Error).message.slice(0, 300) });
    return "ok";
  }
}

/** Agendador: avança as varreduras em andamento de todos, dentro do prazo. */
export async function advanceRunningScans(
  admin: SupabaseClient,
  deadline: number,
  f: typeof fetch = fetch,
): Promise<{ advanced: number }> {
  const { data, error } = await admin
    .from("mail_scans")
    .select(SCAN_COLS)
    .in("status", RUNNING_STATUSES)
    .order("updated_at")
    .limit(5);
  if (error) throw new Error(`mail_scans: ${error.message}`);
  let advanced = 0;
  for (const s of (data ?? []) as ScanRow[]) {
    if (Date.now() >= deadline) break;
    try {
      await advanceScan(admin, s, deadline, f);
      advanced++;
    } catch {
      // Erro de uma varredura não para as outras; tenta de novo no próximo tick.
    }
  }
  return { advanced };
}

/** Intervalo da sincronização contínua. */
export const SYNC_EVERY_MINUTES = 30;

/**
 * Sincronização contínua (agendador): para cada conta com a leitura automática
 * ligada, lê o histórico desde o último `history_id` e põe os e-mails novos numa
 * varredura do tipo "sync" (mesmo pré-filtro e extração, sem pedir confirmação).
 * Histórico expirado (404): refaz a busca dos últimos 30 dias.
 */
export async function syncAccounts(
  admin: SupabaseClient,
  now: string,
  deadline: number,
  f: typeof fetch = fetch,
  clock: () => number = Date.now,
): Promise<{ synced: number; found: number }> {
  if (!googleClient()) return { synced: 0, found: 0 };
  const cutoff = new Date(Date.parse(now) - SYNC_EVERY_MINUTES * 60_000).toISOString();
  const { data, error } = await admin
    .from("mail_accounts")
    .select("user_id, history_id, last_sync_at")
    .eq("status", "active")
    .eq("auto_sync", true)
    .order("last_sync_at", { ascending: true })
    .limit(5);
  if (error) throw new Error(`mail_accounts: ${error.message}`);
  let synced = 0;
  let found = 0;
  for (const acc of data ?? []) {
    if (clock() >= deadline) break;
    if (acc.last_sync_at && (acc.last_sync_at as string) > cutoff) continue;
    const userId = acc.user_id as string;
    const current = await latestScan(admin, userId);
    if (current && ACTIVE_STATUSES.includes(current.status)) continue; // varredura em andamento
    try {
      const token = await accessToken(admin, userId, f);
      const ids = new Set<string>();
      let historyId = (acc.history_id as string | null) ?? null;
      try {
        if (!historyId) throw new GmailError(404, "sem history_id");
        let page: string | null = null;
        let pages = 0;
        do {
          const r = await listHistory(token, historyId, page, f);
          r.ids.forEach((id) => ids.add(id));
          page = r.nextPageToken;
          if (r.historyId) historyId = r.historyId;
        } while (page && ++pages < 5);
      } catch (e) {
        if (!(e instanceof GmailError) || e.status !== 404) throw e;
        for (const q of recentQueries()) {
          (await listMessageIds(token, q, null, f)).ids.forEach((id) => ids.add(id));
        }
      }
      // Só o que ainda não foi visto (varreduras anteriores) entra na fila.
      const fresh = await unseen(admin, userId, [...ids]);
      if (fresh.length) {
        const { data: scan, error: e1 } = await admin
          .from("mail_scans")
          .insert({ user_id: userId, kind: "sync", status: "filtering" })
          .select("id")
          .single();
        if (e1 || !scan) throw new Error(`mail_scans: ${e1?.message}`);
        const { error: e2 } = await admin.from("mail_messages").upsert(
          fresh.map((id) => ({
            user_id: userId,
            scan_id: scan.id,
            provider_message_id: id,
            status: "listed",
          })),
          { onConflict: "user_id,provider_message_id", ignoreDuplicates: true },
        );
        if (e2) throw new Error(`mail_messages: ${e2.message}`);
        found += fresh.length;
      }
      await admin
        .from("mail_accounts")
        .update({
          last_sync_at: now,
          ...(historyId ? { history_id: historyId } : {}),
          last_error: null,
        })
        .eq("user_id", userId);
      synced++;
    } catch (e) {
      await admin
        .from("mail_accounts")
        .update({ last_sync_at: now, last_error: (e as Error).message.slice(0, 300) })
        .eq("user_id", userId);
    }
  }
  return { synced, found };
}

async function unseen(admin: SupabaseClient, userId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const seen = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin
      .from("mail_messages")
      .select("provider_message_id")
      .eq("user_id", userId)
      .in("provider_message_id", ids.slice(i, i + 200));
    if (error) throw new Error(`mail_messages: ${error.message}`);
    for (const r of data ?? []) seen.add(r.provider_message_id as string);
  }
  return ids.filter((id) => !seen.has(id));
}

/** Aviso "Passagens novas no Gmail" (um por sincronização que achou algo). */
export function syncFoundEvent(scanId: string, count: number) {
  return {
    key: `mail-sync:${scanId}`,
    title: "Passagens novas no Gmail",
    body: `Encontramos ${count} passagem(ns) nova(s) no seu e-mail. Confira e importe.`,
    path: "/app/passagens/importar",
    urgent: false,
  };
}
