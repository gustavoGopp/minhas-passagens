import "server-only";
import { getDecryptedKey } from "@/lib/integrations/repo";
import { deliver, loadChannelConfig } from "@/lib/notify/dispatch";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { exigir } from "@/lib/supabase/exigir";

// Ações de aviso que precisam do servidor: o vínculo do Telegram só é criado pelo
// servidor (docs/regras-de-acesso.md) e o teste de envio lê dados de entrega.
// Cada função recebe o id da pessoa da sessão e sempre filtra por ele.

/** Guarda o código de vínculo do Telegram da pessoa (válido até `expira`). */
export async function guardarCodigoTelegram(userId: string, codigo: string, expira: string) {
  exigir(
    await createSupabaseAdminClient().from("telegram_links").upsert({
      user_id: userId,
      link_token: codigo,
      token_expires_at: expira,
      updated_at: new Date().toISOString(),
    }),
    "Falha ao gerar o link do Telegram",
  );
}

/** Manda um aviso de teste por todos os canais ligados da pessoa. */
export async function enviarTeste(userId: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  const [profile, link, subs] = await Promise.all([
    admin
      .from("profiles")
      .select("email, notify_telegram, notify_push, notify_email")
      .eq("id", userId)
      .single(),
    admin.from("telegram_links").select("chat_id").eq("user_id", userId).maybeSingle(),
    admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId),
  ]);
  const { ok: channels, attempted } = await deliver(
    {
      userId,
      email: profile.data?.email ?? null,
      notifyTelegram: Boolean(profile.data?.notify_telegram),
      notifyPush: Boolean(profile.data?.notify_push),
      notifyEmail: Boolean(profile.data?.notify_email),
      telegramChatId: link.data?.chat_id ? Number(link.data.chat_id) : null,
      pushSubs: subs.data ?? [],
      resendKey: await getDecryptedKey(userId, "resend"),
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
  return channels.length
    ? `Enviado por: ${channels.join(", ")}.`
    : attempted.length
      ? `Falhou em: ${attempted.join(", ")}. Confira as chaves e tente de novo.`
      : "Nenhum canal configurado. Ative um canal acima e salve.";
}
