"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { validateAnthropicKey } from "@/lib/integrations/anthropic";
import { getProvider } from "@/lib/prices/providers";
import {
  PROVIDERS,
  removeIntegration,
  saveIntegration,
  type Provider,
} from "@/lib/integrations/repo";

export interface IntegrationFormState {
  ok?: boolean;
  error?: string;
  provider?: Provider;
}

const inputSchema = z.object({
  provider: z.enum(PROVIDERS),
  api_key: z.string().trim().min(8, "Chave muito curta").max(500),
});

export async function saveApiKeyAction(
  _prev: IntegrationFormState,
  formData: FormData,
): Promise<IntegrationFormState> {
  const user = await getCurrentUser();
  const parsed = inputSchema.safeParse({
    provider: formData.get("provider"),
    api_key: formData.get("api_key"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const { provider, api_key } = parsed.data;

  if (provider === "anthropic") {
    const result = await validateAnthropicKey(api_key);
    if (!result.ok && result.reason === "invalid") {
      return { provider, error: result.message };
    }
    // Erros transitórios (rede, 429, 5xx): guardamos como "invalid" para
    // revalidar depois, em vez de perder a chave digitada.
    await saveIntegration(user.id, provider, api_key, result.ok);
    revalidatePath("/app/integracoes");
    return result.ok
      ? { ok: true, provider }
      : { provider, error: `${result.message} A chave foi guardada; valide de novo mais tarde.` };
  }

  // Provedores de preço: validação gratuita (não consome busca paga).
  const check = await getProvider(provider).validateKey(api_key);
  if (!check.ok && check.invalid) return { provider, error: check.message };
  await saveIntegration(user.id, provider, api_key, check.ok);
  revalidatePath("/app/integracoes");
  revalidatePath("/app/monitor");
  return check.ok
    ? { ok: true, provider }
    : { provider, error: `${check.message} A chave foi guardada; valide de novo mais tarde.` };
}

export async function removeApiKeyAction(formData: FormData) {
  const user = await getCurrentUser();
  const provider = z.enum(PROVIDERS).parse(formData.get("provider"));
  await removeIntegration(user.id, provider);
  revalidatePath("/app/integracoes");
}
