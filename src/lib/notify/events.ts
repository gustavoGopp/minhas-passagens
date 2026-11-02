import { airportTimeZone } from "@/lib/airports";
import { checkinReminderTimes, checkinRule, checkinState } from "@/lib/trips/checkin";
import type { BookingRow, FlightRow } from "@/lib/trips/draft";
import { activeFlights, computeAlerts, type CreditRow } from "@/lib/trips/rules";
import { formatInZone } from "@/lib/trips/time";

export interface NotifyEvent {
  key: string;
  title: string;
  body: string;
  /** Caminho no app para abrir ao tocar no aviso. */
  path: string;
  /** Ignora a janela silenciosa (lembrete de check-in de 24h). */
  urgent: boolean;
}

/**
 * Avisos devidos agora para um usuário. O chamador remove os que já foram
 * enviados (notification_log) e aplica a janela silenciosa.
 */
export function dueEvents(input: {
  bookings: BookingRow[];
  flights: FlightRow[];
  credits: CreditRow[];
  now: string;
}): NotifyEvent[] {
  const now = Date.parse(input.now);
  const bookings = new Map(input.bookings.map((b) => [b.id, b]));
  const events: NotifyEvent[] = [];

  for (const f of activeFlights(input.flights, bookings)) {
    const st = checkinState(f, input.now);
    if (st.state !== "open") continue;
    const tz = airportTimeZone(f.origin) ?? "America/Sao_Paulo";
    const when = formatInZone(f.departs_at, tz);
    const url = checkinRule(f.airline).url;
    const { dayBefore } = checkinReminderTimes(f);
    const path = `/app/passagens/${f.booking_id}`;
    if (now >= Date.parse(dayBefore)) {
      events.push({
        key: `checkin-24h:${f.id}`,
        title: `Check-in pendente: ${f.origin} → ${f.destination}`,
        body: `Voo ${when}. Faltam menos de 24 horas.${url ? ` ${url}` : ""}`,
        path,
        urgent: true,
      });
    } else {
      events.push({
        key: `checkin-open:${f.id}`,
        title: `Check-in aberto: ${f.origin} → ${f.destination}`,
        body: `Voo ${when}.${url ? ` ${url}` : ""}`,
        path,
        urgent: false,
      });
    }
  }

  for (const a of computeAlerts(input)) {
    if (a.type === "checkin") continue; // coberto acima
    events.push({
      key: `alert:${a.key}`,
      title: a.title,
      body: a.detail,
      path:
        a.type === "credit_expiring"
          ? "/app/creditos"
          : a.bookingIds[0]
            ? `/app/passagens/${a.bookingIds[0]}`
            : "/app",
      urgent: false,
    });
  }
  return events;
}

/** Hora local "HH:MM" no fuso. */
function localHm(nowIso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(nowIso));
}

/** Verdadeiro se agora está na janela silenciosa (que pode cruzar a meia-noite). */
export function isQuietHours(
  nowIso: string,
  timeZone: string,
  start: string,
  end: string,
): boolean {
  const t = localHm(nowIso, timeZone);
  const s = start.slice(0, 5);
  const e = end.slice(0, 5);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}
