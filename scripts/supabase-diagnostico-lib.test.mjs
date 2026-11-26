import { describe, expect, it } from "vitest";
import { detalheSeguro, problemasDeDadoPessoal } from "./supabase-diagnostico-lib.mjs";

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

  // Revisão de 26/11: estes casos passavam pela trava.
  it("recusa token do Telegram e segredo dentro de aspas, JSON ou URL", () => {
    const telegram = "7123456789:AAHdq" + "x".repeat(10) + "Zw9K4" + "y".repeat(12);
    expect(problemasDeDadoPessoal([{ t: telegram }])).toEqual([
      { caminho: "[0].t", motivo: "token" },
    ]);
    const chave = "chave_falsa_9f8e7d6c5b4a39281706f5e4d3c2b1a0";
    for (const texto of [
      `headers:='{"Authorization":"Bearer ${chave}"}'`,
      `{"key":"${chave}"}`,
      `https://exemplo.test/x?key=${chave}`,
    ]) {
      expect(problemasDeDadoPessoal([{ a: texto }]), texto).toHaveLength(1);
    }
  });

  it("recusa telefone sem +55, CPF sem pontuação e e-mail codificado", () => {
    expect(problemasDeDadoPessoal([{ a: "21 99999-8888" }])).toEqual([
      { caminho: "[0].a", motivo: "telefone" },
    ]);
    expect(problemasDeDadoPessoal([{ a: "21999998888" }])).toEqual([
      { caminho: "[0].a", motivo: "telefone" },
    ]);
    // 529.982.247-25 é o exemplo de CPF válido da documentação da Receita.
    expect(problemasDeDadoPessoal([{ a: "52998224725" }])).toEqual([
      { caminho: "[0].a", motivo: "CPF" },
    ]);
    expect(problemasDeDadoPessoal([{ a: "fulano%40example.com" }])).toEqual([
      { caminho: "[0].a", motivo: "e-mail" },
    ]);
  });

  it("confere também os nomes dos campos", () => {
    expect(problemasDeDadoPessoal([{ "fulano@example.com": 1 }])).toEqual([
      { caminho: "[0].(nome do campo)", motivo: "e-mail" },
    ]);
  });

  it("não acusa contagens, tamanhos e identificadores de execução", () => {
    expect(
      problemasDeDadoPessoal([{ linhas: 12345678901, bytes: "1127225", execucao: "45894792615" }]),
    ).toEqual([]);
  });

  it("mensagem de erro da API só sai se não tiver cara de dado pessoal", () => {
    expect(detalheSeguro('{"message":"relation \\"public.x\\" does not exist"}')).toContain(
      "does not exist",
    );
    expect(
      detalheSeguro('invalid input syntax for type integer: "fulano.de.tal@example.com"'),
    ).toBe("(detalhe omitido: tinha formato de dado pessoal)");
  });

  it("não confunde identificador de migração nem UUID com dado pessoal", () => {
    const linhas = [
      { nome: "20261111000000_link_oferta.sql", id: "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b" },
    ];
    expect(problemasDeDadoPessoal(linhas)).toEqual([]);
  });
});
