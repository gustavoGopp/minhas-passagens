export type AuthHash =
  | { type: "error"; message: string }
  | { type: "session"; accessToken: string; refreshToken: string }
  | { type: "none" };

/**
 * Interpreta o fragmento (#...) que o Supabase anexa ao redirecionar.
 * Erros de OAuth e o fluxo implícito chegam no fragmento, que o servidor não vê.
 */
export function parseAuthHash(hash: string): AuthHash {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const error = params.get("error_description") ?? params.get("error");
  if (error) return { type: "error", message: error.replace(/\+/g, " ") };
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) return { type: "session", accessToken, refreshToken };
  return { type: "none" };
}
