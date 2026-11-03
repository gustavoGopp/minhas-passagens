import { airportTimeZone, findAirport } from "@/lib/airports";
import { checkinState } from "./checkin";
import type { BookingRow, FlightRow } from "./draft";
import { utcToLocal } from "./time";

export type AlertType =
  | "checkin"
  | "conflict"
  | "tight_connection"
  | "missing_leg"
  | "missing_return"
  | "check_date"
  | "duplicate"
  | "credit_expiring";

export interface TripAlert {
  key: string;
  type: AlertType;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  flightIds: string[];
  bookingIds: string[];
}

export interface CreditRow {
  id: string;
  booking_id: string | null;
  kind: "refund" | "credit";
  provider: string | null;
  amount_cents: number;
  remaining_cents: number | null;
  currency: string;
  issued_on: string;
  expires_on: string | null;
  notes: string | null;
}

const HOUR = 3_600_000;
const MIN_CONNECTION_MIN = 60;
/** Sem chegada informada, assume 1h10 de voo (ponte aérea). */
const DEFAULT_DURATION = 70 * 60_000;
const MISSING_LEG_WINDOW_DAYS = 30;
/** Avisa da volta não comprada para idas que saem nos próximos 45 dias. */
const MISSING_RETURN_WINDOW_DAYS = 45;

const arrival = (f: FlightRow) =>
  f.arrives_at ? Date.parse(f.arrives_at) : Date.parse(f.departs_at) + DEFAULT_DURATION;
const route = (f: FlightRow) => `${f.origin}→${f.destination}`;
const localDay = (f: FlightRow) =>
  utcToLocal(f.departs_at, airportTimeZone(f.origin) ?? "America/Sao_Paulo").slice(0, 10);
const brDate = (iso: string) => iso.split("-").reverse().join("/");

/** Trechos de reservas ativas, em ordem de partida. */
export function activeFlights(
  flights: FlightRow[],
  bookings: Map<string, BookingRow>,
): FlightRow[] {
  return flights
    .filter((f) => bookings.get(f.booking_id)?.status === "active")
    .sort((a, b) => a.departs_at.localeCompare(b.departs_at));
}

