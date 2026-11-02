import { inWindows } from "./rule";
import type { MonitorConfig, Offer, Target } from "./types";

/** Códigos equivalentes: a LATAM Brasil aparece como LA ou JJ conforme a fonte. */
const AIRLINE_ALIASES: Record<string, string> = { JJ: "LA" };

export function normalizeAirline(code: string): string {
  const c = code.trim().toUpperCase();
  return AIRLINE_ALIASES[c] ?? c;
}

/**
 * Aplica no cliente o que os provedores nem sempre filtram: aeroporto exato,
 * data-alvo, janela de horário, companhia, conexão e duração máxima.
 */
export function filterOffers(offers: Offer[], monitor: MonitorConfig, targets: Target[]): Offer[] {
  const byDate = new Map(targets.map((t) => [t.date, t.windows]));
  const allowed = new Set(monitor.airlines.map(normalizeAirline));
  return offers.filter((o) => {
    if (o.origin !== monitor.origin || o.destination !== monitor.destination) return false;
    const windows = byDate.get(o.date);
    if (!windows || !inWindows(o.time, windows)) return false;
    if (allowed.size && !allowed.has(normalizeAirline(o.airline))) return false;
    if (!monitor.allow_connections && o.transfers > 0) return false;
    if (
      monitor.max_duration_min &&
      o.durationMin != null &&
      o.durationMin > monitor.max_duration_min
    )
      return false;
    return true;
  });
}

/** Menor oferta por data, mantendo até `perDate` ofertas mais baratas (distintas por voo). */
export function cheapestPerDate(offers: Offer[], perDate = 5): Map<string, Offer[]> {
  const map = new Map<string, Offer[]>();
  const sorted = [...offers].sort((a, b) => a.priceCents - b.priceCents);
  for (const o of sorted) {
    const list = map.get(o.date) ?? [];
    const id = `${normalizeAirline(o.airline)}|${o.flightNumber ?? ""}|${o.time}`;
    if (list.length >= perDate) continue;
    if (list.some((x) => `${normalizeAirline(x.airline)}|${x.flightNumber ?? ""}|${x.time}` === id))
      continue;
    list.push(o);
    map.set(o.date, list);
  }
  return map;
}
