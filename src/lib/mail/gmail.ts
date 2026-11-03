import { cleanText } from "@/lib/extract/text";

/**
 * Cliente fino da Gmail API (só leitura), com `fetch` injetável. Não guarda nada:
 * quem chama decide o que persistir (só metadados, nunca o corpo).
 */
export const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

type FetchLike = typeof fetch;

/** Remetentes de companhias, agências e programas de milhas (conferir com e-mails reais). */
export const TRAVEL_SENDERS = [
  "voeazul.com.br",
  "voegol.com.br",
  "latam.com",
  "latamairlines.com",
  "smiles.com.br",
  "tudoazul.com.br",
  "latampass.com",
  "123milhas.com",
  "123milhas.com.br",
  "decolar.com",
  "zupper.com.br",
  "maxmilhas.com.br",
  "viajanet.com.br",
  "submarinoviagens.com.br",
  "livelo.com.br",
];

/** Duas consultas: por remetente e por termos (pega agências fora da lista). Spam e lixeira inclusos. */
export function scanQueries(years = 5): string[] {
  return [
    `in:anywhere newer_than:${years}y from:(${TRAVEL_SENDERS.join(" OR ")})`,
    `in:anywhere newer_than:${years}y (localizador OR "código de reserva" OR "codigo da reserva" OR e-ticket OR "bilhete eletrônico" OR "cartão de embarque")`,
  ];
}

export class GmailError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function get(path: string, token: string, f: FetchLike) {
  const res = await f(`${GMAIL_API}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new GmailError(res.status, `Gmail respondeu ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** Uma página de ids (até 500), com spam e lixeira. */
export async function listMessageIds(
  token: string,
  q: string,
  pageToken: string | null,
  f: FetchLike = fetch,
): Promise<{ ids: string[]; nextPageToken: string | null }> {
  const p = new URLSearchParams({ q, includeSpamTrash: "true", maxResults: "500" });
  if (pageToken) p.set("pageToken", pageToken);
  const j = await get(`/messages?${p}`, token, f);
  const msgs = (j.messages as { id: string }[] | undefined) ?? [];
  return { ids: msgs.map((m) => m.id), nextPageToken: (j.nextPageToken as string) ?? null };
}

/**
 * E-mails adicionados desde `startHistoryId` (sincronização incremental).
 * Lança GmailError(404) quando o id é antigo demais: aí refaz a busca recente.
 */
export async function listHistory(
  token: string,
  startHistoryId: string,
  pageToken: string | null,
  f: FetchLike = fetch,
): Promise<{ ids: string[]; nextPageToken: string | null; historyId: string | null }> {
  const p = new URLSearchParams({
    startHistoryId,
    historyTypes: "messageAdded",
    maxResults: "500",
  });
  if (pageToken) p.set("pageToken", pageToken);
  const j = await get(`/history?${p}`, token, f);
  const ids = new Set<string>();
  for (const h of (j.history as
    { messagesAdded?: { message?: { id?: string } }[] }[] | undefined) ?? []) {
    for (const a of h.messagesAdded ?? []) if (a.message?.id) ids.add(a.message.id);
  }
  return {
    ids: [...ids],
    nextPageToken: (j.nextPageToken as string) ?? null,
    historyId: (j.historyId as string) ?? null,
  };
}

/** Busca recente (quando o histórico expirou): as mesmas consultas, só os últimos dias. */
export function recentQueries(days = 30): string[] {
  return scanQueries().map((q) => q.replace(/newer_than:\d+y/, `newer_than:${days}d`));
}

interface Part {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: Part[];
}

export interface MessageMeta {
  id: string;
  receivedAt: string;
  from: string;
  subject: string;
  listUnsubscribe: boolean;
}

function header(headers: { name: string; value: string }[] | undefined, name: string) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export function parseMeta(j: Record<string, unknown>): MessageMeta {
  const payload = (j.payload as Part | undefined) ?? {};
  const internal = Number(j.internalDate ?? 0);
  return {
    id: String(j.id ?? ""),
    receivedAt: new Date(Number.isFinite(internal) && internal > 0 ? internal : 0).toISOString(),
    from: header(payload.headers, "From"),
    subject: header(payload.headers, "Subject"),
    listUnsubscribe: Boolean(header(payload.headers, "List-Unsubscribe")),
  };
}

/** Cabeçalhos mínimos para o pré-filtro (remetente, assunto, se é lista de e-mails). */
export async function getMeta(token: string, id: string, f: FetchLike = fetch) {
  const p = new URLSearchParams({ format: "metadata" });
  for (const h of ["From", "Subject", "List-Unsubscribe"]) p.append("metadataHeaders", h);
  return parseMeta(await get(`/messages/${encodeURIComponent(id)}?${p}`, token, f));
}

const decode = (data: string) => Buffer.from(data, "base64url").toString("utf8");

/** Texto do e-mail: prefere text/plain; senão, o HTML limpo. Anexos ficam de fora. */
export function bodyText(payload: Part): string {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (p: Part) => {
    if (p.filename) return; // anexo
    if (p.body?.data) {
      if (p.mimeType === "text/plain") plain.push(decode(p.body.data));
      else if (p.mimeType === "text/html") html.push(decode(p.body.data));
    }
    for (const c of p.parts ?? []) walk(c);
  };
  walk(payload);
  const text = plain.join("\n").trim();
  // Muitos e-mails de companhia têm um text/plain vazio ou só "veja no navegador".
  return text.length >= 200 ? cleanText(text) : cleanText(html.join("\n") || text);
}

export async function getBody(token: string, id: string, f: FetchLike = fetch) {
  const j = await get(`/messages/${encodeURIComponent(id)}?format=full`, token, f);
  const payload = (j.payload as Part | undefined) ?? {};
  return { meta: parseMeta(j), text: bodyText(payload) };
}

/** Link para abrir a mensagem no Gmail (na conta logada). */
export function gmailLink(id: string): string {
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(id)}`;
}
