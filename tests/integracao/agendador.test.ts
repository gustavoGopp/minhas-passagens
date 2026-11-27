// Fluxo: um ciclo do agendador (runTick) contra o banco local. Um aviso de
// check-in sai uma vez só; se o Telegram falhar, sai depois da espera, uma vez.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FIRST_RETRY_MINUTES } from "@/lib/notify/delivery";
import { admin, instalarRedeFalsa, json, novaPessoa, rede, type PessoaTeste } from "./apoio";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/lib/supabase/server", async () => {
  const { pessoaDaSessao } = await import("./apoio");
  return { createSupabaseServerClient: async () => pessoaDaSessao().cliente };
});
vi.mock("@/lib/auth/current-user", async () => {
  const { usuarioDaSessao } = await import("./apoio");
  return {
    getCurrentUser: async () => usuarioDaSessao(),
    getOptionalUser: async () => usuarioDaSessao(),
  };
});
// Push nunca sai de verdade (e o teste vê se alguém tentou).
const { enviarPush } = vi.hoisted(() => ({ enviarPush: vi.fn(async () => ({ statusCode: 201 })) }));
vi.mock("web-push", () => ({ default: { sendNotification: enviarPush } }));

const { runTick } = await import("@/lib/jobs/tick");

// Meio-dia em São Paulo (fora da janela silenciosa).
const AGORA = "2027-03-01T15:00:00Z";
// Voo da Gol 43 h depois: check-in aberto (abre 48 h antes), ainda não é o aviso de 24 h.
const PARTIDA = "2027-03-03T10:00:00Z";
const CHAT_OK = 4242;
const CHAT_FALHA = 4343;

const minutosDepois = (iso: string, min: number) =>
  new Date(Date.parse(iso) + min * 60_000).toISOString();

/** Quando ligado, o Telegram responde 500 para o chat da pessoa com falha. */
const telegram = { fora: false };

const pessoas: PessoaTeste[] = [];

