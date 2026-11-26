import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { emptyDraft, emptyLeg } from "@/lib/trips/draft";

// O formulário é um componente de navegador; aqui só conferimos o que ele
// desenha a partir do rascunho (aviso de aeroporto e moeda), sem servidor.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("./actions", () => ({ saveBookingAction: async () => ({}) }));
const { BookingForm } = await import("./booking-form");

const rascunho = (destination: string, currency = "BRL") => ({
  ...emptyDraft(),
  currency,
  legs: [{ ...emptyLeg("LA"), origin: "GRU", destination }],
});

describe("formulário de passagem", () => {
  it("aeroporto conhecido: não mostra aviso", () => {
    const html = renderToString(<BookingForm initial={rascunho("LIS")} />);
    expect(html).not.toContain("Conferi os horários");
  });

  it("aeroporto fora das listas: mostra o aviso e a caixa 'Conferi os horários'", () => {
    const html = renderToString(<BookingForm initial={rascunho("KEF")} />);
    expect(html).toContain("Não conheço o aeroporto");
    expect(html).toContain("KEF");
    expect(html).toContain("Conferi os horários");
  });

  it("valor em outra moeda: avisa que não entra na soma em reais", () => {
    const html = renderToString(<BookingForm initial={rascunho("MIA", "USD")} />);
    expect(html).toContain("não entra na soma de gastos em reais");
    expect(renderToString(<BookingForm initial={rascunho("MIA")} />)).not.toContain(
      "não entra na soma",
    );
  });
});
