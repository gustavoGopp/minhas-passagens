import regional from "@/data/feriados-regionais.json";
import { addDays, isoDate, weekday } from "./dates";
import { easterSunday } from "./easter";
import type { HolidayEvent, HolidayKind } from "./types";

type Rule =
  | { type: "fixed"; month: number; day: number }
  | { type: "fixed_next_sunday"; month: number; day: number }
  | { type: "easter"; offset: number }
  | { type: "nth_weekday"; nth: number; weekday: number; month: number };

interface RegionalRule {
  rule: Rule;
  name: string;
  kind: HolidayKind;
  from?: string;
  to?: string;
  note?: string;
}

interface RegionalData {
  source: string;
  states: Record<string, { name: string; rules: RegionalRule[] }>;
  cities: Record<string, { uf: string; name: string; rules: RegionalRule[] }>;
}

const data = regional as RegionalData;

/** Fonte da semente regional, para atribuição (CC BY-SA 3.0). */
export const REGIONAL_SOURCE = data.source;

export function listStates(): { uf: string; name: string }[] {
  return Object.entries(data.states)
    .map(([uf, s]) => ({ uf, name: s.name }))
    .sort((a, b) => a.uf.localeCompare(b.uf));
}

/** Cidades com feriados municipais na semente. Código no formato "UF-CIDADE". */
export function listCities(uf?: string): { code: string; uf: string; name: string }[] {
  return Object.entries(data.cities)
    .filter(([, c]) => !uf || c.uf === uf)
    .map(([code, c]) => ({ code, uf: c.uf, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function resolveRule(rule: Rule, year: number): string {
  switch (rule.type) {
    case "fixed":
      return isoDate(year, rule.month, rule.day);
    case "fixed_next_sunday": {
      // Regra de SC: se não cair no domingo, passa para o domingo seguinte.
      const d = isoDate(year, rule.month, rule.day);
      const wd = weekday(d);
      return wd === 0 ? d : addDays(d, 7 - wd);
    }
    case "easter":
      return addDays(easterSunday(year), rule.offset);
    case "nth_weekday": {
      const first = isoDate(year, rule.month, 1);
      const shift = (rule.weekday - weekday(first) + 7) % 7;
      return addDays(first, shift + 7 * (rule.nth - 1));
    }
  }
}

function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function single(
  key: string,
  name: string,
  date: string,
  kind: HolidayKind,
  extra: Partial<HolidayEvent> = {},
): HolidayEvent {
  return {
    key,
    name,
    date,
    endDate: date,
    kind,
    source: "br_national",
    region: "BR",
    startsAtSunset: false,
    ...extra,
  };
}

/**
 * Feriados nacionais por lei (Leis 662/1949, 6.802/1980, 9.093/1995, 10.607/2002,
 * 14.759/2023) e pontos facultativos federais recorrentes (Carnaval, Quarta-feira
 * de Cinzas até 14h e Corpus Christi), definidos a cada ano por portaria.
 */
export function brazilNationalHolidays(year: number): HolidayEvent[] {
  const easter = easterSunday(year);
  const list: HolidayEvent[] = [
    single("br:confraternizacao", "Confraternização Universal", isoDate(year, 1, 1), "holiday"),
    single("br:carnaval-segunda", "Carnaval (segunda)", addDays(easter, -48), "optional", {
      note: "Ponto facultativo federal",
    }),
    single("br:carnaval-terca", "Carnaval (terça)", addDays(easter, -47), "optional", {
      note: "Ponto facultativo federal",
    }),
    single("br:cinzas", "Quarta-feira de Cinzas", addDays(easter, -46), "optional", {
      note: "Ponto facultativo até 14h",
    }),
    single("br:paixao", "Sexta-feira da Paixão", addDays(easter, -2), "holiday"),
    single("br:tiradentes", "Tiradentes", isoDate(year, 4, 21), "holiday"),
    single("br:trabalho", "Dia do Trabalho", isoDate(year, 5, 1), "holiday"),
    single("br:corpus-christi", "Corpus Christi", addDays(easter, 60), "optional", {
      note: "Ponto facultativo federal; feriado em várias cidades",
    }),
    single("br:independencia", "Independência do Brasil", isoDate(year, 9, 7), "holiday"),
    single("br:aparecida", "Nossa Senhora Aparecida", isoDate(year, 10, 12), "holiday"),
    single("br:finados", "Finados", isoDate(year, 11, 2), "holiday"),
    single("br:republica", "Proclamação da República", isoDate(year, 11, 15), "holiday"),
    single("br:natal", "Natal", isoDate(year, 12, 25), "holiday"),
  ];
  if (year >= 2024) {
    list.push(
      single("br:consciencia-negra", "Dia da Consciência Negra", isoDate(year, 11, 20), "holiday", {
        note: "Dia Nacional de Zumbi e da Consciência Negra (Lei 14.759/2023)",
      }),
    );
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/** Datas cristãs móveis que não são feriado nacional (opção do usuário). */
export function christianObservances(year: number): HolidayEvent[] {
  const easter = easterSunday(year);
  const make = (key: string, name: string, offset: number) =>
    single(`christian:${key}`, name, addDays(easter, offset), "observance", {
      source: "christian",
      region: "CHRISTIAN",
    });
  return [
    make("ramos", "Domingo de Ramos", -7),
    make("pascoa", "Páscoa", 0),
    make("ascensao", "Ascensão do Senhor", 39),
    make("pentecostes", "Pentecostes", 49),
  ];
}

function activeIn(rule: RegionalRule, date: string): boolean {
  if (rule.from && date < rule.from) return false;
  if (rule.to && date >= rule.to) return false;
  return true;
}

function regionalEvents(
  rules: RegionalRule[],
  year: number,
  source: "br_state" | "br_city",
  region: string,
): HolidayEvent[] {
  const out: HolidayEvent[] = [];
  for (const r of rules) {
    const date = resolveRule(r.rule, year);
    if (!activeIn(r, date)) continue;
    out.push({
      key: `${source === "br_state" ? "uf" : "city"}:${region}:${slug(r.name)}`,
      name: r.name,
      date,
      endDate: date,
      kind: r.kind,
      source,
      region,
      startsAtSunset: false,
      ...(r.note ? { note: r.note } : {}),
    });
  }
  return out;
}

export function brazilStateHolidays(year: number, uf: string): HolidayEvent[] {
  const st = data.states[uf];
  return st ? regionalEvents(st.rules, year, "br_state", `BR-${uf}`) : [];
}

export function brazilCityHolidays(year: number, cityCode: string): HolidayEvent[] {
  const city = data.cities[cityCode];
  return city ? regionalEvents(city.rules, year, "br_city", `BR-${cityCode}`) : [];
}
