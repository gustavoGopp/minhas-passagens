// Limites da leitura com IA (P25): no máximo 3 tentativas por e-mail e teto
// diário de 30 leituras (leitura automática e envio de print, PDF ou texto). A
// busca completa que o dono confirma vendo o custo fica fora do teto. Tudo
// contra o Supabase local, com a extração e o Gmail falsos.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ExtractResult } from "@/lib/extract/extract";
import type { Extraction } from "@/lib/extract/schema";
import { admin, entrarComo, instalarRedeFalsa, json, novaPessoa, type PessoaTeste } from "./apoio";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
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

// Extração falsa. "trava": nunca responde (a função da Vercel morreu no meio).
const estado = vi.hoisted(() => ({ modo: "responde" as "responde" | "trava" }));
const { extrair } = vi.hoisted(() => ({
  extrair: vi.fn(
    async (_chave: string, input: { kind: string; text?: string }, _opcoes?: object) => {
      if (estado.modo === "trava") return new Promise<never>(() => {});
      const locator = /LIMITE[0-9]+/.exec(input.text ?? "")?.[0] ?? "";
      const data: Extraction = { bookings: locator ? [reserva(locator)] : [], warnings: [] };
      const r: ExtractResult = {
        ok: true,
        data,
        model: "modelo-falso",
        chamadas: [
          {
            modelo: "modelo-falso",
            reforco: false,
            resultado: "ok",
            motivoParada: "end_turn",
            tokensEntrada: 4000,
            tokensSaida: 500,
            tokensCacheLeitura: 0,
            tokensCacheEscrita: 0,
          },
        ],
      };
      return r;
    },
  ),
}));
vi.mock("@/lib/extract/extract", async (original) => ({
  ...(await original<typeof import("@/lib/extract/extract")>()),
  extractBookings: extrair,
}));

const { saveGmailConnection } = await import("@/lib/mail/accounts");
const { saveIntegration } = await import("@/lib/integrations/repo");
const { advanceScan, latestScan } = await import("@/lib/mail/scan");
const { extractAction } = await import("@/app/(app)/app/passagens/actions");
const { TETO_DIARIO_EXTRACOES, MAX_TENTATIVAS_POR_EMAIL } = await import("@/lib/extract/limites");
const { limparConsumoAntigo } = await import("@/lib/extract/consumo");

function reserva(locator: string): Extraction["bookings"][number] {
  return {
    locator,
    airline_code: "AD",
    seller: "Site da companhia",
    channel: "airline",
    total_amount: 300,
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
        departure_local: "2027-03-10T07:00",
        arrival_local: "2027-03-10T08:05",
        passenger: null,
      },
    ],
  };
}

/** Gmail falso: todo e-mail "msg-LIMITEn" é uma confirmação com localizador LIMITEn. */
function gmailFalso(url: URL) {
  const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  const locator = id.replace("msg-", "");
  const headers = [
    { name: "From", value: "Azul <reservas@voeazul.com.br>" },
    { name: "Subject", value: `Confirmação da reserva ${locator}` },
  ];
  const texto = `Sua compra foi confirmada. Localizador: ${locator}. Voo AD 4512 SDU para CGH. Valor total R$ 300,00. E-mail fictício de teste automático, sem nenhum dado real.`;
  return json({
    id,
    internalDate: String(Date.parse("2026-11-20T12:00:00Z")),
    payload: {
      mimeType: "text/plain",
      headers,
      body: { data: Buffer.from(texto).toString("base64url") },
    },
  });
}

const pessoas: PessoaTeste[] = [];

