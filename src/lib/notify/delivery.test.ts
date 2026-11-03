import { describe, expect, it } from "vitest";
import {
  availableChannels,
  MAX_ATTEMPTS,
  outcomeOf,
  retryDecision,
  retryDelayMinutes,
} from "./delivery";

describe("outcomeOf", () => {
  it("enviado quando algum canal funcionou", () => {
    expect(
      outcomeOf({ ok: ["email"], attempted: ["push", "email"], errors: ["push: falhou"] }),
    ).toEqual({
      kind: "sent",
      channels: ["email"],
    });
  });

  it("sem canal configurado não conta como envio nem como falha", () => {
    expect(outcomeOf({ ok: [], attempted: [], errors: [] })).toEqual({ kind: "no_channel" });
  });

  it("falha quando todos os canais tentados falharam", () => {
    expect(outcomeOf({ ok: [], attempted: ["email"], errors: ["email: unavailable"] })).toEqual({
      kind: "failed",
      error: "email: unavailable",
    });
  });
});

describe("retryDecision", () => {
  const now = "2026-11-05T12:00:00.000Z";
  const minutesAgo = (m: number) => new Date(Date.parse(now) - m * 60_000).toISOString();

  it("primeira vez tenta; já enviado não repete", () => {
    expect(retryDecision(undefined, now)).toBe("attempt");
    expect(
      retryDecision({ status: "sent", attempts: 1, last_attempt_at: minutesAgo(1) }, now),
    ).toBe("done");
  });

  it("espera cresce: 5, 10, 20… minutos", () => {
    expect(retryDelayMinutes(1)).toBe(5);
    expect(retryDelayMinutes(2)).toBe(10);
    expect(retryDelayMinutes(3)).toBe(20);
    const failed = (attempts: number, ago: number) =>
      retryDecision({ status: "failed", attempts, last_attempt_at: minutesAgo(ago) }, now);
    expect(failed(1, 4)).toBe("wait");
    expect(failed(1, 5)).toBe("attempt");
    expect(failed(3, 19)).toBe("wait");
    expect(failed(3, 20)).toBe("attempt");
  });

  it("desiste depois do máximo de tentativas", () => {
    expect(
      retryDecision(
        { status: "failed", attempts: MAX_ATTEMPTS, last_attempt_at: minutesAgo(999) },
        now,
      ),
    ).toBe("gave_up");
  });
});

describe("availableChannels", () => {
  const base = {
    notifyTelegram: false,
    telegramChatId: null,
    telegramToken: null,
    notifyPush: false,
    pushSubs: 0,
    vapid: true,
    notifyEmail: false,
    email: "a@b.c",
    emailKey: true,
  };

  it("preferência ligada sem canal de fato não conta (push sem assinatura, Telegram sem chat)", () => {
    expect(availableChannels({ ...base, notifyPush: true, notifyTelegram: true })).toEqual([]);
  });

  it("e-mail precisa de chave do Resend", () => {
    expect(availableChannels({ ...base, notifyEmail: true })).toEqual(["email"]);
    expect(availableChannels({ ...base, notifyEmail: true, emailKey: false })).toEqual([]);
  });

  it("todos os canais configurados", () => {
    expect(
      availableChannels({
        ...base,
        notifyTelegram: true,
        telegramChatId: 1,
        telegramToken: "t",
        notifyPush: true,
        pushSubs: 2,
        notifyEmail: true,
      }),
    ).toEqual(["telegram", "push", "email"]);
  });
});