export function computeAlerts(input: {
  bookings: BookingRow[];
  flights: FlightRow[];
  credits?: CreditRow[];
  now: string;
  /** Cidade onde a pessoa mora (perfil). Sem ela, não há aviso de volta não comprada. */
  homeCity?: string | null;
}): TripAlert[] {
  const bookings = new Map(input.bookings.map((b) => [b.id, b]));
  const now = Date.parse(input.now);
  const flights = activeFlights(input.flights, bookings);
  const alerts: TripAlert[] = [];

  // Check-in aberto e não feito.
  for (const f of flights) {
    if (Date.parse(f.departs_at) < now) continue;
    const st = checkinState(f, input.now);
    if (st.state === "open") {
      alerts.push({
        key: `checkin:${f.id}`,
        type: "checkin",
        severity: st.urgent ? "high" : "medium",
        title: `Check-in aberto: ${route(f)}`,
        detail: st.urgent
          ? "Faltam menos de 24 horas para o voo."
          : "O check-in online já está disponível.",
        flightIds: [f.id],
        bookingIds: [f.booking_id],
      });
    }
  }

  // Pares consecutivos: sobreposição, conexão curta, trecho faltando.
  for (let i = 1; i < flights.length; i++) {
    const a = flights[i - 1];
    const b = flights[i];
    if (arrival(b) < now) continue; // só o que ainda importa
    const gap = Date.parse(b.departs_at) - arrival(a);
    if (gap < 0) {
      alerts.push({
        key: `conflict:${a.id}:${b.id}`,
        type: "conflict",
        severity: "high",
        title: `Conflito de horário: ${route(a)} e ${route(b)}`,
        detail: "Os dois voos se sobrepõem.",
        flightIds: [a.id, b.id],
        bookingIds: [...new Set([a.booking_id, b.booking_id])],
      });
      continue;
    }
    if (a.destination === b.origin && gap < MIN_CONNECTION_MIN * 60_000 && gap < 24 * HOUR) {
      alerts.push({
        key: `tight:${a.id}:${b.id}`,
        type: "tight_connection",
        severity: "high",
        title: `Conexão curta em ${b.origin}`,
        detail: `Só ${Math.round(gap / 60_000)} min entre a chegada e a próxima partida.`,
        flightIds: [a.id, b.id],
        bookingIds: [...new Set([a.booking_id, b.booking_id])],
      });
    }
    if (
      a.destination !== b.origin &&
      !b.ignore_missing_leg &&
      gap <= MISSING_LEG_WINDOW_DAYS * 24 * HOUR
    ) {
      alerts.push({
        key: `missing:${a.id}:${b.id}`,
        type: "missing_leg",
        severity: "medium",
        title: `Trecho faltando: ${a.destination} → ${b.origin}`,
        detail: `Você chega em ${a.destination} e o próximo voo sai de ${b.origin} (${brDate(localDay(b))}).`,
        flightIds: [a.id, b.id],
        bookingIds: [...new Set([a.booking_id, b.booking_id])],
      });
    }
  }

  // Volta não comprada: a última ida termina fora da cidade de casa.
  const last = flights[flights.length - 1];
  const destCity = last ? findAirport(last.destination)?.city : undefined;
  if (
    last &&
    input.homeCity &&
    destCity &&
    destCity !== input.homeCity &&
    !last.ignore_missing_return &&
    Date.parse(last.departs_at) >= now &&
    Date.parse(last.departs_at) - now <= MISSING_RETURN_WINDOW_DAYS * 24 * HOUR
  ) {
    alerts.push({
      key: `return:${last.id}`,
      type: "missing_return",
      severity: "medium",
      title: `Volta não comprada: ${destCity} → ${input.homeCity}`,
      detail: `Você chega em ${last.destination} em ${brDate(localDay(last))} e não há voo de volta para ${input.homeCity}.`,
      flightIds: [last.id],
      bookingIds: [last.booking_id],
    });
  }

  // Data a conferir: voo antes da data da compra (ano lido errado na importação, por exemplo).
  for (const f of flights) {
    const b = bookings.get(f.booking_id);
    if (!b?.purchased_on) continue;
    const day = localDay(f);
    if (day >= b.purchased_on) continue;
    alerts.push({
      key: `checkdate:${f.id}:${f.departs_at}:${b.purchased_on}`,
      type: "check_date",
      severity: "medium",
      title: `Confira a data: ${route(f)}`,
      detail: `O voo (${brDate(day)}) está antes da compra (${brDate(b.purchased_on)}). O ano pode estar errado: edite a passagem ou apague se não for sua.`,
      flightIds: [f.id],
      bookingIds: [f.booking_id],
    });
  }

  // Compra duplicada: mesma rota, mesmo dia local, reservas diferentes. Voos que já
  // passaram só contam se vieram da importação de e-mail (repetida dobra os gastos).
  const groups = new Map<string, FlightRow[]>();
  for (const f of flights) {
    if (arrival(f) < now && bookings.get(f.booking_id)?.source !== "email") continue;
    const k = `${route(f)}|${localDay(f)}`;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  for (const [k, list] of groups) {
    const bookingIds = [...new Set(list.map((f) => f.booking_id))];
    if (bookingIds.length < 2) continue;
    if (
      list.every((f) => arrival(f) < now) &&
      !bookingIds.every((id) => bookings.get(id)?.source === "email")
    )
      continue;
    const [r, day] = k.split("|");
    alerts.push({
      key: `dup:${k}`,
      type: "duplicate",
      severity: "high",
      title: `Possível compra duplicada: ${r}`,
      detail: `${bookingIds.length} reservas diferentes para ${brDate(day)}.`,
      flightIds: list.map((f) => f.id),
      bookingIds,
    });
  }

  // Créditos vencendo em até 30 dias.
  for (const c of input.credits ?? []) {
    if (c.kind !== "credit" || !c.expires_on || (c.remaining_cents ?? c.amount_cents) <= 0)
      continue;
    // Dias de calendário entre hoje e a validade.
    const days = Math.round(
      (Date.parse(c.expires_on) - Date.parse(input.now.slice(0, 10))) / (24 * HOUR),
    );
    if (days < 0 || days > 30) continue;
    alerts.push({
      key: `credit:${c.id}`,
      type: "credit_expiring",
      severity: days <= 7 ? "high" : "medium",
      title: `Crédito vence em ${days} dia${days === 1 ? "" : "s"}`,
      detail: `${c.provider ?? "Crédito"} · validade ${brDate(c.expires_on)}.`,
      flightIds: [],
      bookingIds: c.booking_id ? [c.booking_id] : [],
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  return alerts.sort((x, y) => order[x.severity] - order[y.severity]);
}
