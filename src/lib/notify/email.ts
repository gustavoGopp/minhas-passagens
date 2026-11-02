/** Envio de e-mail pelo Resend (sem dependências de servidor, testável). */

export type EmailResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "own_email_only" | "unavailable"; message: string };

/**
 * Envia pelo Resend. Usa a chave do usuário (Integrações) ou, se não houver,
 * a chave da instalação (RESEND_API_KEY). Sem domínio próprio, o Resend só
 * entrega no e-mail da conta que criou a chave.
 */
export async function sendEmailDetailed(
  to: string,
  subject: string,
  text: string,
  userKey?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<EmailResult> {
  const key = userKey || process.env.RESEND_API_KEY;
  if (!key) return { ok: false, reason: "unavailable", message: "E-mail não configurado." };
  let res: Response;
  try {
    res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Minhas Passagens <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, reason: "unavailable", message: "Não foi possível falar com o Resend." };
  }
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  const msg = body.message ?? "";
  if (res.status === 403 && /own email|testing emails/i.test(msg)) {
    return {
      ok: false,
      reason: "own_email_only",
      message: `Crie a conta do Resend com o mesmo e-mail do app (${to}).`,
    };
  }
  if (res.status === 401 || res.status === 403 || /api key/i.test(msg)) {
    return { ok: false, reason: "invalid", message: "Chave do Resend inválida." };
  }
  return { ok: false, reason: "unavailable", message: `O Resend respondeu ${res.status}.` };
}

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  userKey?: string | null,
): Promise<boolean> {
  return (await sendEmailDetailed(to, subject, text, userKey)).ok;
}
