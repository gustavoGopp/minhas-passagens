import { describe, expect, it } from "vitest";
import { sendEmailDetailed } from "./email";

const reply = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), { status });

describe("e-mail pelo Resend", () => {
  it("usa a chave do usuário e confirma o envio", async () => {
    let auth = "";
    const r = await sendEmailDetailed("a@b.com", "t", "x", "re_123", async (_u, init) => {
      auth = (init?.headers as Record<string, string>).authorization;
      return new Response("{}", { status: 200 });
    });
    expect(r).toEqual({ ok: true });
    expect(auth).toBe("Bearer re_123");
  });

  it("explica quando a conta do Resend é de outro e-mail", async () => {
    const r = await sendEmailDetailed(
      "a@b.com",
      "t",
      "x",
      "re_1",
      reply(403, { message: "You can only send testing emails to your own email address" }),
    );
    expect(r).toMatchObject({ ok: false, reason: "own_email_only" });
  });

  it("chave inválida e sem chave", async () => {
    expect(
      await sendEmailDetailed(
        "a@b.com",
        "t",
        "x",
        "re_1",
        reply(401, { message: "API key is invalid" }),
      ),
    ).toMatchObject({ ok: false, reason: "invalid" });
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    expect(await sendEmailDetailed("a@b.com", "t", "x", null)).toMatchObject({
      reason: "unavailable",
    });
    if (prev) process.env.RESEND_API_KEY = prev;
  });
});
