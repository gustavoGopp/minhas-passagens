import { describe, expect, it } from "vitest";
import {
  draftFromExtraction,
  draftFromRows,
  planLegChanges,
  draftSchema,
  emptyDraft,
  rowsFromDraft,
} from "./draft";

describe("rascunho de passagem", () => {
  it("converte rascunho em linhas com horário UTC pelo fuso do aeroporto", () => {
    const d = draftSchema.parse({
      ...emptyDraft(),
      locator: "XYZ9K2",
      amount: "R$ 459,90",
      purchased_on: "2026-11-02",
      legs: [
        {
          airline: "AD",
          flight_number: "AD 4512",
          origin: "sdu",
          destination: "cgh",
          departure_local: "2026-11-09T06:30",
          arrival_local: "2026-11-09T07:35",
          passenger: "",
        },
      ],
    });
    const { booking, flights } = rowsFromDraft(d);
    expect(booking).toMatchObject({ locator: "XYZ9K2", amount_cents: 45990, miles: null });
    expect(flights[0]).toMatchObject({
      origin: "SDU",
      destination: "CGH",
      departs_at: "2026-11-09T09:30:00.000Z",
      arrives_at: "2026-11-09T10:35:00.000Z",
    });
  });

  it("rejeita aeroporto que não é código de 3 letras e trecho sem horário", () => {
    const r = draftSchema.safeParse({
      ...emptyDraft(),
      legs: [{ ...emptyDraft().legs[0], origin: "Santos Dumont", destination: "CGH" }],
    });
    expect(r.success).toBe(false);
  });

  it("monta rascunho a partir da extração, com milhas e taxas", () => {
    const d = draftFromExtraction(
      {
        locator: "AB12CD",
        airline_code: "G3",
        seller: "Smiles",
        channel: "miles",
        total_amount: null,
        currency: "BRL",
        miles: 12000,
        taxes_amount: 45.9,
        purchased_on: "2026-11-01",
        flights: [
          {
            airline_code: "G3",
            flight_number: "G3 1023",
            origin_iata: "cgh",
            destination_iata: "sdu",
            departure_local: "2026-11-12T19:00",
            arrival_local: null,
            passenger: null,
          },
        ],
      },
      "text",
    );
    expect(d).toMatchObject({
      channel: "miles",
      miles: "12000",
      taxes: "45,90",
      amount: "",
      source: "text",
    });
    expect(d.legs[0]).toMatchObject({ origin: "CGH", destination: "SDU", arrival_local: "" });
  });

  it("volta do banco para o formulário com horário local", () => {
    const d = draftFromRows(
      {
        id: "11111111-1111-4111-8111-111111111111",
        locator: "Q1",
        airline: "LA",
        seller: null,
        channel: "airline",
        amount_cents: 30000,
        currency: "BRL",
        miles: null,
        taxes_cents: null,
        purchased_on: "2026-10-01",
        tag: "work",
        status: "active",
        source: "manual",
        notes: null,
      },
      [
        {
          id: "f",
          booking_id: "b",
          airline: "LA",
          flight_number: "LA 3001",
          origin: "CGH",
          destination: "SDU",
          departs_at: "2026-11-12T21:00:00.000Z",
          arrives_at: null,
          passenger: null,
          checkin_done: false,
        },
      ],
    );
    expect(d.amount).toBe("300,00");
    expect(d.legs[0].departure_local).toBe("2026-11-12T18:00");
  });
});

describe("planLegChanges (editar sem recriar trechos)", () => {
  const old = [
    { id: "f1", departs_at: "2026-11-09T09:20:00.000Z", flight_number: "LA3901", origin: "SDU" },
    { id: "f2", departs_at: "2026-11-12T21:30:00.000Z", flight_number: "LA3920", origin: "CGH" },
  ];
  const leg = (o: Partial<Parameters<typeof planLegChanges>[1][number]>) => ({
    id: undefined as string | undefined,
    airline: "LA",
    flight_number: "LA3901",
    origin: "SDU",
    destination: "CGH",
    departs_at: "2026-11-09T09:20:00.000Z",
    arrives_at: null,
    passenger: null,
    ...o,
  });

  it("mudar só a observação mantém ids e não zera o check-in", () => {
    const plan = planLegChanges(old, [
      leg({ id: "f1" }),
      leg({
        id: "f2",
        flight_number: "LA3920",
        origin: "CGH",
        destination: "SDU",
        departs_at: "2026-11-12T21:30:00Z",
      }),
    ]);
    expect(plan.insert).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.update.map((u) => u.id)).toEqual(["f1", "f2"]);
    expect(plan.update.every((u) => !("checkin_done" in u.fields))).toBe(true);
  });

  it("remarcação zera o check-in; trocar a origem zera também 'cheguei por outro meio'", () => {
    const plan = planLegChanges(old, [
      leg({ id: "f1", departs_at: "2026-11-10T09:20:00.000Z" }),
      leg({ id: "f2", origin: "GRU", flight_number: "LA3920", departs_at: old[1].departs_at }),
    ]);
    expect(plan.update[0].fields).toMatchObject({ checkin_done: false });
    expect("ignore_missing_leg" in plan.update[0].fields).toBe(false);
    expect(plan.update[1].fields).toMatchObject({ checkin_done: false, ignore_missing_leg: false });
  });

  it("trecho novo é inserido, trecho tirado é apagado e id estranho vira novo", () => {
    const plan = planLegChanges(old, [leg({ id: "f1" }), leg({ id: "outro" }), leg({})]);
    expect(plan.update.map((u) => u.id)).toEqual(["f1"]);
    expect(plan.insert).toHaveLength(2);
    expect(plan.insert.every((f) => !("id" in f))).toBe(true);
    expect(plan.remove).toEqual(["f2"]);
  });

  it("o mesmo id repetido no formulário não atualiza duas vezes", () => {
    const plan = planLegChanges(old, [leg({ id: "f1" }), leg({ id: "f1" })]);
    expect(plan.update).toHaveLength(1);
    expect(plan.insert).toHaveLength(1);
  });
});
