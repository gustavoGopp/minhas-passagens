import { headers } from "next/headers";

type HeaderGetter = { get(name: string): string | null };

/**
 * Origem pública da requisição a partir dos cabeçalhos do proxy (Vercel) ou do Host.
 * Função pura para facilitar testes. Devolve null quando não há host.
 */
export function originFromHeaders(h: HeaderGetter): string | null {
  const host = (h.get("x-forwarded-host") ?? h.get("host"))?.split(",")[0]?.trim();
  if (!host) return null;
  const forwardedProto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    forwardedProto ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Origem usada em links de retorno (OAuth). Prefere a URL real da requisição,
 * então produção, previews e localhost funcionam sem configurar nada.
 */
export async function getRequestOrigin(): Promise<string> {
  const fromRequest = originFromHeaders(await headers());
  if (fromRequest) return fromRequest;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}
