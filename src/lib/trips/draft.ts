import { z } from "zod";
import { airportTimeZone, isKnownAirport } from "@/lib/airports";
import type { ExtractedBooking } from "@/lib/extract/schema";
import { parseMoney } from "./money";
import { isRealDate, localDateTimeProblem, localToUtc, utcToLocal } from "./time";

/** Estado do formulário de passagem (strings, como digitado). */
export interface LegDraft {
  /** Id do trecho já salvo (edição); trechos novos não têm. */
  id?: string;
  airline: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure_local: string;
  arrival_local: string;
  passenger: string;
}

export interface BookingDraft {
  id?: string;
  locator: string;
  airline: string;
  seller: string;
  channel: "airline" | "agency" | "miles" | "corporate";
  amount: string;
  /** Moeda do valor (código ISO de 3 letras). Só BRL entra nas somas de gastos. */
  currency?: string;
  miles: string;
  taxes: string;
  purchased_on: string;
  tag: "personal" | "work";
  status: "active" | "cancelled" | "rebooked";
  source: "manual" | "text" | "image" | "email";
  notes: string;
  /**
   * "Conferi os horários": exigido quando algum aeroporto não está nas listas
   * do app. Nesse caso os horários valem como horário de Brasília.
   */
  confirm_unknown_airports?: boolean;
  legs: LegDraft[];
}

export const DEFAULT_TZ = "America/Sao_Paulo";

export function emptyLeg(airline = "AD"): LegDraft {
  return {
    airline,
    flight_number: "",
    origin: "",
    destination: "",
    departure_local: "",
    arrival_local: "",
    passenger: "",
  };
}

export function emptyDraft(): BookingDraft {
  return {
    locator: "",
    airline: "AD",
    seller: "",
    channel: "airline",
    amount: "",
    currency: "BRL",
    miles: "",
    taxes: "",
    purchased_on: new Date().toISOString().slice(0, 10),
    tag: "personal",
    status: "active",
    source: "manual",
    notes: "",
    legs: [emptyLeg()],
  };
}

const money = (n: number | null) => (n == null ? "" : n.toFixed(2).replace(".", ","));

