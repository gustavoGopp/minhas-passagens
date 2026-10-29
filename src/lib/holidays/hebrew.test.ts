import { describe, expect, it } from "vitest";
import {
  daysInHebrewYear,
  hebrewToIso,
  isHebrewLeapYear,
  jewishHolidays,
  NISAN,
  TISHREI,
} from "./hebrew";

const first = (year: number, key: string, israel = false) =>
  jewishHolidays(year, { israel }).find(
    (e) => e.key === `jewish:${key}` && e.date.startsWith(`${year}-`),
  );

describe("calendário hebraico", () => {
  it("converte datas conhecidas", () => {
    expect(hebrewToIso(5785, TISHREI, 1)).toBe("2024-10-03");
    expect(hebrewToIso(5786, TISHREI, 1)).toBe("2025-09-23");
    expect(hebrewToIso(5786, NISAN, 15)).toBe("2026-04-02");
  });

  it("identifica anos embolísmicos e durações válidas", () => {
    expect(isHebrewLeapYear(5784)).toBe(true);
    expect(isHebrewLeapYear(5785)).toBe(false);
    for (let y = 5780; y <= 5800; y++) {
      expect([353, 354, 355, 383, 384, 385]).toContain(daysInHebrewYear(y));
    }
  });

  // Datas publicadas (primeiro dia; o evento começa ao pôr do sol da véspera).
  it.each([
    [2024, "pessach", "2024-04-23"],
    [2024, "rosh-hashana", "2024-10-03"],
    [2024, "yom-kipur", "2024-10-12"],
    [2024, "chanuca", "2024-12-26"],
    [2025, "purim", "2025-03-14"],
    [2025, "pessach", "2025-04-13"],
    [2025, "shavuot", "2025-06-02"],
    [2025, "rosh-hashana", "2025-09-23"],
    [2025, "yom-kipur", "2025-10-02"],
    [2025, "sucot", "2025-10-07"],
    [2025, "chanuca", "2025-12-15"],
    [2026, "purim", "2026-03-03"],
    [2026, "pessach", "2026-04-02"],
    [2026, "shavuot", "2026-05-22"],
    [2026, "rosh-hashana", "2026-09-12"],
    [2026, "yom-kipur", "2026-09-21"],
    [2027, "pessach", "2027-04-22"],
    [2027, "rosh-hashana", "2027-10-02"],
  ])("%i: %s em %s", (year, key, date) => {
    expect(first(year, key)?.date).toBe(date);
  });

  it("marca início ao pôr do sol e jejum de Yom Kipur", () => {
    const yk = first(2026, "yom-kipur");
    expect(yk).toMatchObject({ startsAtSunset: true, fast: true, kind: "holiday" });
  });

  it("adia Tishá BeAv quando 9 de Av cai no Shabat (2022)", () => {
    // 9 de Av de 5782 foi sábado, 06/08/2022; o jejum foi no domingo, 07/08.
    expect(first(2022, "tisha-beav")).toMatchObject({
      date: "2022-08-07",
      note: expect.stringContaining("Shabat"),
    });
    expect(first(2025, "tisha-beav")).toMatchObject({ date: "2025-08-03" });
    expect(first(2025, "tisha-beav")?.note).toBeUndefined();
    expect(first(2026, "tisha-beav")?.date).toBe("2026-07-23");
  });

  it("diáspora tem dois dias de yom tov; Israel, um", () => {
    expect(first(2026, "pessach")?.endDate).toBe("2026-04-03");
    expect(first(2026, "pessach", true)?.endDate).toBe("2026-04-02");
    expect(first(2026, "simchat-tora")?.date).toBe("2026-10-04");
    expect(first(2026, "simchat-tora", true)).toBeUndefined();
  });

  it("inclui Chanucá que começou em dezembro do ano anterior", () => {
    const ch = jewishHolidays(2025).filter((e) => e.key === "jewish:chanuca");
    expect(ch.map((e) => e.date)).toEqual(["2024-12-26", "2025-12-15"]);
  });
});
