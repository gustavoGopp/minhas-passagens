import type { Provider } from "@/lib/integrations/repo";

/** Textos de apoio por provedor, exibidos na tela de Integrações. */
export const PROVIDER_INFO: Record<
  Provider,
  { name: string; purpose: string; help: string; url: string }
> = {
  anthropic: {
    name: "Anthropic (Claude)",
    purpose: "Extrai passagens de e-mails, textos e prints.",
    help: "Crie uma conta individual, compre créditos pré-pagos (a partir de ~US$ 5, duram anos neste uso) e gere uma chave de API.",
    url: "https://platform.claude.com/",
  },
  travelpayouts: {
    name: "Travelpayouts (Aviasales)",
    purpose: "Fonte gratuita de preços para o monitor.",
    help: "Crie uma conta gratuita de parceiro, abra Perfil (ou Ferramentas → API) e copie o token da API. Sem custo.",
    url: "https://www.travelpayouts.com/",
  },
  resend: {
    name: "E-mail (Resend)",
    purpose: "Envia os avisos para o seu Gmail. Grátis até 3.000 e-mails por mês.",
    help: "Entre com o Google usando o mesmo Gmail do app, clique em Create API Key (permissão Sending access), copie e cole aqui. Ao salvar, mandamos um e-mail de teste e ligamos o canal de e-mail.",
    url: "https://resend.com/api-keys",
  },
  duffel: {
    name: "Duffel",
    purpose: "Preços reais por voo (opcional; cobra por busca).",
    help: "Exige ativação do modo live com verificação de identidade.",
    url: "https://duffel.com/",
  },
  serpapi: {
    name: "SerpApi (Google Flights)",
    purpose:
      "Preços do Google Flights nas próximas 2 semanas, ao lado do Travelpayouts (piloto). Plano grátis: 250 buscas/mês; o app para em 240.",
    help: "Crie uma conta grátis (sem cartão), abra Dashboard → Your Private API Key, copie e cole aqui. Validar a chave não gasta busca.",
    url: "https://serpapi.com/",
  },
};
