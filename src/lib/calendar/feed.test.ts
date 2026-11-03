import { beforeEach, describe, expect, it } from "vitest";
import { FakeDb } from "@/test/fake-supabase";
import {
  feedUrl,
  generateFeed,
  hashFeedToken,
  loadFeed,
  newFeedToken,
  parseFeedParam,
  revokeFeed,
  TOKEN_RE,
} from "./feed";

const APP = "https://minhas-passagens.vercel.app";
const U1 = "user-1";
const U2 = "user-2";
const NOW = "2026-11-03T12:00:00.000Z";

let db: FakeDb;
beforeEach(() => {
  db = new FakeDb();
  db.set("bookings", [
    { id: "b1", user_id: U1, locator: "ABC123", status: "active" },
    { id: "b9", user_id: U2, locator: "OUTRO1", status: "active" },
  ]);
  db.set("flights", [
    {
      id: "f1",
      booking_id: "b1",
      user_id: U1,
      airline: "LA",
      flight_number: "3001",
      origin: "SDU",
      destination: "CGH",
      departs_at: "2026-11-09T09:05:00.000Z",
      arrives_at: "2026-11-09T10:10:00.000Z",
      updated_at: "2026-11-02T15:00:00.000Z",
    },
    {
      id: "f9",
      booking_id: "b9",
      user_id: U2,
      airline: "G3",
      flight_number: "1001",
      origin: "CGH",
      destination: "SDU",
      departs_at: "2026-11-10T09:05:00.000Z",
      arrives_at: null,
      updated_at: "2026-11-02T15:00:00.000Z",
    },
  ]);
});

describe("token do calendário", () => {
  it("43 caracteres base64url, hash sha256 em hex", () => {
    const t = newFeedToken();
    expect(t).toMatch(TOKEN_RE);
    expect(newFeedToken()).not.toBe(t);
    expect(hashFeedToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("aceita com ou sem .ics e recusa formato inválido", () => {
    const t = newFeedToken();
    expect(parseFeedParam(t)).toBe(t);
    expect(parseFeedParam(`${t}.ics`)).toBe(t);
    expect(parseFeedParam("abc")).toBeNull();
    expect(parseFeedParam(`${t}x`)).toBeNull();
    expect(parseFeedParam("../../etc/passwd")).toBeNull();
    expect(feedUrl(APP, t)).toBe(`${APP}/api/calendario/${t}.ics`);
  });
});

describe("link do calendário", () => {
  it("guarda só o hash e devolve o calendário de quem tem o token", async () => {
    const token = await generateFeed(db.client(), U1, NOW);
    const rows = db.rows("calendar_feeds");
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(hashFeedToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);

    const res = await loadFeed(db.client(), `${token}.ics`, APP, NOW);
    expect(res.status).toBe(200);
    const body = res.status === 200 ? res.body : "";
    expect(body).toContain("UID:f1@minhas-passagens");
    expect(body).not.toContain("f9@"); // voo de outro usuário
    expect(body).not.toContain("OUTRO1");
    expect(rows[0].last_fetched_at).toBe(NOW);
  });

  it("token errado ou malformado: 404", async () => {
    await generateFeed(db.client(), U1, NOW);
    expect((await loadFeed(db.client(), newFeedToken(), APP, NOW)).status).toBe(404);
    expect((await loadFeed(db.client(), "nada", APP, NOW)).status).toBe(404);
  });

  it("gerar novo link faz o antigo parar na hora", async () => {
    const old = await generateFeed(db.client(), U1, NOW);
    const fresh = await generateFeed(db.client(), U1, "2026-11-03T13:00:00.000Z");
    expect(db.rows("calendar_feeds")).toHaveLength(1);
    expect((await loadFeed(db.client(), old, APP, NOW)).status).toBe(404);
    expect((await loadFeed(db.client(), fresh, APP, NOW)).status).toBe(200);
  });

  it("desligar apaga o link", async () => {
    const token = await generateFeed(db.client(), U1, NOW);
    await revokeFeed(db.client(), U1);
    expect(db.rows("calendar_feeds")).toHaveLength(0);
    expect((await loadFeed(db.client(), token, APP, NOW)).status).toBe(404);
  });

  it("marca a leitura no máximo uma vez por hora", async () => {
    const token = await generateFeed(db.client(), U1, NOW);
    await loadFeed(db.client(), token, APP, NOW);
    await loadFeed(db.client(), token, APP, "2026-11-03T12:30:00.000Z");
    expect(db.rows("calendar_feeds")[0].last_fetched_at).toBe(NOW);
    await loadFeed(db.client(), token, APP, "2026-11-03T13:01:00.000Z");
    expect(db.rows("calendar_feeds")[0].last_fetched_at).toBe("2026-11-03T13:01:00.000Z");
  });
});
