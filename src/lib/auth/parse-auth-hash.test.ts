import { describe, expect, it } from "vitest";
import { friendlyAuthError, parseAuthHash } from "./parse-auth-hash";

describe("parseAuthHash", () => {
  it("extrai a descrição do erro", () => {
    expect(
      parseAuthHash(
        "#error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user",
      ),
    ).toEqual({ type: "error", message: "Database error saving new user" });
  });

  it("usa o código quando não há descrição", () => {
    expect(parseAuthHash("#error=access_denied")).toEqual({
      type: "error",
      message: "access_denied",
    });
  });

  it("reconhece tokens do fluxo implícito", () => {
    expect(parseAuthHash("#access_token=a&refresh_token=b&token_type=bearer")).toEqual({
      type: "session",
      accessToken: "a",
      refreshToken: "b",
    });
  });

  it("devolve none para fragmento vazio", () => {
    expect(parseAuthHash("")).toEqual({ type: "none" });
    expect(parseAuthHash("#")).toEqual({ type: "none" });
  });

  it("decodifica mensagens duplamente codificadas", () => {
    expect(
      parseAuthHash("#error_description=Unable+to+exchange+external+code%253A+4%252F0A"),
    ).toEqual({
      type: "error",
      message: "Unable to exchange external code: 4/0A",
    });
  });

  it("traduz erros conhecidos", () => {
    expect(friendlyAuthError("Unable to exchange external code: 4/0A")).toMatch(/Client Secret/);
    expect(friendlyAuthError("outra coisa")).toBe("outra coisa");
  });
});

describe("friendlyAuthError", () => {
  it("explica o cadastro fechado (conta Google nova)", () => {
    const msg = parseAuthHash(
      "#error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance",
    );
    expect(msg.type).toBe("error");
    expect(friendlyAuthError(msg.type === "error" ? msg.message : "")).toMatch(/^Cadastro fechado/);
  });
});
