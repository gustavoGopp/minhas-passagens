import { addDays, fromEpochDay, weekday } from "./dates";
import type { HolidayEvent, HolidayKind } from "./types";

/**
 * Calendário hebraico aritmético (Dershowitz & Reingold, "Calendrical Calculations").
 * Implementação própria para manter a licença MIT do projeto.
 *
 * Meses numerados como no livro: Nissan = 1 ... Adar = 12, Adar II = 13;
 * o ano começa em Tishrei (7).
 */
export const NISAN = 1;
export const IYAR = 2;
export const SIVAN = 3;
export const TAMUZ = 4;
export const AV = 5;
export const ELUL = 6;
export const TISHREI = 7;
export const CHESHVAN = 8;
export const KISLEV = 9;
export const TEVET = 10;
export const SHEVAT = 11;
export const ADAR = 12;
export const ADAR_II = 13;

/** Dia fixo (R.D.) de 1 de Tishrei do ano 1. */
const HEBREW_EPOCH_RD = -1373427;
/** R.D. de 1970-01-01. */
const UNIX_EPOCH_RD = 719163;

export function isHebrewLeapYear(year: number): boolean {
  return (((7 * year + 1) % 19) + 19) % 19 < 7;
}

function lastMonthOfYear(year: number): number {
  return isHebrewLeapYear(year) ? ADAR_II : ADAR;
}

function calendarElapsedDays(year: number): number {
  const monthsElapsed = Math.floor((235 * year - 234) / 19);
  const partsElapsed = 12084 + 13753 * monthsElapsed;
  const days = 29 * monthsElapsed + Math.floor(partsElapsed / 25920);
  return (3 * (days + 1)) % 7 < 3 ? days + 1 : days;
}

function yearLengthCorrection(year: number): number {
  const ny0 = calendarElapsedDays(year - 1);
  const ny1 = calendarElapsedDays(year);
  const ny2 = calendarElapsedDays(year + 1);
  if (ny2 - ny1 === 356) return 2;
  if (ny1 - ny0 === 382) return 1;
  return 0;
}

function newYearRd(year: number): number {
  return HEBREW_EPOCH_RD + calendarElapsedDays(year) + yearLengthCorrection(year);
}

export function daysInHebrewYear(year: number): number {
  return newYearRd(year + 1) - newYearRd(year);
}

function lastDayOfMonth(year: number, month: number): number {
  const len = daysInHebrewYear(year);
  const longCheshvan = len % 10 === 5; // 355 ou 385
  const shortKislev = len % 10 === 3; // 353 ou 383
  if ([IYAR, TAMUZ, ELUL, TEVET, ADAR_II].includes(month)) return 29;
  if (month === ADAR && !isHebrewLeapYear(year)) return 29;
  if (month === CHESHVAN && !longCheshvan) return 29;
  if (month === KISLEV && shortKislev) return 29;
  return 30;
}

function fixedFromHebrew(year: number, month: number, day: number): number {
  let rd = newYearRd(year) + day - 1;
  if (month < TISHREI) {
    for (let m = TISHREI; m <= lastMonthOfYear(year); m++) rd += lastDayOfMonth(year, m);
    for (let m = NISAN; m < month; m++) rd += lastDayOfMonth(year, m);
  } else {
    for (let m = TISHREI; m < month; m++) rd += lastDayOfMonth(year, m);
  }
  return rd;
}

/** Data civil (YYYY-MM-DD) do dia hebraico informado. */
export function hebrewToIso(year: number, month: number, day: number): string {
  return fromEpochDay(fixedFromHebrew(year, month, day) - UNIX_EPOCH_RD);
}

export interface JewishOptions {
  /** true = calendário de Israel (um dia de yom tov); false = diáspora (dois dias). Padrão: false. */
  israel?: boolean;
}

interface Spec {
  key: string;
  name: string;
  hyear: number;
  month: number;
  day: number;
  length: number;
  kind: HolidayKind;
  fast?: boolean;
  note?: string;
}

/**
 * Datas judaicas que caem no ano civil informado. Cada evento começa ao pôr do
 * sol da véspera de `date` (startsAtSunset = true) e termina ao anoitecer de `endDate`.
 */
