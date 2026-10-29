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
    help: "Cadastre-se como parceiro e copie o token da API em Perfil.",
    url: "https://www.travelpayouts.com/",
  },
  duffel: {
    name: "Duffel",
    purpose: "Preços reais por voo (opcional; cobra por busca).",
    help: "Exige ativação do modo live com verificação de identidade.",
    url: "https://duffel.com/",
  },
  serpapi: {
    name: "SerpApi (Google Flights)",
    purpose: "Confirmação de preço de alta precisão (250 buscas grátis/mês).",
    help: "Cadastre-se e copie a chave de API.",
    url: "https://serpapi.com/",
  },
};
