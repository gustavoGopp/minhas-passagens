// Cenários de aceitação C1 a C7 (tests/aceitacao/cenarios.md), no app de verdade.
// O título de cada teste começa com o código e o título do cenário aprovado.
import { expect, test } from "@playwright/test";
import {
  admin,
  apagarPessoa,
  conferirTela,
  emDias,
  entrar,
  novaPessoa,
  semearVoo,
  type Pessoa,
} from "./apoio";

let pessoas: Pessoa[] = [];
async function pessoa(nome: string) {
  const p = await novaPessoa(nome);
  pessoas.push(p);
  return p;
}
test.afterEach(async () => {
  for (const p of pessoas) await apagarPessoa(p);
  pessoas = [];
});

/** "AAAA-MM-DDTHH:MM" daqui a `dias` dias (campo de data e hora do formulário). */
function localDaqui(dias: number, hora: string) {
  const d = new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
  return `${d}T${hora}`;
}

async function preencherTrecho(
  page: import("@playwright/test").Page,
  i: number,
  t: { de?: string; para?: string; partida: string; chegada: string },
) {
  if (t.de) await page.getByLabel("De", { exact: true }).nth(i).fill(t.de);
  if (t.para) await page.getByLabel("Para", { exact: true }).nth(i).fill(t.para);
  await page.getByLabel("Partida (hora local)").nth(i).fill(t.partida);
  await page.getByLabel("Chegada (hora local)").nth(i).fill(t.chegada);
}

test("C1 — Entrar só pelo Google", async ({ page, context, baseURL }, info) => {
  await page.goto("/app/passagens");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('input[type="password"], input[type="email"]')).toHaveCount(0);
  const google = page.getByRole("button", { name: /Google/ });
  await expect(google).toHaveCount(1);
  await conferirTela(page, info, "c1-entrada");

  // O clique leva ao Google. A navegação é parada antes de sair do computador.
  let destino = "";
  await page.route("**/auth/v1/authorize**", async (rota) => {
    destino = rota.request().url();
    await rota.fulfill({ status: 200, contentType: "text/html", body: "<title>parado</title>" });
  });
  await google.click();
  await expect.poll(() => destino).toContain("provider=google");

  const ana = await pessoa("Ana");
  await entrar(context, ana, baseURL!);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/app\/?$/);
});

