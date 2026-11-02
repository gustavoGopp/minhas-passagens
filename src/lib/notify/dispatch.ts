import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail, sendPush, sendTelegram, type PushSub } from "./channels";
import { getConfig } from "./config";
import type { NotifyEvent } from "./events";

export interface Recipient {
  userId: string;
  email: string | null;
  notifyTelegram: boolean;
  notifyPush: boolean;
  notifyEmail: boolean;
  telegramChatId: number | null;
  pushSubs: PushSub[];
  /** Chave Resend do próprio usuário (Integrações), se houver. */
  resendKey?: string | null;
}

export async function loadChannelConfig() {
  const cfg = await getConfig([
    "telegram_bot_token",
    "vapid_public_key",
    "vapid_private_key",
    "app_url",
  ]);
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN ?? cfg.telegram_bot_token ?? null;
  const vapid =
    cfg.vapid_public_key && cfg.vapid_private_key
      ? {
          publicKey: cfg.vapid_public_key,
          privateKey: cfg.vapid_private_key,
          subject: process.env.VAPID_SUBJECT ?? "mailto:avisos@minhas-passagens.app",
        }
      : null;
  return {
    telegramToken,
    vapid,
    appUrl: (cfg.app_url ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, ""),
  };
}

export type ChannelConfig = Awaited<ReturnType<typeof loadChannelConfig>>;

/** Entrega um aviso em todos os canais ativos do usuário. Devolve os canais que funcionaram. */
export async function deliver(r: Recipient, e: NotifyEvent, cfg: ChannelConfig): Promise<string[]> {
  const ok: string[] = [];
  const link = cfg.appUrl ? `${cfg.appUrl}${e.path}` : e.path;

  if (r.notifyTelegram && r.telegramChatId && cfg.telegramToken) {
    if (await sendTelegram(cfg.telegramToken, r.telegramChatId, `${e.title}\n${e.body}\n${link}`))
      ok.push("telegram");
  }
  if (r.notifyPush && cfg.vapid && r.pushSubs.length) {
    const admin = createSupabaseAdminClient();
    let any = false;
    for (const sub of r.pushSubs) {
      const res = await sendPush(cfg.vapid, sub, { title: e.title, body: e.body, url: e.path });
      if (res === "ok") any = true;
      if (res === "gone") await admin.from("push_subscriptions").delete().eq("id", sub.id);
    }
    if (any) ok.push("push");
  }
  if (r.notifyEmail && r.email) {
    if (await sendEmail(r.email, e.title, `${e.body}\n\n${link}`, r.resendKey)) ok.push("email");
  }
  return ok;
}
