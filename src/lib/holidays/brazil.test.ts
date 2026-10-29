import { describe, expect, it } from "vitest";
import {
  brazilCityHolidays,
  brazilNationalHolidays,
  brazilStateHolidays,
  listCities,
  listStates,
} from "./brazil";

const byKey = (year: number) => new Map(brazilNationalHolidays(year).map((e) => [e.key, e]));

describe("feriados nacionais", () => {
  it("calcula os móveis de 2026 a partir da Páscoa (05/04)", () => {
    const h = byKey(2026);
    expect(h.get("br:carnaval-segunda")?.date).toBe("2026-02-16");
    expect(h.get("br:carnaval-terca")?.date).toBe("2026-02-17");
    expect(h.get("br:paixao")?.date).toBe("2026-04-03");
    expect(h.get("br:corpus-christi")?.date).toBe("2026-06-04");
  });

  it("trata Carnaval e Corpus Christi como ponto facultativo, não feriado de lei", () => {
    const h = byKey(2026);
    expect(h.get("br:carnaval-terca")?.kind).toBe("optional");
    expect(h.get("br:corpus-christi")?.kind).toBe("optional");
    expect(h.get("br:tiradentes")?.kind).toBe("holiday");
  });

  it("inclui 20 de novembro só a partir de 2024 (Lei 14.759/2023)", () => {
    expect(byKey(2023).has("br:consciencia-negra")).toBe(false);
    expect(byKey(2024).get("br:consciencia-negra")?.date).toBe("2024-11-20");
  });

  it("tem 13 eventos em 2026 (9 fixos + Consciência Negra + Paixão + 4 facultativos - ...)", () => {
    const list = brazilNationalHolidays(2026);
    expect(list.filter((e) => e.kind === "holiday")).toHaveLength(10);
    expect(list.filter((e) => e.kind === "optional")).toHaveLength(4);
  });
});

describe("feriados estaduais e municipais", () => {
  it("lista as 27 UFs e cidades da semente", () => {
    expect(listStates()).toHaveLength(27);
    expect(listCities("SP").map((c) => c.code)).toEqual(["SP-SP"]);
  });

  it("SP: 9 de julho; cidade de São Paulo: 25 de janeiro e Corpus Christi como feriado", () => {
    expect(brazilStateHolidays(2026, "SP").map((e) => e.date)).toEqual(["2026-07-09"]);
    const city = brazilCityHolidays(2026, "SP-SP");
    expect(city.find((e) => e.date === "2026-01-25")?.name).toBe("Aniversário da Cidade");
    expect(city.find((e) => e.name === "Corpus Christi")).toMatchObject({
      date: "2026-06-04",
      kind: "holiday",
    });
  });

  it("RJ: São Jorge, terça de Carnaval e Dia do Comércio (3ª terça de outubro)", () => {
    const rj = brazilStateHolidays(2026, "RJ");
    expect(rj.find((e) => e.name === "Dia de São Jorge")?.date).toBe("2026-04-23");
    expect(rj.find((e) => e.name === "Carnaval")?.date).toBe("2026-02-17");
    expect(rj.find((e) => e.name === "Dia do Comércio")).toMatchObject({
      date: "2026-10-20",
      kind: "observance",
    });
    expect(brazilCityHolidays(2026, "RJ-RJ")[0]).toMatchObject({
      date: "2026-01-20",
      name: "Dia de São Sebastião",
    });
  });

  it("SC: Santa Catarina passa para o domingo seguinte", () => {
    const sc = brazilStateHolidays(2026, "SC");
    // 11/08/2026 é terça; vai para domingo 16/08.
    expect(sc.find((e) => e.name === "Dia de Santa Catarina")?.date).toBe("2026-08-16");
  });

  it("UF ou cidade desconhecida devolve lista vazia", () => {
    expect(brazilStateHolidays(2026, "XX")).toEqual([]);
    expect(brazilCityHolidays(2026, "XX-YY")).toEqual([]);
  });
});
