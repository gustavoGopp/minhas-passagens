import { describe, expect, it } from "vitest";
import { onboardingSteps } from "./onboarding";

describe("Comece por aqui", () => {
  it("conta novo: nada feito, cada passo leva à tela certa", () => {
    const s = onboardingSteps({
      gmailActive: false,
      hasAnthropic: false,
      emailAlerts: false,
      homeCity: false,
      monitors: 0,
    });
    expect(s.every((x) => !x.done)).toBe(true);
    expect(s.map((x) => x.href)).toEqual([
      "/app/integracoes",
      "/app/integracoes",
      "/app/integracoes",
      "/app/perfil",
      "/app/monitor",
    ]);
  });
  it("tudo configurado: todos feitos", () => {
    const s = onboardingSteps({
      gmailActive: true,
      hasAnthropic: true,
      emailAlerts: true,
      homeCity: true,
      monitors: 2,
    });
    expect(s.every((x) => x.done)).toBe(true);
  });
});
