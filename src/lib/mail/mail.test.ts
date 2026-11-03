import { describe, expect, it } from "vitest";
import { emptyDraft, type BookingDraft, type BookingRow, type FlightRow } from "@/lib/trips/draft";
import { estimateUsd, formatUsd } from "./cost";
import { decideCandidates } from "./dedupe";
import { bodyText, listMessageIds, parseMeta, scanQueries } from "./gmail";
import { bodyDecision, bodySignals, classify, headerDecision, senderDomain } from "./prefilter";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

describe("Gmail: consulta e leitura", () => {
  it("as consultas cobrem todas as pastas e os remetentes de viagem", () => {
    const [bySender, byTerm] = scanQueries();
    expect(bySender).toMatch(/^in:anywhere newer_than:5y from:\(voeazul\.com\.br OR /);
    expect(byTerm).toContain('"código de reserva"');
  });

  it("lista ids com spam e lixeira e segue a paginação", async () => {
    let url = "";
    const r = await listMessageIds("tok", "q", "p2", async (u, init) => {
      url = String(u);
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
      return Response.json({ messages: [{ id: "a" }, { id: "b" }], nextPageToken: "p3" });
    });
    expect(url).toContain("includeSpamTrash=true");
    expect(url).toContain("pageToken=p2");
    expect(r).toEqual({ ids: ["a", "b"], nextPageToken: "p3" });
  });

  it("metadados: remetente, assunto, lista e data de recebimento", () => {
    const m = parseMeta({
      id: "m1",
      internalDate: String(Date.parse("2026-10-20T12:00:00Z")),
      payload: {
        headers: [
          { name: "From", value: "LATAM <noreply@latam.com>" },
          { name: "Subject", value: "Confirmação de compra - localizador XKQ7PZ" },
        ],
      },
    });
    expect(m).toEqual({
      id: "m1",
      receivedAt: "2026-10-20T12:00:00.000Z",
      from: "LATAM <noreply@latam.com>",
      subject: "Confirmação de compra - localizador XKQ7PZ",
      listUnsubscribe: false,
    });
  });

  it("corpo: usa o HTML limpo quando o texto puro é só 'veja no navegador'; ignora anexos", () => {
    const text = bodyText({
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/plain", body: { data: b64("Veja no navegador.") } },
            {
              mimeType: "text/html",
              body: { data: b64("<p>Localizador:&nbsp;XKQ7PZ</p><p>SDU &amp; CGH</p>") },
            },
          ],
        },
        { mimeType: "application/pdf", filename: "bilhete.pdf", body: { data: b64("%PDF") } },
      ],
    });
    expect(text).toBe("Localizador: XKQ7PZ\nSDU & CGH");
  });
});

describe("pré-filtro", () => {
  it("cabeçalho: confirmação entra, propaganda sai", () => {
    expect(
      headerDecision({
        from: "Azul <noreply@voeazul.com.br>",
        subject: "Sua reserva está confirmada",
        listUnsubscribe: false,
      }),
    ).toBe("candidate");
    expect(
      headerDecision({
        from: "Gol <promo@voegol.com.br>",
        subject: "Black Friday: 30% off",
        listUnsubscribe: true,
      }),
    ).toBe("skip");
    expect(
      headerDecision({
        from: "Smiles <news@smiles.com.br>",
        subject: "Novidades da semana",
        listUnsubscribe: true,
      }),
    ).toBe("skip");
    expect(
      headerDecision({
        from: "Agência X <a@agenciax.com>",
        subject: "E-ticket da sua viagem",
        listUnsubscribe: false,
      }),
    ).toBe("candidate");
    expect(
      headerDecision({ from: "amigo@gmail.com", subject: "Almoço?", listUnsubscribe: false }),
    ).toBe("skip");
  });

  it("corpo: precisa de 2 sinais (localizador, aeroporto, voo, valor)", () => {
    const ok = "Localizador: XKQ7PZ. Voo LA3901 SDU → CGH. Total R$ 612,90";
    expect(bodySignals(ok)).toEqual({
      locator: "XKQ7PZ",
      airports: ["SDU", "CGH"],
      flightNumber: true,
      money: true,
    });
    expect(bodyDecision(ok)).toBe("candidate");
    expect(bodyDecision("Passagens a partir de R$ 199! Aproveite.")).toBe("skip");
  });

  it("classifica cancelamento, remarcação e confirmação", () => {
    expect(classify("Sua reserva foi cancelada", "")).toBe("cancellation");
    expect(classify("Alteração de horário", "Seu voo alterado para 08:10")).toBe("change");
    expect(classify("Confirmação de compra", "")).toBe("confirmation");
    expect(senderDomain("LATAM <NoReply@LATAM.com>")).toBe("latam.com");
  });
});

