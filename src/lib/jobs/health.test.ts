import { describe, expect, it } from "vitest";
import {
  dailyDue,
  intervalElapsed,
  isTickStale,
  minutesSince,
  retentionCutoffs,
  staleTickEmail,
} from "./health";

const now = "2026-11-03T12:00:00.000Z";

describe("saúde do agendador", () => {
  it("considera parado sem tick ou com tick há mais de 30 min", () => {
    expect(isTickStale(null, now)).toBe(true);
    expect(isTickStale("lixo", now)).toBe(true);
    expect(isTickStale("2026-11-03T11:35:00Z", now)).toBe(false);
    expect(isTickStale("2026-11-03T11:30:00Z", now)).toBe(false);
    expect(isTickStale("2026-11-03T11:29:00Z", now)).toBe(true);
  });

  it("limita alertas e reconciliações por intervalo", () => {
    expect(intervalElapsed(null, now, 60)).toBe(true);
    expect(intervalElapsed("2026-11-03T11:30:00Z", now, 60)).toBe(false);
    expect(intervalElapsed("2026-11-02T15:00:00Z", now, 20 * 60)).toBe(true);
    expect(minutesSince("2026-11-03T10:00:00Z", now)).toBe(120);
  });

  it("roda a tarefa diária uma vez por dia (UTC)", () => {
    expect(dailyDue(null, now)).toBe(true);
    expect(dailyDue("2026-11-02", now)).toBe(true);
    expect(dailyDue("2026-11-03", now)).toBe(false);
  });

  it("corta observações com mais de 180 dias e checagens com mais de 365", () => {
    expect(retentionCutoffs(now)).toEqual({
      price_observations: "2026-05-07T12:00:00.000Z",
      price_checks: "2025-11-03T12:00:00.000Z",
    });
  });

  it("monta o e-mail de alerta", () => {
    const e = staleTickEmail("2026-11-03T07:00:00Z", now, "https://app.exemplo");
    expect(e.subject).toContain("agendador parado");
    expect(e.text).toContain("há 5 horas");
    expect(e.text).toContain("https://app.exemplo/app/notificacoes");
    expect(staleTickEmail(null, now, "").text).toContain("nunca registrou");
  });
});
