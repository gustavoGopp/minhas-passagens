/** Categoria do dia: feriado de lei, ponto facultativo/opcional ou só uma data comemorativa. */
export type HolidayKind = "holiday" | "optional" | "observance";

export type HolidaySource =
  "br_national" | "br_state" | "br_city" | "christian" | "jewish" | "custom";

export interface HolidayEvent {
  /** Identificador estável dentro do ano (ex.: "br:tiradentes", "jewish:pesach-1"). */
  key: string;
  name: string;
  /** Primeiro dia civil, YYYY-MM-DD. */
  date: string;
  /** Último dia civil (inclusive), YYYY-MM-DD. Igual a date para eventos de 1 dia. */
  endDate: string;
  kind: HolidayKind;
  source: HolidaySource;
  /** "BR", "BR-SP", "BR-SP-SP" (cidade), "JEWISH" etc. */
  region: string;
  /** Verdadeiro quando o evento começa no pôr do sol da véspera (calendário judaico). */
  startsAtSunset: boolean;
  /** Dia de jejum (Yom Kipur, Tishá BeAv). */
  fast?: boolean;
  note?: string;
}
