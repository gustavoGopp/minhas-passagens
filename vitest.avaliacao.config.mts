import { defineConfig } from "vitest/config";
import path from "node:path";

// Rodada de verdade da avaliação da extração (P24): chama a API da Anthropic com
// a chave da avaliação. Só o workflow avaliacao-extracao.yml roda isto; o
// `npm test` comum nunca inclui este arquivo.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/extract/avaliacao/rodar.avaliacao.ts"],
    env: { TZ: "UTC" },
    testTimeout: 25 * 60_000,
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
