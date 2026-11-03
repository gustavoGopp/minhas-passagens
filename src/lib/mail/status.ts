import type { NotifyEvent } from "@/lib/notify/events";

/** Regras puras da conexão do Gmail (testadas). */

/** Renova o acesso no máximo uma vez a cada 20 h (teste de que o token continua vivo). */
export const GMAIL_HEALTH_EVERY_HOURS = 20;

export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "••••";
  return `${name.slice(0, 2)}•••@${domain}`;
}

/** Aviso "Reconecte o Gmail" para conexões expiradas (um por conexão). */
export function gmailExpiredEvent(a: { connected_at: string }, nowIso: string): NotifyEvent {
  const days = Math.max(
    0,
    Math.floor((Date.parse(nowIso) - Date.parse(a.connected_at)) / 86_400_000),
  );
  return {
    key: `gmail-expired:${a.connected_at}`,
    title: "Reconecte o Gmail",
    body: `O Google encerrou o acesso do Minhas Passagens ao seu Gmail (${days} dia(s) depois de conectar). Conecte de novo em Integrações para continuar encontrando suas passagens.`,
    path: "/app/integracoes",
    urgent: false,
  };
}
