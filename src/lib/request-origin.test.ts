import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const { originFromHeaders } = await import("./request-origin");

describe("originFromHeaders", () => {
  it("usa os cabeçalhos encaminhados pela Vercel", () => {
    const h = new Headers({
      host: "interno:3000",
      "x-forwarded-host": "minhas-passagens.vercel.app",
      "x-forwarded-proto": "https",
    });
    expect(originFromHeaders(h)).toBe("https://minhas-passagens.vercel.app");
  });

  it("usa http para localhost sem proxy", () => {
    expect(originFromHeaders(new Headers({ host: "localhost:3000" }))).toBe(
      "http://localhost:3000",
    );
  });

  it("assume https para outros hosts sem proto", () => {
    expect(originFromHeaders(new Headers({ host: "app.exemplo.com.br" }))).toBe(
      "https://app.exemplo.com.br",
    );
  });

  it("pega o primeiro valor quando há lista", () => {
    const h = new Headers({
      "x-forwarded-host": "a.vercel.app, b",
      "x-forwarded-proto": "https, http",
    });
    expect(originFromHeaders(h)).toBe("https://a.vercel.app");
  });

  it("devolve null sem host", () => {
    expect(originFromHeaders(new Headers())).toBeNull();
  });
});
