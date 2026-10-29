import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const listMock = vi.fn();
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic {
    static AuthenticationError = actual.default.AuthenticationError;
    static PermissionDeniedError = actual.default.PermissionDeniedError;
    static RateLimitError = actual.default.RateLimitError;
    static APIConnectionError = actual.default.APIConnectionError;
    static APIError = actual.default.APIError;
    static InternalServerError = actual.default.InternalServerError;
    models = { list: listMock };
  }
  return { default: FakeAnthropic };
});

const { validateAnthropicKey } = await import("./anthropic");
const Anthropic = (await import("@anthropic-ai/sdk")).default;

describe("validateAnthropicKey", () => {
  it("retorna ok quando a listagem de modelos responde", async () => {
    listMock.mockResolvedValueOnce({});
    await expect(validateAnthropicKey("sk-ant-x")).resolves.toEqual({ ok: true });
  });

  it("classifica 401 como chave inválida", async () => {
    listMock.mockRejectedValueOnce(
      new Anthropic.AuthenticationError(401, {}, "unauthorized", new Headers()),
    );
    const r = await validateAnthropicKey("sk-ant-x");
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("classifica 429 como rate limit e 500 como indisponível", async () => {
    listMock.mockRejectedValueOnce(
      new Anthropic.RateLimitError(429, {}, "slow down", new Headers()),
    );
    expect(await validateAnthropicKey("k")).toMatchObject({ ok: false, reason: "rate_limited" });
    listMock.mockRejectedValueOnce(
      new Anthropic.InternalServerError(500, {}, "boom", new Headers()),
    );
    expect(await validateAnthropicKey("k")).toMatchObject({ ok: false, reason: "unavailable" });
  });
});
