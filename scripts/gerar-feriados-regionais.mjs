// Gera src/data/feriados-regionais.json a partir dos dados do pacote date-holidays
// (data/countries/BR.yaml, licença CC BY-SA 3.0). Rode com:
//   node scripts/gerar-feriados-regionais.mjs
// Só regras de estados e municípios; os feriados nacionais são calculados em
// src/lib/holidays/brazil.ts a partir da legislação.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parse } from "yaml";

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve("date-holidays/package.json"));
const pkgVersion = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8")).version;
const doc = parse(readFileSync(path.join(pkgDir, "data/countries/BR.yaml"), "utf8"));

const NAMED = {
  "easter 60": "Corpus Christi",
  "08-15": "Assunção de Nossa Senhora",
  "12-08": "Imaculada Conceição",
};
const WEEKDAYS = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const ORD = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };
const MONTHS = {
  January: 1,
  February: 2,
  March: 3,
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12,
};
const KIND = {
  public: "holiday",
  optional: "optional",
  bank: "optional",
  observance: "observance",
};

function parseRule(key) {
  let m;
  if ((m = key.match(/^(\d{2})-(\d{2})$/))) return { type: "fixed", month: +m[1], day: +m[2] };
  if ((m = key.match(/^(\d{2})-(\d{2}) if .+ then next sunday$/)))
    return { type: "fixed_next_sunday", month: +m[1], day: +m[2] };
  if ((m = key.match(/^easter(?: (-?\d+))?$/))) return { type: "easter", offset: m[1] ? +m[1] : 0 };
  if ((m = key.match(/^(1st|2nd|3rd|4th) (\w+) in (\w+)$/)))
    return { type: "nth_weekday", nth: ORD[m[1]], weekday: WEEKDAYS[m[2]], month: MONTHS[m[3]] };
  throw new Error(`Regra não suportada: ${key}`);
}

function convertDays(days, regionCode) {
  const out = [];
  for (const [key, def] of Object.entries(days ?? {})) {
    const active = def.active?.[0];
    // Ignora regras encerradas antes de 2024 (ex.: 20/11 estadual, hoje nacional).
    if (active?.to && active.to < "2024-01-01") continue;
    const name = def.name?.pt ?? NAMED[def._name] ?? NAMED[key];
    if (!name) throw new Error(`Sem nome para ${regionCode} ${key}`);
    out.push({
      rule: parseRule(key),
      name,
      kind: KIND[def.type ?? "public"] ?? "holiday",
      ...(active?.from ? { from: String(active.from) } : {}),
      ...(active?.to ? { to: String(active.to) } : {}),
      ...(def.note ? { note: def.note } : {}),
    });
  }
  return out;
}

const states = doc.holidays.BR.states;
const result = { source: `date-holidays ${pkgVersion} (CC BY-SA 3.0)`, states: {}, cities: {} };
for (const [uf, st] of Object.entries(states)) {
  result.states[uf] = { name: st.name, rules: convertDays(st.days, uf) };
  for (const [code, city] of Object.entries(st.regions ?? {})) {
    result.cities[`${uf}-${code}`] = {
      uf,
      name: city.name,
      rules: convertDays(city.days, `${uf}-${code}`),
    };
  }
}
const target = path.join(import.meta.dirname, "..", "src/data/feriados-regionais.json");
writeFileSync(target, JSON.stringify(result, null, 2) + "\n");
console.log(
  `Gerado ${target}: ${Object.keys(result.states).length} UFs, ${Object.keys(result.cities).length} cidades`,
);
