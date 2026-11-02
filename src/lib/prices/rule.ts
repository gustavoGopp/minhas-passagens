import { addDays, diffDays, weekday } from "@/lib/holidays/dates";
import type { HolidayEvent } from "@/lib/holidays/types";
import type { MonitorRule, Target, TimeWindow } from "./types";

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const WEEKDAYS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function isValidWindow(w: TimeWindow): boolean {
  return HM.test(w.from) && HM.test(w.to) && w.from <= w.to;
}

/** "HH:MM" dentro de alguma das janelas (inclusivo nas pontas). */
export function inWindows(time: string, windows: TimeWindow[]): boolean {
  return windows.some((w) => time >= w.from && time <= w.to);
}

function pushTarget(map: Map<string, TimeWindow[]>, date: string, w: TimeWindow) {
  const list = map.get(date) ?? [];
  if (!list.some((x) => x.from === w.from && x.to === w.to)) list.push(w);
  map.set(date, list);
}

export interface LongWeekend {
  start: string;
  end: string;
  names: string[];
}

/** Dia que conta como folga para montar feriado prolongado. */
function isDayOffHoliday(e: HolidayEvent): boolean {
  if (e.kind === "observance") return false;
  return e.source.startsWith("br_") || e.source === "custom";
}

/**
 * Folgas prolongadas (≥ 3 dias seguidos com pelo menos um feriado) entre `from` e `to`.
 * Feriado na terça puxa a segunda (emenda); na quinta, puxa a sexta.
 */
export function longWeekends(holidays: HolidayEvent[], from: string, to: string): LongWeekend[] {
  const names = new Map<string, string[]>();
  for (const e of holidays.filter(isDayOffHoliday)) {
    for (let d = e.date; d <= e.endDate; d = addDays(d, 1)) {
      names.set(d, [...(names.get(d) ?? []), e.name]);
    }
  }
  const off = new Set<string>(names.keys());
  for (const d of names.keys()) {
    const wd = weekday(d);
    if (wd === 2) off.add(addDays(d, -1));
    if (wd === 4) off.add(addDays(d, 1));
  }
  const isOff = (d: string) => off.has(d) || weekday(d) === 0 || weekday(d) === 6;

  const result: LongWeekend[] = [];
  let d = addDays(from, -6);
  const last = addDays(to, 6);
  while (d <= last) {
    if (!isOff(d)) {
      d = addDays(d, 1);
      continue;
    }
    const start = d;
    while (isOff(addDays(d, 1))) d = addDays(d, 1);
    const end = d;
    const blockNames: string[] = [];
    for (let x = start; x <= end; x = addDays(x, 1)) blockNames.push(...(names.get(x) ?? []));
    if (diffDays(start, end) >= 2 && blockNames.length && end >= from && start <= to) {
      result.push({ start, end, names: [...new Set(blockNames)] });
    }
    d = addDays(end, 1);
  }
  return result;
}

/**
 * Expande a regra em datas-alvo entre amanhã e o horizonte (em semanas).
 * `today` é a data local do usuário; datas são locais do aeroporto de origem.
 */
export function expandRule(
  rule: MonitorRule,
  opts: { today: string; horizonWeeks: number; holidays?: HolidayEvent[] },
): Target[] {
  const first = addDays(opts.today, 1);
  const last = addDays(opts.today, Math.max(1, opts.horizonWeeks) * 7);
  const map = new Map<string, TimeWindow[]>();

  if (rule.kind === "weekly") {
    for (let d = first; d <= last; d = addDays(d, 1)) {
      for (const s of rule.slots) {
        if (s.weekday === weekday(d) && isValidWindow(s)) {
          pushTarget(map, d, { from: s.from, to: s.to });
        }
      }
    }
  } else if (rule.kind === "dates") {
    for (const r of rule.ranges) {
      if (!isValidWindow(r) || r.end < r.start) continue;
      const a = r.start < first ? first : r.start;
      const b = r.end > last ? last : r.end;
      for (let d = a; d <= b; d = addDays(d, 1)) pushTarget(map, d, { from: r.from, to: r.to });
    }
  } else if (isValidWindow(rule.window)) {
    for (const lw of longWeekends(opts.holidays ?? [], first, last)) {
      const days =
        rule.leg === "outbound" ? [addDays(lw.start, -1), lw.start] : [lw.end, addDays(lw.end, 1)];
      for (const d of days) {
        if (d >= first && d <= last) pushTarget(map, d, rule.window);
      }
    }
  }

  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, windows]) => ({ date, windows }));
}

/** Texto curto da regra para a lista, ex.: "segunda 00:00–08:00 · domingo 12:00–23:59". */
export function describeRule(rule: MonitorRule): string {
  const w = (x: TimeWindow) =>
    x.from === "00:00"
      ? `até ${x.to}`
      : x.to === "23:59"
        ? `a partir de ${x.from}`
        : `${x.from}–${x.to}`;
  if (rule.kind === "weekly") {
    return rule.slots.map((s) => `${WEEKDAYS_PT[s.weekday]} ${w(s)}`).join(" · ");
  }
  if (rule.kind === "dates") {
    return rule.ranges
      .map((r) => `${fmt(r.start)}${r.end !== r.start ? `–${fmt(r.end)}` : ""} ${w(r)}`)
      .join(" · ");
  }
  return `Feriados prolongados (${rule.leg === "outbound" ? "ida" : "volta"}) ${w(rule.window)}`;
}

function fmt(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Janelas da ponte aérea semanal do dono (entrevista de 2026-10-29). */
export const PONTE_AEREA = {
  rioSp: {
    origin: "SDU",
    destination: "CGH",
    rule: {
      kind: "weekly",
      slots: [
        { weekday: 1, from: "00:00", to: "08:00" },
        { weekday: 0, from: "12:00", to: "23:59" },
      ],
    } satisfies MonitorRule,
  },
  spRio: {
    origin: "CGH",
    destination: "SDU",
    rule: {
      kind: "weekly",
      slots: [
        { weekday: 4, from: "18:00", to: "23:59" },
        { weekday: 5, from: "00:00", to: "13:00" },
      ],
    } satisfies MonitorRule,
  },
} as const;