test("C2 — Passagem em reais", async ({ page, context, baseURL }, info) => {
  const ana = await pessoa("Ana");
  await entrar(context, ana, baseURL!);
  await page.goto("/app/passagens/nova");
  await page.getByLabel("Localizador").fill("TESTE2");
  await preencherTrecho(page, 0, {
    de: "SDU",
    para: "CGH",
    partida: localDaqui(30, "07:00"),
    chegada: localDaqui(30, "08:05"),
  });
  await page.getByRole("button", { name: "+ Adicionar trecho (volta ou conexão)" }).click();
  await preencherTrecho(page, 1, {
    partida: localDaqui(33, "19:00"),
    chegada: localDaqui(33, "20:05"),
  });

  // Valor ambíguo: recusado com mensagem, nada salvo.
  const valor = page.getByRole("textbox", { name: "Valor pago" });
  await valor.fill("1,234");
  await page.getByRole("button", { name: "Salvar passagem" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Informe um valor em reais, como 1.250,50",
  );
  await expect(page).toHaveURL(/\/nova/);
  const nada = await admin().from("bookings").select("id").eq("user_id", ana.id);
  expect(nada.data).toEqual([]);

  await valor.fill("1.000,00");
  await page.getByRole("button", { name: "Salvar passagem" }).click();
  await expect(page).toHaveURL(/\/app\/passagens\/[0-9a-f-]{36}$/);
  await expect(page.getByText("R$ 1.000,00").first()).toBeVisible();
  // A passagem salva abre no formulário: os dois trechos aparecem preenchidos.
  const de = page.getByRole("combobox", { name: "De", exact: true });
  const para = page.getByRole("combobox", { name: "Para", exact: true });
  await expect(de).toHaveCount(2);
  await expect(de.nth(0)).toHaveValue("SDU");
  await expect(para.nth(0)).toHaveValue("CGH");
  await expect(de.nth(1)).toHaveValue("CGH");
  await expect(para.nth(1)).toHaveValue("SDU");
  const salvas = await admin()
    .from("bookings")
    .select("amount_cents, flights(origin, destination)")
    .eq("user_id", ana.id);
  expect(salvas.data).toHaveLength(1);
  expect(salvas.data![0].amount_cents).toBe(100000);
  expect(salvas.data![0].flights).toHaveLength(2);
  await conferirTela(page, info, "c2-passagem-salva");
});

test("C3 — Aeroporto desconhecido", async ({ page, context, baseURL }, info) => {
  const ana = await pessoa("Ana");
  await entrar(context, ana, baseURL!);
  await page.goto("/app/passagens/nova");
  await page.getByLabel("Localizador").fill("TESTE3");
  await page.getByRole("textbox", { name: "Valor pago" }).fill("300,00");
  await preencherTrecho(page, 0, {
    de: "ZZZ",
    para: "CGH",
    partida: localDaqui(20, "07:00"),
    chegada: localDaqui(20, "09:00"),
  });
  await expect(page.getByText(/Não conheço o aeroporto ZZZ/)).toBeVisible();
  await page.getByRole("button", { name: "Salvar passagem" }).click();
  await expect(page).toHaveURL(/\/nova/);
  // A captura espera o envio terminar: o botão "Salvando…" esmaecido é passageiro.
  await expect(page.getByRole("button", { name: "Salvar passagem" })).toBeEnabled();
  await conferirTela(page, info, "c3-aeroporto-desconhecido");
  const antes = await admin().from("bookings").select("id").eq("user_id", ana.id);
  expect(antes.data).toEqual([]);

  await page.getByLabel("Conferi os horários").check();
  await page.getByRole("button", { name: "Salvar passagem" }).click();
  await expect(page).toHaveURL(/\/app\/passagens\/[0-9a-f-]{36}$/);
  const depois = await admin().from("bookings").select("id").eq("user_id", ana.id);
  expect(depois.data).toHaveLength(1);
});

test("C4 — Próximo voo", async ({ page, context, baseURL }, info) => {
  const ana = await pessoa("Ana");
  await semearVoo(ana, {
    localizador: "TESTE4",
    origem: "SDU",
    destino: "CGH",
    partidaUtc: emDias(3, 10),
  });
  await entrar(context, ana, baseURL!);
  await page.goto("/app");
  const cartao = page.getByLabel("Próximo voo: SDU para CGH");
  await expect(cartao).toBeVisible();
  await expect(cartao).toContainText("10:00");
  await conferirTela(page, info, "c4-proximo-voo");
});

test("C5 — Monitor de preço", async ({ page, context, baseURL }, info) => {
  const ana = await pessoa("Ana");
  await entrar(context, ana, baseURL!);
  await page.goto("/app/monitor/novo");
  await page.getByLabel("Origem").fill("SDU");
  await page.getByLabel("Destino").fill("CGH");
  await page.getByLabel("Preço-alvo (R$)").fill("250");
  await page.getByRole("button", { name: "Criar monitor" }).click();
  await expect(page).toHaveURL(/\/app\/monitor\/[0-9a-f-]{36}$/);
  await page.goto("/app/monitor");
  await expect(page.getByText(/SDU\s*→\s*CGH/).first()).toBeVisible();
  await expect(page.getByText(/R\$\s*250/).first()).toBeVisible();
  const salvos = await admin().from("price_monitors").select("target_cents").eq("user_id", ana.id);
  expect(salvos.data).toEqual([{ target_cents: 25000 }]);
  await conferirTela(page, info, "c5-monitores");
});

test("C6 — Sem internet", async ({ page, context, baseURL }, info) => {
  const ana = await pessoa("Ana");
  await semearVoo(ana, {
    localizador: "TESTE6",
    origem: "SDU",
    destino: "CGH",
    partidaUtc: emDias(3, 10),
  });
  await entrar(context, ana, baseURL!);
  await page.goto("/app");
  await expect(page.getByLabel("Próximo voo: SDU para CGH")).toBeVisible();
  // O app guarda os próximos voos e registra o service worker na primeira visita.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).length)).toBeGreaterThan(0);

  await context.setOffline(true);
  await page.goto("/app");
  await expect(page.getByText(/Sem conexão/)).toBeVisible();
  await expect(page.getByText("SDU").first()).toBeVisible();
  await conferirTela(page, info, "c6-sem-internet");
  await context.setOffline(false);
});

test("C7 — Cada um vê o seu", async ({ page, context, baseURL }, info) => {
  const ana = await pessoa("Ana");
  const bruno = await pessoa("Bruno");
  const idDaAna = await semearVoo(ana, {
    localizador: "TESTE7",
    origem: "SDU",
    destino: "CGH",
    partidaUtc: emDias(5, 9),
  });
  await semearVoo(bruno, {
    localizador: "TESTE8",
    origem: "CGH",
    destino: "SDU",
    partidaUtc: emDias(6, 18),
  });
  await entrar(context, bruno, baseURL!);
  // A lista de Bruno (no início) mostra a passagem dele e nada da Ana.
  await page.goto("/app");
  await expect(page.getByLabel("Próximo voo: CGH para SDU")).toBeVisible();
  await expect(page.getByText("TESTE8").first()).toBeVisible();
  await expect(page.getByText("TESTE7")).toHaveCount(0);
  // O endereço da passagem da Ana dá "não encontrada", sem nenhum dado dela.
  await page.goto(`/app/passagens/${idDaAna}`);
  await expect(page.getByText(/pode ter sido apagado/)).toBeVisible();
  await expect(page.getByText("TESTE7")).toHaveCount(0);
  await conferirTela(page, info, "c7-passagem-de-outra-pessoa");
});
