import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifra chaves de API de usuários (BYOK) com AES-256-GCM.
 * Formatos armazenados:
 * - "v2.<iv>.<tag>.<ciphertext>" (base64), com AAD: o texto cifrado fica preso
 *   ao contexto (ex.: "<user_id>:<provider>") e não serve se for copiado para outra linha;
 * - "v1.<iv>.<tag>.<ciphertext>", sem AAD (chaves salvas antes; continuam legíveis).
 * A chave mestra vive só em variável de ambiente do servidor.
 */
const IV_BYTES = 12;
const TAG_BYTES = 16;

function loadKey(masterKeyBase64: string): Buffer {
  const key = Buffer.from(masterKeyBase64, "base64");
  if (key.length !== 32) throw new Error("Chave mestra inválida: esperados 32 bytes em base64");
  return key;
}

/** Cifra. Com `aad`, grava no formato v2 (recomendado); sem, no v1. */
export function encryptSecret(plain: string, masterKeyBase64: string, aad?: string): string {
  const key = loadKey(masterKeyBase64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    aad ? "v2" : "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(".");
}

/** Decifra v1 ou v2. No v2, o `aad` precisa ser o mesmo usado ao cifrar. */
export function decryptSecret(payload: string, masterKeyBase64: string, aad?: string): string {
  const key = loadKey(masterKeyBase64);
  const parts = payload.split(".");
  if (parts.length !== 4 || (parts[0] !== "v1" && parts[0] !== "v2"))
    throw new Error("Formato de segredo cifrado desconhecido");
  const [version, ivB64, tagB64, ctB64] = parts;
  const tag = Buffer.from(tagB64, "base64");
  if (tag.length !== TAG_BYTES) throw new Error("Segredo cifrado inválido");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"), {
    authTagLength: TAG_BYTES,
  });
  if (version === "v2") {
    if (!aad) throw new Error("Segredo v2 exige o contexto (AAD)");
    decipher.setAAD(Buffer.from(aad, "utf8"));
  }
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return plain.toString("utf8");
}

/** Contexto AAD padrão das chaves de um usuário. */
export function secretContext(userId: string, provider: string): string {
  return `${userId}:${provider}`;
}

/** Últimos 4 caracteres, para o usuário reconhecer a chave sem expô-la. */
export function keyHint(plain: string): string {
  const trimmed = plain.trim();
  return trimmed.length <= 4 ? "••••" : `••••${trimmed.slice(-4)}`;
}
