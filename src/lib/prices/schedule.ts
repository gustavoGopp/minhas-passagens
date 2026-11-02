import { addDays } from "@/lib/holidays/dates";
import { localToUtc, utcToLocal } from "@/lib/trips/time";
import type { Frequency, PriceProviderId } from "./types";

/** Horários locais de checagem, sempre fora da janela silenciosa padrão (23h–7h). */
const SLOTS: Record<Frequency, { times: string[]; weekday?: number }> = {
  daily: { times: ["07:00"] },
  twice_daily: { times: ["07:00", "19:00"] },
  weekly: { times: ["07:00"], weekday: 1 },
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: "Diário (7h)",
  twice_daily: "2× ao dia (7h e 19h)",
  weekly: "Semanal (segunda, 7h)",
};

/** Desvio estável de 0 a 24 min por monitor, para espalhar as checagens em lotes. */
export function spreadMinutes(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 25;
}

/** Próximo horário de checagem estritamente depois de `afterIso`, no fuso do usuário. */
export function nextCheckAt(
  frequency: Frequency,
  afterIso: string,
  timeZone: string,
  monitorId = "",
): string {
  const slot = SLOTS[frequency];
  const after = Date.parse(afterIso);
  const startDate = utcToLocal(afterIso, timeZone).slice(0, 10);
  const extra = spreadMinutes(monitorId);
  for (let i = 0; i <= 8; i++) {
    const date = addDays(startDate, i);
    if (slot.weekday != null && new Date(`${date}T12:00:00Z`).getUTCDay() !== slot.weekday)
      continue;
    for (const t of slot.times) {
      const iso = localToUtc(`${date}T${t}`, timeZone);
      const ms = Date.parse(iso) + extra * 60_000;
      if (ms > after) return new Date(ms).toISOString();
    }
  }
  throw new Error("Sem horário de checagem nos próximos 8 dias");
}

export const CHECKS_PER_MONTH: Record<Frequency, number> = {
  daily: 30,
  twice_daily: 60,
  weekly: 4.3,
};

/** Limites e custos de cada provedor, para mostrar a cota consumida. */
export const PROVIDER_QUOTA: Record<
  PriceProviderId,
  { freePerMonth: number | null; usdPerRequest: number | null; note: string }
> = {
  travelpayouts: {
    freePerMonth: null,
    usdPerRequest: null,
    note: "Grátis (limite de 600 req/min)",
  },
  serpapi: { freePerMonth: 250, usdPerRequest: 0.025, note: "250 buscas grátis por mês" },
  duffel: { freePerMonth: null, usdPerRequest: 0.005, note: "US$ 0,005 por busca sem reserva" },
};

export interface QuotaEstimate {
  perCheck: number;
  perMonth: number;
  /** Parte da cota grátis mensal (0–1+), quando o provedor tem cota. */
  shareOfFree: number | null;
  /** Custo estimado em US$ por mês, quando o provedor cobra. */
  usdPerMonth: number | null;
}

/** Uma requisição por data-alvo em todos os provedores. */
export function estimateQuota(
  targetCount: number,
  frequency: Frequency,
  provider: PriceProviderId,
): QuotaEstimate {
  const perMonth = Math.round(targetCount * CHECKS_PER_MONTH[frequency]);
  const q = PROVIDER_QUOTA[provider];
  const billable = q.freePerMonth != null ? Math.max(0, perMonth - q.freePerMonth) : perMonth;
  return {
    perCheck: targetCount,
    perMonth,
    shareOfFree: q.freePerMonth ? perMonth / q.freePerMonth : null,
    usdPerMonth:
      q.usdPerRequest != null ? Math.round(billable * q.usdPerRequest * 100) / 100 : null,
  };
}
