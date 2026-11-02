import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getConfig } from "@/lib/notify/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { savePrefsAction, telegramUnlinkAction } from "./actions";
import { PushToggle } from "./push-toggle";
import { TelegramConnect } from "./telegram-connect";
import { TestButton } from "./test-button";

export const metadata = { title: "Notificações" };

export default function NotificacoesPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Notificações</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
        <Settings />
      </Suspense>
    </main>
  );
}

const card = "flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800";

async function Settings() {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, { data: link }, { data: log }, cfg] = await Promise.all([
    supabase
      .from("profiles")
      .select("notify_telegram, notify_push, notify_email, quiet_hours_start, quiet_hours_end")
      .eq("id", user.id)
      .single(),
    supabase
      .from("telegram_links")
      .select("chat_id, linked_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("notification_log")
      .select("title, channels, sent_at")
      .eq("user_id", user.id)
      .order("sent_at", { ascending: false })
      .limit(10),
    getConfig(["telegram_bot_username"]),
  ]);
  const emailReady = Boolean(process.env.RESEND_API_KEY);

  return (
    <>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Avisos de check-in (na abertura e 24h antes), conflitos, trecho faltando, compra duplicada e
        créditos vencendo. Entre {profile?.quiet_hours_start?.slice(0, 5)} e{" "}
        {profile?.quiet_hours_end?.slice(0, 5)} só o aviso de check-in de 24h é enviado; o resto
        espera a manhã.
      </p>

      <section className={card}>
        <h2 className="font-semibold">Telegram</h2>
        {!cfg.telegram_bot_username ? (
          <p className="text-sm text-zinc-500">Ainda não configurado nesta instalação.</p>
        ) : link?.chat_id ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>Conectado ao @{cfg.telegram_bot_username}.</span>
            <form action={telegramUnlinkAction}>
              <button className="text-xs underline underline-offset-2">Desconectar</button>
            </form>
          </div>
        ) : (
          <TelegramConnect />
        )}
      </section>

      <section className={card}>
        <h2 className="font-semibold">Notificação no celular (push)</h2>
        <PushToggle />
      </section>

      <form action={savePrefsAction} className={card}>
        <h2 className="font-semibold">Canais</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="notify_telegram"
            defaultChecked={profile?.notify_telegram ?? true}
          />{" "}
          Telegram
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notify_push" defaultChecked={profile?.notify_push ?? true} />{" "}
          Push
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="notify_email"
            defaultChecked={profile?.notify_email ?? false}
            disabled={!emailReady}
          />{" "}
          E-mail
          {!emailReady ? (
            <span className="text-xs text-zinc-500">
              (disponível quando o envio de e-mail for configurado)
            </span>
          ) : null}
        </label>
        <button className="self-start rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
          Salvar
        </button>
      </form>

      <section className={card}>
        <h2 className="font-semibold">Testar</h2>
        <TestButton />
      </section>

      {log?.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
            Últimos avisos
          </h2>
          <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {log.map((l) => (
              <li key={`${l.sent_at}-${l.title}`} className="flex flex-col px-4 py-2">
                <span>{l.title}</span>
                <span className="text-xs text-zinc-500">
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: "America/Sao_Paulo",
                  }).format(new Date(l.sent_at))}{" "}
                  ·{" "}
                  {(l.channels as string[]).length
                    ? (l.channels as string[]).join(", ")
                    : "nenhum canal ativo"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
