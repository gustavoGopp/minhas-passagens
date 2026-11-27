// Fluxo: salvar e editar uma passagem pela ação do servidor (saveBookingAction),
// gravando de verdade no Postgres com as regras de acesso da pessoa logada.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { emptyDraft, type BookingDraft } from "@/lib/trips/draft";
import { admin, entrarComo, novaPessoa, type PessoaTeste } from "./apoio";

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

const { saveBookingAction } = await import("@/app/(app)/app/passagens/actions");

let ana: PessoaTeste;
let bruno: PessoaTeste;

beforeAll(async () => {
  ana = await novaPessoa("ana");
  bruno = await novaPessoa("bruno");
});

afterAll(async () => {
  for (const p of [ana, bruno]) if (p) await admin().auth.admin.deleteUser(p.id);
});

function idaEVolta(): BookingDraft {
  const vazio = emptyDraft("2026-11-27T12:00:00Z");
  const trecho = vazio.legs[0];
  return {
    ...vazio,
    locator: "TESTE1",
    airline: "G3",
    amount: "1.000,00",
    purchased_on: "2026-11-20",
    legs: [
      {
        ...trecho,
        airline: "G3",
        flight_number: "G31000",
        origin: "SDU",
        destination: "CGH",
        departure_local: "2027-03-01T07:00",
        arrival_local: "2027-03-01T08:05",
        passenger: "Pessoa Fictícia",
      },
      {
        ...trecho,
        airline: "G3",
        flight_number: "G31001",
        origin: "CGH",
        destination: "SDU",
        departure_local: "2027-03-04T19:00",
        arrival_local: "2027-03-04T20:05",
        passenger: "Pessoa Fictícia",
      },
    ],
  };
}

function formulario(d: BookingDraft) {
  const f = new FormData();
  f.set("payload", JSON.stringify(d));
  return f;
}

async function passagem(id: string) {
  const db = admin();
  const b = await db.from("bookings").select("*").eq("id", id).single();
  const f = await db.from("flights").select("*").eq("booking_id", id).order("departs_at");
  return { booking: b.data, flights: f.data ?? [] };
}

describe("salvar e editar passagem", () => {
  let id = "";

  it("Ana salva uma ida e volta; R$ 1.000,00 é gravado como 100000 centavos", async () => {
    entrarComo(ana);
    const r = await saveBookingAction({}, formulario(idaEVolta()));
    expect(r.error).toBeUndefined();
    id = r.savedId!;
    const { booking, flights } = await passagem(id);
    expect(booking).toMatchObject({ user_id: ana.id, locator: "TESTE1", amount_cents: 100000 });
    expect(flights.map((f) => [f.origin, f.destination, f.user_id])).toEqual([
      ["SDU", "CGH", ana.id],
      ["CGH", "SDU", ana.id],
    ]);
    // Horário local do Rio (UTC-3) gravado em UTC.
    expect(flights[0].departs_at).toBe("2027-03-01T10:00:00+00:00");
  });

  it("Ana edita o horário da volta; a ida continua a mesma linha", async () => {
    entrarComo(ana);
    const antes = await passagem(id);
    const d = idaEVolta();
    d.id = id;
    d.legs[0].id = antes.flights[0].id;
    d.legs[1].id = antes.flights[1].id;
    d.legs[1].departure_local = "2027-03-04T21:00";
    d.legs[1].arrival_local = "2027-03-04T22:05";
    const r = await saveBookingAction({}, formulario(d));
    expect(r.error).toBeUndefined();
    const depois = await passagem(id);
    expect(depois.flights).toHaveLength(2);
    expect(depois.flights[0].id).toBe(antes.flights[0].id);
    expect(depois.flights[1].departs_at).toBe("2027-03-05T00:00:00+00:00");
  });

  it("Bruno tenta editar a passagem de Ana pela mesma ação: nada muda", async () => {
    const antes = await passagem(id);
    entrarComo(bruno);
    const d = idaEVolta();
    d.id = id;
    d.amount = "1,00";
    d.legs[0].departure_local = "2027-06-01T07:00";
    d.legs[0].arrival_local = "2027-06-01T08:05";
    await saveBookingAction({}, formulario(d));
    const depois = await passagem(id);
    expect(depois).toEqual(antes);
    const intrusos = await admin().from("flights").select("id").eq("user_id", bruno.id);
    expect(intrusos.data).toEqual([]);
  });

  it('valor ambíguo ("1,234", da tabela aprovada) é recusado com mensagem e nada é gravado', async () => {
    entrarComo(ana);
    const d = idaEVolta();
    d.locator = "TESTE2";
    d.amount = "1,234";
    const r = await saveBookingAction({}, formulario(d));
    expect(r.error).toBeTruthy();
    expect(r.savedId).toBeUndefined();
    const gravadas = await admin()
      .from("bookings")
      .select("id")
      .eq("user_id", ana.id)
      .eq("locator", "TESTE2");
    expect(gravadas.data).toEqual([]);
  });
});
