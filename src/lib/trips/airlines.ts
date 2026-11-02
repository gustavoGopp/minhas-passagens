export const AIRLINES = [
  { code: "AD", name: "Azul" },
  { code: "G3", name: "Gol" },
  { code: "LA", name: "LATAM" },
  { code: "OTHER", name: "Outra" },
] as const;

export type AirlineCode = (typeof AIRLINES)[number]["code"];

export function airlineName(code: string): string {
  return AIRLINES.find((a) => a.code === code)?.name ?? code;
}

export const CHANNELS = [
  { code: "airline", name: "Site/app da companhia" },
  { code: "agency", name: "Agência online" },
  { code: "miles", name: "Milhas" },
  { code: "corporate", name: "Corporativo" },
] as const;

export type Channel = (typeof CHANNELS)[number]["code"];
