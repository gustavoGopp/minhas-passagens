/**
 * Regras de entrega dos avisos (puras, testadas): um aviso só conta como enviado
 * se pelo menos um canal funcionou. Sem canal configurado, nada é registrado (o
 * aviso volta a ser avaliado e sai quando houver canal, se ainda valer). Se os
 * canais falharam, o aviso é tentado de novo com espera crescente.
 */

export type Channel = "telegram" | "push" | "email";

/** Tentativas antes de desistir (5, 10, 20, 40 e 80 min: cerca de 2,5 h no total). */
export const MAX_ATTEMPTS = 6;
export const FIRST_RETRY_MINUTES = 5;

export interface DeliveryResult {
  /** Canais que entregaram. */
  ok: Channel[];
  /** Canais configurados que foram tentados. */
  attempted: Channel[];
  /** Erros técnicos por canal (sem dados pessoais). */
  errors: string[];
}

export type Outcome =
  | { kind: "sent"; channels: Channel[] }
  | { kind: "no_channel" }
  | { kind: "failed"; error: string };

export function outcomeOf(r: DeliveryResult): Outcome {
  if (r.ok.length) return { kind: "sent", channels: r.ok };
  if (!r.attempted.length) return { kind: "no_channel" };
  return { kind: "failed", error: (r.errors.join("; ") || "falha no envio").slice(0, 300) };
}

export interface AttemptState {
  status: "sent" | "failed";
  attempts: number;
  last_attempt_at: string | null;
}

export type RetryDecision = "attempt" | "done" | "wait" | "gave_up";

export function retryDelayMinutes(attempts: number): number {
  return FIRST_RETRY_MINUTES * 2 ** Math.max(0, attempts - 1);
}

/** Decide se um aviso já registrado deve ser tentado agora. */
export function retryDecision(prev: AttemptState | undefined, nowIso: string): RetryDecision {
  if (!prev) return "attempt";
  if (prev.status === "sent") return "done";
  if (prev.attempts >= MAX_ATTEMPTS) return "gave_up";
  if (!prev.last_attempt_at) return "attempt";
  const elapsed = (Date.parse(nowIso) - Date.parse(prev.last_attempt_at)) / 60_000;
  return elapsed >= retryDelayMinutes(prev.attempts) ? "attempt" : "wait";
}

/** Canais que dá para tentar, dadas as preferências e o que está de fato configurado. */
export function availableChannels(input: {
  notifyTelegram: boolean;
  telegramChatId: number | null;
  telegramToken: string | null;
  notifyPush: boolean;
  pushSubs: number;
  vapid: boolean;
  notifyEmail: boolean;
  email: string | null;
  emailKey: boolean;
}): Channel[] {
  const out: Channel[] = [];
  if (input.notifyTelegram && input.telegramChatId && input.telegramToken) out.push("telegram");
  if (input.notifyPush && input.vapid && input.pushSubs > 0) out.push("push");
  if (input.notifyEmail && input.email && input.emailKey) out.push("email");
  return out;
}
