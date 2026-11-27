import airportsJson from "@/data/airports-br.json";
import foreignJson from "@/data/airports-intl.json";

/** Aeroporto brasileiro da tabela estática semeada no repositório. */
export interface Airport {
  /** Código IATA de 3 letras (ex.: SDU). */
  iata: string;
  /** Código ICAO de 4 letras (ex.: SBRJ). */
  icao: string;
  name: string;
  city: string;
  /** Unidade da federação (sigla). */
  uf: string;
  /** Fuso IANA usado para converter horários locais informados pelas companhias. */
  tz: string;
}

/**
 * Aeroporto estrangeiro dos mais usados a partir do Brasil. Só serve para
 * converter horários locais com o fuso certo: o perfil, os monitores e os
 * feriados continuam usando apenas a tabela brasileira.
 */
export interface ForeignAirport {
  iata: string;
  city: string;
  country: string;
  tz: string;
}

const airports: readonly Airport[] = airportsJson as Airport[];
const byIata = new Map(airports.map((a) => [a.iata, a]));
const foreignByIata = new Map((foreignJson as ForeignAirport[]).map((a) => [a.iata, a]));

const code = (iata: string) => iata.trim().toUpperCase();

export function listAirports(): readonly Airport[] {
  return airports;
}

/** Busca por código IATA, ignorando caixa e espaços. Retorna undefined se desconhecido. */
export function findAirport(iata: string): Airport | undefined {
  return byIata.get(iata.trim().toUpperCase());
}

/** Cidades com aeroporto na tabela, em ordem alfabética (para "cidade onde você mora"). */
export function listAirportCities(): string[] {
  return [...new Set(airports.map((a) => a.city))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Aeroporto estrangeiro da lista, ou undefined. */
export function findForeignAirport(iata: string): ForeignAirport | undefined {
  return foreignByIata.get(code(iata));
}

/** Fuso IANA do aeroporto (brasileiro ou estrangeiro da lista), ou undefined se desconhecido. */
export function airportTimeZone(iata: string): string | undefined {
  return findAirport(iata)?.tz ?? findForeignAirport(iata)?.tz;
}

/** O app sabe o fuso deste aeroporto. Para os demais, os horários precisam de conferência. */
export function isKnownAirport(iata: string): boolean {
  return airportTimeZone(iata) !== undefined;
}

/** Verdadeiro quando os dois códigos são o mesmo aeroporto (comparação exata, sem agrupar por cidade). */
export function isSameAirport(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}
