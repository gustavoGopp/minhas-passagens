import { describe, expect, it } from "vitest";
import { origemValida, resumoDasFalhas, textoDaFalha } from "./falhas-resumo";

describe("texto da falha guardado no registro", () => {
  it("usa a mensagem do erro, sem quebras de linha", () => {
    expect(textoDaFalha(new Error("Falha ao salvar:\n  permission denied"))).toBe(
      "Falha ao salvar: permission denied",
    );
  });

  it("aceita texto solto e objeto com message; o resto vira 'erro sem mensagem'", () => {
    expect(textoDaFalha("tempo esgotado")).toBe("tempo esgotado");
    expect(textoDaFalha({ message: "do supabase" })).toBe("do supabase");
    expect(textoDaFalha(null)).toBe("erro sem mensagem");
    expect(textoDaFalha(new Error(""))).toBe("erro sem mensagem");
  });

  it("guarda o código de erro do Next (digest) quando a mensagem foi escondida", () => {
    const e = Object.assign(new Error("An error occurred in the Server Components render."), {
      digest: "123456",
    });
    expect(textoDaFalha(e)).toBe(
      "An error occurred in the Server Components render. (digest 123456)",
    );
  });

  it("esconde e-mails e corta em 500 caracteres", () => {
    expect(textoDaFalha(new Error("duplicate key (email)=(fulano.tal@example.com)"))).toBe(
      "duplicate key (email)=(f***@example.com)",
    );
    const longo = textoDaFalha(new Error("x".repeat(800)));
    expect(longo).toHaveLength(500);
    expect(longo.endsWith("…")).toBe(true);
  });

  it("origem curta e sem espaços estranhos", () => {
    expect(origemValida("  agendador:precos ")).toBe("agendador:precos");
    expect(origemValida("")).toBe("desconhecida");
    expect(origemValida("a".repeat(200))).toHaveLength(120);
  });
});

describe("resumo das falhas no e-mail do vigia diário", () => {
  const now = "2026-11-28T11:17:00.000Z";

  it("sem falha nas últimas 24 h, não há resumo (nenhum e-mail novo)", () => {
    expect(resumoDasFalhas([], now, "")).toBeNull();
  });

  it("agrupa por origem, da mais frequente para a menos, com a mensagem mais recente e o horário de Brasília", () => {
    const r = resumoDasFalhas(
      [
        {
          origem: "agendador:precos",
          mensagem: "tempo esgotado",
          criado_em: "2026-11-28T09:00:00Z",
        },
        {
          origem: "acao:importar",
          mensagem: "permission denied",
          criado_em: "2026-11-27T20:00:00Z",
        },
        { origem: "agendador:precos", mensagem: "HTTP 502", criado_em: "2026-11-28T10:05:00Z" },
      ],
      now,
      "https://app.exemplo",
    );
    expect(r?.subject).toBe("Minhas Passagens: 3 falhas nas últimas 24 horas");
    expect(r?.text).toContain(
      "- agendador:precos: 2 vezes. A mais recente às 07:05 de 28/11: HTTP 502",
    );
    expect(r?.text).toContain(
      "- acao:importar: 1 vez. A mais recente às 17:00 de 27/11: permission denied",
    );
    expect(r!.text.indexOf("agendador:precos")).toBeLessThan(r!.text.indexOf("acao:importar"));
    expect(r?.text).toContain("docs/EMERGENCIA.md");
  });

  it("uma falha só: assunto no singular", () => {
    const r = resumoDasFalhas(
      [{ origem: "requisicao:/app", mensagem: "x", criado_em: "2026-11-28T10:00:00Z" }],
      now,
      "",
    );
    expect(r?.subject).toBe("Minhas Passagens: 1 falha nas últimas 24 horas");
  });
});
