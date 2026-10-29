import { describe, expect, it } from "vitest";
import { parseAuthHash } from "./parse-auth-hash";

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
});
