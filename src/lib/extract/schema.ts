import { z } from "zod";

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
  locator: z.string().nullable().describe("Localizador/código da reserva (PNR)"),
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
  flights: z.array(extractedFlightSchema),
});

export const extractionSchema = z.object({
  bookings: z.array(extractedBookingSchema),
  warnings: z.array(z.string()).describe("Dúvidas ou campos que não foram encontrados"),
});

export type Extraction = z.infer<typeof extractionSchema>;
export type ExtractedBooking = z.infer<typeof extractedBookingSchema>;

const IATA = /^[A-Z]{3}$/;
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Problemas que justificam tentar de novo com um modelo mais forte. */
export function validationProblems(x: Extraction): string[] {
  const problems: string[] = [];
  if (x.bookings.length === 0) problems.push("nenhuma reserva encontrada");
  for (const b of x.bookings) {
    if (b.flights.length === 0) problems.push("reserva sem trechos");
    for (const f of b.flights) {
      if (!IATA.test(f.origin_iata) || !IATA.test(f.destination_iata))
        problems.push("aeroporto inválido");
      if (!LOCAL.test(f.departure_local)) problems.push("data de partida inválida");
      if (f.arrival_local && !LOCAL.test(f.arrival_local))
        problems.push("data de chegada inválida");
    }
  }
  return problems;
}
