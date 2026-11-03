import { describe, expect, it } from "vitest";
import { markDays, monthGrid } from "./grid";

describe("grade do calendário", () => {
  it("novembro de 2026 começa num domingo e tem 5 semanas", () => {
    const g = monthGrid(2026, 11);
    expect(g[0][0]).toBe("2026-11-01");
    expect(g).toHaveLength(5);
    expect(g.flat().filter(Boolean)).toHaveLength(30);
    expect(g[4].slice(0, 2)).toEqual(["2026-11-29", "2026-11-30"]);
    expect(g[4][2]).toBeNull();
  });

  it("nunca mostra dias de outro mês nem de outro ano", () => {
    const jan = monthGrid(2027, 1); // 1/1/2027 é sexta
    expect(jan[0].slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(jan[0][5]).toBe("2027-01-01");
    expect(jan.flat().every((d) => d === null || d.startsWith("2027-01-"))).toBe(true);
    const dec = monthGrid(2026, 12);
    expect(dec.flat().every((d) => d === null || d.startsWith("2026-12-"))).toBe(true);
  });

  it("fevereiro em ano bissexto", () => {
    expect(monthGrid(2028, 2).flat().filter(Boolean)).toHaveLength(29);
  });

  it("marca voos, feriados (inclusive de vários dias) e facultativos; datas comemorativas não", () => {
    const m = markDays({
      flights: ["2026-11-16"],
      holidays: [
        { date: "2026-11-15", endDate: "2026-11-15", kind: "holiday" },
        { date: "2026-02-16", endDate: "2026-02-17", kind: "optional" },
        { date: "2026-12-04", endDate: "2026-12-04", kind: "observance" },
      ],
    });
    expect(m.get("2026-11-16")).toEqual({ flight: true, holiday: false, optional: false });
    expect(m.get("2026-11-15")?.holiday).toBe(true);
    expect(m.get("2026-02-17")?.optional).toBe(true);
    expect(m.has("2026-12-04")).toBe(false);
  });
});