beforeAll(() => {
  instalarRedeFalsa({
    "api.telegram.org": (_url, c) => {
      const { chat_id } = JSON.parse(c.corpo) as { chat_id: number };
      if (telegram.fora && chat_id === CHAT_FALHA) return json({ ok: false }, 500);
      return json({ ok: true, result: { message_id: 1 } });
    },
    // Só por precaução: as pessoas semeadas não têm token do Gmail.
    "oauth2.googleapis.com": () => json({ error: "invalid_grant" }, 400),
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  for (const p of pessoas) await admin().auth.admin.deleteUser(p.id);
});

/** Pessoa com Telegram ligado (chat fictício) e uma passagem da Gol com check-in aberto. */
async function pessoaComVoo(prefixo: string, chat: number, locator: string) {
  const p = await novaPessoa(prefixo);
  pessoas.push(p);
  const db = admin();
  const perfil = await db.from("profiles").update({ notify_telegram: true }).eq("id", p.id);
  expect(perfil.error).toBeNull();
  const link = await db
    .from("telegram_links")
    .insert({ user_id: p.id, chat_id: chat, linked_at: AGORA });
  expect(link.error).toBeNull();
  const b = await db
    .from("bookings")
    .insert({ user_id: p.id, locator, airline: "G3", amount_cents: 50000 })
    .select("id")
    .single();
  expect(b.error).toBeNull();
  const f = await db.from("flights").insert({
    booking_id: b.data!.id,
    user_id: p.id,
    airline: "G3",
    flight_number: "G31000",
    origin: "SDU",
    destination: "CGH",
    departs_at: PARTIDA,
    arrives_at: minutosDepois(PARTIDA, 65),
  });
  expect(f.error).toBeNull();
  return p;
}

/** Mensagens do Telegram enviadas a um chat desde o começo do arquivo. */
function mensagens(chat: number) {
  return rede
    .para("api.telegram.org")
    .map((c) => JSON.parse(c.corpo) as { chat_id: number; text: string })
    .filter((m) => m.chat_id === chat);
}

const deCheckin = (ms: { text: string }[]) =>
  ms.filter((m) => m.text.startsWith("Check-in aberto: SDU → CGH"));

async function registroDoCheckin(userId: string) {
  const { data, error } = await admin()
    .from("notification_log")
    .select("event_key, status, attempts, channels")
    .eq("user_id", userId)
    .like("event_key", "checkin-open:%");
  expect(error).toBeNull();
  return data ?? [];
}

describe("C8 — Aviso uma vez só", () => {
  describe("Telegram funcionando", () => {
    let ana: PessoaTeste;

    beforeAll(async () => {
      ana = await pessoaComVoo("agenda-ana", CHAT_OK, "TESTE3");
    });

    it("1º ciclo: uma mensagem de check-in no Telegram e um registro 'sent'", async () => {
      const r = await runTick({ now: AGORA, recordTick: false });
      expect(r.userErrors).toBe(0);
      expect(deCheckin(mensagens(CHAT_OK))).toHaveLength(1);
      const log = await registroDoCheckin(ana.id);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ status: "sent", attempts: 1, channels: ["telegram"] });
      // Push e e-mail não estão configurados: ninguém tentou.
      expect(enviarPush).not.toHaveBeenCalled();
    });

    it("2º ciclo no mesmo horário e outro 10 min depois: nada novo para o chat", async () => {
      const antes = mensagens(CHAT_OK).length;
      await runTick({ now: AGORA, recordTick: false });
      await runTick({ now: minutosDepois(AGORA, 10), recordTick: false });
      expect(mensagens(CHAT_OK)).toHaveLength(antes);
      expect(deCheckin(mensagens(CHAT_OK))).toHaveLength(1);
      const log = await registroDoCheckin(ana.id);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ status: "sent", attempts: 1 });
    });

    it("só o Telegram (e o Supabase local) foram chamados", () => {
      const hosts = new Set(rede.chamadas.map((c) => new URL(c.url).host));
      expect([...hosts]).toEqual(["api.telegram.org"]);
    });
  });

  describe("Telegram fora do ar", () => {
    let bia: PessoaTeste;
    const T0 = minutosDepois(AGORA, 20);

    beforeAll(async () => {
      bia = await pessoaComVoo("agenda-bia", CHAT_FALHA, "TESTE4");
    });

    it("1º ciclo com o Telegram respondendo 500: registro 'failed', 1 tentativa", async () => {
      telegram.fora = true;
      await runTick({ now: T0, recordTick: false });
      // Tentou uma vez e não conseguiu.
      expect(deCheckin(mensagens(CHAT_FALHA))).toHaveLength(1);
      const log = await registroDoCheckin(bia.id);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ status: "failed", attempts: 1, channels: [] });
    });

    it("antes da espera de nova tentativa, não tenta de novo", async () => {
      telegram.fora = false;
      const antes = mensagens(CHAT_FALHA).length;
      await runTick({ now: minutosDepois(T0, FIRST_RETRY_MINUTES - 1), recordTick: false });
      expect(mensagens(CHAT_FALHA)).toHaveLength(antes);
      expect((await registroDoCheckin(bia.id))[0]).toMatchObject({ status: "failed", attempts: 1 });
    });

    it(`depois de ${FIRST_RETRY_MINUTES} min, com o Telegram de volta: sai uma vez`, async () => {
      const antes = deCheckin(mensagens(CHAT_FALHA)).length;
      await runTick({ now: minutosDepois(T0, FIRST_RETRY_MINUTES), recordTick: false });
      expect(deCheckin(mensagens(CHAT_FALHA))).toHaveLength(antes + 1);
      const log = await registroDoCheckin(bia.id);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ status: "sent", attempts: 2, channels: ["telegram"] });
    });

    it("ciclo seguinte: nada mais sai para o chat", async () => {
      const antes = mensagens(CHAT_FALHA).length;
      await runTick({ now: minutosDepois(T0, FIRST_RETRY_MINUTES + 1), recordTick: false });
      await runTick({ now: minutosDepois(T0, 60), recordTick: false });
      expect(mensagens(CHAT_FALHA)).toHaveLength(antes);
      expect((await registroDoCheckin(bia.id))[0]).toMatchObject({ status: "sent", attempts: 2 });
    });
  });
});
