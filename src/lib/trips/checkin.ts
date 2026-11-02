/**
 * Janelas de check-in online por companhia (doméstico). Valores públicos das
 * companhias em 2026; podem mudar, por isso ficam numa tabela única.
 */
export interface CheckinRule {
  opensHoursBefore: number;
  closesMinutesBefore: number;
  url: string | null;
}

export const CHECKIN_RULES: Record<string, CheckinRule> = {
  AD: {
    opensHoursBefore: 72,
    closesMinutesBefore: 60,
    url: "https://www.voeazul.com.br/br/pt/home/check-in",
  },
  G3: { opensHoursBefore: 48, closesMinutesBefore: 60, url: "https://www.voegol.com.br/check-in" },
  LA: {
    opensHoursBefore: 48,
    closesMinutesBefore: 60,
    url: "https://www.latamairlines.com/br/pt/check-in",
  },
  OTHER: { opensHoursBefore: 24, closesMinutesBefore: 60, url: null },
};

export function checkinRule(airline: string): CheckinRule {
  return CHECKIN_RULES[airline] ?? CHECKIN_RULES.OTHER;
}

export type CheckinState =
  | { state: "done" }
  | { state: "not_open"; opensAt: string }
  | { state: "open"; closesAt: string; urgent: boolean }
  | { state: "closed" };

/**
 * Estado do check-in de um trecho. "urgent" = falta 24h ou menos para a partida
 * (segundo aviso combinado na entrevista).
 */
export function checkinState(
  f: { airline: string; departs_at: string; checkin_done: boolean },
  nowIso: string,
): CheckinState {
  if (f.checkin_done) return { state: "done" };
  const rule = checkinRule(f.airline);
  const dep = Date.parse(f.departs_at);
  const now = Date.parse(nowIso);
  const opens = dep - rule.opensHoursBefore * 3_600_000;
  const closes = dep - rule.closesMinutesBefore * 60_000;
  if (now < opens) return { state: "not_open", opensAt: new Date(opens).toISOString() };
  if (now >= closes) return { state: "closed" };
  return {
    state: "open",
    closesAt: new Date(closes).toISOString(),
    urgent: dep - now <= 24 * 3_600_000,
  };
}

/** Momentos dos dois avisos de check-in (para o agendador do M5). */
export function checkinReminderTimes(f: { airline: string; departs_at: string }): {
  opensAt: string;
  dayBefore: string;
} {
  const dep = Date.parse(f.departs_at);
  return {
    opensAt: new Date(dep - checkinRule(f.airline).opensHoursBefore * 3_600_000).toISOString(),
    dayBefore: new Date(dep - 24 * 3_600_000).toISOString(),
  };
}
