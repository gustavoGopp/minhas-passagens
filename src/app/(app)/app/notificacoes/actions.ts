"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { enviarTeste, guardarCodigoTelegram } from "@/lib/notify/acoes";
import { getConfig } from "@/lib/notify/config";
import { exigir } from "@/lib/supabase/exigir";
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
  try {
    await guardarCodigoTelegram(user.id, token, new Date(Date.now() + 15 * 60_000).toISOString());
  } catch (e) {
    return { error: (e as Error).message };
  }
  return { url: `https://t.me/${telegram_bot_username}?start=${token}` };
}

export async function telegramUnlinkAction() {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  exigir(
    await supabase.from("telegram_links").delete().eq("user_id", user.id),
    "Falha ao desfazer o vínculo do Telegram",
  );
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
  exigir(
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", endpoint),
    "Falha ao desligar os avisos neste aparelho",
  );
  revalidatePath("/app/notificacoes");
}

export async function savePrefsAction(fd: FormData) {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  exigir(
    await supabase
      .from("profiles")
      .update({
        notify_telegram: fd.get("notify_telegram") === "on",
        notify_push: fd.get("notify_push") === "on",
        notify_email: fd.get("notify_email") === "on",
      })
      .eq("id", user.id),
    "Falha ao salvar as preferências de aviso",
  );
  revalidatePath("/app/notificacoes");
}

export interface TestState {
  result?: string;
}

export async function sendTestAction(): Promise<TestState> {
  const user = await getCurrentUser();
  return { result: await enviarTeste(user.id) };
}