describe("deduplicação", () => {
  const draft = (o: Partial<BookingDraft>, legs: [string, string, string][]): BookingDraft => ({
    ...emptyDraft(),
    source: "email",
    ...o,
    legs: legs.map(([origin, destination, departure_local]) => ({
      airline: "LA",
      flight_number: "",
      origin,
      destination,
      departure_local,
      arrival_local: "",
      passenger: "",
    })),
  });
  const booking: BookingRow = {
    id: "b1",
    locator: "XKQ7PZ",
    airline: "LA",
    seller: null,
    channel: "airline",
    amount_cents: 61290,
    currency: "BRL",
    miles: null,
    taxes_cents: null,
    purchased_on: "2026-10-20",
    tag: "personal",
    status: "active",
    source: "text",
    notes: null,
  };
  const flight: FlightRow = {
    id: "f1",
    booking_id: "b1",
    airline: "LA",
    flight_number: "LA3901",
    origin: "SDU",
    destination: "CGH",
    departs_at: "2026-11-09T09:20:00.000Z", // 06:20 local
    arrives_at: null,
    passenger: null,
    checkin_done: false,
  };

  it("mesmo localizador e horário = duplicada; outro horário = atualização; cancelada = cancelar", () => {
    const d = decideCandidates({
      bookings: [booking],
      flights: [flight],
      candidates: [
        {
          id: "c1",
          receivedAt: "2026-10-20T12:00:00Z",
          draft: draft({ locator: "xkq7pz" }, [["SDU", "CGH", "2026-11-09T06:20"]]),
        },
      ],
    });
    expect(d).toEqual([{ id: "c1", kind: "duplicate", bookingId: null, coveredBy: "b1" }]);

    const moved = decideCandidates({
      bookings: [booking],
      flights: [flight],
      candidates: [
        {
          id: "c2",
          receivedAt: "2026-10-25T12:00:00Z",
          draft: draft({ locator: "XKQ7PZ" }, [["SDU", "CGH", "2026-11-09T08:10"]]),
        },
      ],
    });
    expect(moved[0]).toMatchObject({ kind: "update", bookingId: "b1" });

    const cancelled = decideCandidates({
      bookings: [booking],
      flights: [flight],
      candidates: [
        {
          id: "c3",
          receivedAt: "2026-10-26T12:00:00Z",
          draft: draft({ locator: "XKQ7PZ", status: "cancelled" }, [
            ["SDU", "CGH", "2026-11-09T06:20"],
          ]),
        },
      ],
    });
    expect(cancelled[0]).toMatchObject({ kind: "cancel", bookingId: "b1" });
  });

  it("vários e-mails da mesma reserva: vale o mais recente; os outros são duplicados dele", () => {
    const d = decideCandidates({
      bookings: [],
      flights: [],
      candidates: [
        {
          id: "old",
          receivedAt: "2026-10-01T10:00:00Z",
          draft: draft({ locator: "AB12CD" }, [["CGH", "SDU", "2026-11-12T18:30"]]),
        },
        {
          id: "new",
          receivedAt: "2026-10-05T10:00:00Z",
          draft: draft({ locator: "AB12CD" }, [["CGH", "SDU", "2026-11-12T19:30"]]),
        },
        {
          id: "other",
          receivedAt: "2026-10-02T10:00:00Z",
          draft: draft({ locator: "" }, [["SDU", "CGH", "2026-11-16T06:05"]]),
        },
      ],
    });
    expect(d.map((x) => [x.id, x.kind, x.coveredBy])).toEqual([
      ["old", "duplicate", "new"],
      ["new", "new", null],
      ["other", "new", null],
    ]);
  });
});

describe("custo", () => {
  it("estima centavos por e-mail e menos de US$ 2 para 1.000 e-mails", () => {
    expect(estimateUsd(1)).toBeCloseTo(0.0016, 4);
    expect(estimateUsd(1000)).toBeLessThan(2);
    expect(formatUsd(estimateUsd(600))).toBe("US$ 0,96");
    expect(formatUsd(0.001)).toBe("menos de US$ 0,01");
  });
});
