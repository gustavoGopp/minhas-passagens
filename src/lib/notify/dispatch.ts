import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmailDetailed, sendPush, sendTelegram, type PushSub } from "./channels";
import { getConfig } from "./config";
import { availableChannels, type Channel, type DeliveryResult } from "./delivery";
import { BUY_LABEL, eventText, type NotifyEvent } from "./events";

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

/** Canais que dá para tentar para este destinatário. */
export function channelsFor(r: Recipient, cfg: ChannelConfig): Channel[] {
  return availableChannels({
    notifyTelegram: r.notifyTelegram,
    telegramChatId: r.telegramChatId,
    telegramToken: cfg.telegramToken,
    notifyPush: r.notifyPush,
    pushSubs: r.pushSubs.length,
    vapid: Boolean(cfg.vapid),
    notifyEmail: r.notifyEmail,
    email: r.email,
    emailKey: Boolean(r.resendKey || process.env.RESEND_API_KEY),
  });
}

/**
 * Entrega um aviso em todos os canais configurados do usuário. Cada canal é
 * isolado: a falha de um não impede os outros nem derruba o agendador.
 */
export async function deliver(
  r: Recipient,
  e: NotifyEvent,
  cfg: ChannelConfig,
): Promise<DeliveryResult> {
  const result: DeliveryResult = { ok: [], attempted: [], errors: [] };
  const link = cfg.appUrl ? `${cfg.appUrl}${e.path}` : e.path;

  for (const channel of channelsFor(r, cfg)) {
    result.attempted.push(channel);
    try {
      if (channel === "telegram") {
        const sent = await sendTelegram(
          cfg.telegramToken!,
          r.telegramChatId!,
          `${e.title}\n${eventText(e, link)}`,
        );
        if (sent) result.ok.push("telegram");
        else result.errors.push("telegram: falhou");
      } else if (channel === "push") {
        const admin = createSupabaseAdminClient();
        let any = false;
        for (const sub of r.pushSubs) {
          const res = await sendPush(cfg.vapid!, sub, {
            title: e.title,
            body: e.body,
            url: e.path,
            ...(e.buyUrl ? { buyUrl: e.buyUrl, buyLabel: BUY_LABEL } : {}),
          });
          if (res === "ok") any = true;
          if (res === "gone") await admin.from("push_subscriptions").delete().eq("id", sub.id);
        }
        if (any) result.ok.push("push");
        else result.errors.push("push: falhou");
      } else {
        const res = await sendEmailDetailed(r.email!, e.title, eventText(e, link), r.resendKey);
        if (res.ok) result.ok.push("email");
        else result.errors.push(`email: ${res.reason}`);
      }
    } catch (err) {
      result.errors.push(`${channel}: ${(err as Error).name || "erro"}`);
    }
  }
  return result;
}
