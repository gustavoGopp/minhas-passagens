/**
 * Datas civis sem fuso, representadas como "YYYY-MM-DD" e manipuladas como
 * número de dias desde 1970-01-01 (UTC). Evita qualquer efeito de horário de verão.
 */
const MS_PER_DAY = 86_400_000;

export function toEpochDay(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function fromEpochDay(epochDay: number): string {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

export function parseIsoDate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return toEpochDay(y, m, d);
}

export function isoDate(year: number, month: number, day: number): string {
  return fromEpochDay(toEpochDay(year, month, day));
}

export function addDays(iso: string, days: number): string {
  return fromEpochDay(parseIsoDate(iso) + days);
}

/** 0 = domingo ... 6 = sábado. */
export function weekday(iso: string): number {
  return new Date(parseIsoDate(iso) * MS_PER_DAY).getUTCDay();
}

/** Diferença em dias (b - a). */
export function diffDays(a: string, b: string): number {
  return parseIsoDate(b) - parseIsoDate(a);
}
