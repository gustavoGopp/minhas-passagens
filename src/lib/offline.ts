import { airportTimeZone, findAirport } from "@/lib/airports";
import { airlineName } from "@/lib/trips/airlines";
import { DEFAULT_TZ, type BookingRow, type FlightRow } from "@/lib/trips/draft";
import { formatInZone } from "@/lib/trips/time";

/**
 * O que o app guarda no próprio aparelho para abrir sem internet: só os
 * próximos voos (rota, horário, companhia, localizador). Fica no localStorage do
 * navegador, nunca no servidor, e é apagado ao sair da conta.
 */
export const OFFLINE_KEY = "mp_offline_v1";
export const OFFLINE_MAX_FLIGHTS = 5;

export interface OfflineFlight {
  origin: string;
  destination: string;
  originCity: string;
  destinationCity: string;
  when: string;
  arrives: string | null;
  airline: string;
  flightNumber: string | null;
  airport: string | null;
  locator: string | null;
}

export interface OfflineSnapshot {
  savedAt: string;
  flights: OfflineFlight[];
}

/** Próximos voos ativos, já formatados no fuso do aeroporto (a página offline só mostra). */
export function offlineSnapshot(
  upcoming: FlightRow[],
  bookings: Map<string, Pick<BookingRow, "locator">>,
  now: string,
): OfflineSnapshot {
  return {
    savedAt: now,
    flights: upcoming.slice(0, OFFLINE_MAX_FLIGHTS).map((f) => {
      const tz = airportTimeZone(f.origin) ?? DEFAULT_TZ;
      const arrTz = airportTimeZone(f.destination) ?? DEFAULT_TZ;
      return {
        origin: f.origin,
        destination: f.destination,
        originCity: findAirport(f.origin)?.city ?? f.origin,
        destinationCity: findAirport(f.destination)?.city ?? f.destination,
        when: formatInZone(f.departs_at, tz, now),
        arrives: f.arrives_at
          ? new Intl.DateTimeFormat("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
              timeZone: arrTz,
            }).format(new Date(f.arrives_at))
          : null,
        airline: airlineName(f.airline),
        flightNumber: f.flight_number,
        airport: findAirport(f.origin)?.name ?? null,
        locator: bookings.get(f.booking_id)?.locator ?? null,
      };
    }),
  };
}