beforeAll(() => {
  instalarRedeFalsa({
    "oauth2.googleapis.com": () => json({ access_token: "acesso-ficticio", expires_in: 3600 }),
    "gmail.googleapis.com": gmailFalso,
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  for (const p of pessoas) await admin().auth.admin.deleteUser(p.id);
});

async function pessoaComGmail(prefixo: string) {
  const p = await novaPessoa(prefixo);
  pessoas.push(p);
  entrarComo(p);
  await saveGmailConnection(p.id, "refresh-ficticio", "caixa-ficticia@example.com", "1000");
  await saveIntegration(p.id, "anthropic", "sk-ant-ficticia-0000", true);
  return p;
}

/** Busca já na etapa de leitura, com e-mails esperando a IA. */
async function buscaComEmails(p: PessoaTeste, kind: "sync" | "full", locators: string[]) {
  const db = admin();
  const { data: scan, error } = await db
    .from("mail_scans")
    .insert({ user_id: p.id, kind, status: "processing" })
    .select("id")
    .single();
  expect(error).toBeNull();
  const { error: e2 } = await db.from("mail_messages").insert(
    locators.map((l) => ({
      user_id: p.id,
      scan_id: scan!.id,
      provider_message_id: `msg-${l}`,
      status: "candidate",
      received_at: "2026-11-20T12:00:00Z",
    })),
  );
  expect(e2).toBeNull();
}

async function avancar(p: PessoaTeste, depoisDe = 0) {
  const clock = () => Date.now() + depoisDe;
  const scan = await latestScan(admin(), p.id);
  return advanceScan(admin(), scan!, clock() + 20_000, fetch, clock);
}

async function mensagens(p: PessoaTeste) {
  const { data } = await admin()
    .from("mail_messages")
    .select("provider_message_id, status, error, attempts")
    .eq("user_id", p.id)
    .order("provider_message_id");
  return data ?? [];
}

async function leiturasDeHoje(p: PessoaTeste, n: number, origem: string) {
  const { error } = await admin()
    .from("extracoes")
    .insert(
      Array.from({ length: n }, () => ({
        user_id: p.id,
        origem,
        modelo: "modelo-falso",
        reforco: false,
        resultado: "ok",
      })),
    );
  expect(error).toBeNull();
}

async function esperarAte(cond: () => Promise<boolean>) {
  for (let i = 0; i < 100; i++) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("tempo esgotado esperando o banco");
}

const MIN = 60_000;

describe("C9 — E-mail com problema não é pago para sempre", () => {
  it("a leitura interrompida é tentada no máximo 3 vezes e depois vira erro", async () => {
    expect(MAX_TENTATIVAS_POR_EMAIL).toBe(3);
    const p = await pessoaComGmail("limite-c9");
    await buscaComEmails(p, "sync", ["LIMITE1"]);
    estado.modo = "trava";
    extrair.mockClear();
    const tentativa = async (n: number) => {
      // Cada rodada do agendador acontece 11 minutos depois da anterior.
      void avancar(p, (n - 1) * 11 * MIN);
      await esperarAte(async () => (await mensagens(p))[0]?.attempts === n);
    };
    await tentativa(1);
    await tentativa(2);
    await tentativa(3);
    expect(extrair).toHaveBeenCalledTimes(3);
    // Quarta rodada: não chama a IA de novo; o e-mail vira erro e a busca termina.
    await expect(avancar(p, 33 * MIN)).resolves.toBe("review");
    expect(extrair).toHaveBeenCalledTimes(3);
    const [m] = await mensagens(p);
    expect(m).toMatchObject({ status: "error", attempts: 3 });
    expect(m.error).toMatch(/3 tentativas/);
    estado.modo = "responde";
  });
});

describe("C10 — Teto diário da leitura com IA", () => {
  it("leitura automática: para no teto, mostra o motivo e continua no dia seguinte", async () => {
    expect(TETO_DIARIO_EXTRACOES).toBe(30);
    const p = await pessoaComGmail("limite-c10");
    await leiturasDeHoje(p, 29, "automatica");
    await buscaComEmails(p, "sync", ["LIMITE2", "LIMITE3", "LIMITE4"]);
    extrair.mockClear();

    expect(await avancar(p)).toBe("processing");
    expect(extrair).toHaveBeenCalledTimes(1);
    expect((await mensagens(p)).map((m) => m.status).sort()).toEqual([
      "candidate",
      "candidate",
      "extracted",
    ]);
    const scan = await latestScan(admin(), p.id);
    expect(scan?.last_error).toMatch(/teto/i);
    // A leitura feita foi registrada, com o consumo, e conta no teto.
    const { count } = await admin()
      .from("extracoes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", p.id);
    expect(count).toBe(30);

    // No dia seguinte, continua sem perder nenhum e-mail.
    expect(await avancar(p, 24 * 60 * MIN)).toBe("review");
    expect(extrair).toHaveBeenCalledTimes(3);
    expect((await mensagens(p)).every((m) => m.status === "extracted")).toBe(true);
  });

  it("enviar texto também respeita o teto", async () => {
    const p = await pessoaComGmail("limite-envio");
    await leiturasDeHoje(p, 30, "envio");
    entrarComo(p);
    extrair.mockClear();
    const f = new FormData();
    f.append("text", "Localizador LIMITE9, voo AD 4512 SDU para CGH, R$ 300,00");
    const r = await extractAction({}, f);
    expect(r.error).toMatch(/teto/i);
    expect(extrair).not.toHaveBeenCalled();
  });

  it("a busca completa confirmada pelo dono não entra no teto", async () => {
    const p = await pessoaComGmail("limite-completa");
    await leiturasDeHoje(p, 30, "automatica");
    await buscaComEmails(p, "full", ["LIMITE5", "LIMITE6"]);
    extrair.mockClear();
    expect(await avancar(p)).toBe("review");
    expect(extrair).toHaveBeenCalledTimes(2);
    const { data } = await admin()
      .from("extracoes")
      .select("origem")
      .eq("user_id", p.id)
      .eq("origem", "varredura");
    expect(data).toHaveLength(2);
  });
});

describe("envio de print, PDF ou texto", () => {
  it("grava o consumo com a origem envio e não paga reforço por texto sem passagem", async () => {
    const p = await pessoaComGmail("limite-envio-ok");
    entrarComo(p);
    extrair.mockClear();
    const f = new FormData();
    f.append("text", "Texto colado sem nenhuma passagem, só para conferir o comportamento.");
    const r = await extractAction({}, f);
    expect(r.error).toMatch(/Não encontrei passagens/);
    expect(extrair).toHaveBeenCalledTimes(1);
    expect(extrair.mock.calls[0][2]).toEqual({ allowEmpty: true });
    const { data } = await admin().from("extracoes").select("origem").eq("user_id", p.id);
    expect(data).toEqual([{ origem: "envio" }]);
  });
});

describe("limpeza do consumo", () => {
  it("linhas com mais de 400 dias saem na rotina diária; as recentes ficam", async () => {
    const p = await pessoaComGmail("limite-limpeza");
    const antiga = new Date(Date.now() - 401 * 86_400_000).toISOString();
    const base = { user_id: p.id, origem: "envio", modelo: "modelo-falso", resultado: "ok" };
    const { error } = await admin()
      .from("extracoes")
      .insert([
        { ...base, criado_em: antiga },
        { ...base, criado_em: new Date().toISOString() },
      ]);
    expect(error).toBeNull();
    expect(await limparConsumoAntigo(new Date().toISOString(), admin())).toBeGreaterThanOrEqual(1);
    const { data } = await admin().from("extracoes").select("criado_em").eq("user_id", p.id);
    expect(data).toHaveLength(1);
  });
});
