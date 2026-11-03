/**
 * "Comece por aqui" (pura e testada): os passos que deixam o app útil, marcados
 * sozinhos pelo que já está configurado. O cartão some quando todos estiverem feitos.
 */
export interface OnboardingStep {
  key: string;
  title: string;
  why: string;
  href: string;
  done: boolean;
}

export function onboardingSteps(input: {
  gmailActive: boolean;
  hasAnthropic: boolean;
  emailAlerts: boolean;
  homeCity: boolean;
  monitors: number;
}): OnboardingStep[] {
  return [
    {
      key: "gmail",
      title: "Conectar o Gmail",
      why: "Acha as passagens que já estão no seu e-mail.",
      href: "/app/integracoes",
      done: input.gmailActive,
    },
    {
      key: "anthropic",
      title: "Chave da Anthropic",
      why: "Lê e-mails, textos e prints (centavos por passagem).",
      href: "/app/integracoes",
      done: input.hasAnthropic,
    },
    {
      key: "email",
      title: "Avisos por e-mail",
      why: "Check-in, preço no alvo e feriados chegam no seu e-mail.",
      href: "/app/integracoes",
      done: input.emailAlerts,
    },
    {
      key: "home",
      title: "Cidade onde você mora",
      why: "Avisa quando a volta para casa ainda não foi comprada.",
      href: "/app/perfil",
      done: input.homeCity,
    },
    {
      key: "monitor",
      title: "Monitor da ponte aérea",
      why: "Acompanha o preço das suas janelas de horário.",
      href: "/app/monitor",
      done: input.monitors > 0,
    },
  ];
}
