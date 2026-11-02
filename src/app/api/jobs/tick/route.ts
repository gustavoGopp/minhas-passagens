import { NextResponse, type NextRequest } from "next/server";
import { getConfig, safeEqual } from "@/lib/notify/config";
import { deliver, loadChannelConfig, type Recipient } from "@/lib/notify/dispatch";
import { dueEvents, isQuietHours } from "@/lib/notify/events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BookingRow, FlightRow } from "@/lib/trips/draft";
import type { CreditRow } from "@/lib/trips/rules";
import { markPriceAlertsSent, pendingPriceEvents, runDueMonitors } from "@/lib/prices/jobs";

export const maxDuration = 60;

/**
 * Chamado pelo pg_cron do Supabase a cada 5 minutos (Authorization: Bearer <jobs_secret>).
 * Calcula os avisos devidos de cada usuário e envia os que ainda não foram enviados;
 * roda as checagens de preço vencidas (em lote) e envia os avisos de preço pendentes.
 */
export async function POST(request: NextRequest) {
  const { jobs_secret } = await getConfig(["jobs_secret"]);
  const auth = request.headers.get("authorization") ?? "";
  if (!jobs_secret || !safeEqual(auth, `Bearer ${jobs_secret}`)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString();

  const [profiles, links, subs, flights, credits] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id, email, timezone, quiet_hours_start, quiet_hours_end, notify_telegram, notify_push, notify_email",
      ),
    admin.from("telegram_links").select("user_id, chat_id").not("chat_id", "is", null),
    admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth"),
    admin
      .from("flights")
      .select(
        "id, user_id, booking_id, airline, flight_number, origin, destination, departs_at, arrives_at, passenger, checkin_done, ignore_missing_leg",
      )
      .gte("departs_at", since),
    admin
      .from("refunds_credits")
      .select(
        "id, user_id, booking_id, kind, provider, amount_cents, remaining_cents, currency, issued_on, expires_on, notes",
      )
      .eq("kind", "credit")
      .gte("expires_on", today),
  ]);
  for (const r of [profiles, links, subs, flights, credits]) {
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  }

  const bookingIds = [...new Set((flights.data ?? []).map((f) => f.booking_id as string))];
  const bookingsRes = bookingIds.length
    ? await admin
        .from("bookings")
        .select(
          "id, user_id, locator, airline, seller, channel, amount_cents, currency, miles, taxes_cents, purchased_on, tag, status, source, notes",
        )
        .in("id", bookingIds)
    : { data: [], error: null };
  if (bookingsRes.error)
    return NextResponse.json({ error: bookingsRes.error.message }, { status: 500 });

  const group = <T extends { user_id: string }>(rows: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const r of rows ?? []) m.set(r.user_id, [...(m.get(r.user_id) ?? []), r]);
    return m;
  };
  const flightsBy = group(flights.data as (FlightRow & { user_id: string })[]);
  const bookingsBy = group(bookingsRes.data as (BookingRow & { user_id: string })[]);
  const creditsBy = group(credits.data as (CreditRow & { user_id: string })[]);
  const subsBy = group(
    subs.data as { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }[],
  );
  const chatBy = new Map((links.data ?? []).map((l) => [l.user_id as string, Number(l.chat_id)]));

  const cfg = await loadChannelConfig();
  let sent = 0;
  let deferred = 0;

  type ProfileRow = NonNullable<typeof profiles.data>[number];
  const profileBy = new Map((profiles.data ?? []).map((p) => [p.id as string, p]));
  const quietFor = (p: ProfileRow) =>
    isQuietHours(
      now,
      p.timezone as string,
      p.quiet_hours_start as string,
      p.quiet_hours_end as string,
    );
  const recipientFor = (p: ProfileRow): Recipient => {
    const userId = p.id as string;
    return {
      userId,
      email: (p.email as string | null) ?? null,
      notifyTelegram: Boolean(p.notify_telegram),
      notifyPush: Boolean(p.notify_push),
      notifyEmail: Boolean(p.notify_email),
      telegramChatId: chatBy.get(userId) ?? null,
      pushSubs: subsBy.get(userId) ?? [],
    };
  };

  for (const p of profiles.data ?? []) {
    const userId = p.id as string;
    const events = dueEvents({
      bookings: bookingsBy.get(userId) ?? [],
      flights: flightsBy.get(userId) ?? [],
      credits: creditsBy.get(userId) ?? [],
      now,
    });
    if (!events.length) continue;

    const { data: logged } = await admin
      .from("notification_log")
      .select("event_key")
      .eq("user_id", userId)
      .in(
        "event_key",
        events.map((e) => e.key),
      );
    const done = new Set((logged ?? []).map((l) => l.event_key as string));
    const quiet = quietFor(p);
    const recipient = recipientFor(p);

    for (const e of events) {
      if (done.has(e.key)) continue;
      if (quiet && !e.urgent) {
        deferred++;
        continue; // tenta de novo depois da janela silenciosa
      }
      const channels = await deliver(recipient, e, cfg);
      // Registra mesmo sem canal configurado, para não acumular avisos antigos.
      await admin
        .from("notification_log")
        .upsert(
          { user_id: userId, event_key: e.key, title: e.title, channels },
          { onConflict: "user_id,event_key", ignoreDuplicates: true },
        );
      sent++;
    }
  }

  // Monitor de preços: checagens vencidas e avisos pendentes. Falhas aqui não
  // derrubam os avisos acima.
  let prices:
    { checked: number; failed: number; sent: number; deferred: number } | { error: string };
  try {
    const run = await runDueMonitors(admin, now);
    let priceSent = 0;
    let priceDeferred = 0;
    const pending = await pendingPriceEvents(
      admin,
      now,
      (id) => (profileBy.get(id)?.timezone as string | undefined) ?? "America/Sao_Paulo",
    );
    for (const pe of pending) {
      const p = profileBy.get(pe.userId);
      if (pe.expired || !p) {
        await markPriceAlertsSent(admin, pe.alertIds, [], now);
        continue;
      }
      if (quietFor(p)) {
        priceDeferred++;
        continue;
      }
      const channels = await deliver(recipientFor(p), pe.event, cfg);
      await markPriceAlertsSent(admin, pe.alertIds, channels, now);
      await admin
        .from("notification_log")
        .upsert(
          { user_id: pe.userId, event_key: pe.event.key, title: pe.event.title, channels },
          { onConflict: "user_id,event_key", ignoreDuplicates: true },
        );
      priceSent++;
    }
    prices = { ...run, sent: priceSent, deferred: priceDeferred };
  } catch (e) {
    prices = { error: (e as Error).message };
  }

  return NextResponse.json({ ok: true, sent, deferred, prices, at: now });
}
