// Fluxo: botão "Verificar agora" de um monitor de preço. Desde a regra aprovada em
// 27/11, o histórico de preço só é gravado pelo servidor (o navegador só lê); o botão
// tem de continuar gravando a checagem, e uma pessoa não verifica o monitor de outra.
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

const { checkNowAction } = await import("@/app/(app)/app/monitor/actions");
const { saveIntegration } = await import("@/lib/integrations/repo");

// O botão usa a hora de verdade: o voo fica daqui a 10 dias, dentro da janela de busca.
const DIA_DO_VOO = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

function travelpayoutsFalso(url: URL) {
  const data = url.searchParams.get("departure_at");
  return json({
    success: true,
    currency: "brl",
    data: [
      {
        origin: "SDU",
        destination: "CGH",
        price: 240,
        airline: "G3",
        flight_number: "1000",
        departure_at: `${data}T07:00:00-03:00`,
        transfers: 0,
        duration_to: 65,
      },
    ],
  });
}

let ana: PessoaTeste;
let bia: PessoaTeste;
let monitorId = "";

beforeAll(async () => {
  instalarRedeFalsa({ "api.travelpayouts.com": travelpayoutsFalso });
  ana = await novaPessoa("agora-ana");
  bia = await novaPessoa("agora-bia");
  entrarComo(ana);
  await saveIntegration(ana.id, "travelpayouts", "token-tp-ficticio", true);
  const m = await admin()
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
    })
    .select("id")
    .single();
  expect(m.error).toBeNull();
  monitorId = m.data!.id as string;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  for (const p of [ana, bia]) if (p) await admin().auth.admin.deleteUser(p.id);
});

function formulario(id: string) {
  const fd = new FormData();
  fd.set("id", id);
  return fd;
}

async function checagensDaAna() {
  const { data, error } = await admin().from("price_checks").select("*").eq("user_id", ana.id);
  expect(error).toBeNull();
  return data ?? [];
}

describe("Verificar agora", () => {
  it("B não verifica o monitor de A", async () => {
    entrarComo(bia);
    const r = await checkNowAction({}, formulario(monitorId));
    expect(r.error).toBe("Monitor não encontrado.");
    expect(await checagensDaAna()).toHaveLength(0);
    expect(rede.para("api.travelpayouts.com")).toHaveLength(0);
  });

  it("A verifica o próprio monitor: a checagem e o aviso são gravados pelo servidor", async () => {
    entrarComo(ana);
    const r = await checkNowAction({}, formulario(monitorId));
    expect(r.error).toBeUndefined();
    expect(r.ok).toBe(true);
    const checks = await checagensDaAna();
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ monitor_id: monitorId, error: null, min_price_cents: 24000 });
    const { data: alertas } = await admin()
      .from("price_alerts")
      .select("price_cents")
      .eq("user_id", ana.id);
    expect(alertas).toEqual([{ price_cents: 24000 }]);
    const { data: monitor } = await admin()
      .from("price_monitors")
      .select("last_checked_at, last_error")
      .eq("id", monitorId)
      .single();
    expect(monitor?.last_checked_at).not.toBeNull();
    expect(monitor?.last_error).toBeNull();
  });
});
