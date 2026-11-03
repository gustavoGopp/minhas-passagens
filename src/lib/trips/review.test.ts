import { describe, expect, it } from "vitest";
import { emptyDraft, type BookingRow, type FlightRow } from "./draft";
import { draftWithYear, reviewItems, shiftLocalYear } from "./review";

const b = (id: string, o: Partial<BookingRow> = {}): BookingRow => ({
  id,
  locator: id,
  airline: "AD",
  seller: null,
  channel: "airline",
  amount_cents: 1,
  currency: "BRL",
  miles: null,
  taxes_cents: null,
  purchased_on: "2026-11-01",
  tag: "personal",
  status: "active",
  source: "email",
  notes: null,
  ...o,
});
const f = (id: string, booking: string, departs: string): FlightRow => ({
  id,
  booking_id: booking,
  airline: "AD",
  flight_number: null,
  origin: "SDU",
  destination: "CGH",
  departs_at: departs,
  arrives_at: null,
  passenger: null,
  checkin_done: false,
});
const now = "2026-11-03T12:00:00.000Z";

describe("tela Conferir", () => {
  it("voo 250 dias antes da compra: sugere o ano seguinte", () => {
    const items = reviewItems({
      bookings: [b("b1")],
      flights: [f("f1", "b1", "2026-02-24T10:00:00.000Z")],
      now,
    });
    expect(items).toEqual([
      {
        kind: "date",
        bookingId: "b1",
        flightId: "f1",
        flightDay: "2026-02-24",
        purchasedOn: "2026-11-01",
        suggestedYear: 2027,
      },
    ]);
  });

  it("voo poucos dias antes da compra: pede para conferir, sem sugerir ano", () => {
    const items = reviewItems({
      bookings: [b("b1")],
      flights: [f("f1", "b1", "2026-10-28T10:00:00.000Z")],
      now,
    });
    expect(items[0]).toMatchObject({ kind: "date", suggestedYear: null });
  });

  it("repetidas importadas aparecem com as duas passagens", () => {
    const items = reviewItems({
      bookings: [b("b1"), b("b2")],
      flights: [
        f("f1", "b1", "2026-11-16T09:05:00.000Z"),
        f("f2", "b2", "2026-11-16T09:05:00.000Z"),
      ],
      now,
    });
    expect(items).toEqual([
      { kind: "duplicate", bookingIds: ["b1", "b2"], day: "2026-11-16", route: "SDU→CGH" },
    ]);
  });

  it("muda o ano de todos os trechos, inclusive 29/02", () => {
    expect(shiftLocalYear("2028-02-29T10:00", 1)).toBe("2029-02-28T10:00");
    expect(shiftLocalYear("", 1)).toBe("");
    const d = {
      ...emptyDraft(),
      legs: [
        {
          airline: "AD",
          flight_number: "",
          origin: "SDU",
          destination: "CGH",
          departure_local: "2026-02-24T07:00",
          arrival_local: "2026-02-24T08:05",
          passenger: "",
        },
      ],
    };
    expect(draftWithYear(d, 2026, 2027).legs[0]).toMatchObject({
      departure_local: "2027-02-24T07:00",
      arrival_local: "2027-02-24T08:05",
    });
  });
});
