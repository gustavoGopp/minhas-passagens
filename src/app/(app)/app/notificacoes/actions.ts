"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getConfig } from "@/lib/notify/config";
import { deliver, loadChannelConfig } from "@/lib/notify/dispatch";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LinkState {
  url?: string;
  error?: string;
}

/** Gera um link t.me/<bot>?start=<token> válido por 15 minutos. */
export async function telegramLinkAction(): Promise<LinkState> {
  const user = await getCurrentUser();
  const { telegram_bot_username } = await getConfig(["telegram_bot_username"]);
  if (!telegram_bot_username) return { error: "O bot do Telegram ainda não foi configurado." };
  const token = randomBytes(18).toString("base64url");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("telegram_links").upsert({
    user_id: user.id,
    link_token: token,
    token_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  return { url: `https://t.me/${telegram_bot_username}?start=${token}` };
}

export async function telegramUnlinkAction() {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("telegram_links").delete().eq("user_id", user.id);
  revalidatePath("/app/notificacoes");
}

const subSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(4) }),
});

export async function savePushSubscriptionAction(
  raw: unknown,
  userAgent: string,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  const sub = subSchema.parse(raw);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent.slice(0, 200),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  revalidatePath("/app/notificacoes");
  return { ok: !error };
}

export async function removePushSubscriptionAction(endpoint: string) {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);
  revalidatePath("/app/notificacoes");
}

export async function savePrefsAction(fd: FormData) {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("profiles")
    .update({
      notify_telegram: fd.get("notify_telegram") === "on",
      notify_push: fd.get("notify_push") === "on",
      notify_email: fd.get("notify_email") === "on",
    })
    .eq("id", user.id);
  revalidatePath("/app/notificacoes");
}

export interface TestState {
  result?: string;
}

export async function sendTestAction(): Promise<TestState> {
  const user = await getCurrentUser();
  const admin = createSupabaseAdminClient();
  const [profile, link, subs] = await Promise.all([
    admin
      .from("profiles")
      .select("email, notify_telegram, notify_push, notify_email")
      .eq("id", user.id)
      .single(),
    admin.from("telegram_links").select("chat_id").eq("user_id", user.id).maybeSingle(),
    admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", user.id),
  ]);
  const channels = await deliver(
    {
      userId: user.id,
      email: profile.data?.email ?? null,
      notifyTelegram: Boolean(profile.data?.notify_telegram),
      notifyPush: Boolean(profile.data?.notify_push),
      notifyEmail: Boolean(profile.data?.notify_email),
      telegramChatId: link.data?.chat_id ? Number(link.data.chat_id) : null,
      pushSubs: subs.data ?? [],
    },
    {
      key: "test",
      title: "Teste do Minhas Passagens",
      body: "Se você recebeu isto, os avisos estão funcionando.",
      path: "/app",
      urgent: true,
    },
    await loadChannelConfig(),
  );
  return {
    result: channels.length
      ? `Enviado por: ${channels.join(", ")}.`
      : "Nenhum canal ativo recebeu o teste.",
  };
}
