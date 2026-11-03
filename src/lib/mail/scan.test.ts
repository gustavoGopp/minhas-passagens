import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));
const extract = vi.fn();
vi.mock("@/lib/extract/extract", () => ({ extractBookings: (...a: unknown[]) => extract(...a) }));
vi.mock("@/lib/integrations/repo", () => ({
  getDecryptedKeyWith: async (_c: unknown, _u: string, p: string) =>
    p === "gmail" ? "rt" : "sk-ant",
}));

const { advanceScan } = await import("./scan");

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const META: Record<string, { from: string; subject: string; unsub?: boolean }> = {
  m1: { from: "LATAM <noreply@latam.com>", subject: "Confirmação de compra - localizador XKQ7PZ" },
  m2: { from: "Gol <promo@voegol.com.br>", subject: "Black Friday: 30% off", unsub: true },
  m3: { from: "Agência <a@agencia.com>", subject: "Seu e-ticket" },
  m4: { from: "amigo@gmail.com", subject: "Almoço?" },
};
const BODY: Record<string, string> = {
  m1: "<p>Localizador: XKQ7PZ</p><p>Voo LA3901 SDU → CGH</p><p>Total R$ 612,90</p>",
  m3: "<p>Obrigado por viajar conosco. Acesse o app.</p>",
};

const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.startsWith("https://oauth2.googleapis.com/token"))
    return Response.json({ access_token: "at", expires_in: 3599 });
  const u = new URL(url);
  if (u.pathname.endsWith("/messages")) {
    const q = u.searchParams.get("q") ?? "";
    return Response.json({
      messages: (q.includes("from:(") ? ["m1", "m2", "m3"] : ["m3", "m4"]).map((id) => ({ id })),
    });
  }
  const id = u.pathname.split("/").pop()!;
  const m = META[id];
  const headers = [
    { name: "From", value: m.from },
    { name: "Subject", value: m.subject },
    ...(m.unsub ? [{ name: "List-Unsubscribe", value: "<mailto:x>" }] : []),
  ];
  const payload =
    u.searchParams.get("format") === "full"
      ? { headers, mimeType: "text/html", body: { data: b64(BODY[id] ?? "") } }
      : { headers };
  return Response.json({ id, internalDate: String(Date.parse("2026-10-20T12:00:00Z")), payload });
});

const booking = {
  locator: "XKQ7PZ",
  airline_code: "LA",
  seller: "LATAM",
  channel: "airline",
  total_amount: 612.9,
  currency: "BRL",
  miles: null,
  taxes_amount: null,
  purchased_on: "2026-10-20",
  status: "active",
  flights: [
    {
      airline_code: "LA",
      flight_number: "LA 3901",
      origin_iata: "SDU",
      destination_iata: "CGH",
      departure_local: "2026-11-09T06:20",
      arrival_local: null,
      passenger: null,
    },
  ],
};

let db: FakeDb;
const scan = (status: string) => ({
  id: "s1",
  user_id: "u1",
  status,
  query_index: 0,
  page_token: null,
  last_error: null,
  created_at: "",
  confirmed_at: null,
  finished_at: null,
});

beforeEach(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "cid";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "sec";
  db = new FakeDb();
  db.rows("mail_scans").push(scan("listing"));
  extract.mockReset();
  extract.mockResolvedValue({
    ok: true,
    data: { bookings: [booking], warnings: [] },
    model: "haiku",
  });
});

/** O mesmo que o botão "Confirmar e ler com IA". */
const confirm = () => {
  db.rows("mail_scans")[0].status = "processing";
};

const statusOf = (id: string) =>
  db.rows("mail_messages").find((m) => m.provider_message_id === id)?.status;

describe("varredura do Gmail", () => {
  it("lista, filtra sem IA e espera a confirmação antes de gastar", async () => {
    const st = await advanceScan(
      db.client(),
      scan("listing") as never,
      Date.now() + 5_000,
      fakeFetch as never,
    );
    expect(st).toBe("awaiting_confirmation");
    expect(db.rows("mail_messages")).toHaveLength(4); // m3 aparece nas duas consultas, uma vez só
    expect(["m1", "m2", "m3", "m4"].map(statusOf)).toEqual([
      "candidate",
      "skipped",
      "candidate",
      "skipped",
    ]);
    expect(extract).not.toHaveBeenCalled();
    // Só metadados: nada de assunto nem corpo no banco.
    const keys = Object.keys(db.rows("mail_messages")[0]);
    expect(keys).not.toContain("subject");
    expect(keys).not.toContain("body");
    expect(db.rows("mail_messages")[0].sender_domain).toBe("latam.com");
  });

  it("depois de confirmar, lê o corpo, chama a IA só quando há sinais e gera o candidato", async () => {
    await advanceScan(
      db.client(),
      scan("listing") as never,
      Date.now() + 5_000,
      fakeFetch as never,
    );
    confirm();
    const st = await advanceScan(
      db.client(),
      scan("processing") as never,
      Date.now() + 5_000,
      fakeFetch as never,
    );
    expect(st).toBe("review");
    expect(extract).toHaveBeenCalledTimes(1); // m3 não tinha sinais de passagem: sem custo
    expect(extract.mock.calls[0][2]).toEqual({ allowEmpty: true, receivedOn: "2026-10-20" });
    expect(statusOf("m1")).toBe("extracted");
    expect(statusOf("m3")).toBe("not_booking");
    const [c] = db.rows("import_candidates");
    expect(c).toMatchObject({ user_id: "u1", received_at: "2026-10-20T12:00:00.000Z" });
    expect((c.draft as { locator: string; source: string }).locator).toBe("XKQ7PZ");
    expect((c.draft as { source: string }).source).toBe("email");
  });

  it("duas chamadas ao mesmo tempo não extraem o mesmo e-mail duas vezes", async () => {
    await advanceScan(
      db.client(),
      scan("listing") as never,
      Date.now() + 5_000,
      fakeFetch as never,
    );
    confirm();
    await Promise.all([
      advanceScan(db.client(), scan("processing") as never, Date.now() + 5_000, fakeFetch as never),
      advanceScan(db.client(), scan("processing") as never, Date.now() + 5_000, fakeFetch as never),
    ]);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(db.rows("import_candidates")).toHaveLength(1);
  });

  it("chave da Anthropic recusada para a varredura com o motivo", async () => {
    extract.mockResolvedValue({
      ok: false,
      error: "Sua chave da Anthropic foi recusada. Atualize em Integrações.",
    });
    await advanceScan(
      db.client(),
      scan("listing") as never,
      Date.now() + 5_000,
      fakeFetch as never,
    );
    confirm();
    await advanceScan(
      db.client(),
      scan("processing") as never,
      Date.now() + 5_000,
      fakeFetch as never,
    );
    expect(db.rows("mail_scans")[0]).toMatchObject({ status: "error" });
    expect(String(db.rows("mail_scans")[0].last_error)).toMatch(/chave/);
  });

  it("cancelar na tela vale na hora: o laço não sobrescreve o estado", async () => {
    await advanceScan(
      db.client(),
      scan("listing") as never,
      Date.now() + 5_000,
      fakeFetch as never,
    );
    db.rows("mail_scans")[0].status = "cancelled";
    const st = await advanceScan(
      db.client(),
      scan("processing") as never,
      Date.now() + 5_000,
      fakeFetch as never,
    );
    expect(st).toBe("cancelled");
    expect(extract).not.toHaveBeenCalled();
    expect(db.rows("mail_scans")[0].status).toBe("cancelled");
  });
});
