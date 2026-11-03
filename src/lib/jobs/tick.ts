import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { holidaysAround, overridesFromRows } from "@/lib/holidays";
import { listDecryptedKeys } from "@/lib/integrations/repo";
import { getConfig, setConfig } from "@/lib/notify/config";
import { deliver, loadChannelConfig, type Recipient } from "@/lib/notify/dispatch";
import { dueEvents, isQuietHours, type NotifyEvent } from "@/lib/notify/events";
import { holidayEvents, type HolidayMonitor } from "@/lib/notify/holiday-events";
import { markPriceAlertsSent, pendingPriceEvents, runDueMonitors } from "@/lib/prices/jobs";
import type { MonitorRule } from "@/lib/prices/types";
import { holidayPreferences, type Profile } from "@/lib/profiles/repo";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BookingRow, FlightRow } from "@/lib/trips/draft";
import type { CreditRow } from "@/lib/trips/rules";
import { utcToLocal } from "@/lib/trips/time";
import { dailyDue, retentionCutoffs } from "./health";

export interface TickResult {
  ok: true;
  sent: number;
  deferred: number;
  prices: { checked: number; failed: number; sent: number; deferred: number } | { error: string };
  retention: { observations: number; checks: number } | { error: string } | null;
  at: string;
}

/**
 * Um ciclo do agendador: avisos de passagens e feriados, checagens de preço
 * vencidas, avisos de preço e a limpeza diária. `recordTick` grava o horário em
 * app_config (o vigia diário roda sem gravar, para não esconder o pg_cron parado).
 */
export async function runTick(
  opts: { now?: string; recordTick?: boolean } = {},
): Promise<TickResult> {
  const admin = createSupabaseAdminClient();
  const now = opts.now ?? new Date().toISOString();
  if (opts.recordTick !== false) await setConfig({ last_tick_at: now });

  const today = now.slice(0, 10);
  const since = new Date(Date.parse(now) - 2 * 86_400_000).toISOString();

  const [profiles, links, subs, flights, credits, monitors, overrides] = await Promise.all([
    admin.from("profiles").select("*"),
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
    admin
      .from("price_monitors")
      .select(
        "id, user_id, name, kind, origin, destination, rule, horizon_weeks, active, long_weekend",
      )
      .eq("active", true),
    admin.from("holiday_overrides").select("user_id, action, date, event_key, name, kind"),
  ]);
  for (const r of [profiles, links, subs, flights, credits, monitors, overrides]) {
    if (r.error) throw new Error(r.error.message);
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
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);

  const group = <T extends { user_id: string }>(rows: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const r of rows ?? []) m.set(r.user_id, [...(m.get(r.user_id) ?? []), r]);
    return m;
  };
  const flightsBy = group(flights.data as (FlightRow & { user_id: string })[]);
  const bookingsBy = group(bookingsRes.data as (BookingRow & { user_id: string })[]);
  const creditsBy = group(credits.data as (CreditRow & { user_id: string })[]);
  const monitorsBy = group(
    (monitors.data ?? []).map((m) => ({
      ...(m as unknown as HolidayMonitor & { user_id: string }),
      origin: String(m.origin).trim(),
      destination: String(m.destination).trim(),
      rule: m.rule as MonitorRule,
    })),
  );
  const overridesBy = group(
    overrides.data as {
      user_id: string;
      action: string;
      date: string;
      event_key: string | null;
      name: string | null;
      kind: string | null;
    }[],
  );
  const subsBy = group(
    subs.data as { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }[],
  );
  const chatBy = new Map((links.data ?? []).map((l) => [l.user_id as string, Number(l.chat_id)]));

  const cfg = await loadChannelConfig();
  const resendKeys = await listDecryptedKeys(admin, "resend").catch(
    () => new Map<string, string>(),
  );
  let sent = 0;
  let deferred = 0;

  const profileRows = (profiles.data ?? []) as Profile[];
  const profileBy = new Map(profileRows.map((p) => [p.id, p]));
  const quietFor = (p: Profile) =>
    isQuietHours(now, p.timezone, p.quiet_hours_start, p.quiet_hours_end);
  const recipientFor = (p: Profile): Recipient => {
    const raw = p as Profile & {
      notify_telegram?: boolean;
      notify_push?: boolean;
      notify_email?: boolean;
    };
    return {
      userId: p.id,
      email: p.email ?? null,
      notifyTelegram: Boolean(raw.notify_telegram),
      notifyPush: Boolean(raw.notify_push),
      notifyEmail: Boolean(raw.notify_email),
      telegramChatId: chatBy.get(p.id) ?? null,
      pushSubs: subsBy.get(p.id) ?? [],
      resendKey: resendKeys.get(p.id) ?? null,
    };
  };

  for (const p of profileRows) {
    const userId = p.id;
    const tz = p.timezone || "America/Sao_Paulo";
    const userFlights = flightsBy.get(userId) ?? [];
    const userBookings = bookingsBy.get(userId) ?? [];
    const events: NotifyEvent[] = dueEvents({
      bookings: userBookings,
      flights: userFlights,
      credits: creditsBy.get(userId) ?? [],
      now,
    });
    try {
      const localToday = utcToLocal(now, tz).slice(0, 10);
      events.push(
        ...holidayEvents({
          bookings: userBookings,
          flights: userFlights,
          monitors: monitorsBy.get(userId) ?? [],
          holidays: holidaysAround(
            localToday,
            holidayPreferences(p),
            overridesFromRows(overridesBy.get(userId) ?? []),
          ),
          today: localToday,
          now,
        }),
      );
    } catch {
      // Feriados nunca derrubam os demais avisos.
    }
    if (!events.length) continue;
    const r = await deliverNew(admin, userId, events, quietFor(p), recipientFor(p), cfg);
    sent += r.sent;
    deferred += r.deferred;
  }

  // Monitor de preços: checagens vencidas e avisos pendentes. Falhas aqui não
  // derrubam os avisos acima.
  let prices: TickResult["prices"];
  try {
    const run = await runDueMonitors(admin, now);
    let priceSent = 0;
    let priceDeferred = 0;
    const pending = await pendingPriceEvents(
      admin,
      now,
      (id) => profileBy.get(id)?.timezone ?? "America/Sao_Paulo",
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
      await logSent(admin, pe.userId, pe.event, channels);
      priceSent++;
    }
    prices = { ...run, sent: priceSent, deferred: priceDeferred };
  } catch (e) {
    prices = { error: (e as Error).message };
  }

  return { ok: true, sent, deferred, prices, retention: await dailyRetention(admin, now), at: now };
}

