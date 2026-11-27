// Apoio aos testes de ponta a ponta. Tudo aqui é fictício e só fala com o
// Supabase local: pessoas @example.com, passagens com localizador TESTE.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

function exigir(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`Falta ${nome} (veja "supabase status -o env").`);
  return v;
}

const apiUrl = () => {
  const v = exigir("API_URL");
  if (!/127\.0\.0\.1|localhost/.test(v)) throw new Error("API_URL precisa ser o Supabase local.");
  return v;
};

export function admin() {
  return createClient(apiUrl(), exigir("SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface Pessoa {
  id: string;
  email: string;
  senha: string;
}

/** Cria uma pessoa fictícia no Auth local. */
export async function novaPessoa(nome: string): Promise<Pessoa> {
  const email = `${nome.toLowerCase()}-${randomUUID().slice(0, 8)}@example.com`;
  const senha = randomUUID();
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { full_name: `${nome} Teste` },
  });
  if (error || !data.user) throw error ?? new Error("pessoa não criada");
  // O primeiro acesso pede o fuso e a cidade; a pessoa fictícia já chega configurada.
  await admin()
    .from("profiles")
    .update({ timezone: "America/Sao_Paulo", home_city: "Rio de Janeiro" })
    .eq("id", data.user.id);
  return { id: data.user.id, email, senha };
}

export async function apagarPessoa(p: Pessoa | undefined) {
  if (p) await admin().auth.admin.deleteUser(p.id);
}

/**
 * Entra como a pessoa: faz o login por senha na API local (só existe no ambiente
 * de teste) e põe no navegador os mesmos cookies que o app grava depois do Google.
 */
export async function entrar(context: BrowserContext, p: Pessoa, baseURL: string) {
  const jar = new Map<string, string>();
  const supabase = createServerClient(apiUrl(), exigir("ANON_KEY"), {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (lista) => {
        for (const c of lista) jar.set(c.name, c.value);
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email: p.email, password: p.senha });
  if (error) throw error;
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: baseURL })));
}

/** Grava uma passagem de um trecho para a pessoa, direto no banco local. */
export async function semearVoo(
  p: Pessoa,
  v: { localizador: string; origem: string; destino: string; partidaUtc: string },
): Promise<string> {
  const db = admin();
  const b = await db
    .from("bookings")
    .insert({
      user_id: p.id,
      locator: v.localizador,
      airline: "G3",
      amount_cents: 45000,
      purchased_on: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (b.error) throw b.error;
  const f = await db.from("flights").insert({
    booking_id: b.data.id,
    user_id: p.id,
    airline: "G3",
    flight_number: "G31234",
    origin: v.origem,
    destination: v.destino,
    departs_at: v.partidaUtc,
    arrives_at: new Date(Date.parse(v.partidaUtc) + 65 * 60_000).toISOString(),
    passenger: "Pessoa Fictícia",
  });
  if (f.error) throw f.error;
  return b.data.id as string;
}

/** Daqui a `dias` dias, à hora local de São Paulo/Rio dada, em UTC. */
export function emDias(dias: number, horaLocal: number): string {
  const d = new Date(Date.now() + dias * 86_400_000);
  const dia = d.toISOString().slice(0, 10);
  return new Date(`${dia}T${String(horaLocal).padStart(2, "0")}:00:00-03:00`).toISOString();
}

/**
 * Captura da tela final (anexada ao relatório e guardada em capturas/<projeto>/)
 * e checagem de acessibilidade (WCAG A e AA). Qualquer violação reprova.
 */
export async function conferirTela(page: Page, info: TestInfo, nome: string) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const imagem = await page.screenshot({ fullPage: true });
  await info.attach(`${nome}.png`, { body: imagem, contentType: "image/png" });
  const pasta = path.join("capturas", info.project.name);
  mkdirSync(pasta, { recursive: true });
  writeFileSync(path.join(pasta, `${nome}.png`), imagem);

  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const resumo = r.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(resumo, `acessibilidade em "${nome}" (${info.project.name})`).toEqual([]);
}
