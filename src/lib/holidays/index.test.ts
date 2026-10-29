import { describe, expect, it } from "vitest";
import { getHolidays, holidaysNear } from "./index";

describe("getHolidays", () => {
  it("mescla Corpus Christi nacional facultativo com o municipal de São Paulo, ficando feriado", () => {
    const list = getHolidays(2026, { uf: "SP", city: "SP-SP" });
    const cc = list.filter((e) => e.date === "2026-06-04");
    expect(cc).toHaveLength(1);
    expect(cc[0].kind).toBe("holiday");
  });

  it("não duplica a Consciência Negra nacional e municipal", () => {
    const list = getHolidays(2026, { uf: "SP", city: "SP-SP" });
    expect(list.filter((e) => e.date === "2026-11-20")).toHaveLength(1);
  });

  it("esconde pontos facultativos quando o usuário pede", () => {
    const list = getHolidays(2026, { showOptional: false });
    expect(list.some((e) => e.kind === "optional")).toBe(false);
  });

  it("inclui judaicos e cristãos só quando ativados", () => {
    expect(getHolidays(2026).some((e) => e.source === "jewish")).toBe(false);
    expect(getHolidays(2026, { showJewish: true }).some((e) => e.key === "jewish:yom-kipur")).toBe(
      true,
    );
    expect(
      getHolidays(2026, { showChristian: true }).some((e) => e.key === "christian:pentecostes"),
    ).toBe(true);
  });

  it("aplica overrides: adiciona feriado próprio e esconde um evento", () => {
    const list = getHolidays(2026, {}, [
      { action: "add", date: "2026-08-15", name: "Padroeira da minha cidade", kind: "holiday" },
      { action: "hide", date: "2026-02-18", key: "br:cinzas" },
    ]);
    expect(list.find((e) => e.date === "2026-08-15")).toMatchObject({
      source: "custom",
      name: "Padroeira da minha cidade",
    });
    expect(list.some((e) => e.key === "br:cinzas")).toBe(false);
  });
});

describe("holidaysNear", () => {
  it("acha feriados a até N dias de uma viagem", () => {
    const list = getHolidays(2026, { uf: "SP" });
    // Quinta 09/07/2026 é feriado em SP; voo de quarta 08/07 está a 1 dia.
    expect(holidaysNear(list, "2026-07-08", 1).map((e) => e.name)).toContain(
      "Revolução Constitucionalista",
    );
    expect(holidaysNear(list, "2026-07-01", 1)).toEqual([]);
  });
});
