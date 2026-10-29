import { addDays } from "./dates";
import {
  brazilCityHolidays,
  brazilNationalHolidays,
  brazilStateHolidays,
  christianObservances,
} from "./brazil";
import { jewishHolidays } from "./hebrew";
import type { HolidayEvent, HolidayKind } from "./types";

export type { HolidayEvent, HolidayKind, HolidaySource } from "./types";
export { listCities, listStates, REGIONAL_SOURCE } from "./brazil";

export interface HolidayPreferences {
  uf?: string | null;
  /** Código "UF-CIDADE" da semente (ex.: "SP-SP"). */
  city?: string | null;
  /** Mostrar pontos facultativos (Carnaval, Corpus Christi...). */
  showOptional?: boolean;
  showChristian?: boolean;
  showJewish?: boolean;
  /** Calendário judaico de Israel (padrão: diáspora). */
  jewishIsrael?: boolean;
}

export interface HolidayOverride {
  /** "add" cria um feriado próprio; "hide" esconde um evento pela chave. */
  action: "add" | "hide";
  date: string;
  /** Para "hide": chave do evento a esconder. Para "add": opcional. */
  key?: string | null;
  name?: string | null;
  kind?: HolidayKind | null;
}

const KIND_RANK: Record<HolidayKind, number> = { holiday: 3, optional: 2, observance: 1 };

/**
 * Feriados do ano conforme as preferências do usuário, já mesclados:
 * se o mesmo dia tem o mesmo nome em mais de uma fonte (ex.: Corpus Christi
 * nacional facultativo e municipal em São Paulo), fica a versão mais forte.
 */
export function getHolidays(
  year: number,
  prefs: HolidayPreferences = {},
  overrides: HolidayOverride[] = [],
): HolidayEvent[] {
  let events: HolidayEvent[] = [...brazilNationalHolidays(year)];
  if (prefs.uf) events.push(...brazilStateHolidays(year, prefs.uf));
  if (prefs.city) events.push(...brazilCityHolidays(year, prefs.city));
  if (prefs.showChristian) events.push(...christianObservances(year));
  if (prefs.showJewish) events.push(...jewishHolidays(year, { israel: prefs.jewishIsrael }));

  // Mescla duplicatas (mesmo dia e mesmo nome normalizado), mantendo o tipo mais forte.
  const byKey = new Map<string, HolidayEvent>();
  for (const e of events) {
    const k = `${e.date}|${normalizeName(e.name)}`;
    const prev = byKey.get(k);
    if (!prev || KIND_RANK[e.kind] > KIND_RANK[prev.kind]) byKey.set(k, e);
  }
  events = [...byKey.values()];

  if (prefs.showOptional === false) events = events.filter((e) => e.kind !== "optional");

  for (const o of overrides) {
    if (!o.date.startsWith(`${year}-`)) continue;
    if (o.action === "hide") {
      events = events.filter((e) => !(e.date === o.date && (!o.key || e.key === o.key)));
    } else if (o.name) {
      events.push({
        key: o.key ?? `custom:${o.date}:${normalizeName(o.name)}`,
        name: o.name,
        date: o.date,
        endDate: o.date,
        kind: o.kind ?? "holiday",
        source: "custom",
        region: "CUSTOM",
        startsAtSunset: false,
      });
    }
  }

  return events.sort(
    (a, b) => a.date.localeCompare(b.date) || KIND_RANK[b.kind] - KIND_RANK[a.kind],
  );
}

/** Eventos que tocam o intervalo [from, to] (datas ISO inclusivas), útil para viagens e monitores. */
export function holidaysBetween(events: HolidayEvent[], from: string, to: string): HolidayEvent[] {
  return events.filter((e) => e.endDate >= from && e.date <= to);
}

/**
 * Feriados a até `days` dias de uma data (antes ou depois), considerando a véspera
 * para eventos que começam ao pôr do sol.
 */
export function holidaysNear(events: HolidayEvent[], date: string, days: number): HolidayEvent[] {
  return holidaysBetween(events, addDays(date, -days), addDays(date, days)).filter(
    (e) => e.kind !== "observance" || e.startsAtSunset,
  );
}

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*\(.*\)\s*/g, "")
    .trim();
}
