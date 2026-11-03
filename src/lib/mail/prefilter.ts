import { listAirports } from "@/lib/airports";
import { TRAVEL_SENDERS } from "./gmail";

/**
 * Pré-filtro sem IA (grátis): decide quais e-mails valem a extração com o Haiku.
 * Duas etapas: pelo cabeçalho (remetente, assunto, lista de e-mails) e pelo corpo
 * (sinais de compra). Puro e testado.
 */

export type MailClass = "confirmation" | "change" | "cancellation" | "checkin" | "credit" | "other";

const BOOKING_WORDS =
  /\b(localizador|c[óo]digo d[ae] reserva|reserva|confirma[çc][ãa]o|compra|bilhete|e-?ticket|itiner[áa]rio|check-?in|cart[ãa]o de embarque|cancelad[ao]|cancelamento|remarca[çc][ãa]o|altera[çc][ãa]o|reembolso|cr[ée]dito|voucher|emiss[ãa]o|pedido)\b/i;
const PROMO_WORDS =
  /\b(oferta|promo[çc][ãa]o|promo|desconto|imperd[íi]vel|black ?friday|cupom|liquida|aproveite|s[óo] hoje|newsletter|% ?off|a partir de r\$)\b/i;

export function senderDomain(from: string): string {
  const m = /@([a-z0-9.-]+)/i.exec(from);
  return (m?.[1] ?? "").toLowerCase();
}

export function isTravelSender(domain: string): boolean {
  return TRAVEL_SENDERS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Etapa 1 (cabeçalho): descarta propaganda; mantém o que pode ser passagem. */
export function headerDecision(h: {
  from: string;
  subject: string;
  listUnsubscribe: boolean;
}): "candidate" | "skip" {
  const booking = BOOKING_WORDS.test(h.subject);
  const promo = PROMO_WORDS.test(h.subject);
  if (booking && !promo) return "candidate";
  if (promo && !booking) return "skip";
  // Lista de e-mails (newsletter) sem palavra de compra no assunto: propaganda.
  if (h.listUnsubscribe && !booking) return "skip";
  return isTravelSender(senderDomain(h.from)) ? "candidate" : booking ? "candidate" : "skip";
}

const IATA_CODES = new Set(listAirports().map((a) => a.iata));
const LOCATOR =
  /\b(?:localizador|c[óo]digo d[ae] reserva|reserva|pnr|record locator)\s*[:#nº°.\-]*\s*([A-Z0-9]{5,8})\b/i;
const FLIGHT_NUMBER = /\b(AD|G3|LA|JJ|TP|CM|AR|AV)\s?-?\d{3,4}\b/;
const MONEY = /R\$\s?\d/;

export interface BodySignals {
  locator: string | null;
  airports: string[];
  flightNumber: boolean;
  money: boolean;
}

export function bodySignals(text: string): BodySignals {
  const airports = [
    ...new Set((text.match(/\b[A-Z]{3}\b/g) ?? []).filter((c) => IATA_CODES.has(c))),
  ];
  return {
    locator: LOCATOR.exec(text)?.[1]?.toUpperCase() ?? null,
    airports,
    flightNumber: FLIGHT_NUMBER.test(text),
    money: MONEY.test(text),
  };
}

/** Etapa 2 (corpo): pelo menos 2 sinais entre localizador, aeroporto, número de voo e valor. */
export function bodyDecision(text: string): "candidate" | "skip" {
  const s = bodySignals(text);
  const n = [Boolean(s.locator), s.airports.length > 0, s.flightNumber, s.money].filter(
    Boolean,
  ).length;
  return n >= 2 ? "candidate" : "skip";
}

/** Tipo do e-mail, para a tela de revisão (remarcação e cancelamento viram propostas). */
export function classify(subject: string, text: string): MailClass {
  const t = `${subject}\n${text.slice(0, 3000)}`;
  if (/cancelad[ao]|cancelamento/i.test(t)) return "cancellation";
  if (
    /remarca[çc][ãa]o|altera[çc][ãa]o (de|do|no) (voo|hor[áa]rio)|mudan[çc]a de hor[áa]rio|voo alterado/i.test(
      t,
    )
  )
    return "change";
  if (/reembolso|cr[ée]dito|voucher/i.test(subject)) return "credit";
  if (/check-?in|cart[ãa]o de embarque/i.test(subject)) return "checkin";
  if (BOOKING_WORDS.test(t)) return "confirmation";
  return "other";
}
