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

/** Backup semanal: sem cópia nova por mais do que isto, o dono é avisado. */
export const BACKUP_MAX_DAYS = 8;
export const BACKUP_ARTIFACT = "supabase-backup";

/**
 * Data da cópia de backup mais recente que ainda existe, lida da resposta de
 * GET /repos/{dono}/{repo}/actions/artifacts?name=supabase-backup do GitHub.
 * Null quando não há cópia ou a resposta não tem a lista (erro, limite de uso).
 */
export function latestBackupAt(response: unknown): string | null {
  const list = (response as { artifacts?: unknown } | null)?.artifacts;
  if (!Array.isArray(list)) return null;
  let latest: number | null = null;
  for (const item of list as { name?: unknown; expired?: unknown; created_at?: unknown }[]) {
    if (item?.name !== BACKUP_ARTIFACT || item.expired === true) continue;
    const t = Date.parse(String(item.created_at));
    if (!Number.isNaN(t) && (latest == null || t > latest)) latest = t;
  }
  return latest == null ? null : new Date(latest).toISOString();
}

export type BackupCheck =
  | { status: "desconhecido" }
  | { status: "em dia"; last: string }
  | { status: "atrasado"; last: string | null };

/**
 * Lê a resposta do GitHub. Sem a lista de cópias (limite de uso, erro,
 * repositório privado) o resultado é "desconhecido": não dá para afirmar que
 * não existe cópia, então isso nunca gera o alerta de backup atrasado.
 */
export function backupCheck(response: unknown, nowIso: string): BackupCheck {
  if (!Array.isArray((response as { artifacts?: unknown } | null)?.artifacts)) {
    return { status: "desconhecido" };
  }
  const last = latestBackupAt(response);
  if (last && !isBackupStale(last, nowIso)) return { status: "em dia", last };
  return { status: "atrasado", last };
}

/** Dias seguidos sem conseguir conferir o backup antes de avisar o dono. */
export const BACKUP_UNKNOWN_DAYS = 3;

/** Faz mais de BACKUP_UNKNOWN_DAYS que a conferência não dá certo (null = começa a contar agora). */
export function backupCheckOverdue(
  lastChecked: string | null | undefined,
  nowIso: string,
): boolean {
  const m = minutesSince(lastChecked, nowIso);
  return m != null && m > BACKUP_UNKNOWN_DAYS * 24 * 60;
}

/** Texto do e-mail quando o vigia não consegue conferir o backup há dias. */
export function unknownBackupEmail(repo: string) {
  return {
    subject: "Minhas Passagens: não consegui conferir o backup",
    text: [
      `Há mais de ${BACKUP_UNKNOWN_DAYS} dias não consegui conferir no GitHub se o backup semanal está sendo feito.`,
      "Pode ser só uma falha de acesso, mas vale olhar:",
      `https://github.com/${repo}/actions/workflows/supabase-backup.yml`,
    ].join("\n"),
  };
}

/** Backup atrasado: nenhuma cópia, ou a mais recente passou do limite de dias. */
export function isBackupStale(
  lastBackup: string | null | undefined,
  nowIso: string,
  maxDays = BACKUP_MAX_DAYS,
): boolean {
  const m = minutesSince(lastBackup, nowIso);
  return m == null || m > maxDays * 24 * 60;
}

/** Texto do e-mail de backup atrasado (sem dados pessoais). */
export function staleBackupEmail(lastBackup: string | null, nowIso: string, repo: string) {
  const m = minutesSince(lastBackup, nowIso);
  const quando =
    m == null
      ? "Não há nenhuma cópia de backup guardada no GitHub."
      : `A última cópia de backup foi feita há ${Math.floor(m / 1440)} dias.`;
  return {
    subject: "Minhas Passagens: backup atrasado",
    text: [
      quando,
      "O backup deveria rodar todo domingo. As cópias duram 28 dias; sem cópia nova, depois disso não sobra nenhuma.",
      "",
      "O que fazer:",
      `1. Abra https://github.com/${repo}/actions/workflows/supabase-backup.yml`,
      "2. Se houver um aviso de que o workflow foi desligado por inatividade (60 dias sem commits), clique em “Enable workflow”.",
      "3. Clique em “Run workflow” para fazer um backup agora.",
    ].join("\n"),
  };
}
