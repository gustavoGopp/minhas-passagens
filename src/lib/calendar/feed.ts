/**
 * Link secreto do calendário assinado. O banco guarda só o sha256 do token; o
 * link aparece uma vez, logo depois de gerado. Trocar o link sobrescreve o hash,
 * então o antigo para de funcionar na hora. Recebe o cliente do Supabase (service
 * role) para ser testável com o Supabase falso.
 */
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCalendar, FEED_PAST_DAYS, type FeedBooking, type FeedFlight } from "./ics";

/** Token: 32 bytes aleatórios em base64url (43 caracteres). */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/** Grava a última leitura no máximo uma vez por hora (o calendário relê sozinho). */
export const FETCH_MARK_MINUTES = 60;

export function newFeedToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashFeedToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Aceita "<token>" ou "<token>.ics"; devolve null se o formato não bate. */
export function parseFeedParam(param: string): string | null {
  const token = param.endsWith(".ics") ? param.slice(0, -4) : param;
  return TOKEN_RE.test(token) ? token : null;
}

export function feedUrl(origin: string, token: string): string {
  return `${origin}/api/calendario/${token}.ics`;
}

/** Cria ou troca o link do usuário. Devolve o token (a única vez que ele existe em claro). */
export async function generateFeed(admin: SupabaseClient, userId: string, now: string) {
  const token = newFeedToken();
  const { error } = await admin
    .from("calendar_feeds")
    .upsert(
      { user_id: userId, token_hash: hashFeedToken(token), created_at: now, last_fetched_at: null },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(`calendar_feeds: ${error.message}`);
  return token;
}

export async function revokeFeed(admin: SupabaseClient, userId: string) {
  const { error } = await admin.from("calendar_feeds").delete().eq("user_id", userId);
  if (error) throw new Error(`calendar_feeds: ${error.message}`);
}

export type FeedResult = { status: 200; body: string } | { status: 404 };

/** Monta o calendário de quem tem o token. Token desconhecido: 404, sem distinguir o motivo. */
export async function loadFeed(
  admin: SupabaseClient,
  param: string,
  appUrl: string,
  now: string,
): Promise<FeedResult> {
  const token = parseFeedParam(param);
  if (!token) return { status: 404 };
  const { data: feed, error } = await admin
    .from("calendar_feeds")
    .select("user_id, last_fetched_at")
    .eq("token_hash", hashFeedToken(token))
    .maybeSingle();
  if (error) throw new Error(`calendar_feeds: ${error.message}`);
  if (!feed) return { status: 404 };
  const userId = feed.user_id as string;

  const since = new Date(Date.parse(now) - (FEED_PAST_DAYS + 1) * 86_400_000).toISOString();
  const [bookingsRes, flightsRes] = await Promise.all([
    admin.from("bookings").select("id, locator, status").eq("user_id", userId),
    admin
      .from("flights")
      .select(
        "id, booking_id, airline, flight_number, origin, destination, departs_at, arrives_at, updated_at",
      )
      .eq("user_id", userId)
      .gte("departs_at", since)
      .order("departs_at"),
  ]);
  if (bookingsRes.error) throw new Error(`bookings: ${bookingsRes.error.message}`);
  if (flightsRes.error) throw new Error(`flights: ${flightsRes.error.message}`);

  const last = feed.last_fetched_at as string | null;
  if (!last || Date.parse(now) - Date.parse(last) >= FETCH_MARK_MINUTES * 60_000) {
    // Só informativo ("última leitura pelo calendário"); falha aqui não derruba a resposta.
    await admin
      .from("calendar_feeds")
      .update({ last_fetched_at: now })
      .eq("user_id", userId)
      .then(
        () => undefined,
        () => undefined,
      );
  }

  return {
    status: 200,
    body: buildCalendar({
      flights: (flightsRes.data ?? []) as FeedFlight[],
      bookings: (bookingsRes.data ?? []) as FeedBooking[],
      appUrl,
      now,
    }),
  };
}
