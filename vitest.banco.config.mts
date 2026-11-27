import path from "node:path";
import { defineConfig } from "vitest/config";

// Testes que precisam do Supabase local (`supabase start`): regras de acesso e
// fluxos do servidor. Ficam fora do `npm run verify`, que roda sem Docker; a CI
// os roda no job "banco". Rodam um arquivo por vez porque compartilham o banco.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/banco/**/*.test.ts", "tests/integracao/**/*.test.ts"],
    globalSetup: ["tests/banco/preparar.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: { TZ: "UTC" },
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
