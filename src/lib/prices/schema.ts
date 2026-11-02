import { z } from "zod";
import { FREQUENCIES, MONITOR_KINDS, PRICE_PROVIDERS } from "./types";

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido (HH:MM)");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const iata = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use o código IATA de 3 letras");

const windowOk = (w: { from: string; to: string }) => w.from <= w.to;
const windowMsg = { message: "A janela precisa começar antes de terminar" };

export const ruleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("weekly"),
    slots: z
      .array(
        z
          .object({ weekday: z.number().int().min(0).max(6), from: hm, to: hm })
          .refine(windowOk, windowMsg),
      )
      .min(1, "Inclua pelo menos um dia")
      .max(14),
  }),
  z.object({
    kind: z.literal("dates"),
    ranges: z
      .array(
        z
          .object({ start: date, end: date, from: hm, to: hm })
          .refine(windowOk, windowMsg)
          .refine((r) => r.start <= r.end, {
            message: "A data final precisa ser depois da inicial",
          }),
      )
      .min(1, "Inclua pelo menos uma data")
      .max(20),
  }),
  z.object({
    kind: z.literal("holiday"),
    leg: z.enum(["outbound", "return"]),
    window: z.object({ from: hm, to: hm }).refine(windowOk, windowMsg),
  }),
]);

export const monitorInputSchema = z
  .object({
    name: z.string().trim().max(80),
    kind: z.enum(MONITOR_KINDS),
    origin: iata,
    destination: iata,
    rule: ruleSchema,
    horizon_weeks: z.coerce.number().int().min(1).max(52),
    target_cents: z.number().int().positive("Informe o preço-alvo"),
    margin_cents: z.number().int().min(0).nullable(),
    margin_pct: z.number().min(0).max(100).nullable(),
    airlines: z.array(z.string().regex(/^[A-Z0-9]{2}$/)).max(10),
    allow_connections: z.boolean(),
    max_duration_min: z.number().int().min(30).max(2880).nullable(),
    frequency: z.enum(FREQUENCIES),
    provider: z.enum(PRICE_PROVIDERS),
    active: z.boolean(),
  })
  .refine((m) => m.origin !== m.destination, {
    message: "Origem e destino iguais",
    path: ["destination"],
  })
  .refine((m) => m.rule.kind === m.kind, {
    message: "Regra não combina com o tipo",
    path: ["rule"],
  });

export type MonitorInput = z.infer<typeof monitorInputSchema>;
