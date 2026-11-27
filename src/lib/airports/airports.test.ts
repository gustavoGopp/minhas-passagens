import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import foreignJson from "@/data/airports-intl.json";
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

describe("aeroportos estrangeiros", () => {
  const estrangeiros = foreignJson as { iata: string; city: string; country: string; tz: string }[];

  it("códigos válidos, sem repetição e sem repetir a tabela brasileira", () => {
    const codes = estrangeiros.map((a) => a.iata);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) {
      expect(c).toMatch(/^[A-Z]{3}$/);
      expect(findAirport(c), `${c} já está na tabela brasileira`).toBeUndefined();
    }
  });

  it("todo fuso é um fuso IANA que o sistema reconhece", () => {
    for (const a of estrangeiros) {
      expect(() => new Intl.DateTimeFormat("pt-BR", { timeZone: a.tz }), a.iata).not.toThrow();
    }
  });

  it("a consulta passagens-conferir.sql usa as mesmas listas de aeroportos", () => {
    const sql = readFileSync(
      path.join(import.meta.dirname, "../../../supabase/diagnostics/passagens-conferir.sql"),
      "utf8",
    );
    const lista = (nome: string) => {
      const bloco = new RegExp(`${nome}\\(iata\\) as \\(([^)]*)\\)`, "s").exec(sql)?.[1] ?? "";
      return [...bloco.matchAll(/'([A-Z]{3})'/g)].map((m) => m[1]).sort();
    };
    expect(lista("br")).toEqual(
      listAirports()
        .map((a) => a.iata)
        .sort(),
    );
    expect(lista("estrangeiros")).toEqual(estrangeiros.map((a) => a.iata).sort());
  });
});

describe("migração de correção do fuso dos aeroportos estrangeiros", () => {
  const sql = readFileSync(
    path.join(
      import.meta.dirname,
      "../../../supabase/migrations/20261127000000_fuso_aeroportos_estrangeiros.sql",
    ),
    "utf8",
  );

  it("usa exatamente a lista de aeroportos e fusos de airports-intl.json", () => {
    const naMigracao = [...sql.matchAll(/\('([A-Z]{3})', '([\w/]+)'\)/g)]
      .map((m) => `${m[1]} ${m[2]}`)
      .sort();
    const naLista = (foreignJson as { iata: string; tz: string }[])
      .map((a) => `${a.iata} ${a.tz}`)
      .sort();
    expect(naMigracao).toEqual(naLista);
  });

  it("roda uma vez só: confere e grava a marca na mesma transação", () => {
    expect(sql).toMatch(/^do \$\$/m);
    expect(sql).toContain(
      "if exists (select 1 from public.app_config where key = 'fuso_estrangeiros_corrigido')",
    );
    expect(sql).toContain("insert into public.app_config (key, value)");
  });
});
