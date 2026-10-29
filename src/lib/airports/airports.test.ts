import { describe, expect, it } from "vitest";
import { airportTimeZone, findAirport, isSameAirport, listAirports } from "./index";

describe("tabela de aeroportos BR", () => {
  it("não tem códigos IATA duplicados e todos têm 3 letras maiúsculas", () => {
    const codes = listAirports().map((a) => a.iata);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[A-Z]{3}$/);
  });

  it("todo fuso é um IANA válido reconhecido pelo Intl", () => {
    for (const a of listAirports()) {
      expect(() => new Intl.DateTimeFormat("pt-BR", { timeZone: a.tz })).not.toThrow();
    }
  });

  it("encontra a ponte aérea com qualquer caixa", () => {
    expect(findAirport("sdu")?.city).toBe("Rio de Janeiro");
    expect(findAirport(" CGH ")?.city).toBe("São Paulo");
  });

  it("retorna undefined para código desconhecido", () => {
    expect(findAirport("XXX")).toBeUndefined();
    expect(airportTimeZone("XXX")).toBeUndefined();
  });

  it("usa fusos diferentes de Brasília onde a lei manda", () => {
    expect(airportTimeZone("MAO")).toBe("America/Manaus");
    expect(airportTimeZone("FEN")).toBe("America/Noronha");
    expect(airportTimeZone("SDU")).toBe("America/Sao_Paulo");
  });

  it("trata cada aeroporto como um lugar distinto (decisão da entrevista)", () => {
    expect(isSameAirport("SDU", "sdu")).toBe(true);
    expect(isSameAirport("SDU", "GIG")).toBe(false);
    expect(isSameAirport("CGH", "GRU")).toBe(false);
  });
});