async function logSent(admin: SupabaseClient, userId: string, e: NotifyEvent, channels: string[]) {
  await admin
    .from("notification_log")
    .upsert(
      { user_id: userId, event_key: e.key, title: e.title, channels },
      { onConflict: "user_id,event_key", ignoreDuplicates: true },
    );
}

/** Envia os avisos ainda não registrados em notification_log (um por evento). */
async function deliverNew(
  admin: SupabaseClient,
  userId: string,
  events: NotifyEvent[],
  quiet: boolean,
  recipient: Recipient,
  cfg: Awaited<ReturnType<typeof loadChannelConfig>>,
) {
  const { data: logged } = await admin
    .from("notification_log")
    .select("event_key")
    .eq("user_id", userId)
    .in(
      "event_key",
      events.map((e) => e.key),
    );
  const done = new Set((logged ?? []).map((l) => l.event_key as string));
  let sent = 0;
  let deferred = 0;
  for (const e of events) {
    if (done.has(e.key)) continue;
    done.add(e.key);
    if (quiet && !e.urgent) {
      deferred++;
      continue; // tenta de novo depois da janela silenciosa
    }
    const channels = await deliver(recipient, e, cfg);
    // Registra mesmo sem canal configurado, para não acumular avisos antigos.
    await logSent(admin, userId, e, channels);
    sent++;
  }
  return { sent, deferred };
}

/** Uma vez por dia (UTC): apaga observações > 180 dias e checagens > 365 dias. */
async function dailyRetention(
  admin: SupabaseClient,
  now: string,
): Promise<TickResult["retention"]> {
  try {
    const { retention_last_run } = await getConfig(["retention_last_run"]);
    if (!dailyDue(retention_last_run, now)) return null;
    await setConfig({ retention_last_run: now.slice(0, 10) });
    const cut = retentionCutoffs(now);
    const obs = await admin
      .from("price_observations")
      .delete({ count: "exact" })
      .lt("observed_at", cut.price_observations);
    if (obs.error) throw new Error(obs.error.message);
    const checks = await admin
      .from("price_checks")
      .delete({ count: "exact" })
      .lt("checked_at", cut.price_checks);
    if (checks.error) throw new Error(checks.error.message);
    return { observations: obs.count ?? 0, checks: checks.count ?? 0 };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
