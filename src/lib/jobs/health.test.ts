import { describe, expect, it } from "vitest";
import {
  dailyDue,
  intervalElapsed,
  isBackupStale,
  isTickStale,
  latestBackupAt,
  minutesSince,
  retentionCutoffs,
  staleBackupEmail,
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

// Formato da resposta de GET /repos/{dono}/{repo}/actions/artifacts?name=supabase-backup
// (documentação da API do GitHub), reduzido aos campos usados.
const artefatos = (itens: { created_at: string; expired?: boolean; name?: string }[]) => ({
  total_count: itens.length,
  artifacts: itens.map((i) => ({ name: "supabase-backup", expired: false, ...i })),
});

describe("vigia do backup", () => {
  it("acha a cópia mais recente que ainda existe", () => {
    const resposta = artefatos([
      { created_at: "2026-10-18T06:30:00Z" },
      { created_at: "2026-11-01T06:31:00Z" },
      { created_at: "2026-10-25T06:29:00Z" },
    ]);
    expect(latestBackupAt(resposta)).toBe("2026-11-01T06:31:00.000Z");
  });

  it("ignora cópia expirada, artefato de outro nome e resposta sem lista", () => {
    const resposta = artefatos([
      { created_at: "2026-11-01T06:31:00Z", expired: true },
      { created_at: "2026-11-02T06:31:00Z", name: "playwright-report" },
      { created_at: "2026-10-25T06:29:00Z" },
    ]);
    expect(latestBackupAt(resposta)).toBe("2026-10-25T06:29:00.000Z");
    expect(latestBackupAt(artefatos([]))).toBeNull();
    expect(latestBackupAt({ message: "API rate limit exceeded" })).toBeNull();
    expect(latestBackupAt(null)).toBeNull();
  });

  it("considera atrasado sem cópia ou com a última há mais de 8 dias", () => {
    // Hoje simulado: 03/11 ao meio-dia. O backup é semanal (domingo).
    expect(isBackupStale("2026-11-01T06:31:00.000Z", now)).toBe(false); // 2 dias
    expect(isBackupStale("2026-10-26T12:00:00.000Z", now)).toBe(false); // 8 dias exatos
    expect(isBackupStale("2026-10-25T06:29:00.000Z", now)).toBe(true); // 9 dias
    expect(isBackupStale(null, now)).toBe(true);
  });

  it("monta o e-mail de backup atrasado com o que fazer", () => {
    const e = staleBackupEmail("2026-10-20T06:30:00.000Z", now, "dono/repo");
    expect(e.subject).toContain("backup atrasado");
    expect(e.text).toContain("há 14 dias");
    expect(e.text).toContain("https://github.com/dono/repo/actions/workflows/supabase-backup.yml");
    expect(staleBackupEmail(null, now, "dono/repo").text).toContain("Não há nenhuma cópia");
  });
});
