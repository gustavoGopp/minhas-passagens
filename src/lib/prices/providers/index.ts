import type { PriceProviderId } from "../types";
import { duffel } from "./duffel";
import { serpapi } from "./serpapi";
import { travelpayouts } from "./travelpayouts";
import type { PriceProvider } from "./types";

export type { PriceProvider, PriceSearch, SearchResult, FetchLike, KeyCheck } from "./types";
export { ProviderAuthError } from "./types";

/** Adaptador plugável: Travelpayouts é o padrão; Duffel e SerpApi são opcionais (BYOK). */
export function getProvider(id: PriceProviderId): PriceProvider {
  switch (id) {
    case "duffel":
      return duffel();
    case "serpapi":
      return serpapi();
    default:
      return travelpayouts();
  }
}

export { duffel, serpapi, travelpayouts };
