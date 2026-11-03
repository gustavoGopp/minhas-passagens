/**
 * Link "Ver onde comprar" (puro e testado). Usa o link que a fonte devolve
 * (Google Flights pela SerpApi, Aviasales pelo Travelpayouts) e, sem ele, monta
 * uma busca do Google Flights com rota e data. Só aceita https em domínios
 * conhecidos: o link vai para e-mail, Telegram e push, então nada de URL arbitrária.
 */

export const MAX_BUY_URL = 1000;

const ALLOWED_HOSTS = [/^(www\.)?google\.com(\.br)?$/, /^(www\.)?aviasales\.[a-z.]+$/];

/** Devolve a URL se for https num domínio permitido; senão, null. */
export function safeBuyUrl(url: string | null | undefined): string | null {
  if (!url || url.length > MAX_BUY_URL) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  if (!ALLOWED_HOSTS.some((re) => re.test(u.hostname))) return null;
  return u.toString();
}

/** Busca do Google Flights só de ida, com rota e data (YYYY-MM-DD). */
export function googleFlightsSearchUrl(q: {
  origin: string;
  destination: string;
  date: string;
}): string {
  const p = new URLSearchParams({
    q: `Voos de ${q.origin} para ${q.destination} em ${q.date} só ida`,
    hl: "pt-BR",
    gl: "BR",
    curr: "BRL",
  });
  return `https://www.google.com/travel/flights?${p}`;
}

/** Link da fonte (se seguro) ou a busca do Google Flights. */
export function buyUrlFor(input: {
  bookingUrl?: string | null;
  origin: string;
  destination: string;
  date: string;
}): string {
  return safeBuyUrl(input.bookingUrl) ?? googleFlightsSearchUrl(input);
}

/** `link` relativo do Travelpayouts (ex.: "/search/SDU0911CGH1?t=…") → URL do Aviasales. */
export function aviasalesUrl(link: unknown): string | null {
  if (typeof link !== "string" || !link.startsWith("/") || link.startsWith("//")) return null;
  return safeBuyUrl(`https://www.aviasales.com${link}`);
}
