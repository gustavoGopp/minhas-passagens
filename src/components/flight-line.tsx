import { airportTimeZone, findAirport } from "@/lib/airports";
import { DEFAULT_TZ, type FlightRow } from "@/lib/trips/draft";
import { formatInZone } from "@/lib/trips/time";
import { airlineName } from "@/lib/trips/airlines";

/** Linha de um trecho: rota, horário local de partida e voo. */
export function FlightLine({ f, big = false }: { f: FlightRow; big?: boolean }) {
  const tz = airportTimeZone(f.origin) ?? DEFAULT_TZ;
  const arrTz = airportTimeZone(f.destination) ?? DEFAULT_TZ;
  const arrTime = f.arrives_at
    ? new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: arrTz,
      }).format(new Date(f.arrives_at))
    : null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className={big ? "text-2xl font-semibold tracking-tight" : "text-sm font-medium"}>
        {f.origin} → {f.destination}
      </span>
      <span className={big ? "text-base" : "text-xs text-zinc-600 dark:text-zinc-400"}>
        {formatInZone(f.departs_at, tz)}
        {arrTime ? ` · chega ${arrTime}` : ""}
      </span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        {[airlineName(f.airline), f.flight_number, findAirport(f.origin)?.name]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </div>
  );
}

/** "em 3 dias", "amanhã", "em 5 h". */
export function relativeTime(iso: string, nowIso: string): string {
  const diff = Date.parse(iso) - Date.parse(nowIso);
  const hours = Math.round(diff / 3_600_000);
  if (diff < 0) return "em andamento";
  if (hours < 1) return "em menos de 1 h";
  if (hours < 24) return `em ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "amanhã" : `em ${days} dias`;
}
