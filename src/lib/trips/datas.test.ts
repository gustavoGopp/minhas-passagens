import { describe, expect, it } from "vitest";
import { draftSchema, emptyDraft, emptyLeg, purchaseAfterFlight, type BookingDraft } from "./draft";
import { isRealDate, localDateTimeProblem } from "./time";

// Tabela aprovada pelo dono em 26/11/2026. Não altere os resultados esperados
// sem aprovação dele. Origem: auditoria A2.1 ("31 de fevereiro às 25:99" era
// aceito e gravado como 4 de março).

function rascunho(
  mudancas: Partial<BookingDraft> = {},
  trecho: Partial<BookingDraft["legs"][0]> = {},
) {
  return {
    ...emptyDraft(),
    purchased_on: "2026-11-01",
    legs: [
      {
        ...emptyLeg("AD"),
        flight_number: "AD 4512",
        origin: "SDU",
        destination: "CGH",
        departure_local: "2026-11-10T07:30",
        arrival_local: "2026-11-10T08:35",
        ...trecho,
      },
    ],
    ...mudancas,
  };
}

const mensagem = (d: BookingDraft) => {
  const r = draftSchema.safeParse(d);
  return r.success ? null : r.error.issues[0]?.message;
};

describe("datas e trechos da passagem", () => {
  it("aceita o caso comum", () => {
    expect(mensagem(rascunho())).toBeNull();
  });

  it("aceita 29/02 em ano bissexto", () => {
    expect(
      mensagem(
        rascunho(
          { purchased_on: "2028-02-01" },
          { departure_local: "2028-02-29T10:00", arrival_local: "2028-02-29T11:05" },
        ),
      ),
    ).toBeNull();
  });

  it("aceita chegada depois da meia-noite", () => {
    expect(
      mensagem(
        rascunho({}, { departure_local: "2026-11-10T23:30", arrival_local: "2026-11-11T00:40" }),
      ),
    ).toBeNull();
  });

  it.each([
    ["31/02/2026", "2026-02-31T10:00"],
    ["29/02/2026 (não bissexto)", "2026-02-29T10:00"],
  ])("recusa %s: a data não existe", (_nome, partida) => {
    expect(mensagem(rascunho({}, { departure_local: partida, arrival_local: "" }))).toBe(
      "Esta data não existe",
    );
  });

  it("recusa hora 25:99", () => {
    expect(mensagem(rascunho({}, { departure_local: "2026-11-10T25:99", arrival_local: "" }))).toBe(
      "Hora inválida",
    );
  });

  it("recusa data de compra que não existe", () => {
    expect(mensagem(rascunho({ purchased_on: "2026-99-99" }))).toBe("Data da compra inválida");
    expect(mensagem(rascunho({ purchased_on: "2026-02-30" }))).toBe("Data da compra inválida");
  });

  it("recusa origem igual ao destino", () => {
    expect(mensagem(rascunho({}, { origin: "SDU", destination: "sdu" }))).toBe(
      "Origem e destino são o mesmo aeroporto",
    );
  });

  it("recusa chegada antes da partida", () => {
    expect(
      mensagem(
        rascunho({}, { departure_local: "2026-11-10T07:30", arrival_local: "2026-11-10T06:30" }),
      ),
    ).toBe("A chegada está antes da partida");
  });

  it("compara partida e chegada no fuso de cada aeroporto", () => {
    // Manaus está 1 hora atrás de São Paulo: sair 10:00 de GRU e chegar 12:55
    // em MAO é um voo de quase 4 horas; chegar 09:30 em MAO seria antes de sair.
    expect(
      mensagem(
        rascunho(
          {},
          {
            origin: "GRU",
            destination: "MAO",
            departure_local: "2026-11-10T10:00",
            arrival_local: "2026-11-10T12:55",
          },
        ),
      ),
    ).toBeNull();
    expect(
      mensagem(
        rascunho(
          {},
          {
            origin: "MAO",
            destination: "GRU",
            departure_local: "2026-11-10T10:00",
            arrival_local: "2026-11-10T10:30",
          },
        ),
      ),
    ).toBe("A chegada está antes da partida");
  });

  // Revisão de 26/11: com a chegada preenchida, uma partida inválida lançava
  // exceção em vez de devolver a mensagem.
  it("partida inválida com chegada preenchida: recusa com mensagem, sem quebrar", () => {
    expect(mensagem(rascunho({}, { departure_local: "2026-02-31T10:00" }))).toBe(
      "Esta data não existe",
    );
    expect(mensagem(rascunho({}, { departure_local: "" }))).toBe("Informe data e hora de partida");
    expect(mensagem(rascunho({}, { arrival_local: "2026-11-10T25:99" }))).toBe("Hora inválida");
  });

  it("recusa hora que não existe no aeroporto por causa do horário de verão", () => {
    // Em Nova York, em 14/03/2027 o relógio pula de 02:00 para 03:00.
    expect(
      mensagem(
        rascunho(
          { purchased_on: "2027-01-10" },
          {
            origin: "JFK",
            destination: "GRU",
            departure_local: "2027-03-14T02:30",
            arrival_local: "",
          },
        ),
      ),
    ).toBe("Esta hora não existe nesse aeroporto (mudança de horário de verão)");
    expect(
      mensagem(
        rascunho(
          { purchased_on: "2027-01-10" },
          {
            origin: "JFK",
            destination: "GRU",
            departure_local: "2027-03-14T03:30",
            arrival_local: "",
          },
        ),
      ),
    ).toBeNull();
  });

  it("a data de compra padrão é o dia de hoje em Brasília, não em UTC", () => {
    // 22h de 10/06 em Brasília já é 11/06 em UTC.
    expect(emptyDraft("2026-06-11T01:00:00.000Z").purchased_on).toBe("2026-06-10");
    expect(emptyDraft("2026-06-11T04:00:00.000Z").purchased_on).toBe("2026-06-11");
  });

  it("aponta compra depois do voo (o formulário recusa; a importação manda para Conferir)", () => {
    expect(purchaseAfterFlight(rascunho({ purchased_on: "2026-12-01" }))).toBe(true);
    expect(purchaseAfterFlight(rascunho({ purchased_on: "2026-11-10" }))).toBe(false);
    expect(purchaseAfterFlight(rascunho({ purchased_on: "" }))).toBe(false);
  });

  it("confere data e hora de verdade, não só o formato", () => {
    expect(localDateTimeProblem("2026-11-10T07:30")).toBeNull();
    expect(localDateTimeProblem("10/11/2026 07:30")).toBe("formato");
    expect(localDateTimeProblem("2026-02-31T10:00")).toBe("data");
    expect(localDateTimeProblem("2026-13-01T10:00")).toBe("data");
    expect(localDateTimeProblem("2026-11-10T24:00")).toBe("hora");
    expect(localDateTimeProblem("2026-11-10T23:60")).toBe("hora");
    expect(isRealDate("2028-02-29")).toBe(true);
    expect(isRealDate("2026-02-29")).toBe(false);
    expect(isRealDate("2026-00-10")).toBe(false);
  });
});
