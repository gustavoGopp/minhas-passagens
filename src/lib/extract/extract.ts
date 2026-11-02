import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { serverEnv } from "@/lib/env";
import { extractionSchema, validationProblems, type Extraction } from "./schema";

export type ExtractInput =
  | { kind: "text"; text: string }
  | {
      kind: "image";
      mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
      base64: string;
    }
  | { kind: "pdf"; base64: string };

export type ExtractResult =
  { ok: true; data: Extraction; model: string } | { ok: false; error: string };

const SYSTEM = `Você extrai dados de passagens aéreas de confirmações de compra (e-mails de companhias, agências, programas de milhas, prints e PDFs).
Regras:
- Devolva uma reserva por localizador; cada trecho (voo) separado, inclusive volta e conexões.
- Horários sempre no horário LOCAL do aeroporto, exatamente como aparecem, no formato YYYY-MM-DDTHH:mm. Não converta fusos.
- Aeroportos em código IATA de 3 letras (Santos Dumont = SDU, Congonhas = CGH, Galeão = GIG, Guarulhos = GRU, Viracopos = VCP).
- Companhia: AD (Azul), G3 (Gol), LA (LATAM) ou OTHER.
- channel: airline (comprado no site/app da companhia), agency (123milhas, Zupper, Decolar, MaxMilhas...), miles (emissão com pontos/milhas), corporate (agência corporativa/empresa).
- Valores numéricos sem símbolo (459.90). Se for emissão com milhas, use miles e taxes_amount e deixe total_amount nulo.
- Se o ano não aparecer, deduza pelo contexto (datas futuras próximas). Registre dúvidas em warnings, em português.
- Ignore propaganda e texto sem relação com a viagem.`;

/** Remove marcação de HTML colado para economizar tokens. */
export function cleanText(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, 60_000);
}

function content(input: ExtractInput): Anthropic.ContentBlockParam[] {
  const today = new Date().toISOString().slice(0, 10);
  const instruction = { type: "text" as const, text: `Hoje é ${today}. Extraia as passagens.` };
  switch (input.kind) {
    case "text":
      return [{ type: "text", text: cleanText(input.text) }, instruction];
    case "image":
      return [
        {
          type: "image",
          source: { type: "base64", media_type: input.mediaType, data: input.base64 },
        },
        instruction,
      ];
    case "pdf":
      return [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: input.base64 },
        },
        instruction,
      ];
  }
}

async function run(client: Anthropic, model: string, input: ExtractInput): Promise<Extraction> {
  const response = await client.messages.parse({
    model,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: content(input) }],
    output_config: { format: zodOutputFormat(extractionSchema), effort: "low" },
  });
  if (response.stop_reason === "refusal") throw new Error("O modelo recusou o conteúdo enviado.");
  if (!response.parsed_output) throw new Error("A resposta não veio no formato esperado.");
  return response.parsed_output;
}

/**
 * Extrai com o modelo padrão (barato) e, se a validação falhar, tenta com o
 * modelo de reforço. Usa a chave de API do próprio usuário.
 */
export async function extractBookings(apiKey: string, input: ExtractInput): Promise<ExtractResult> {
  const env = serverEnv();
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 90_000 });
  try {
    const first = await run(client, env.EXTRACTION_MODEL_DEFAULT, input);
    if (validationProblems(first).length === 0)
      return { ok: true, data: first, model: env.EXTRACTION_MODEL_DEFAULT };
    const second = await run(client, env.EXTRACTION_MODEL_RETRY, input);
    return { ok: true, data: second, model: env.EXTRACTION_MODEL_RETRY };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "Sua chave da Anthropic foi recusada. Atualize em Integrações." };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "Limite de uso da API atingido. Tente em instantes." };
    }
    if (error instanceof Anthropic.BadRequestError && /credit|balance/i.test(error.message)) {
      return { ok: false, error: "Sem créditos na sua conta da Anthropic." };
    }
    if (error instanceof Anthropic.APIError) {
      return { ok: false, error: `A API da Anthropic respondeu com erro ${error.status}.` };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Falha na extração." };
  }
}
