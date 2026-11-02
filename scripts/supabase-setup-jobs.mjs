// Prepara notificações e agendador (idempotente). Uso no workflow:
//   APP_URL=https://minhas-passagens.vercel.app [TELEGRAM_BOT_TOKEN=...] node scripts/supabase-setup-jobs.mjs
// Nada sensível é impresso: os logs do repositório são públicos.
import { randomBytes } from "node:crypto";
import webpush from "web-push";
import { query } from "./supabase-api.mjs";

const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
if (!/^https:\/\//.test(appUrl)) throw new Error("Informe APP_URL (https://...)");

const sqlStr = (v) => `'${String(v).replace(/'/g, "''")}'`;
const get = async (key) =>
  (await query(`select value from public.app_config where key = ${sqlStr(key)}`))[0]?.value;
const set = (key, value) =>
  query(
    `insert into public.app_config (key, value) values (${sqlStr(key)}, ${sqlStr(value)})
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
  );

// 1. Chaves VAPID (geradas uma vez; trocar invalida as inscrições de push).
if (!(await get("vapid_public_key"))) {
  const keys = webpush.generateVAPIDKeys();
  await set("vapid_public_key", keys.publicKey);
  await set("vapid_private_key", keys.privateKey);
  console.log("VAPID: chaves criadas.");
} else console.log("VAPID: já existiam.");

// 2. Segredo do agendador.
let jobsSecret = await get("jobs_secret");
if (!jobsSecret) {
  jobsSecret = randomBytes(32).toString("base64url");
  await set("jobs_secret", jobsSecret);
  console.log("Agendador: segredo criado.");
} else console.log("Agendador: segredo já existia.");
await set("app_url", appUrl);

// 3. pg_cron a cada 5 minutos chamando /api/jobs/tick.
await query("create extension if not exists pg_cron");
await query("create extension if not exists pg_net");
await query(`select cron.unschedule(jobid) from cron.job where jobname = 'minhas-passagens-tick'`);
await query(`select cron.schedule(
  'minhas-passagens-tick',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := (select value from public.app_config where key = 'app_url') || '/api/jobs/tick',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || (select value from public.app_config where key = 'jobs_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
)`);
console.log("Agendador: pg_cron a cada 5 minutos.");

// 4. Telegram (opcional): guarda o token e registra o webhook.
const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (token) {
  const me = await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json();
  if (!me.ok) throw new Error("Token do Telegram recusado pelo getMe.");
  let hookSecret = await get("telegram_webhook_secret");
  if (!hookSecret) {
    hookSecret = randomBytes(24).toString("base64url");
    await set("telegram_webhook_secret", hookSecret);
  }
  await set("telegram_bot_token", token);
  await set("telegram_bot_username", me.result.username);
  const hook = await (
    await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: `${appUrl}/api/telegram/webhook`,
        secret_token: hookSecret,
        allowed_updates: ["message"],
      }),
    })
  ).json();
  if (!hook.ok) throw new Error(`setWebhook falhou: ${hook.description}`);
  console.log(`Telegram: bot @${me.result.username} conectado ao webhook.`);
} else {
  console.log("Telegram: segredo TELEGRAM_BOT_TOKEN não definido; pulando.");
}
