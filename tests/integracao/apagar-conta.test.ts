// Fluxo: apagar a própria conta (deleteAccountAction). Sem digitar APAGAR, nada
// some. Com APAGAR: o acesso ao Gmail é revogado no Google uma vez, nenhuma linha
// da pessoa sobra em tabela nenhuma, o login dela some, e os dados de outra pessoa ficam.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { banco, fecharBanco } from "../banco/apoio";
import { TABELAS, type Contexto } from "../banco/tabelas";
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

const { deleteAccountAction } = await import("@/app/(app)/app/conta/actions");
const { saveSecretWith } = await import("@/lib/integrations/repo");

const REFRESH_DA_ANA = "refresh-token-ficticio-da-ana";

let ana: PessoaTeste;
let bruno: PessoaTeste;
let reservaDoBruno = "";

/** Tabelas públicas com dono (coluna user_id; em profiles, a chave é o próprio id). */
async function tabelasComDono(): Promise<{ nome: string; coluna: string }[]> {
  const { rows } = await banco().query<{ nome: string; coluna: string }>(
    `select table_name as nome, column_name as coluna
       from information_schema.columns
      where table_schema = 'public'
        and (column_name = 'user_id' or (table_name = 'profiles' and column_name = 'id'))
      order by table_name`,
  );
  return rows;
}

async function linhasDe(userId: string) {
  const out: Record<string, number> = {};
  for (const t of await tabelasComDono()) {
    const { count, error } = await admin()
      .from(t.nome)
      .select("*", { count: "exact", head: true })
      .eq(t.coluna, userId);
    expect(error, t.nome).toBeNull();
    out[t.nome] = count ?? 0;
  }
  return out;
}

/** Uma linha da pessoa em cada tabela com dono (mesmas linhas fictícias dos testes de regras). */
async function semearTudo(userId: string) {
  const ctx: Contexto = { user: userId, booking: "", monitor: "", message: "" };
  const db = admin();
  for (const t of TABELAS) {
    if (t.global || t.nome === "profiles") continue;
    const { data, error } = await db
      .from(t.nome)
      .insert(t.linha(ctx, "apagar"))
      .select(t.pk)
      .single();
    expect(error, t.nome).toBeNull();
    const pk = String((data as unknown as Record<string, unknown>)[t.pk]);
    if (t.nome === "bookings") ctx.booking = pk;
    if (t.nome === "price_monitors") ctx.monitor = pk;
    if (t.nome === "mail_messages") ctx.message = pk;
  }
  // Acesso ao Gmail cifrado como o app grava (é ele que precisa ser revogado).
  await saveSecretWith(db, userId, "gmail", REFRESH_DA_ANA, "ca•••@example.com");
}

beforeAll(async () => {
  instalarRedeFalsa({
    "oauth2.googleapis.com": (url) =>
      url.pathname === "/revoke" ? json({}) : json({ error: "rota" }, 404),
  });
  ana = await novaPessoa("apagar-ana");
  bruno = await novaPessoa("apagar-bruno");
  await semearTudo(ana.id);
  const b = await admin()
    .from("bookings")
    .insert({ user_id: bruno.id, locator: "TESTE7", amount_cents: 30000 })
    .select("id")
    .single();
  expect(b.error).toBeNull();
  reservaDoBruno = b.data!.id as string;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  for (const p of [ana, bruno]) if (p) await admin().auth.admin.deleteUser(p.id);
  await fecharBanco();
});

function confirmacao(texto: string) {
  const f = new FormData();
  f.set("confirmacao", texto);
  return f;
}

describe("apagar a conta", () => {
  it("a Ana tem linhas em todas as tabelas com dono", async () => {
    const contagem = await linhasDe(ana.id);
    const vazias = Object.entries(contagem).filter(([, n]) => n === 0);
    expect(vazias).toEqual([]);
    expect(contagem.user_integrations).toBe(2); // travelpayouts e gmail
  });

  it.each(["", "apagar conta", "APAGA", "sim"])(
    'digitar "%s" no lugar de APAGAR não apaga nada',
    async (texto) => {
      entrarComo(ana);
      const antes = await linhasDe(ana.id);
      const r = await deleteAccountAction({}, confirmacao(texto));
      expect(r.error).toBe("Digite APAGAR para confirmar.");
      expect(await linhasDe(ana.id)).toEqual(antes);
      expect((await admin().auth.admin.getUserById(ana.id)).data.user?.id).toBe(ana.id);
      expect(rede.para("oauth2.googleapis.com")).toHaveLength(0);
    },
  );

  it("com APAGAR: revoga o Gmail uma vez, apaga tudo da Ana e leva para a página inicial", async () => {
    entrarComo(ana);
    await expect(deleteAccountAction({}, confirmacao("APAGAR"))).rejects.toThrow(
      "redirect:/?conta=apagada",
    );
    const revogacoes = rede.para("oauth2.googleapis.com");
    expect(revogacoes).toHaveLength(1);
    expect(revogacoes[0].url).toBe("https://oauth2.googleapis.com/revoke");
    expect(revogacoes[0].metodo).toBe("POST");
    expect(new URLSearchParams(revogacoes[0].corpo).get("token")).toBe(REFRESH_DA_ANA);

    const sobra = Object.entries(await linhasDe(ana.id)).filter(([, n]) => n > 0);
    expect(sobra).toEqual([]);
    const login = await admin().auth.admin.getUserById(ana.id);
    expect(login.data.user).toBeNull();
  });

  it("os dados do Bruno continuam lá", async () => {
    const { data } = await admin().from("bookings").select("id, locator").eq("user_id", bruno.id);
    expect(data).toEqual([{ id: reservaDoBruno, locator: "TESTE7" }]);
    expect((await admin().auth.admin.getUserById(bruno.id)).data.user?.id).toBe(bruno.id);
    expect((await linhasDe(bruno.id)).profiles).toBe(1);
  });
});
