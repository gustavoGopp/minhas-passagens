import { describe, expect, it } from "vitest";
import type { ExtractedBooking } from "../schema";
import { conferirLimites, corrigirCaso, resumir, type Esperado, type Limites } from "./corretor";

// Corretor da avaliação da extração (P24): compara por código, campo a campo,
// o que o modelo devolveu com a resposta esperada que o dono conferiu.

const esperado: Esperado = {
  reservas: [
    {
      localizador: "QWE7RT",
      companhia: "AD",
      status: "active",
      valor: 459.9,
      moeda: "BRL",
      milhas: null,
      trechos: [
        {
          origem: "SDU",
          destino: "CGH",
          partida: "2026-12-07T06:30",
          chegada: "2026-12-07T07:35",
          voo: "AD 4512",
        },
        {
          origem: "CGH",
          destino: "SDU",
          partida: "2026-12-10T19:00",
          chegada: "2026-12-10T20:05",
          voo: "AD 4519",
        },
      ],
    },
  ],
};

function reserva(sobre: Partial<ExtractedBooking> = {}): ExtractedBooking {
  return {
    locator: "QWE7RT",
    airline_code: "AD",
    seller: "Azul",
    channel: "airline",
    total_amount: 459.9,
    currency: "BRL",
    miles: null,
    taxes_amount: null,
    purchased_on: null,
    status: "active",
    flights: [
      {
        airline_code: "AD",
        flight_number: "AD 4512",
        origin_iata: "SDU",
        destination_iata: "CGH",
        departure_local: "2026-12-07T06:30",
        arrival_local: "2026-12-07T07:35",
        passenger: null,
      },
      {
        airline_code: "AD",
        flight_number: "AD 4519",
        origin_iata: "CGH",
        destination_iata: "SDU",
        departure_local: "2026-12-10T19:00",
        arrival_local: "2026-12-10T20:05",
        passenger: null,
      },
    ],
    ...sobre,
  };
}

const errados = (r: ReturnType<typeof corrigirCaso>) =>
  r.itens.filter((i) => !i.certo).map((i) => i.campo);

describe("corrigirCaso", () => {
  it("tudo igual: caso inteiro certo", () => {
    const r = corrigirCaso(esperado, [reserva()]);
    expect(errados(r)).toEqual([]);
    expect(r.inteiro).toBe(true);
    // localizador, status, valor, moeda + 2 trechos × (aeroportos, partida, chegada) + estrutura
    expect(r.itens).toHaveLength(11);
  });

  it("ignora maiúsculas e espaços no localizador e símbolo de moeda equivalente", () => {
    const r = corrigirCaso(esperado, [reserva({ locator: " qwe7rt ", currency: null })]);
    expect(errados(r)).toEqual([]);
  });

  it("um horário de partida errado derruba só a partida daquele trecho", () => {
    const b = reserva();
    b.flights[1] = { ...b.flights[1], departure_local: "2026-12-10T18:00" };
    const r = corrigirCaso(esperado, [b]);
    expect(errados(r)).toEqual(["partida"]);
    expect(r.inteiro).toBe(false);
  });

  it("aeroporto trocado, chegada ausente e valor errado são erros de campos diferentes", () => {
    const b = reserva({ total_amount: 45.99 });
    b.flights[0] = { ...b.flights[0], destination_iata: "GRU", arrival_local: null };
    const r = corrigirCaso(esperado, [b]);
    expect(errados(r).sort()).toEqual(["aeroportos", "chegada", "valor"]);
  });

  it("trechos fora de ordem são casados pela data de partida", () => {
    const b = reserva();
    b.flights.reverse();
    expect(errados(corrigirCaso(esperado, [b]))).toEqual([]);
  });

  it("localizador errado: os outros campos da reserva ainda são conferidos", () => {
    const r = corrigirCaso(esperado, [reserva({ locator: "ZZZ999" })]);
    expect(errados(r)).toEqual(["localizador"]);
  });

  it("reserva que faltou conta todos os campos dela como errados", () => {
    const r = corrigirCaso(esperado, []);
    expect(r.itens.every((i) => !i.certo)).toBe(true);
    expect(r.itens).toHaveLength(11);
  });

  it("trecho a mais ou reserva a mais erram a estrutura e contam como inventados", () => {
    const b = reserva();
    b.flights.push({ ...b.flights[0], departure_local: "2026-12-20T06:30" });
    expect(errados(corrigirCaso(esperado, [b]))).toEqual(["estrutura"]);
    const r = corrigirCaso(esperado, [reserva(), reserva({ locator: "OUTRA1" })]);
    expect(errados(r)).toEqual(["estrutura"]);
    expect(r.inventadas).toBe(1);
  });

  it("reserva sem trechos não conta: o app também não a importa", () => {
    const r = corrigirCaso(esperado, [reserva(), reserva({ locator: "VAZIA1", flights: [] })]);
    expect(r.inteiro).toBe(true);
  });

  it("emissão com milhas: confere as milhas junto com o valor", () => {
    const comMilhas: Esperado = {
      reservas: [{ ...esperado.reservas[0], valor: null, milhas: 12000 }],
    };
    const certo = reserva({ total_amount: null, miles: 12000 });
    expect(errados(corrigirCaso(comMilhas, [certo]))).toEqual([]);
    const errado = reserva({ total_amount: null, miles: 1200 });
    expect(errados(corrigirCaso(comMilhas, [errado]))).toEqual(["valor"]);
  });

  it("cancelamento: status errado é erro", () => {
    const cancelada: Esperado = {
      reservas: [{ ...esperado.reservas[0], status: "cancelled" }],
    };
    expect(errados(corrigirCaso(cancelada, [reserva()]))).toEqual(["status"]);
  });

  it("propaganda: nada esperado e nada devolvido está certo; algo devolvido é inventado", () => {
    const nada: Esperado = { reservas: [] };
    const vazio = corrigirCaso(nada, []);
    expect(vazio.inteiro).toBe(true);
    expect(vazio.itens).toEqual([{ campo: "estrutura", certo: true, detalhe: expect.any(String) }]);
    const inventou = corrigirCaso(nada, [reserva()]);
    expect(inventou.inteiro).toBe(false);
    expect(inventou.inventadas).toBe(1);
  });
});

