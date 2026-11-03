import { NextResponse, type NextRequest } from "next/server";
import {
  ALERT_EVERY_HOURS,
  intervalElapsed,
  isTickStale,
  minutesSince,
  RECONCILE_EVERY_MINUTES,
  staleTickEmail,
} from "@/lib/jobs/health";
import { runTick } from "@/lib/jobs/tick";
import { getDecryptedKeyWith } from "@/lib/integrations/repo";
import { sendEmailDetailed } from "@/lib/notify/email";
import { getConfig, safeEqual, setConfig } from "@/lib/notify/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * Vigia diário (Vercel Cron, independente do pg_cron). Se o último tick tiver
 * mais de 30 minutos: roda um tick de reconciliação (no máximo 1 por hora) e
 * manda e-mail ao dono da instância com a chave Resend dele (no máximo 1 a cada 20 h).
 * Com CRON_SECRET definido na Vercel, só aceita a chamada do cron.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && !safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const cfg = await getConfig(["last_tick_at", "watchdog_alert_at", "watchdog_run_at", "app_url"]);
  const minutes = minutesSince(cfg.last_tick_at, now);
  if (!isTickStale(cfg.last_tick_at, now)) {
    return NextResponse.json({ ok: true, stale: false, minutes });
  }

  let reconciled = false;
  if (intervalElapsed(cfg.watchdog_run_at, now, RECONCILE_EVERY_MINUTES)) {
    await setConfig({ watchdog_run_at: now });
    try {
      await runTick({ now, recordTick: false });
      reconciled = true;
    } catch {
      // segue para o alerta
    }
  }

  let emailed = false;
  if (intervalElapsed(cfg.watchdog_alert_at, now, ALERT_EVERY_HOURS * 60)) {
    const admin = createSupabaseAdminClient();
    // Dono da instância: o usuário mais antigo (mesma regra da semente da ponte aérea).
    const { data: owner } = await admin
      .from("profiles")
      .select("id, email")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (owner?.email) {
      const key = await getDecryptedKeyWith(admin, owner.id as string, "resend").catch(() => null);
      const appUrl = (cfg.app_url ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
      const mail = staleTickEmail(cfg.last_tick_at ?? null, now, appUrl);
      const res = await sendEmailDetailed(owner.email as string, mail.subject, mail.text, key);
      emailed = res.ok;
      if (emailed) await setConfig({ watchdog_alert_at: now });
    }
  }

  return NextResponse.json({ ok: true, stale: true, minutes, reconciled, emailed });
}
