/**
 * Conversão entre horário local de um aeroporto ("YYYY-MM-DDTHH:mm") e instante UTC.
 * Companhias informam hora local sem fuso; o fuso vem da tabela de aeroportos.
 */

function offsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - utcMs) / 60000);
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isLocalDateTime(value: string): boolean {
  return LOCAL_RE.test(value);
}

/** "2026-11-10T07:30" em America/Sao_Paulo → "2026-11-10T10:30:00.000Z". */
export function localToUtc(local: string, timeZone: string): string {
  const m = LOCAL_RE.exec(local);
  if (!m) throw new Error(`Data/hora inválida: ${local}`);
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = naive - offsetMinutes(naive, timeZone) * 60000;
  // Segunda passada corrige casos perto de mudança de horário.
  guess = naive - offsetMinutes(guess, timeZone) * 60000;
  return new Date(guess).toISOString();
}

/** Instante UTC → "YYYY-MM-DDTHH:mm" no fuso informado (para preencher formulários). */
export function utcToLocal(iso: string, timeZone: string): string {
  const ms = Date.parse(iso);
  const local = new Date(ms + offsetMinutes(ms, timeZone) * 60000);
  return local.toISOString().slice(0, 16);
}

/**
 * Texto amigável em pt-BR no fuso do aeroporto, ex.: "seg., 10/11 às 07:30".
 * Fora do ano atual, o ano aparece sempre ("seg., 08/02/2027 às 07:30"), para
 * voos de anos diferentes nunca parecerem do mesmo ano.
 */
export function formatInZone(
  iso: string,
  timeZone: string,
  nowIso = new Date().toISOString(),
): string {
  const d = new Date(iso);
  const sameYear =
    utcToLocal(iso, timeZone).slice(0, 4) === utcToLocal(nowIso, timeZone).slice(0, 4);
  const day = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone,
  }).format(d);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(d);
  return `${day} às ${time}`;
}

/** Ano local (fuso do aeroporto de origem) de um instante. */
export function localYear(iso: string, timeZone: string): number {
  return Number(utcToLocal(iso, timeZone).slice(0, 4));
}
