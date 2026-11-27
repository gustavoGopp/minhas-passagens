// Fluxo: monitor de preço com alvo R$ 250 (SDU → CGH). O agendador (runTick)
// checa o monitor vencido no Travelpayouts falso, grava o aviso de preço e, no
// ciclo seguinte, manda um aviso no Telegram. O mesmo preço de novo não avisa de novo.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  admin,
  entrarComo,
  instalarRedeFalsa,
  json,
  novaPessoa,
  rede,
  type PessoaTeste,
} from "./apoio";

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
const { enviarPush } = vi.hoisted(() => ({ enviarPush: vi.fn(async () => ({ statusCode: 201 })) }));
vi.mock("web-push", () => ({ default: { sendNotification: enviarPush } }));

const { runTick } = await import("@/lib/jobs/tick");
const { saveIntegration } = await import("@/lib/integrations/repo");

// Meio-dia em São Paulo; o voo monitorado é numa quarta, 10/03/2027, das 6h às 10h.
const AGORA = "2027-03-01T15:00:00Z";
const DIA_DO_VOO = "2027-03-10";
const CHAT = 4242;
const TOKEN_TP = "token-tp-ficticio";

const depois = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString();

/** Preço (em reais) que o Travelpayouts falso devolve para o voo das 7h. */
const fonte = { preco: 240 };

function travelpayoutsFalso(url: URL) {
  if (url.pathname !== "/aviasales/v3/prices_for_dates") return json({ error: "rota" }, 404);
  const data = url.searchParams.get("departure_at");
  return json({
    success: true,
    currency: "brl",
    data: [
      // Dentro da regra (7h, sem conexão).
      {
        origin: "SDU",
        destination: "CGH",
        price: fonte.preco,
        airline: "G3",
        flight_number: "1000",
        departure_at: `${data}T07:00:00-03:00`,
        transfers: 0,
        duration_to: 65,
      },
      // Mais barato, mas fora da janela de horário: não pode virar aviso.
      {
        origin: "SDU",
        destination: "CGH",
        price: 150,
        airline: "G3",
        flight_number: "1010",
        departure_at: `${data}T15:00:00-03:00`,
        transfers: 0,
        duration_to: 65,
      },
    ],
  });
}

let ana: PessoaTeste;
let monitorId = "";

beforeAll(async () => {
  instalarRedeFalsa({
    "api.telegram.org": () => json({ ok: true, result: { message_id: 1 } }),
    "api.travelpayouts.com": travelpayoutsFalso,
  });
  ana = await novaPessoa("preco-ana");
  entrarComo(ana);
  await saveIntegration(ana.id, "travelpayouts", TOKEN_TP, true);
  const db = admin();
  expect(
    (await db.from("profiles").update({ notify_telegram: true }).eq("id", ana.id)).error,
  ).toBeNull();
  expect(
    (await db.from("telegram_links").insert({ user_id: ana.id, chat_id: CHAT, linked_at: AGORA }))
      .error,
  ).toBeNull();
  const m = await db
    .from("price_monitors")
    .insert({
      user_id: ana.id,
      kind: "dates",
      origin: "SDU",
      destination: "CGH",
      rule: {
        kind: "dates",
        ranges: [{ start: DIA_DO_VOO, end: DIA_DO_VOO, from: "06:00", to: "10:00" }],
      },
      target_cents: 25000,
      provider: "travelpayouts",
      frequency: "daily",
      active: true,
      next_check_at: AGORA,
    })
    .select("id")
    .single();
  expect(m.error).toBeNull();
  monitorId = m.data!.id as string;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  if (ana) await admin().auth.admin.deleteUser(ana.id);
});

async function linhas(tabela: string) {
  const { data, error } = await admin().from(tabela).select("*").eq("user_id", ana.id);
  expect(error).toBeNull();
  return (data ?? []) as Record<string, unknown>[];
}

/** Avisos de preço que chegaram ao chat da Ana pelo Telegram. */
function avisosDePreco() {
  return rede
    .para("api.telegram.org")
    .map((c) => JSON.parse(c.corpo) as { chat_id: number; text: string })
    .filter((m) => m.chat_id === CHAT && m.text.startsWith("Preço SDU → CGH"));
}

describe("monitor de preço com aviso", () => {
  it("1º ciclo: checa o monitor vencido e grava um aviso de R$ 240 (o voo das 15h fica de fora)", async () => {
    await runTick({ now: AGORA, recordTick: false });
    const chamadas = rede.para("api.travelpayouts.com");
    expect(chamadas).toHaveLength(1);
    expect(new URL(chamadas[0].url).searchParams.get("departure_at")).toBe(DIA_DO_VOO);
    const checks = await linhas("price_checks");
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ monitor_id: monitorId, error: null, min_price_cents: 24000 });
    const alertas = await linhas("price_alerts");
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      monitor_id: monitorId,
      flight_date: DIA_DO_VOO,
      departs_local: `${DIA_DO_VOO}T07:00`,
      price_cents: 24000,
      signals: ["at_target"],
      sent_at: null,
    });
    // O aviso sai no ciclo seguinte (os pendentes são enviados antes das checagens).
    expect(avisosDePreco()).toHaveLength(0);
  });

  it("2º ciclo (10 min depois): um aviso de preço no Telegram; o aviso fica marcado como enviado", async () => {
    await runTick({ now: depois(AGORA, 10), recordTick: false });
    const avisos = avisosDePreco();
    expect(avisos).toHaveLength(1);
    expect(avisos[0].text).toMatch(/R\$\s240,00 \(no alvo\)/);
    const [alerta] = await linhas("price_alerts");
    expect(alerta.sent_at).not.toBeNull();
    expect(alerta.channels).toEqual(["telegram"]);
    // O monitor não estava vencido: nenhuma consulta nova.
    expect(rede.para("api.travelpayouts.com")).toHaveLength(1);
  });

  it("no dia seguinte, o mesmo preço: checa de novo, mas não cria aviso nem manda mensagem", async () => {
    const amanha = depois(AGORA, 24 * 60);
    await runTick({ now: amanha, recordTick: false });
    await runTick({ now: depois(amanha, 10), recordTick: false });
    expect(rede.para("api.travelpayouts.com")).toHaveLength(2);
    expect(await linhas("price_checks")).toHaveLength(2);
    expect(await linhas("price_alerts")).toHaveLength(1);
    expect(avisosDePreco()).toHaveLength(1);
  });

  it("uma queda relevante (R$ 225) gera um aviso novo, uma vez", async () => {
    fonte.preco = 225;
    const depoisDeAmanha = depois(AGORA, 2 * 24 * 60);
    await runTick({ now: depoisDeAmanha, recordTick: false });
    await runTick({ now: depois(depoisDeAmanha, 10), recordTick: false });
    await runTick({ now: depois(depoisDeAmanha, 20), recordTick: false });
    const alertas = await linhas("price_alerts");
    expect(alertas.map((a) => a.price_cents).sort()).toEqual([22500, 24000]);
    expect(avisosDePreco()).toHaveLength(2);
    expect(avisosDePreco()[1].text).toMatch(/R\$\s225,00/);
  });

  it("só o Telegram e o Travelpayouts foram chamados; nenhum push", () => {
    expect(enviarPush).not.toHaveBeenCalled();
    const hosts = new Set(rede.chamadas.map((c) => new URL(c.url).host));
    expect([...hosts].sort()).toEqual(["api.telegram.org", "api.travelpayouts.com"]);
  });
});