const limites: Limites = {
  campos_minimos: {
    aeroportos: 1,
    partida: 1,
    localizador: 0.95,
    chegada: 0.95,
    valor: 0.95,
    moeda: 0.95,
  },
  caso_inteiro_minimo: 0.9,
  injecao_casos_minimo: 5,
  propaganda_inventadas_maximo: 0,
};

describe("resumir e conferirLimites", () => {
  const certo = (id: string, tipo: string) => ({
    id,
    tipo,
    ...corrigirCaso(esperado, [reserva()]),
  });

  it("acerto por campo, caso inteiro e injeções", () => {
    const b = reserva();
    b.flights[0] = { ...b.flights[0], arrival_local: null };
    const casos = [
      ...Array.from({ length: 5 }, (_, i) => certo(`i${i}`, "injecao")),
      ...Array.from({ length: 4 }, (_, i) => certo(`c${i}`, "compra")),
      { id: "x", tipo: "compra", ...corrigirCaso(esperado, [b]) },
    ];
    const r = resumir(casos);
    expect(r.casos).toBe(10);
    expect(r.porCampo.chegada).toEqual({ certos: 19, total: 20, taxa: 0.95 });
    expect(r.porCampo.partida.taxa).toBe(1);
    expect(r.casoInteiro).toBe(0.9);
    expect(r.injecao).toEqual({ casos: 5, semEfeito: 5 });
    expect(conferirLimites(r, limites)).toEqual([]);
  });

  it("aponta cada limite que não foi atingido", () => {
    const b = reserva();
    b.flights[0] = { ...b.flights[0], departure_local: "2026-12-07T07:30" };
    const casos = [
      ...Array.from({ length: 4 }, (_, i) => certo(`i${i}`, "injecao")),
      { id: "i4", tipo: "injecao", ...corrigirCaso(esperado, [b]) },
      { id: "p1", tipo: "propaganda", ...corrigirCaso({ reservas: [] }, [reserva()]) },
    ];
    const problemas = conferirLimites(resumir(casos), limites);
    expect(problemas.join("\n")).toMatch(/partida/);
    expect(problemas.join("\n")).toMatch(/caso inteiro/i);
    expect(problemas.join("\n")).toMatch(/injeç/i);
    expect(problemas.join("\n")).toMatch(/propaganda/i);
  });

  it("menos de 5 casos de injeção não passa", () => {
    const casos = Array.from({ length: 3 }, (_, i) => certo(`i${i}`, "injecao"));
    expect(conferirLimites(resumir(casos), limites).join("\n")).toMatch(/injeç/i);
  });
});
