import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, keyHint } from "./byok";

const master = Buffer.alloc(32, 1).toString("base64");
const other = Buffer.alloc(32, 2).toString("base64");

describe("byok", () => {
  it("cifra e decifra ida e volta, com IV aleatório", () => {
    const a = encryptSecret("sk-ant-api03-abc", master);
    const b = encryptSecret("sk-ant-api03-abc", master);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(decryptSecret(a, master)).toBe("sk-ant-api03-abc");
  });

  it("detecta adulteração do texto cifrado", () => {
    const payload = encryptSecret("segredo", master);
    const parts = payload.split(".");
    const ct = Buffer.from(parts[3], "base64");
    ct[0] ^= 0xff;
    parts[3] = ct.toString("base64");
    expect(() => decryptSecret(parts.join("."), master)).toThrow();
  });

  it("falha com chave mestra errada ou de tamanho inválido", () => {
    const payload = encryptSecret("segredo", master);
    expect(() => decryptSecret(payload, other)).toThrow();
    expect(() => encryptSecret("x", "curta")).toThrow(/32 bytes/);
  });

  it("rejeita formato desconhecido", () => {
    expect(() => decryptSecret("v0.a.b.c", master)).toThrow(/Formato/);
  });

  it("gera dica com os 4 últimos caracteres", () => {
    expect(keyHint("sk-ant-api03-wxyz")).toBe("••••wxyz");
    expect(keyHint("ab")).toBe("••••");
  });
});
