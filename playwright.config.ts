import { defineConfig, devices } from "@playwright/test";

// Testes de ponta a ponta (P15): o app de verdade (next build + next start) sobre o
// Supabase local, só com pessoas e passagens fictícias. Cada cenário roda em quatro
// combinações (celular e computador, tema claro e escuro), com captura de tela e
// checagem de acessibilidade. Antes: `supabase start`, as variáveis de
// `supabase status -o env` e `npm run build` com o app apontando para o banco local.
//
// Sem nova tentativa automática (retries: 0): teste que falha uma vez é falha.
// O "healer" do Playwright não é usado: teste quebrado é consertado por pessoa ou
// por sessão revisada, nunca sozinho.
const porta = 3000;
const baseURL = `http://127.0.0.1:${porta}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : 3,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "off",
    screenshot: "off",
  },
  projects: [
    { name: "celular-claro", use: { ...devices["Pixel 7"], colorScheme: "light" } },
    { name: "celular-escuro", use: { ...devices["Pixel 7"], colorScheme: "dark" } },
    { name: "desktop-claro", use: { ...devices["Desktop Chrome"], colorScheme: "light" } },
    { name: "desktop-escuro", use: { ...devices["Desktop Chrome"], colorScheme: "dark" } },
  ],
  webServer: {
    command: `npx next start -H 127.0.0.1 -p ${porta}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.API_URL ?? "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.ANON_KEY ?? "",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SERVICE_ROLE_KEY ?? "",
      NEXT_PUBLIC_APP_URL: baseURL,
      BYOK_MASTER_KEY: process.env.BYOK_MASTER_KEY ?? "",
    },
  },
});
