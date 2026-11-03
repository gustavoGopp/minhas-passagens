import { airportTimeZone } from "@/lib/airports";
import { addDays, diffDays } from "@/lib/holidays/dates";
import { holidaysNear, type HolidayEvent } from "@/lib/holidays";
import {
  bridgeSuggestion,
  describeLongWeekend,
  expandRule,
  longWeekendDays,
  upcomingLongWeekends,
} from "@/lib/prices/rule";
import type { MonitorRule } from "@/lib/prices/types";
import type { BookingRow, FlightRow } from "@/lib/trips/draft";
import { activeFlights } from "@/lib/trips/rules";
import { formatInZone, utcToLocal } from "@/lib/trips/time";
import type { NotifyEvent } from "./events";

/** Feriado a até 3 dias de um voo meu. */
export const NEAR_FLIGHT_DAYS = 3;
/** Mesma distância usada para tirar o preço da média de 30 dias. */
export const NEAR_MONITOR_DAYS = 2;
/** Feriadões avisados com esta antecedência. */
export const LONG_WEEKEND_WEEKS = 8;
/** Só avisa de voos que saem nos próximos 30 dias (aviso útil, sem enxurrada). */
export const FLIGHT_LOOKAHEAD_DAYS = 30;

export interface HolidayMonitor {
  id: string;
  name: string | null;
  kind: string;
  origin: string;
  destination: string;
  rule: MonitorRule;
  horizon_weeks: number;
  active: boolean;
  /** Preenchido nos monitores criados por "Monitorar este feriadão". */
  long_weekend?: string | null;
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Data local da partida no aeroporto de origem. */
export function flightLocalDate(f: { origin: string; departs_at: string }): string {
  return utcToLocal(f.departs_at, airportTimeZone(f.origin) ?? "America/Sao_Paulo").slice(0, 10);
}

/**
 * Feriados (e facultativos) a até `days` dias de uma data. Datas comemorativas
 * (ex.: Chanucá) ficam de fora dos avisos e do selo, mas continuam tirando o
 * preço da média de 30 dias no monitor.
 */
export function dayOffHolidaysNear(
  holidays: HolidayEvent[],
  date: string,
  days: number,
): HolidayEvent[] {
  return holidaysNear(holidays, date, days).filter((h) => h.kind !== "observance");
}

/** Feriados perto de um voo (para o selo "feriado perto" e para o aviso). */
export function holidaysNearFlight(
  holidays: HolidayEvent[],
  f: { origin: string; departs_at: string },
  days = NEAR_FLIGHT_DAYS,
): HolidayEvent[] {
  return dayOffHolidaysNear(holidays, flightLocalDate(f), days);
}

function uniqueNames(list: HolidayEvent[]): string {
  const seen = new Map<string, string>();
  for (const h of list) if (!seen.has(h.name)) seen.set(h.name, `${h.name} (${ddmm(h.date)})`);
  return [...seen.values()].join(", ");
}

/**
 * Avisos de feriado devidos para um usuário. Chaves estáveis (um aviso por
 * evento via notification_log); nenhum é urgente, então respeitam a janela silenciosa.
 * `today` é a data local do usuário.
 */
export function holidayEvents(input: {
  bookings: BookingRow[];
  flights: FlightRow[];
  monitors: HolidayMonitor[];
  holidays: HolidayEvent[];
  today: string;
  now: string;
}): NotifyEvent[] {
  const events: NotifyEvent[] = [];
  const { holidays, today, now } = input;
  const bookings = new Map(input.bookings.map((b) => [b.id, b]));

  // 1. Feriado a até 3 dias de um voo meu.
  const lastFlightDay = addDays(today, FLIGHT_LOOKAHEAD_DAYS);
  for (const f of activeFlights(input.flights, bookings)) {
    if (Date.parse(f.departs_at) <= Date.parse(now)) continue;
    const day = flightLocalDate(f);
    if (day > lastFlightDay) continue;
    const near = holidaysNearFlight(holidays, f);
    if (!near.length) continue;
    const tz = airportTimeZone(f.origin) ?? "America/Sao_Paulo";
    events.push({
      key: `holiday-flight:${f.id}:${day}`,
      title: `Feriado perto do seu voo ${f.origin} → ${f.destination}`,
      body: `Voo ${formatInZone(f.departs_at, tz)}. Perto de ${uniqueNames(near)}. Aeroportos costumam encher: chegue com folga.`,
      path: `/app/passagens/${f.booking_id}`,
      urgent: false,
    });
  }

  // 2. Feriado numa data monitorada (próximas 8 semanas): um aviso por monitor e bloco.
  const lastMonitorDay = addDays(today, LONG_WEEKEND_WEEKS * 7);
  for (const m of input.monitors) {
    if (!m.active || m.kind === "holiday" || m.long_weekend) continue;
    const targets = expandRule(m.rule, { today, horizonWeeks: m.horizon_weeks, holidays });
    const hits = targets
      .filter((t) => t.date <= lastMonitorDay)
      .map((t) => ({ date: t.date, near: dayOffHolidaysNear(holidays, t.date, NEAR_MONITOR_DAYS) }))
      .filter((h) => h.near.length);
    // Agrupa datas a até 3 dias uma da outra (ex.: quinta e sexta do mesmo feriado).
    const clusters: (typeof hits)[] = [];
    for (const h of hits) {
      const last = clusters.at(-1);
      if (last && diffDays(last.at(-1)!.date, h.date) <= 3) last.push(h);
      else clusters.push([h]);
    }
    for (const c of clusters) {
      const near = c.flatMap((h) => h.near);
      events.push({
        key: `holiday-monitor:${m.id}:${c[0].date}`,
        title: `Feriado em data monitorada: ${m.name || `${m.origin} → ${m.destination}`}`,
        body: `${c.map((h) => ddmm(h.date)).join(", ")} perto de ${uniqueNames(near)}. O preço tende a subir perto de feriado; esses preços ficam fora da média de 30 dias.`,
        path: `/app/monitor/${m.id}`,
        urgent: false,
      });
    }
  }

  // 3. Feriado prolongado nas próximas 8 semanas, com sugestão de emenda.
  for (const lw of upcomingLongWeekends(holidays, today, LONG_WEEKEND_WEEKS)) {
    const bridge = bridgeSuggestion(lw);
    events.push({
      key: `long-weekend:${lw.start}`,
      title: `Feriadão: ${describeLongWeekend(lw)} (${longWeekendDays(lw)} dias)`,
      body: `${lw.names.join(", ")}. ${bridge ?? "Sem precisar de emenda."} Dá para monitorar as passagens na tela inicial.`,
      path: "/app",
      urgent: false,
    });
  }

  return events;
}
