// Fluxo: importar passagens do Gmail. Busca (startScanAction) → avanço com o Gmail
// falso (advanceScanAction) → confirmação do custo (confirmScanAction) → leitura
// com a extração falsa → importação (importCandidatesAction). Nada do corpo do
// e-mail fica gravado, e repetir a busca não duplica passagens.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Extraction } from "@/lib/extract/schema";
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
// Extração falsa: nenhuma chamada à Anthropic. Devolve a passagem do localizador
// que aparece no texto do e-mail.
const { extrair } = vi.hoisted(() => ({
  extrair: vi.fn(async (_chave: string, input: { kind: string; text?: string }) => {
    const locator = /TESTE[0-9]/.exec(input.text ?? "")?.[0] ?? "";
    const data: Extraction = { bookings: locator ? [reserva(locator)] : [], warnings: [] };
    return { ok: true as const, data, model: "modelo-falso" };
  }),
}));
vi.mock("@/lib/extract/extract", () => ({ extractBookings: extrair }));

const { saveGmailConnection } = await import("@/lib/mail/accounts");
const { saveIntegration } = await import("@/lib/integrations/repo");
const { startScanAction, advanceScanAction, confirmScanAction, importCandidatesAction } =
  await import("@/app/(app)/app/passagens/importar/actions");

/** Frase que só existe no corpo dos e-mails falsos: não pode ir para o banco. */
const FRASE_DO_CORPO = "Frase exclusiva do corpo: o tucano fictício cochila no hangar";
const REFRESH = "refresh-token-ficticio";
const ACESSO = "acesso-ficticio";

// E-mails falsos: dois de compra e, na segunda busca, um reenvio do primeiro.
const EMAILS: Record<string, { locator: string; recebido: string; numero: string }> = {
  "msg-teste-1": { locator: "TESTE5", recebido: "2026-11-20T12:00:00Z", numero: "1234" },
  "msg-teste-2": { locator: "TESTE6", recebido: "2026-11-21T12:00:00Z", numero: "1236" },
  "msg-teste-3": { locator: "TESTE5", recebido: "2026-11-22T12:00:00Z", numero: "1234" },
};
const caixa = { ids: ["msg-teste-1", "msg-teste-2"] };

function reserva(locator: string): Extraction["bookings"][number] {
  const ida = locator === "TESTE5" ? "2027-02-10" : "2027-02-17";
  return {
    locator,
    airline_code: "G3",
    seller: "Site da companhia",
    channel: "airline",
    total_amount: 450,
    currency: "BRL",
    miles: null,
    taxes_amount: null,
    purchased_on: null,
    status: "active",
    flights: [
      {
        airline_code: "G3",
        flight_number: locator === "TESTE5" ? "G3 1234" : "G3 1236",
        origin_iata: "SDU",
        destination_iata: "CGH",
        departure_local: `${ida}T07:00`,
        arrival_local: `${ida}T08:05`,
        passenger: "Pessoa Fictícia",
      },
    ],
  };
}

function cabecalhos(locator: string) {
  return [
    { name: "From", value: "Gol <reservas@voegol.com.br>" },
    { name: "Subject", value: `Confirmação da sua reserva ${locator}` },
  ];
}

function corpo(locator: string, numero: string) {
  return [
    `Olá, Pessoa Fictícia. Sua compra foi confirmada.`,
    `Localizador: ${locator}`,
    `Voo G3 ${numero} de SDU para CGH.`,
    `Valor total: R$ 450,00.`,
    FRASE_DO_CORPO,
    `Este é um e-mail fictício usado só em testes automáticos, sem nenhum dado real de ninguém.`,
  ].join("\n");
}

/** Gmail falso: lista, cabeçalhos e corpo, no formato da API (só leitura). */
function gmailFalso(url: URL, c: { metodo: string }) {
  if (c.metodo !== "GET") return json({ error: "método" }, 405);
  const caminho = url.pathname.replace("/gmail/v1/users/me", "");
  if (caminho === "/messages") return json({ messages: caixa.ids.map((id) => ({ id })) });
  const id = decodeURIComponent(caminho.replace("/messages/", ""));
  const e = EMAILS[id];
  if (!e) return json({ error: "não encontrado" }, 404);
  const base = { id, internalDate: String(Date.parse(e.recebido)) };
  if (url.searchParams.get("format") === "metadata")
    return json({ ...base, payload: { headers: cabecalhos(e.locator) } });
  return json({
    ...base,
    payload: {
      mimeType: "text/plain",
      headers: cabecalhos(e.locator),
      body: { data: Buffer.from(corpo(e.locator, e.numero)).toString("base64url") },
    },
  });
}

let ana: PessoaTeste;

