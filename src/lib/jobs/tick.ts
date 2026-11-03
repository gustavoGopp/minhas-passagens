import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { holidaysAround, overridesFromRows } from "@/lib/holidays";
import { listDecryptedKeys } from "@/lib/integrations/repo";
import { gmailHealth } from "@/lib/mail/accounts";
import { advanceRunningScans } from "@/lib/mail/scan";
import { gmailExpiredEvent } from "@/lib/mail/status";
import { getConfig, setConfig } from "@/lib/notify/config";
import { outcomeOf, retryDecision, type AttemptState, type Channel } from "@/lib/notify/delivery";
import { deliver, loadChannelConfig, type Recipient } from "@/lib/notify/dispatch";
import { dueEvents, isQuietHours, type NotifyEvent } from "@/lib/notify/events";
import { holidayEvents, type HolidayMonitor } from "@/lib/notify/holiday-events";
import {
  markPriceAlertsFailed,
  markPriceAlertsSent,
  pendingPriceEvents,
  MONITORS_PER_TICK,
  runDueMonitors,
} from "@/lib/prices/jobs";
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
  /** Avisos cujos canais falharam (serão tentados de novo). */
  failed: number;
  /** Usuários pulados por erro neste tick (os demais seguem). */
  userErrors: number;
  prices:
    | { checked: number; failed: number; skipped: number; sent: number; deferred: number }
    | { error: string };
  retention: { observations: number; checks: number } | { error: string } | null;
  /** Varreduras do Gmail avançadas neste tick (com o tempo que sobrou). */
  mailScans: { advanced: number } | { error: string };
  /** Renovação diária do acesso ao Gmail (null se não há cliente OAuth configurado). */
  gmail: { checked: number; expired: number; failed: number } | { error: string } | null;
  at: string;
}

/**
 * Um ciclo do agendador: avisos de passagens e feriados, checagens de preço
 * vencidas, avisos de preço e a limpeza diária. `recordTick` grava o horário em
 * app_config (o vigia diário roda sem gravar, para não esconder o pg_cron parado).
 */
/** Tempo do tick para começar checagens de preço (a função da Vercel tem 60 s). */
export const TICK_BUDGET_MS = 35_000;
/** Até quando o tick avança varreduras do Gmail (sobra folga para responder). */
export const MAIL_BUDGET_MS = 48_000;

