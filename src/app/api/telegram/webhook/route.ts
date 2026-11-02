import { NextResponse, type NextRequest } from "next/server";
import { sendTelegram } from "@/lib/notify/channels";
import { getConfig, safeEqual } from "@/lib/notify/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Recebe mensagens do bot. "/start <token>" vincula o chat à conta; "/parar" desvincula. */
export async function POST(request: NextRequest) {
  const cfg = await getConfig(["telegram_webhook_secret", "telegram_bot_token"]);
  const header = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!cfg.telegram_webhook_secret || !safeEqual(header, cfg.telegram_webhook_secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN ?? cfg.telegram_bot_token;
  const update = (await request.json().catch(() => null)) as {
    message?: { chat?: { id?: number }; text?: string };
  } | null;
  const chatId = update?.message?.chat?.id;
  const text = update?.message?.text?.trim() ?? "";
  if (!chatId || !token) return NextResponse.json({ ok: true });

  const admin = createSupabaseAdminClient();
  const start = /^\/start\s+([A-Za-z0-9_-]{16,64})$/.exec(text);
  if (start) {
    const { data } = await admin
      .from("telegram_links")
      .select("user_id, token_expires_at")
      .eq("link_token", start[1])
      .maybeSingle();
    if (
      !data ||
      (data.token_expires_at && Date.parse(data.token_expires_at as string) < Date.now())
    ) {
      await sendTelegram(
        token,
        chatId,
        "Link expirado. Gere um novo em Minhas Passagens → Mais → Notificações.",
      );
      return NextResponse.json({ ok: true });
    }
    await admin
      .from("telegram_links")
      .update({
        chat_id: chatId,
        linked_at: new Date().toISOString(),
        link_token: null,
        token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", data.user_id);
    await sendTelegram(
      token,
      chatId,
      "Pronto! Você vai receber aqui os avisos de check-in, conflitos e créditos. Para parar, envie /parar.",
    );
    return NextResponse.json({ ok: true });
  }
  if (text === "/parar") {
    await admin
      .from("telegram_links")
      .update({ chat_id: null, linked_at: null })
      .eq("chat_id", chatId);
    await sendTelegram(token, chatId, "Avisos desligados neste chat.");
    return NextResponse.json({ ok: true });
  }
  await sendTelegram(
    token,
    chatId,
    "Para conectar, use o botão em Minhas Passagens → Mais → Notificações.",
  );
  return NextResponse.json({ ok: true });
}
