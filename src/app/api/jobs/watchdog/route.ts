import { NextResponse, type NextRequest } from "next/server";
import {
  ALERT_EVERY_HOURS,
  BACKUP_ARTIFACT,
  backupCheck,
  backupCheckOverdue,
  isTickStale,
  minutesSince,
  RECONCILE_EVERY_MINUTES,
  staleBackupEmail,
  staleTickEmail,
  unknownBackupEmail,
} from "@/lib/jobs/health";
import { runTick } from "@/lib/jobs/tick";
import { falhasDesde, registrarFalha } from "@/lib/falhas";
import { resumoDasFalhas } from "@/lib/falhas-resumo";
import { getDecryptedKeyWith } from "@/lib/integrations/repo";
import { sendEmailDetailed } from "@/lib/notify/email";
import { claimInterval, getConfig, safeEqual, setConfig } from "@/lib/notify/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * Vigia diário (Vercel Cron, independente do pg_cron). Se o último tick tiver
 * mais de 30 minutos: roda um tick de reconciliação (no máximo 1 por hora) e
 * manda e-mail ao dono da instância com a chave Resend dele (no máximo 1 a cada 20 h).
 * Também confere a data do último backup no GitHub e avisa se passar de 8 dias,
 * e manda o resumo das falhas do servidor das últimas 24 horas, se houver (P23).
 * Exige CRON_SECRET na Vercel (o cron envia "Authorization: Bearer <CRON_SECRET>"):
 * sem ele, ninguém de fora consegue disparar ticks pelo vigia.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Defina CRON_SECRET nas variáveis da Vercel para ligar o vigia." },
      { status: 503 },
    );
  }
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const cfg = await getConfig(["last_tick_at", "app_url"]);
  const appUrl = (cfg.app_url ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const minutes = minutesSince(cfg.last_tick_at, now);
  if (!isTickStale(cfg.last_tick_at, now)) {
    const backup = await checkBackup(now);
    const falhas = await checkFalhas(now, appUrl);
    return NextResponse.json({ ok: true, stale: false, minutes, backup, falhas });
  }

  let reconciled = false;
  // Reserva atômica: chamadas simultâneas não rodam ticks em paralelo.
  if ((await claimInterval("watchdog_run_at", now, RECONCILE_EVERY_MINUTES)).claimed) {
    try {
      await runTick({ now, recordTick: false });
      reconciled = true;
    } catch (e) {
      // segue para o alerta
      await registrarFalha("vigia:reconciliacao", e);
    }
  }

  const emailed = await alertOwner(
    "watchdog_alert_at",
    now,
    staleTickEmail(cfg.last_tick_at ?? null, now, appUrl),
  );

  // O backup é conferido por último: nada aqui pode atrasar ou derrubar o
  // ciclo de reconciliação e o alerta de agendador parado.
  const backup = await checkBackup(now);
  const falhas = await checkFalhas(now, appUrl);
  return NextResponse.json({ ok: true, stale: true, minutes, reconciled, emailed, backup, falhas });
}

/**
 * Resumo das falhas das últimas 24 horas no e-mail do dono (decisão de 27/11).
 * Sem falha, nada sai. Nunca lança: o resumo não derruba o resto do vigia.
 */
async function checkFalhas(now: string, appUrl: string) {
  try {
    const desde = new Date(Date.parse(now) - 24 * 3_600_000).toISOString();
    const linhas = await falhasDesde(desde);
    const mail = resumoDasFalhas(linhas, now, appUrl);
    if (!mail) return { total: 0 };
    return { total: linhas.length, emailed: await alertOwner("falhas_alert_at", now, mail) };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * E-mail ao dono da instância (o usuário mais antigo, mesma regra da semente da
 * ponte aérea), no máximo um por tipo de alerta a cada ALERT_EVERY_HOURS.
 */
async function alertOwner(
  claimKey: "watchdog_alert_at" | "backup_alert_at" | "falhas_alert_at",
  now: string,
  mail: { subject: string; text: string },
): Promise<boolean> {
  const alert = await claimInterval(claimKey, now, ALERT_EVERY_HOURS * 60);
  if (!alert.claimed) return false;
  let emailed = false;
  const admin = createSupabaseAdminClient();
  const { data: owner } = await admin
    .from("profiles")
    .select("id, email")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (owner?.email) {
    const key = await getDecryptedKeyWith(admin, owner.id as string, "resend").catch(() => null);
    const res = await sendEmailDetailed(owner.email as string, mail.subject, mail.text, key);
    emailed = res.ok;
  }
  // Sem e-mail enviado, libera a reserva para tentar no próximo dia de vigia.
  if (!emailed) await setConfig({ [claimKey]: alert.previous ?? "1970-01-01T00:00:00.000Z" });
  return emailed;
}

/**
 * Confere no GitHub (API pública, sem credencial) quando foi feita a última
 * cópia de backup. O repositório vem de BACKUP_GITHUB_REPO ("dono/repo") ou das
 * variáveis de sistema da Vercel. Nunca lança: qualquer falha vira um status.
 * Sem conseguir conferir por alguns dias seguidos, avisa o dono.
 */
async function checkBackup(now: string) {
  try {
    const owner = process.env.VERCEL_GIT_REPO_OWNER;
    const slug = process.env.VERCEL_GIT_REPO_SLUG;
    const repo = process.env.BACKUP_GITHUB_REPO || (owner && slug ? `${owner}/${slug}` : "");
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { status: "sem repositório" as const };
    let body: unknown = null;
    try {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/actions/artifacts?name=${BACKUP_ARTIFACT}&per_page=20`,
        { headers: { accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(8_000) },
      );
      if (res.ok) body = await res.json();
    } catch {
      // rede ou tempo esgotado: fica como "desconhecido"
    }
    const result = backupCheck(body, now);
    if (result.status === "desconhecido") {
      const { backup_checked_at: lastChecked } = await getConfig(["backup_checked_at"]);
      if (!lastChecked) await setConfig({ backup_checked_at: now });
      else if (backupCheckOverdue(lastChecked, now)) {
        return {
          ...result,
          emailed: await alertOwner("backup_alert_at", now, unknownBackupEmail(repo)),
        };
      }
      return result;
    }
    await setConfig({ backup_checked_at: now });
    if (result.status === "em dia") return result;
    const emailed = await alertOwner(
      "backup_alert_at",
      now,
      staleBackupEmail(result.last, now, repo),
    );
    return { ...result, emailed };
  } catch {
    return { status: "erro" as const };
  }
}
