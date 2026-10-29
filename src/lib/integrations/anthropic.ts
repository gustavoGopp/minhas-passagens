import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export type KeyValidation =
  | { ok: true }
  | { ok: false; reason: "invalid" | "rate_limited" | "unavailable" | "network"; message: string };

/**
 * Valida uma chave da Anthropic com uma chamada barata e sem custo de tokens
 * (listar modelos). Não lança: devolve um resultado tipado para a UI.
 */
export async function validateAnthropicKey(apiKey: string): Promise<KeyValidation> {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 15_000 });
  try {
    await client.models.list({ limit: 1 });
    return { ok: true };
  } catch (error) {
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError
    ) {
      return { ok: false, reason: "invalid", message: "Chave inválida ou sem permissão." };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return {
        ok: false,
        reason: "rate_limited",
        message: "Limite de requisições atingido. Tente de novo em instantes.",
      };
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return {
        ok: false,
        reason: "network",
        message: "Não foi possível falar com a API da Anthropic.",
      };
    }
    if (error instanceof Anthropic.APIError) {
      return {
        ok: false,
        reason: "unavailable",
        message: `A API respondeu com erro ${error.status}.`,
      };
    }
    throw error;
  }
}
