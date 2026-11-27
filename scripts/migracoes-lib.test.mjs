import { describe, expect, it } from "vitest";
import { aplicarPendentes, problemasDaMigracaoNova, sqlComRegistro } from "./migracoes-lib.mjs";

describe("migrador: aplicar e registrar juntos (P18)", () => {
  it("a migração e o seu registro vão no mesmo envio, que o Postgres roda como uma transação só", () => {
    const sql = sqlComRegistro(
      "20990101000000_x.sql",
      "create table t (id int) -- fim sem ponto e vírgula",
    );
    expect(sql).toBe(
      "create table t (id int) -- fim sem ponto e vírgula\n;\ninsert into public.app_migrations (name) values ('20990101000000_x.sql');",
    );
  });

  it("nome com aspas não quebra o comando de registro", () => {
    expect(sqlComRegistro("a'b.sql", "select 1")).toContain("values ('a''b.sql')");
  });

  it("aplica só as pendentes, em ordem, uma chamada por migração", async () => {
    const chamadas = [];
    const executar = async (sql) => {
      chamadas.push(sql);
      if (/select name from public.app_migrations/.test(sql)) return [{ name: "1_a.sql" }];
      return [];
    };
    const n = await aplicarPendentes({
      executar,
      arquivos: [
        { nome: "2_b.sql", sql: "select 2" },
        { nome: "1_a.sql", sql: "select 1" },
        { nome: "3_c.sql", sql: "select 3" },
      ],
      log: () => {},
    });
    expect(n).toBe(2);
    const aplicadas = chamadas.filter((s) => /insert into public.app_migrations/.test(s));
    expect(aplicadas.map((s) => s.split("\n")[0])).toEqual(["select 2", "select 3"]);
  });

  it("para na primeira migração que falha: as seguintes não rodam", async () => {
    const chamadas = [];
    const executar = async (sql) => {
      chamadas.push(sql);
      if (sql.startsWith("select 2")) throw new Error("erro de sintaxe");
      return [];
    };
    await expect(
      aplicarPendentes({
        executar,
        arquivos: [
          { nome: "1_a.sql", sql: "select 1" },
          { nome: "2_b.sql", sql: "select 2" },
          { nome: "3_c.sql", sql: "select 3" },
        ],
        log: () => {},
      }),
    ).rejects.toThrow("2_b.sql: erro de sintaxe");
    expect(chamadas.some((s) => s.startsWith("select 3"))).toBe(false);
  });
});

describe("travas para migração nova (P18)", () => {
  it("aceita migração que só acrescenta", () => {
    expect(
      problemasDaMigracaoNova(
        "create table if not exists public.t (id int);\nalter table public.t enable row level security;\ngrant select, insert, delete on public.t to service_role;",
      ),
    ).toEqual([]);
  });

  it("recusa controle de transação e índice concorrente (o migrador já roda tudo numa transação)", () => {
    expect(problemasDaMigracaoNova("begin;\ncreate table t (id int);\ncommit;")).toHaveLength(1);
    expect(problemasDaMigracaoNova("create index concurrently i on t (id);")).toHaveLength(1);
  });

  it("aceita begin dentro de bloco do $$ … $$", () => {
    expect(problemasDaMigracaoNova("do $$\nbegin\n  perform 1;\nend $$;")).toEqual([]);
  });

  it("apagar ou renomear coluna ou tabela só como segunda entrega, com a marca", () => {
    expect(problemasDaMigracaoNova("alter table t drop column x;")).toHaveLength(1);
    expect(problemasDaMigracaoNova("alter table t rename column x to y;")).toHaveLength(1);
    expect(problemasDaMigracaoNova("drop table if exists t;")).toHaveLength(1);
    expect(problemasDaMigracaoNova("alter table t rename to u;")).toHaveLength(1);
    expect(
      problemasDaMigracaoNova(
        "-- segunda entrega: o app parou de usar x no PR anterior\nalter table t drop column x;",
      ),
    ).toEqual([]);
  });

  it("apagar e recriar policy não é apagar dado: passa", () => {
    expect(
      problemasDaMigracaoNova(
        'drop policy if exists "p" on t;\ncreate policy "p" on t for select using (true);',
      ),
    ).toEqual([]);
  });

  // Revisão em sessão limpa da 2b: a migração roda antes da publicação, então o app
  // antigo roda um tempo sobre o banco novo. Tirar acesso de que ele precisa o quebra.
  it("retirar acesso (revoke, ou apagar policy sem recriar a mesma) só como segunda entrega", () => {
    expect(problemasDaMigracaoNova("revoke select on public.t from authenticated;")).toHaveLength(
      1,
    );
    expect(
      problemasDaMigracaoNova(
        'drop policy if exists "t: dono" on public.t;\ncreate policy "t: dono lê" on public.t for select using (true);',
      ),
    ).toHaveLength(1);
    expect(
      problemasDaMigracaoNova(
        '-- segunda entrega: o app novo já não grava em t pelo navegador\nrevoke insert on public.t from authenticated;\ndrop policy if exists "t: dono" on public.t;',
      ),
    ).toEqual([]);
  });

  it("revoke na tabela criada na mesma migração não é retirar acesso: passa", () => {
    expect(
      problemasDaMigracaoNova(
        "create table if not exists public.nova (id bigint generated always as identity primary key);\nrevoke all on public.nova from public, anon, authenticated, service_role;\nrevoke all on sequence public.nova_id_seq from anon, authenticated;\ngrant select on public.nova to service_role;",
      ),
    ).toEqual([]);
  });

  it("correção de dados não se mistura com mudança de estrutura", () => {
    expect(
      problemasDaMigracaoNova("alter table t add column x int;\nupdate t set x = 1;"),
    ).toHaveLength(1);
    expect(problemasDaMigracaoNova("update public.t set x = 1 where x is null;")).toEqual([]);
    expect(problemasDaMigracaoNova("create table t (id int);\ndelete from u;")).toHaveLength(1);
    // Com apelido na tabela e dentro de bloco do $$ … $$ (formato das migrações antigas).
    expect(
      problemasDaMigracaoNova("alter table t add column x int;\nupdate public.t c\nset x = 1;"),
    ).toHaveLength(1);
    expect(
      problemasDaMigracaoNova(
        "alter table t add column x int;\ndo $$\nbegin\n  if true then\n    update t set x = 1;\n  end if;\nend $$;",
      ),
    ).toHaveLength(1);
  });
});
