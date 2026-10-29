import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifra chaves de API de usuários (BYOK) com AES-256-GCM.
 * Formato armazenado: "v1.<iv base64>.<tag base64>.<ciphertext base64>".
 * A chave mestra vive só em variável de ambiente do servidor.
 */
const VERSION = "v1";
const IV_BYTES = 12;

function loadKey(masterKeyBase64: string): Buffer {
  const key = Buffer.from(masterKeyBase64, "base64");
  if (key.length !== 32) throw new Error("Chave mestra inválida: esperados 32 bytes em base64");
  return key;
}

export function encryptSecret(plain: string, masterKeyBase64: string): string {
  const key = loadKey(masterKeyBase64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
}

export function decryptSecret(payload: string, masterKeyBase64: string): string {
  const key = loadKey(masterKeyBase64);
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION)
    throw new Error("Formato de segredo cifrado desconhecido");
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return plain.toString("utf8");
}

/** Últimos 4 caracteres, para o usuário reconhecer a chave sem expô-la. */
export function keyHint(plain: string): string {
  const trimmed = plain.trim();
  return trimmed.length <= 4 ? "••••" : `••••${trimmed.slice(-4)}`;
}
