/** Saúde do agendador e retenção de dados (lógica pura, testada). */

/** Último tick mais velho que isto = agendador parado. */
export const STALE_TICK_MINUTES = 30;
/** No máximo um e-mail de alerta por este intervalo. */
export const ALERT_EVERY_HOURS = 20;
/** Tick de reconciliação disparado pelo vigia, no máximo uma vez por este intervalo. */
export const RECONCILE_EVERY_MINUTES = 60;

export const RETENTION_DAYS = { price_observations: 180, price_checks: 365 } as const;

/** Minutos desde o último tick (null se nunca houve). */
export function minutesSince(iso: string | null | undefined, nowIso: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.parse(nowIso) - t) / 60_000);
}

/** Agendador parado: nunca rodou ou o último tick passou do limite. */
export function isTickStale(
  lastTick: string | null | undefined,
  nowIso: string,
  maxMinutes = STALE_TICK_MINUTES,
): boolean {
  const m = minutesSince(lastTick, nowIso);
  return m == null || m > maxMinutes;
}

/** Já passou o intervalo desde a última vez (ou nunca aconteceu). */
export function intervalElapsed(
  last: string | null | undefined,
  nowIso: string,
  minutes: number,
): boolean {
  const m = minutesSince(last, nowIso);
  return m == null || m >= minutes;
}

/** A tarefa diária ainda não rodou hoje (datas YYYY-MM-DD, UTC). */
export function dailyDue(lastRunDate: string | null | undefined, nowIso: string): boolean {
  return lastRunDate !== nowIso.slice(0, 10);
}

/** Instantes de corte: apaga o que for mais antigo que isto. */
export function retentionCutoffs(nowIso: string) {
  const now = Date.parse(nowIso);
  const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();
  return {
    price_observations: ago(RETENTION_DAYS.price_observations),
    price_checks: ago(RETENTION_DAYS.price_checks),
  };
}

/** Texto do e-mail de alerta (sem dados pessoais além do horário). */
export function staleTickEmail(lastTick: string | null, nowIso: string, appUrl: string) {
  const m = minutesSince(lastTick, nowIso);
  const quando =
    m == null
      ? "O agendador nunca registrou um ciclo."
      : m < 120
        ? `O último ciclo foi há ${m} minutos.`
        : `O último ciclo foi há ${Math.round(m / 60)} horas.`;
  return {
    subject: "Minhas Passagens: agendador parado",
    text: [
      quando,
      "Sem ele, não há avisos de check-in, preço ou feriado.",
      "",
      "O que fazer:",
      "1. Veja se o projeto do Supabase está pausado (supabase.com/dashboard) e restaure.",
      "2. No GitHub, rode o workflow “Supabase — notificações e agendador” para reagendar o pg_cron.",
      "",
      "Um ciclo de reconciliação já foi rodado agora pelo vigia diário da Vercel.",
      appUrl ? `${appUrl}/app/notificacoes` : "",
    ]
      .filter((l, i, a) => l || a[i - 1])
      .join("\n"),
  };
}
