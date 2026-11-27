import { randomBytes } from "node:crypto";
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
    // Variáveis do app apontando para o Supabase local; chave mestra gerada na hora.
    // Nenhum valor de produção: os serviços de fora são falsos nos testes.
    env: {
      TZ: "UTC",
      NEXT_PUBLIC_SUPABASE_URL: process.env.API_URL ?? "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.ANON_KEY ?? "",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SERVICE_ROLE_KEY ?? "",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
      BYOK_MASTER_KEY: randomBytes(32).toString("base64"),
      TELEGRAM_BOT_TOKEN: "token-ficticio",
      GOOGLE_OAUTH_CLIENT_ID: "cliente-ficticio.apps.googleusercontent.com",
      GOOGLE_OAUTH_CLIENT_SECRET: "segredo-ficticio",
    },
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
