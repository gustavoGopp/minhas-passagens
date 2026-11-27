import { z } from "zod";
import { airportTimeZone, isKnownAirport } from "@/lib/airports";
import { currencyCode } from "@/lib/trips/money";
import { isRealDate, localDateTimeProblem, localToUtc } from "@/lib/trips/time";

/** Formato que a IA devolve. Horários são locais do aeroporto, sem fuso. */
export const extractedFlightSchema = z.object({
  airline_code: z
    .enum(["AD", "G3", "LA", "OTHER"])
    .describe("AD=Azul, G3=Gol, LA=LATAM, OTHER=outra"),
  flight_number: z.string().nullable().describe("Ex.: 'AD 4512' ou 'G3 1023'"),
  origin_iata: z.string().describe("Código IATA de 3 letras do aeroporto de partida, ex.: SDU"),
  destination_iata: z
    .string()
    .describe("Código IATA de 3 letras do aeroporto de chegada, ex.: CGH"),
  departure_local: z.string().describe("Data e hora local de partida no formato YYYY-MM-DDTHH:mm"),
  arrival_local: z
    .string()
    .nullable()
    .describe("Data e hora local de chegada no formato YYYY-MM-DDTHH:mm"),
  passenger: z.string().nullable(),
});

export const extractedBookingSchema = z.object({
  locator: z
    .string()
    .nullable()
    .describe(
      "Código de reserva da companhia aérea (PNR); nulo se só houver número de pedido da agência",
    ),
  airline_code: z.enum(["AD", "G3", "LA", "OTHER"]),
  seller: z
    .string()
    .nullable()
    .describe("Quem vendeu: site da companhia, 123milhas, Zupper, Decolar, Smiles..."),
  channel: z.enum(["airline", "agency", "miles", "corporate"]),
  total_amount: z.number().nullable().describe("Valor total pago em dinheiro, sem milhas"),
  currency: z.string().nullable().describe("Código ISO da moeda, ex.: BRL"),
  miles: z.number().nullable().describe("Milhas/pontos usados, se houver"),
  taxes_amount: z.number().nullable().describe("Taxas pagas em dinheiro numa emissão com milhas"),
  purchased_on: z.string().nullable().describe("Data da compra YYYY-MM-DD, se aparecer"),
  status: z
    .enum(["active", "cancelled"])
    .describe("cancelled se o texto informa que a reserva foi cancelada; senão active"),
  flights: z.array(extractedFlightSchema),
});

export const extractionSchema = z.object({
  bookings: z.array(extractedBookingSchema),
  warnings: z.array(z.string()).describe("Dúvidas ou campos que não foram encontrados"),
});

export type Extraction = z.infer<typeof extractionSchema>;
export type ExtractedBooking = z.infer<typeof extractedBookingSchema>;

const IATA = /^[A-Z]{3}$/;

/**
 * Problemas que justificam tentar de novo com um modelo mais forte: formato,
 * datas e horas que não existem, trecho incoerente e valores negativos.
 */
export function validationProblems(x: Extraction): string[] {
  const problems: string[] = [];
  if (x.bookings.length === 0) problems.push("nenhuma reserva encontrada");
  for (const b of x.bookings) {
    if (b.flights.length === 0) problems.push("reserva sem trechos");
    const departures: string[] = [];
    for (const f of b.flights) {
      const airportsOk = IATA.test(f.origin_iata) && IATA.test(f.destination_iata);
      if (!airportsOk) problems.push("aeroporto inválido");
      else if (f.origin_iata === f.destination_iata) problems.push("origem igual ao destino");
      const departureOk = localDateTimeProblem(f.departure_local) === null;
      if (!departureOk) problems.push("data de partida inválida");
      else departures.push(f.departure_local.slice(0, 10));
      const arrivalOk = !f.arrival_local || localDateTimeProblem(f.arrival_local) === null;
      if (!arrivalOk) problems.push("data de chegada inválida");
      // Só compara partida e chegada quando sabe o fuso dos dois aeroportos.
      const from = airportsOk ? airportTimeZone(f.origin_iata) : undefined;
      const to = airportsOk ? airportTimeZone(f.destination_iata) : undefined;
      if (from && to && departureOk && arrivalOk && f.arrival_local) {
        const departs = Date.parse(localToUtc(f.departure_local, from));
        const arrives = Date.parse(localToUtc(f.arrival_local, to));
        if (arrives <= departs) problems.push("chegada antes da partida");
      }
    }
    if (b.purchased_on && !isRealDate(b.purchased_on)) problems.push("data da compra inválida");
    else if (b.purchased_on && departures.length && b.purchased_on > departures.sort()[0])
      problems.push("compra depois do voo");
    if ((b.total_amount ?? 0) < 0 || (b.taxes_amount ?? 0) < 0 || (b.miles ?? 0) < 0)
      problems.push("valor negativo");
    if (currencyCode(b.currency) === "") problems.push("moeda não reconhecida");
  }
  return problems;
}

const semEspacos = (s: string) => s.replace(/\s+/g, "").toUpperCase();

/**
 * Coerência com o texto de origem (P25): a saída estruturada garante o formato,
 * não a verdade. Localizador ou número de voo que não aparecem no texto foram
 * inventados ou vieram de texto injetado: são `problemas` e levam ao reforço.
 * Aeroporto fora das listas do app vira `aviso` para o dono conferir (o reforço
 * não ajudaria). Sem texto (print, PDF), só os avisos.
 */
export function coerencia(
  x: Extraction,
  texto: string | undefined,
): { problemas: string[]; avisos: string[] } {
  const problemas = new Set<string>();
  const avisos = new Set<string>();
  const base = texto ? semEspacos(texto) : null;
  for (const b of x.bookings) {
    if (base && b.locator && semEspacos(b.locator) && !base.includes(semEspacos(b.locator)))
      problemas.add("localizador não aparece no texto");
    for (const f of b.flights) {
      const numero = /\d{1,5}/.exec(f.flight_number ?? "")?.[0];
      if (texto && numero && !new RegExp(`(?<!\\d)0*${Number(numero)}(?!\\d)`).test(texto))
        problemas.add("número do voo não aparece no texto");
      for (const iata of [f.origin_iata, f.destination_iata])
        if (IATA.test(iata) && !isKnownAirport(iata))
          avisos.add(
            `Conferir: aeroporto ${iata} fora das listas do app (horário tratado como de Brasília).`,
          );
    }
  }
  return { problemas: [...problemas], avisos: [...avisos] };
}
