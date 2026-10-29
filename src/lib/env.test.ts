import { describe, expect, it } from "vitest";
import { parsePublicEnv, parseServerEnv } from "./env";

const key32 = Buffer.alloc(32, 7).toString("base64");

describe("env", () => {
  it("aceita variáveis públicas válidas sem URL do app", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_x",
    });
    expect(env.NEXT_PUBLIC_APP_URL).toBeUndefined();
  });

  it("falha com mensagem que cita a variável ausente", () => {
    expect(() => parsePublicEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("exige chave mestra de exatamente 32 bytes", () => {
    expect(() =>
      parseServerEnv({ SUPABASE_SERVICE_ROLE_KEY: "x", BYOK_MASTER_KEY: "curta" }),
    ).toThrow(/32 bytes/);
    const env = parseServerEnv({ SUPABASE_SERVICE_ROLE_KEY: "x", BYOK_MASTER_KEY: key32 });
    expect(env.EXTRACTION_MODEL_DEFAULT).toBe("claude-haiku-5-5");
  });
});
