import type { Instrumentation } from "next";

/**
 * Erro não tratado em página, rota ou ação do servidor vai para o registro de
 * falhas no banco (P23), que aparece no e-mail do vigia diário. A origem leva o
 * tipo e o arquivo da rota (ex.: "requisicao:action:/app/passagens/importar"),
 * nunca o endereço com ids. Só no Node.js: a gravação usa o cliente do servidor.
 */
export const onRequestError: Instrumentation.onRequestError = async (erro, _pedido, contexto) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registrarFalha } = await import("@/lib/falhas");
  await registrarFalha(`requisicao:${contexto.routeType}:${contexto.routePath}`, erro);
};
