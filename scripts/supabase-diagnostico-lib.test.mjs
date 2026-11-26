import { describe, expect, it } from "vitest";
import { problemasDeDadoPessoal } from "./supabase-diagnostico-lib.mjs";

// Os logs do Actions são públicos. Esta trava substitui a regra escrita
// "diagnóstico nunca devolve dado pessoal" (auditoria A1.14).
describe("trava de dado pessoal no diagnóstico", () => {
  it("aceita nomes de objetos, contagens, datas e booleanos", () => {
    const linhas = [
      {
        estado: {
          tabelas: ["bookings", "flights", "price_monitors"],
          usuarios: 2,
          trigger_novo_usuario: true,
          migracoes_registradas: "20261029000000_init.sql,20261102000000_bookings.sql",
          ultimo_tick: "2026-11-26T12:00:00.000Z",
        },
      },
    ];
    expect(problemasDeDadoPessoal(linhas)).toEqual([]);
  });

  it("aceita URLs de configuração e definições de políticas", () => {
    const linhas = [
      {
        site_url: "https://minhas-passagens.vercel.app",
        uri_allow_list: "http://localhost:3000/**",
      },
      { tabela: "bookings", politica: "bookings: dono", expressao: "(auth.uid() = user_id)" },
    ];
    expect(problemasDeDadoPessoal(linhas)).toEqual([]);
  });

  it("recusa e-mail em qualquer nível e diz onde, sem repetir o valor", () => {
    const linhas = [{ estado: { donos: ["fulano.de.tal@example.com"] } }];
    const problemas = problemasDeDadoPessoal(linhas);
    expect(problemas).toEqual([{ caminho: "[0].estado.donos[0]", motivo: "e-mail" }]);
    expect(JSON.stringify(problemas)).not.toContain("fulano");
  });

  it("recusa token no formato JWT e segredo longo sem espaços", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123456abcDEF123456";
    const segredo = "chave_falsa_9f8e7d6c5b4a39281706f5e4d3c2b1a0";
    expect(problemasDeDadoPessoal([{ a: jwt }])).toEqual([{ caminho: "[0].a", motivo: "token" }]);
    expect(problemasDeDadoPessoal([{ b: segredo }])).toEqual([
      { caminho: "[0].b", motivo: "segredo" },
    ]);
  });

  it("recusa CPF e telefone", () => {
    expect(problemasDeDadoPessoal([{ doc: "123.456.789-09" }])).toEqual([
      { caminho: "[0].doc", motivo: "CPF" },
    ]);
    expect(problemasDeDadoPessoal([{ tel: "+55 21 99999-8888" }])).toEqual([
      { caminho: "[0].tel", motivo: "telefone" },
    ]);
  });

  it("não confunde identificador de migração nem UUID com dado pessoal", () => {
    const linhas = [
      { nome: "20261111000000_link_oferta.sql", id: "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b" },
    ];
    expect(problemasDeDadoPessoal(linhas)).toEqual([]);
  });
});
