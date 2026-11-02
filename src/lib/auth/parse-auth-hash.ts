export type AuthHash =
  | { type: "error"; message: string }
  | { type: "session"; accessToken: string; refreshToken: string }
  | { type: "none" };

/** Decodifica "+" e sequências %XX que às vezes chegam duplamente codificadas. */
function decode(text: string): string {
  let out = text.replace(/\+/g, " ");
  for (let i = 0; i < 2 && /%[0-9A-Fa-f]{2}/.test(out); i++) {
    try {
      out = decodeURIComponent(out);
    } catch {
      break;
    }
  }
  return out;
}

/** Traduz erros conhecidos do Supabase Auth para algo acionável. */
export function friendlyAuthError(message: string): string {
  if (/unable to exchange external code/i.test(message)) {
    return "O Supabase não conseguiu validar o login com o Google. Confira se o Client ID e o Client Secret do Google cadastrados no Supabase são do mesmo cliente OAuth.";
  }
  if (/database error saving new user/i.test(message)) {
    return "O banco recusou a criação do usuário. As migrações do Supabase precisam ser aplicadas.";
  }
  return message;
}

/**
 * Interpreta o fragmento (#...) que o Supabase anexa ao redirecionar.
 * Erros de OAuth e o fluxo implícito chegam no fragmento, que o servidor não vê.
 */
export function parseAuthHash(hash: string): AuthHash {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const error = params.get("error_description") ?? params.get("error");
  if (error) return { type: "error", message: decode(error) };
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) return { type: "session", accessToken, refreshToken };
  return { type: "none" };
}
