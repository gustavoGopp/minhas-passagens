/** Tipos do monitor de preços (M6). Lógica pura, sem acesso a banco ou rede. */

export const MONITOR_KINDS = ["weekly", "dates", "holiday"] as const;
export type MonitorKind = (typeof MONITOR_KINDS)[number];

export const FREQUENCIES = ["daily", "twice_daily", "weekly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const PRICE_PROVIDERS = ["travelpayouts", "duffel", "serpapi"] as const;
export type PriceProviderId = (typeof PRICE_PROVIDERS)[number];

/** Janela de horário local "HH:MM"–"HH:MM" (inclusiva) no aeroporto de origem. */
export interface TimeWindow {
  from: string;
  to: string;
}

/** Recorrente semanal: dia da semana (0 = domingo) + janela. */
export interface WeeklySlot extends TimeWindow {
  weekday: number;
}

/** Datas fixas (start = end) ou janela de datas, com janela de horário. */
export interface DateRange extends TimeWindow {
  start: string;
  end: string;
}

export type MonitorRule =
  | { kind: "weekly"; slots: WeeklySlot[] }
  | { kind: "dates"; ranges: DateRange[] }
  /**
   * Feriado prolongado: "outbound" monitora a véspera e o 1º dia da folga;
   * "return" monitora o último dia e o dia seguinte.
   */
  | { kind: "holiday"; leg: "outbound" | "return"; window: TimeWindow };

export interface MonitorConfig {
  id: string;
  origin: string;
  destination: string;
  rule: MonitorRule;
  horizon_weeks: number;
  target_cents: number;
  margin_cents: number | null;
  margin_pct: number | null;
  airlines: string[];
  allow_connections: boolean;
  max_duration_min: number | null;
  frequency: Frequency;
  provider: PriceProviderId;
}

/** Uma data a monitorar, com as janelas de horário aceitas nela. */
export interface Target {
  date: string;
  windows: TimeWindow[];
}

/** Oferta normalizada vinda de qualquer provedor. */
export interface Offer {
  /** Data local da partida, YYYY-MM-DD. */
  date: string;
  /** Hora local da partida no aeroporto de origem, HH:MM. */
  time: string;
  origin: string;
  destination: string;
  /** Código IATA da companhia (ex.: G3). */
  airline: string;
  flightNumber: string | null;
  priceCents: number;
  currency: string;
  transfers: number;
  durationMin: number | null;
  /** Quando o provedor viu esse preço (se informado). */
  foundAt: string | null;
}
