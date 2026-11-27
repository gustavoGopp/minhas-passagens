import { afterEach, describe, expect, it, vi } from "vitest";

const { registrarFalha } = vi.hoisted(() => ({ registrarFalha: vi.fn(async () => undefined) }));
vi.mock("@/lib/falhas", () => ({ registrarFalha }));

const { onRequestError } = await import("./instrumentation");

const pedido = { path: "/app/passagens/123", method: "POST", headers: {} };
const contexto = {
  routerKind: "App Router",
  routePath: "/app/passagens/[id]",
  routeType: "action",
  renderSource: "react-server-components",
  revalidateReason: undefined,
} as const;

afterEach(() => {
  vi.unstubAllEnvs();
  registrarFalha.mockClear();
});

describe("erro não tratado do servidor", () => {
  it("vai para o registro de falhas com o tipo e o arquivo da rota, sem o endereço com ids", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const erro = new Error("quebrou");
    await onRequestError(erro, pedido, contexto as never);
    expect(registrarFalha).toHaveBeenCalledWith("requisicao:action:/app/passagens/[id]", erro);
  });

  it("fora do Node.js (edge), não tenta gravar", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await onRequestError(new Error("x"), pedido, contexto as never);
    expect(registrarFalha).not.toHaveBeenCalled();
  });
});
