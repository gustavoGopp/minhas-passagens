// Fluxo: falha do servidor vai para o registro no banco e aparece no e-mail do
// vigia diário (P23; decisão do dono de 27/11: só no banco, sem Sentry). O
// registro guarda 30 dias. Sem falha nas últimas 24 horas, nenhum e-mail novo sai.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { admin, instalarRedeFalsa, json, rede } from "./apoio";

vi.mock("server-only", () => ({}));

const { registrarFalha, limparFalhasAntigas } = await import("@/lib/falhas");
const { GET: vigia } = await import("@/app/api/jobs/watchdog/route");

const SEGREDO = "segredo-do-vigia-de-teste";
const ORIGEM = `teste:${Date.now()}`;

async function minhasFalhas() {
  const { data, error } = await admin()
    .from("registro_falhas")
    .select("origem, mensagem, criado_em")
    .like("origem", "teste:%");
  expect(error).toBeNull();
  return data ?? [];
}

function chamarVigia() {
  return vigia(
    new Request("http://127.0.0.1/api/jobs/watchdog", {
      headers: { authorization: `Bearer ${SEGREDO}` },
    }) as never,
  );
}

function emailsDoResend() {
  return rede
    .para("api.resend.com")
    .map((c) => JSON.parse(c.corpo) as { subject: string; text: string });
}

beforeAll(async () => {
  vi.stubEnv("CRON_SECRET", SEGREDO);
  vi.stubEnv("RESEND_API_KEY", "chave-resend-ficticia");
  vi.stubEnv("BACKUP_GITHUB_REPO", "");
  const db = admin();
  // Agendador em dia (o vigia não reconcilia) e nenhum alerta de falha enviado ainda.
  await db.from("app_config").upsert({ key: "last_tick_at", value: new Date().toISOString() });
  await db.from("app_config").delete().eq("key", "falhas_alert_at");
  await db.from("registro_falhas").delete().like("origem", "teste:%");
});

beforeEach(() => {
  instalarRedeFalsa({ "api.resend.com": () => json({ id: "email-ficticio" }) });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await admin().from("registro_falhas").delete().like("origem", "teste:%");
  await admin().from("app_config").delete().eq("key", "falhas_alert_at");
});

describe("registro de falhas", () => {
  it("sem falha nas últimas 24 horas, o vigia não manda e-mail", async () => {
    await admin()
      .from("registro_falhas")
      .delete()
      .gte("criado_em", new Date(Date.now() - 86_400_000).toISOString());
    const r = await chamarVigia();
    expect(r.status).toBe(200);
    expect(emailsDoResend()).toHaveLength(0);
  });

  it("a falha fica gravada, com a mensagem curta e o e-mail escondido", async () => {
    await registrarFalha(ORIGEM, new Error("Falha ao salvar: conta fulano@example.com"));
    const linhas = await minhasFalhas();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      origem: ORIGEM,
      mensagem: "Falha ao salvar: conta f***@example.com",
    });
  });

  it("o vigia diário manda o resumo das falhas por e-mail, uma vez", async () => {
    const r = await chamarVigia();
    expect(r.status).toBe(200);
    const emails = emailsDoResend();
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toMatch(/\d+ falhas? nas últimas 24 horas/);
    expect(emails[0].text).toContain(`- ${ORIGEM}: 1 vez.`);
    // No mesmo dia, o vigia não repete o e-mail.
    await chamarVigia();
    expect(emailsDoResend()).toHaveLength(1);
  });

  it("falhas com mais de 30 dias saem na limpeza; as recentes ficam", async () => {
    const velha = new Date(Date.now() - 31 * 86_400_000).toISOString();
    expect(
      (
        await admin()
          .from("registro_falhas")
          .insert({ origem: ORIGEM, mensagem: "antiga", criado_em: velha })
      ).error,
    ).toBeNull();
    expect(await minhasFalhas()).toHaveLength(2);
    expect(await limparFalhasAntigas(new Date().toISOString())).toBeGreaterThanOrEqual(1);
    const restantes = await minhasFalhas();
    expect(restantes.map((l) => l.mensagem)).toEqual(["Falha ao salvar: conta f***@example.com"]);
  });
});
