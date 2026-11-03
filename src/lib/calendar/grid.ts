import { addDays, isoDate, weekday } from "@/lib/holidays/dates";

/** Cabeçalho da grade (semana começa no domingo, como nos calendários brasileiros). */
export const WEEKDAYS_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];
export const WEEKDAYS_LONG = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/**
 * Semanas de um mês como linhas de 7 dias (ISO "AAAA-MM-DD"). Dias de outros
 * meses ficam `null`: a grade nunca mostra dia de outro mês (nem de outro ano).
 */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = isoDate(year, month, 1);
  const days: string[] = [];
  for (
    let d = first;
    Number(d.slice(5, 7)) === month && Number(d.slice(0, 4)) === year;
    d = addDays(d, 1)
  )
    days.push(d);
  const cells: (string | null)[] = [...Array(weekday(first)).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export type DayMarks = { flight: boolean; holiday: boolean; optional: boolean };

/** Marca cada dia com voo, feriado ou ponto facultativo (para a grade). */
export function markDays(input: {
  flights: string[];
  holidays: { date: string; endDate: string; kind: "holiday" | "optional" | "observance" }[];
}): Map<string, DayMarks> {
  const out = new Map<string, DayMarks>();
  const get = (d: string) => {
    const m = out.get(d) ?? { flight: false, holiday: false, optional: false };
    out.set(d, m);
    return m;
  };
  for (const d of input.flights) get(d).flight = true;
  for (const h of input.holidays) {
    if (h.kind === "observance") continue;
    for (let d = h.date; d <= h.endDate; d = addDays(d, 1)) {
      if (h.kind === "holiday") get(d).holiday = true;
      else get(d).optional = true;
    }
  }
  return out;
}