export function jewishHolidays(gregorianYear: number, options: JewishOptions = {}): HolidayEvent[] {
  const diaspora = !options.israel;
  const specs: Spec[] = [];
  // O ano civil cruza dois anos hebraicos: a primavera é do ano H-1 e o outono do ano H.
  for (const hy of [gregorianYear + 3759, gregorianYear + 3760, gregorianYear + 3761]) {
    const yomTovDays = diaspora ? 2 : 1;
    specs.push(
      {
        key: "rosh-hashana",
        name: "Rosh Hashaná",
        hyear: hy,
        month: TISHREI,
        day: 1,
        length: 2,
        kind: "holiday",
      },
      {
        key: "yom-kipur",
        name: "Yom Kipur",
        hyear: hy,
        month: TISHREI,
        day: 10,
        length: 1,
        kind: "holiday",
        fast: true,
      },
      {
        key: "sucot",
        name: "Sucot",
        hyear: hy,
        month: TISHREI,
        day: 15,
        length: yomTovDays,
        kind: "holiday",
      },
      {
        key: "sucot-chol-hamoed",
        name: "Sucot (Chol HaMoed)",
        hyear: hy,
        month: TISHREI,
        day: 15 + yomTovDays,
        length: 21 - (15 + yomTovDays) + 1,
        kind: "observance",
      },
      {
        key: "shemini-atzeret",
        name: diaspora ? "Shemini Atzeret" : "Shemini Atzeret / Simchat Torá",
        hyear: hy,
        month: TISHREI,
        day: 22,
        length: 1,
        kind: "holiday",
      },
      ...(diaspora
        ? [
            {
              key: "simchat-tora",
              name: "Simchat Torá",
              hyear: hy,
              month: TISHREI,
              day: 23,
              length: 1,
              kind: "holiday" as const,
            },
          ]
        : []),
      {
        key: "chanuca",
        name: "Chanucá",
        hyear: hy,
        month: KISLEV,
        day: 25,
        length: 8,
        kind: "observance",
      },
      {
        key: "purim",
        name: "Purim",
        hyear: hy,
        month: isHebrewLeapYear(hy) ? ADAR_II : ADAR,
        day: 14,
        length: 1,
        kind: "observance",
      },
      {
        key: "pessach",
        name: "Pessach",
        hyear: hy,
        month: NISAN,
        day: 15,
        length: yomTovDays,
        kind: "holiday",
      },
      {
        key: "pessach-chol-hamoed",
        name: "Pessach (Chol HaMoed)",
        hyear: hy,
        month: NISAN,
        day: 15 + yomTovDays,
        length: 20 - (15 + yomTovDays) + 1,
        kind: "observance",
      },
      {
        key: "pessach-final",
        name: "Pessach (últimos dias)",
        hyear: hy,
        month: NISAN,
        day: 21,
        length: yomTovDays,
        kind: "holiday",
      },
      {
        key: "shavuot",
        name: "Shavuot",
        hyear: hy,
        month: SIVAN,
        day: 6,
        length: yomTovDays,
        kind: "holiday",
      },
    );
    // Tishá BeAv: se 9 de Av cair no Shabat, o jejum passa para domingo.
    const nineAv = hebrewToIso(hy, AV, 9);
    specs.push({
      key: "tisha-beav",
      name: "Tishá BeAv",
      hyear: hy,
      month: AV,
      day: weekday(nineAv) === 6 ? 10 : 9,
      length: 1,
      kind: "observance",
      fast: true,
      ...(weekday(nineAv) === 6 ? { note: "Adiado do Shabat para domingo" } : {}),
    });
  }

  const out: HolidayEvent[] = [];
  const seen = new Set<string>();
  for (const s of specs) {
    const date = hebrewToIso(s.hyear, s.month, s.day);
    const endDate = addDays(date, s.length - 1);
    // Inclui eventos que tocam o ano civil (ex.: Chanucá de dezembro que termina em janeiro).
    if (!date.startsWith(`${gregorianYear}-`) && !endDate.startsWith(`${gregorianYear}-`)) continue;
    const key = `jewish:${s.key}`;
    if (seen.has(`${key}:${date}`)) continue;
    seen.add(`${key}:${date}`);
    out.push({
      key,
      name: s.name,
      date,
      endDate,
      kind: s.kind,
      source: "jewish",
      region: diaspora ? "JEWISH-DIASPORA" : "JEWISH-IL",
      startsAtSunset: true,
      ...(s.fast ? { fast: true } : {}),
      ...(s.note ? { note: s.note } : {}),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