export async function runTick(
  opts: { now?: string; recordTick?: boolean } = {},
): Promise<TickResult> {
  const startedAt = Date.now();
  const admin = createSupabaseAdminClient();
  const now = opts.now ?? new Date().toISOString();
  if (opts.recordTick !== false) await setConfig({ last_tick_at: now });

  // Antes de ler os perfis: assim um acesso que acabou de expirar já gera o aviso neste tick.
  const gmail: TickResult["gmail"] = await gmailHealth(admin, now).catch((e: Error) => ({
    error: e.message,
  }));

  const today = now.slice(0, 10);
  const since = new Date(Date.parse(now) - 2 * 86_400_000).toISOString();

  const [profiles, links, subs, flights, credits, monitors, overrides, mail] = await Promise.all([
    admin.from("profiles").select("*"),
    admin.from("telegram_links").select("user_id, chat_id").not("chat_id", "is", null),
    admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth"),
    admin
      .from("flights")
      .select(
        "id, user_id, booking_id, airline, flight_number, origin, destination, departs_at, arrives_at, passenger, checkin_done, ignore_missing_leg, ignore_missing_return",
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
    admin.from("mail_accounts").select("user_id, status, connected_at").eq("status", "expired"),
  ]);
  // mail_accounts fica de fora: se a tabela ainda não existir (deploy antes da migração),
  // o tick segue sem o aviso do Gmail.
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
  const expiredMailBy = new Map(
    (mail.error ? [] : (mail.data ?? [])).map((m) => [
      m.user_id as string,
      { connected_at: m.connected_at as string },
    ]),
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

  let failed = 0;
  let userErrors = 0;
  for (const p of profileRows) {
    // Cada usuário é isolado: um perfil com dado inválido ou um canal fora do ar
    // não impede os avisos dos demais.
    try {
      const userId = p.id;
      const tz = p.timezone || "America/Sao_Paulo";
      const userFlights = flightsBy.get(userId) ?? [];
      const userBookings = bookingsBy.get(userId) ?? [];
      const events: NotifyEvent[] = dueEvents({
        bookings: userBookings,
        flights: userFlights,
        credits: creditsBy.get(userId) ?? [],
        now,
        homeCity: p.home_city ?? null,
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
      const expiredMail = expiredMailBy.get(userId);
      if (expiredMail) events.push(gmailExpiredEvent(expiredMail, now));
      if (!events.length) continue;
      const r = await deliverNew(admin, userId, events, quietFor(p), recipientFor(p), cfg, now);
      sent += r.sent;
      deferred += r.deferred;
      failed += r.failed;
    } catch {
      userErrors++;
    }
  }

  // Monitor de preços: primeiro os avisos pendentes e a limpeza diária (rápidos),
  // depois as checagens vencidas, dentro do orçamento de tempo. Falhas aqui não
  // derrubam os avisos acima.
  let prices: TickResult["prices"];
  const retention: TickResult["retention"] = await dailyRetention(admin, now);
  try {
    let priceSent = 0;
    let priceDeferred = 0;
    const pending = await pendingPriceEvents(
      admin,
      now,
      (id) => profileBy.get(id)?.timezone ?? "America/Sao_Paulo",
    );
    for (const pe of pending) {
      try {
        const p = profileBy.get(pe.userId);
        if (pe.expired || !p) {
          await markPriceAlertsSent(admin, pe.alertIds, [], now);
          continue;
        }
        if (retryDecision(pe.attempt, now) !== "attempt") continue;
        if (quietFor(p)) {
          priceDeferred++;
          continue;
        }
        const outcome = outcomeOf(await deliver(recipientFor(p), pe.event, cfg));
        if (outcome.kind === "sent") {
          await markPriceAlertsSent(admin, pe.alertIds, outcome.channels, now);
          await recordAttempt(
            admin,
            pe.userId,
            pe.event,
            { status: "sent", channels: outcome.channels },
            1,
            now,
          );
          priceSent++;
        } else if (outcome.kind === "no_channel") {
          // Preço é perecível: sem canal, o aviso é resolvido (fica a marca "sem canal").
          await markPriceAlertsFailed(admin, pe.alertIds, pe.attempt, "sem canal", now, true);
        } else {
          await markPriceAlertsFailed(admin, pe.alertIds, pe.attempt, outcome.error, now, false);
          failed++;
        }
      } catch {
        userErrors++;
      }
    }
    const run = await runDueMonitors(admin, now, MONITORS_PER_TICK, startedAt + TICK_BUDGET_MS);
    prices = { ...run, sent: priceSent, deferred: priceDeferred };
  } catch (e) {
    prices = { error: (e as Error).message };
  }

  const mailScans: TickResult["mailScans"] = await advanceRunningScans(
    admin,
    startedAt + MAIL_BUDGET_MS,
  ).catch((e: Error) => ({ error: e.message }));

  return {
    ok: true,
    sent,
    deferred,
    failed,
    userErrors,
    prices,
    retention,
    mailScans,
    gmail,
    at: now,
  };
}

type Attempt = { status: "sent"; channels: Channel[] } | { status: "failed"; error: string };

/** Registra a tentativa em notification_log (um registro por evento, atualizado a cada tentativa). */
async function recordAttempt(
  admin: SupabaseClient,
  userId: string,
  e: NotifyEvent,
  a: Attempt,
  attempts: number,
  now: string,
) {
  const { error } = await admin.from("notification_log").upsert(
    {
      user_id: userId,
      event_key: e.key,
      title: e.title,
      channels: a.status === "sent" ? a.channels : [],
      status: a.status,
      attempts,
      last_error: a.status === "failed" ? a.error : null,
      last_attempt_at: now,
      sent_at: now,
    },
    { onConflict: "user_id,event_key" },
  );
  // Sem registro, o aviso sairia de novo no próximo tick: melhor falhar alto.
  if (error) throw new Error(`notification_log: ${error.message}`);
}

/**
 * Envia os avisos ainda não entregues (um por evento). Só registra como enviado
 * se algum canal funcionou; sem canal configurado não registra nada (o aviso sai
 * quando houver canal, se ainda valer); com falha, tenta de novo com espera crescente.
 */
async function deliverNew(
  admin: SupabaseClient,
  userId: string,
  events: NotifyEvent[],
  quiet: boolean,
  recipient: Recipient,
  cfg: Awaited<ReturnType<typeof loadChannelConfig>>,
  now: string,
) {
  const { data: logged, error } = await admin
    .from("notification_log")
    .select("event_key, status, attempts, last_attempt_at")
    .eq("user_id", userId)
    .in(
      "event_key",
      events.map((e) => e.key),
    );
  // Sem saber o que já foi enviado, não envia nada (evita repetir tudo).
  if (error) throw new Error(`notification_log: ${error.message}`);
  const prev = new Map(
    (logged ?? []).map((l) => [
      l.event_key as string,
      {
        status: l.status as AttemptState["status"],
        attempts: Number(l.attempts),
        last_attempt_at: (l.last_attempt_at as string | null) ?? null,
      },
    ]),
  );
  let sent = 0;
  let deferred = 0;
  let failed = 0;
  const seen = new Set<string>();
  for (const e of events) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    const before = prev.get(e.key);
    if (retryDecision(before, now) !== "attempt") continue;
    if (quiet && !e.urgent) {
      deferred++;
      continue; // tenta de novo depois da janela silenciosa
    }
    const outcome = outcomeOf(await deliver(recipient, e, cfg));
    if (outcome.kind === "no_channel") continue;
    const attempts = (before?.attempts ?? 0) + 1;
    if (outcome.kind === "sent") {
      await recordAttempt(
        admin,
        userId,
        e,
        { status: "sent", channels: outcome.channels },
        attempts,
        now,
      );
      sent++;
    } else {
      await recordAttempt(
        admin,
        userId,
        e,
        { status: "failed", error: outcome.error },
        attempts,
        now,
      );
      failed++;
    }
  }
  return { sent, deferred, failed };
}

/**
 * Uma vez por dia (UTC): apaga observações > 180 dias e checagens > 365 dias,
 * e pausa monitores de feriadão que já passou.
 */
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
    // Monitores de feriadão já passado ficam pausados (sem datas a checar).
    await admin
      .from("price_monitors")
      .update({ active: false, next_check_at: null })
      .eq("active", true)
      .lt("long_weekend", new Date(Date.parse(now) - 10 * 86_400_000).toISOString().slice(0, 10));
    // Candidatos da importação do Gmail: apagados 30 dias depois da decisão.
    await admin
      .from("import_candidates")
      .delete()
      .neq("status", "pending")
      .lt("decided_at", new Date(Date.parse(now) - 30 * 86_400_000).toISOString());
    return { observations: obs.count ?? 0, checks: checks.count ?? 0 };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