/** Código ISO de 3 letras em maiúsculas; qualquer outra coisa vira BRL. */
const currencyCode = (c: string | null | undefined) => {
  const up = (c ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(up) ? up : "BRL";
};

export function draftFromExtraction(
  b: ExtractedBooking,
  source: "text" | "image" | "email",
  /** Sem data de compra no texto: usa esta (a data do e-mail), nunca "hoje" para histórico. */
  fallbackPurchasedOn?: string,
): BookingDraft {
  return {
    locator: b.locator ?? "",
    airline: b.airline_code,
    seller: b.seller ?? "",
    channel: b.channel,
    amount: money(b.total_amount),
    currency: currencyCode(b.currency),
    miles: b.miles == null ? "" : String(Math.round(b.miles)),
    taxes: money(b.taxes_amount),
    purchased_on: b.purchased_on ?? fallbackPurchasedOn ?? new Date().toISOString().slice(0, 10),
    tag: "personal",
    status: b.status === "cancelled" ? "cancelled" : "active",
    source,
    notes: "",
    legs: b.flights.map((f) => ({
      airline: f.airline_code,
      flight_number: f.flight_number ?? "",
      origin: f.origin_iata.toUpperCase(),
      destination: f.destination_iata.toUpperCase(),
      departure_local: f.departure_local,
      arrival_local: f.arrival_local ?? "",
      passenger: f.passenger ?? "",
    })),
  };
}

export interface BookingRow {
  id: string;
  locator: string | null;
  airline: string;
  seller: string | null;
  channel: BookingDraft["channel"];
  amount_cents: number | null;
  currency: string;
  miles: number | null;
  taxes_cents: number | null;
  purchased_on: string | null;
  tag: BookingDraft["tag"];
  status: BookingDraft["status"];
  source: BookingDraft["source"];
  notes: string | null;
}

export interface FlightRow {
  id: string;
  booking_id: string;
  airline: string;
  flight_number: string | null;
  origin: string;
  destination: string;
  departs_at: string;
  arrives_at: string | null;
  passenger: string | null;
  checkin_done: boolean;
  ignore_missing_leg?: boolean;
  /** "Volto por outro meio": silencia o aviso de volta não comprada depois deste voo. */
  ignore_missing_return?: boolean;
}

export function draftFromRows(b: BookingRow, flights: FlightRow[]): BookingDraft {
  const cents = (c: number | null) => (c == null ? "" : money(c / 100));
  return {
    id: b.id,
    locator: b.locator ?? "",
    airline: b.airline,
    seller: b.seller ?? "",
    channel: b.channel,
    amount: cents(b.amount_cents),
    currency: currencyCode(b.currency),
    miles: b.miles == null ? "" : String(b.miles),
    taxes: cents(b.taxes_cents),
    purchased_on: b.purchased_on ?? "",
    tag: b.tag,
    status: b.status,
    source: b.source,
    notes: b.notes ?? "",
    legs: [...flights]
      .sort((x, y) => x.departs_at.localeCompare(y.departs_at))
      .map((f) => ({
        id: f.id,
        airline: f.airline,
        flight_number: f.flight_number ?? "",
        origin: f.origin,
        destination: f.destination,
        departure_local: utcToLocal(f.departs_at, airportTimeZone(f.origin) ?? DEFAULT_TZ),
        arrival_local: f.arrives_at
          ? utcToLocal(f.arrives_at, airportTimeZone(f.destination) ?? DEFAULT_TZ)
          : "",
        passenger: f.passenger ?? "",
      })),
  };
}

const iata = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .refine((s) => /^[A-Z]{3}$/.test(s), "Use o código de 3 letras do aeroporto (ex.: SDU)");

const LOCAL_MESSAGES = { data: "Esta data não existe", hora: "Hora inválida" } as const;

/** Horário local que existe de verdade (não só no formato). */
const localField = (formatMessage: string, optional = false) =>
  z.string().superRefine((v, ctx) => {
    if (optional && v === "") return;
    const problem = localDateTimeProblem(v);
    if (problem) {
      ctx.addIssue({
        code: "custom",
        message: problem === "formato" ? formatMessage : LOCAL_MESSAGES[problem],
      });
    }
  });

const tzOf = (iata: string) => airportTimeZone(iata) ?? DEFAULT_TZ;

const legSchema = z.object({
  id: z.uuid().optional(),
  airline: z.string().trim().min(1).max(10),
  flight_number: z.string().trim().max(10),
  origin: iata,
  destination: iata,
  departure_local: localField("Informe data e hora de partida"),
  arrival_local: localField("Hora de chegada inválida", true),
  passenger: z.string().trim().max(120),
});

const moneyField = z.string().superRefine((v, ctx) => {
  const r = parseMoney(v);
  if (!r.ok) ctx.addIssue({ code: "custom", message: r.message });
});
/** Centavos de um valor já validado pelo schema (vazio = sem valor). */
const centsOf = (v: string) => {
  const r = parseMoney(v);
  return r.ok ? r.cents : null;
};

const draftFields = z.object({
  id: z.uuid().optional(),
  locator: z.string().trim().max(20),
  airline: z.string().trim().min(1).max(10),
  seller: z.string().trim().max(80),
  channel: z.enum(["airline", "agency", "miles", "corporate"]),
  amount: moneyField,
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Moeda inválida")
    .default("BRL"),
  miles: z.string().regex(/^\d*$/, "Milhas: só números"),
  taxes: moneyField,
  purchased_on: z.string().refine((v) => v === "" || isRealDate(v), "Data da compra inválida"),
  tag: z.enum(["personal", "work"]),
  status: z.enum(["active", "cancelled", "rebooked"]),
  source: z.enum(["manual", "text", "image", "email"]),
  notes: z.string().max(2000),
  confirm_unknown_airports: z.boolean().optional(),
  legs: z.array(legSchema).min(1, "Inclua pelo menos um trecho"),
});

/**
 * Rascunho de passagem válido: os campos de draftFields e a coerência de cada
 * trecho (origem diferente do destino; chegada depois da partida, comparadas
 * no fuso de cada aeroporto).
 */
export const draftSchema = draftFields.superRefine((d, ctx) => {
  const unknown = unknownAirports(d);
  if (unknown.length && !d.confirm_unknown_airports) {
    ctx.addIssue({
      code: "custom",
      path: ["confirm_unknown_airports"],
      message: `Não conheço o aeroporto ${unknown.join(", ")}. Informe os horários no horário de Brasília e marque “Conferi os horários”.`,
    });
    return;
  }
  d.legs.forEach((l, i) => {
    if (l.origin === l.destination) {
      ctx.addIssue({
        code: "custom",
        path: ["legs", i, "destination"],
        message: "Origem e destino são o mesmo aeroporto",
      });
      return;
    }
    if (!l.arrival_local) return;
    const departs = Date.parse(localToUtc(l.departure_local, tzOf(l.origin)));
    const arrives = Date.parse(localToUtc(l.arrival_local, tzOf(l.destination)));
    if (arrives <= departs) {
      ctx.addIssue({
        code: "custom",
        path: ["legs", i, "arrival_local"],
        message: "A chegada está antes da partida",
      });
    }
  });
});

/** Aeroportos do rascunho cujo fuso o app não conhece (sem repetição, na ordem em que aparecem). */
export function unknownAirports(d: { legs: Pick<LegDraft, "origin" | "destination">[] }): string[] {
  const codes = d.legs.flatMap((l) => [l.origin, l.destination]).map((c) => c.trim().toUpperCase());
  return [...new Set(codes)].filter((c) => /^[A-Z]{3}$/.test(c) && !isKnownAirport(c));
}

/**
 * Compra com data depois do primeiro voo. O formulário recusa; a importação em
 * lote deixa passar e a tela "Conferir passagens" resolve com um clique (quase
 * sempre é o ano do voo que foi lido errado no e-mail).
 */
export function purchaseAfterFlight(d: Pick<BookingDraft, "purchased_on" | "legs">): boolean {
  if (!d.purchased_on) return false;
  const first = d.legs
    .map((l) => l.departure_local.slice(0, 10))
    .filter(Boolean)
    .sort()[0];
  return Boolean(first) && d.purchased_on > first;
}

/** Converte o rascunho validado nas linhas do banco (horários locais → UTC pelo fuso do aeroporto). */
export function rowsFromDraft(d: z.infer<typeof draftSchema>) {
  const booking = {
    locator: d.locator || null,
    airline: d.airline,
    seller: d.seller || null,
    channel: d.channel,
    amount_cents: centsOf(d.amount),
    currency: d.currency,
    miles: d.miles ? Number(d.miles) : null,
    taxes_cents: centsOf(d.taxes),
    purchased_on: d.purchased_on || null,
    tag: d.tag,
    status: d.status,
    source: d.source,
    notes: d.notes || null,
  };
  const flights = d.legs.map((l) => ({
    id: l.id,
    airline: l.airline,
    flight_number: l.flight_number || null,
    origin: l.origin,
    destination: l.destination,
    departs_at: localToUtc(l.departure_local, tzOf(l.origin)),
    arrives_at: l.arrival_local ? localToUtc(l.arrival_local, tzOf(l.destination)) : null,
    passenger: l.passenger || null,
  }));
  return { booking, flights };
}

type FlightInput = ReturnType<typeof rowsFromDraft>["flights"][number];
type FlightFields = Omit<FlightInput, "id">;

export interface LegPlan {
  update: {
    id: string;
    fields: FlightFields & { checkin_done?: false; ignore_missing_leg?: false };
  }[];
  insert: FlightFields[];
  remove: string[];
}

/**
 * Edição de passagem sem recriar trechos: mantém o id (e os avisos já enviados)
 * de cada trecho que continua no formulário, preserva "check-in feito" e
 * "cheguei por outro meio", e só os zera quando o voo muda (remarcação).
 * Ids desconhecidos viram trechos novos.
 */
export function planLegChanges(
  existing: Pick<FlightRow, "id" | "departs_at" | "flight_number" | "origin">[],
  next: FlightInput[],
): LegPlan {
  const byId = new Map(existing.map((f) => [f.id, f]));
  const kept = new Set<string>();
  const plan: LegPlan = { update: [], insert: [], remove: [] };
  for (const { id, ...fields } of next) {
    const old = id ? byId.get(id) : undefined;
    if (!old || kept.has(old.id)) {
      plan.insert.push(fields);
      continue;
    }
    kept.add(old.id);
    const sameTime = Date.parse(old.departs_at) === Date.parse(fields.departs_at);
    const moved =
      !sameTime ||
      (old.flight_number ?? null) !== fields.flight_number ||
      old.origin !== fields.origin;
    plan.update.push({
      id: old.id,
      fields: {
        ...fields,
        ...(moved ? { checkin_done: false } : {}),
        ...(old.origin !== fields.origin ? { ignore_missing_leg: false } : {}),
      },
    });
  }
  plan.remove = existing.filter((f) => !kept.has(f.id)).map((f) => f.id);
  return plan;
}