beforeAll(async () => {
  instalarRedeFalsa({
    "oauth2.googleapis.com": (url) =>
      url.pathname === "/token"
        ? json({ access_token: ACESSO, expires_in: 3600 })
        : json({ error: "rota" }, 404),
    "gmail.googleapis.com": gmailFalso,
  });
  ana = await novaPessoa("gmail-ana");
  entrarComo(ana);
  // Conexão como o app grava: token do Gmail cifrado + conta; chave da Anthropic cifrada.
  await saveGmailConnection(ana.id, REFRESH, "caixa-ficticia@example.com", "1000");
  await saveIntegration(ana.id, "anthropic", "sk-ant-ficticia-0000", true);
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

async function avancarAte(estado: string) {
  let r = await advanceScanAction();
  for (let i = 0; i < 5 && r.status !== estado; i++) r = await advanceScanAction();
  expect(r.error).toBeUndefined();
  expect(r.status).toBe(estado);
  return r;
}

function formulario(campos: [string, string][]) {
  const f = new FormData();
  for (const [k, v] of campos) f.append(k, v);
  return f;
}

describe("importar passagens do Gmail", () => {
  it("a busca lista os e-mails, filtra pelos cabeçalhos e para esperando a confirmação", async () => {
    entrarComo(ana);
    await startScanAction();
    const r = await avancarAte("awaiting_confirmation");
    expect(r.total).toBe(2);
    const msgs = await linhas("mail_messages");
    expect(msgs.map((m) => [m.provider_message_id, m.status, m.sender_domain]).sort()).toEqual([
      ["msg-teste-1", "candidate", "voegol.com.br"],
      ["msg-teste-2", "candidate", "voegol.com.br"],
    ]);
    // O token do Gmail foi decifrado e usado na renovação do acesso.
    expect(rede.para("oauth2.googleapis.com")[0].corpo).toContain(`refresh_token=${REFRESH}`);
    // Sem confirmação, a IA ainda não foi chamada.
    expect(extrair).not.toHaveBeenCalled();
  });

  it("confirmada, a leitura extrai uma passagem por e-mail e termina em revisão", async () => {
    entrarComo(ana);
    await confirmScanAction(formulario([]));
    await avancarAte("review");
    expect(extrair).toHaveBeenCalledTimes(2);
    // A chave usada é a da pessoa (decifrada), e o corpo do e-mail chegou à extração.
    expect(extrair.mock.calls.map((c) => c[0])).toEqual([
      "sk-ant-ficticia-0000",
      "sk-ant-ficticia-0000",
    ]);
    expect(extrair.mock.calls.every((c) => c[1].text?.includes(FRASE_DO_CORPO))).toBe(true);
    const cands = await linhas("import_candidates");
    expect(cands).toHaveLength(2);
    expect(cands.every((c) => c.status === "pending")).toBe(true);
    const msgs = await linhas("mail_messages");
    expect(msgs.map((m) => m.status)).toEqual(["extracted", "extracted"]);
  });

  it("importar cria as 2 passagens e marca os candidatos como importados", async () => {
    entrarComo(ana);
    const cands = await linhas("import_candidates");
    const r = await importCandidatesAction(
      {},
      formulario(cands.map((c) => ["candidate", c.id as string])),
    );
    expect(r).toMatchObject({ imported: 2, errors: [] });
    const bookings = await linhas("bookings");
    expect(bookings.map((b) => [b.locator, b.amount_cents, b.source]).sort()).toEqual([
      ["TESTE5", 45000, "email"],
      ["TESTE6", 45000, "email"],
    ]);
    const flights = await linhas("flights");
    expect(flights).toHaveLength(2);
    const depois = await linhas("import_candidates");
    expect(depois.map((c) => c.status)).toEqual(["imported", "imported"]);
    expect(depois.map((c) => c.booking_id).sort()).toEqual(bookings.map((b) => b.id).sort());
  });

  it("nada do corpo do e-mail fica gravado (só metadados e o rascunho)", async () => {
    for (const t of ["mail_messages", "mail_scans", "import_candidates", "bookings", "flights"]) {
      const texto = JSON.stringify(await linhas(t));
      expect(texto, t).not.toContain(FRASE_DO_CORPO);
      expect(texto, t).not.toContain("tucano");
    }
  });

  it("importar de novo os mesmos candidatos não cria nada", async () => {
    entrarComo(ana);
    const cands = await linhas("import_candidates");
    const r = await importCandidatesAction(
      {},
      formulario(cands.map((c) => ["candidate", c.id as string])),
    );
    expect(r).toMatchObject({ imported: 0, updated: 0, errors: [] });
    expect(await linhas("bookings")).toHaveLength(2);
  });

  it("nova busca: e-mails já lidos não voltam; o reenvio da mesma compra é descartado", async () => {
    entrarComo(ana);
    caixa.ids = ["msg-teste-1", "msg-teste-2", "msg-teste-3"];
    extrair.mockClear();
    await startScanAction();
    await avancarAte("awaiting_confirmation");
    await confirmScanAction(formulario([]));
    await avancarAte("review");
    // Só o e-mail novo foi lido pela IA.
    expect(extrair).toHaveBeenCalledTimes(1);
    expect(extrair.mock.calls[0][1].text).toContain("TESTE5");
    const pendentes = (await linhas("import_candidates")).filter((c) => c.status === "pending");
    expect(pendentes).toHaveLength(1);
    const r = await importCandidatesAction(
      {},
      formulario([["candidate", pendentes[0].id as string]]),
    );
    expect(r).toMatchObject({ imported: 0, skipped: 1, errors: [] });
    expect(await linhas("bookings")).toHaveLength(2);
    expect(await linhas("flights")).toHaveLength(2);
    expect(await linhas("mail_messages")).toHaveLength(3);
  });

  it("só o Google (token e Gmail) foi chamado; nenhuma outra rede", () => {
    const hosts = new Set(rede.chamadas.map((c) => new URL(c.url).host));
    expect([...hosts].sort()).toEqual(["gmail.googleapis.com", "oauth2.googleapis.com"]);
  });
});
