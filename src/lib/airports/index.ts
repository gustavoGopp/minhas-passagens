import airportsJson from "@/data/airports-br.json";

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

const airports: readonly Airport[] = airportsJson as Airport[];
const byIata = new Map(airports.map((a) => [a.iata, a]));

export function listAirports(): readonly Airport[] {
  return airports;
}

/** Busca por código IATA, ignorando caixa e espaços. Retorna undefined se desconhecido. */
export function findAirport(iata: string): Airport | undefined {
  return byIata.get(iata.trim().toUpperCase());
}

/** Fuso IANA do aeroporto, ou undefined se o código não estiver na tabela. */
export function airportTimeZone(iata: string): string | undefined {
  return findAirport(iata)?.tz;
}

/** Verdadeiro quando os dois códigos são o mesmo aeroporto (comparação exata, sem agrupar por cidade). */
export function isSameAirport(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}
