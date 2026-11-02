import "server-only";
import webpush from "web-push";

export async function sendTelegram(
  token: string,
  chatId: number | string,
  text: string,
): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  return res.ok;
}

export interface PushSub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Envia push; devolve "gone" quando a inscrição expirou (404/410) e deve ser apagada. */
export async function sendPush(
  vapid: { publicKey: string; privateKey: string; subject: string },
  sub: PushSub,
  payload: { title: string; body: string; url: string },
): Promise<"ok" | "gone" | "error"> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { vapidDetails: vapid, TTL: 6 * 3600 },
    );
    return "ok";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "error";
  }
}

/** E-mail via Resend (opcional: só se RESEND_API_KEY existir). */
export { sendEmail, sendEmailDetailed, type EmailResult } from "./email";
