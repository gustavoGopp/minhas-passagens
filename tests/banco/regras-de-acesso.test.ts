// Regras de acesso (docs/regras-de-acesso.md) contra o Postgres do Supabase local.
// Convenção de nomes, usada por scripts/banco-teste/quebrar-regras.mjs:
// - "nega: ..." precisa falhar quando a regra da tabela é aberta de propósito;
// - "permite: ..." precisa falhar quando o acesso do usuário logado é retirado.
// Nos testes "nega", o visitante e o usuário logado recebem todas as concessões
// (como o padrão antigo do Supabase dava): quem barra tem de ser a regra por linha.
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, describe, expect, inject, it } from "vitest";
import { como, comoServidor, emTransacao, fecharBanco, tentar, type Quem } from "./apoio";
import { insert, TABELAS, type Tabela } from "./tabelas";

const { A, B, globais } = inject("pessoas");

afterAll(fecharBanco);

async function concederTudo(c: PoolClient, tabela: string) {
  await c.query(`grant select, insert, update, delete on public.${tabela} to anon, authenticated`);
}

async function linhaDe(c: PoolClient, t: Tabela, pk: string) {
  await comoServidor(c);
  const { rows } = await c.query(`select * from public.${t.nome} where ${t.pk}::text = $1`, [pk]);
  return rows[0];
}

/** Prepara o terreno para criar uma linha de `dono` (apaga a atual quando é uma por usuário). */
async function abrirEspaco(c: PoolClient, t: Tabela, donoId: string) {
  if (t.umaPorUsuario) await c.query(`delete from public.${t.nome} where ${t.pk} = $1`, [donoId]);
}

async function ver(c: PoolClient, t: Tabela, quem: Quem, pk: string) {
  await como(c, quem);
  return tentar(c, `select ${t.pk} from public.${t.nome} where ${t.pk}::text = $1`, [pk]);
}

async function alterar(c: PoolClient, t: Tabela, quem: Quem, pk: string) {
  await como(c, quem);
  return tentar(
    c,
    `update public.${t.nome} set ${t.alterar.coluna} = $1 where ${t.pk}::text = $2`,
    [t.alterar.valor, pk],
  );
}

async function apagar(c: PoolClient, t: Tabela, quem: Quem, pk: string) {
  await como(c, quem);
  return tentar(c, `delete from public.${t.nome} where ${t.pk}::text = $1`, [pk]);
}

async function criar(c: PoolClient, t: Tabela, quem: Quem, linha: Record<string, unknown>) {
  await como(c, quem);
  const [sql, vals] = insert(t, linha);
  return tentar(c, sql, vals);
}

/** A recusa tem de vir da proteção de acesso, não de outra regra do banco. */
function esperarRecusa(r: Awaited<ReturnType<typeof criar>>, quem: string) {
  expect(r.ok, `${quem} conseguiu criar`).toBe(false);
  expect(r.erro).toMatch(/row-level security|permission denied/);
}

function esperarNegadoLeitura(r: Awaited<ReturnType<typeof ver>>) {
  expect(r.ok ? r.linhas : 0, r.erro).toBe(0);
}

async function esperarIntacta(c: PoolClient, t: Tabela, pk: string, antes: unknown) {
  const depois = await linhaDe(c, t, pk);
  expect(depois, `a linha ${pk} de ${t.nome} mudou ou sumiu`).toEqual(antes);
}

for (const t of TABELAS.filter((t) => !t.global)) {
  describe(`tabela ${t.nome}`, () => {
    const pkA = A.linhas[t.nome];
    const pkB = B.linhas[t.nome];

    // O que o dono dos dados pode (ou não) fazer com as próprias linhas.
    if (t.dono.ler) {
      it("permite: A lê a própria linha", () =>
        emTransacao(async (c) => {
          const r = await ver(c, t, A, pkA);
          expect(r.erro).toBeUndefined();
          expect(r.linhas).toBe(1);
        }));
    }

    if (t.dono.criar) {
      it("permite: A cria uma linha própria", () =>
        emTransacao(async (c) => {
          await abrirEspaco(c, t, A.id);
          const r = await criar(c, t, A, t.linha(A.ctx, randomUUID()));
          expect(r.erro).toBeUndefined();
          expect(r.linhas).toBe(1);
        }));
    } else {
      it("nega: A não cria linha pelo navegador", () =>
        emTransacao(async (c) => {
          await concederTudo(c, t.nome);
          await abrirEspaco(c, t, A.id);
          const r = await criar(c, t, A, t.linha(A.ctx, randomUUID()));
          esperarRecusa(r, "A");
        }));
    }

    if (t.dono.alterar) {
      it("permite: A altera a própria linha", () =>
        emTransacao(async (c) => {
          const r = await alterar(c, t, A, pkA);
          expect(r.erro).toBeUndefined();
          expect(r.linhas).toBe(1);
        }));
    } else {
      it("nega: A não altera a própria linha pelo navegador", () =>
        emTransacao(async (c) => {
          await concederTudo(c, t.nome);
          const antes = await linhaDe(c, t, pkA);
          const r = await alterar(c, t, A, pkA);
          expect(r.linhas).toBe(0);
          await esperarIntacta(c, t, pkA, antes);
        }));
    }

    if (t.dono.apagar) {
      it("permite: A apaga a própria linha", () =>
        emTransacao(async (c) => {
          const r = await apagar(c, t, A, pkA);
          expect(r.erro).toBeUndefined();
          expect(r.linhas).toBe(1);
        }));
    } else {
      it("nega: A não apaga a própria linha pelo navegador", () =>
        emTransacao(async (c) => {
          await concederTudo(c, t.nome);
          const antes = await linhaDe(c, t, pkA);
          const r = await apagar(c, t, A, pkA);
          expect(r.linhas).toBe(0);
          await esperarIntacta(c, t, pkA, antes);
        }));
    }

    // B e o visitante: nada com a linha de A.
    for (const [rotulo, quem] of [
      ["B", B],
      ["o visitante", "visitante"],
    ] as const) {
      it(`nega: ${rotulo} não vê a linha de A`, () =>
        emTransacao(async (c) => {
          await concederTudo(c, t.nome);
          esperarNegadoLeitura(await ver(c, t, quem, pkA));
        }));

      it(`nega: ${rotulo} não altera a linha de A`, () =>
        emTransacao(async (c) => {
          await concederTudo(c, t.nome);
          const antes = await linhaDe(c, t, pkA);
          const r = await alterar(c, t, quem, pkA);
          expect(r.linhas).toBe(0);
          await esperarIntacta(c, t, pkA, antes);
        }));

      it(`nega: ${rotulo} não apaga a linha de A`, () =>
        emTransacao(async (c) => {
          await concederTudo(c, t.nome);
          const antes = await linhaDe(c, t, pkA);
          const r = await apagar(c, t, quem, pkA);
          expect(r.linhas).toBe(0);
          await esperarIntacta(c, t, pkA, antes);
        }));

      it(`nega: ${rotulo} não cria linha em nome de A`, () =>
        emTransacao(async (c) => {
          await concederTudo(c, t.nome);
          await abrirEspaco(c, t, A.id);
          const r = await criar(c, t, quem, t.linha(A.ctx, randomUUID()));
          esperarRecusa(r, rotulo);
        }));
    }

    it("permite: B lê a própria linha, mas não a de A, na mesma consulta", () =>
      emTransacao(async (c) => {
        await como(c, B);
        const r = await tentar(c, `select ${t.pk}::text as pk from public.${t.nome}`);
        const vistas = r.rows.map((x) => x.pk);
        expect(vistas).toContain(pkB);
        expect(vistas).not.toContain(pkA);
      }));
  });
}

describe("tabela flights", () => {
  it("nega: B não pendura trecho dele numa passagem de A", () =>
    emTransacao(async (c) => {
      await concederTudo(c, "flights");
      const t = TABELAS.find((x) => x.nome === "flights")!;
      const r = await criar(c, t, B, t.linha({ ...B.ctx, booking: A.ctx.booking }, randomUUID()));
      esperarRecusa(r, "B");
    }));
});

// A chave de API cifrada nunca vai ao navegador, nem para o próprio dono (regra
// aprovada em 27/11). Aqui quem barra é a concessão por coluna, não a regra por
// linha: por isso estes testes não chamam concederTudo. A prova de quebra
// (concessão de tabela inteira) tem de fazer o "nega" falhar.
describe("tabela user_integrations", () => {
  const t = TABELAS.find((x) => x.nome === "user_integrations")!;

  it("nega: A não lê a própria chave cifrada pelo navegador", () =>
    emTransacao(async (c) => {
      await como(c, A);
      const r = await tentar(
        c,
        `select encrypted_key from public.user_integrations where id = $1`,
        [A.linhas[t.nome]],
      );
      expect(r.ok, "A leu a chave cifrada").toBe(false);
      expect(r.erro).toMatch(/permission denied/);
    }));

  it("permite: A lê o que a tela mostra da própria chave", () =>
    emTransacao(async (c) => {
      await como(c, A);
      const r = await tentar(
        c,
        `select provider, key_hint, status, validated_at, updated_at
         from public.user_integrations where id = $1`,
        [A.linhas[t.nome]],
      );
      expect(r.erro).toBeUndefined();
      expect(r.linhas).toBe(1);
    }));

  // O app troca a chave atualizando a linha (src/lib/integrations/repo.ts). Gravar
  // por cima com "on conflict do update" pediria ler a cifra, e isso está fechado.
  it("permite: A troca a própria chave", () =>
    emTransacao(async (c) => {
      await como(c, A);
      const r = await tentar(
        c,
        `update public.user_integrations
         set encrypted_key = 'outra-cifra-ficticia', key_hint = '5678'
         where id = $1`,
        [A.linhas[t.nome]],
      );
      expect(r.erro).toBeUndefined();
      expect(r.linhas).toBe(1);
    }));
});

for (const t of TABELAS.filter((t) => t.global)) {
  describe(`tabela ${t.nome}`, () => {
    const pk = globais[t.nome];
    for (const [rotulo, quem] of [
      ["A", A],
      ["o visitante", "visitante"],
    ] as const) {
      it(`nega: ${rotulo} não lê`, () =>
        emTransacao(async (c) => {
          await concederTudo(c, t.nome);
          esperarNegadoLeitura(await ver(c, t, quem, pk));
        }));
      it(`nega: ${rotulo} não cria`, () =>
        emTransacao(async (c) => {
          await concederTudo(c, t.nome);
          const r = await criar(c, t, quem, t.linha(A.ctx, randomUUID()));
          esperarRecusa(r, rotulo);
        }));
      it(`nega: ${rotulo} não altera`, () =>
        emTransacao(async (c) => {
          await concederTudo(c, t.nome);
          const antes = await linhaDe(c, t, pk);
          const r = await alterar(c, t, quem, pk);
          expect(r.linhas).toBe(0);
          await esperarIntacta(c, t, pk, antes);
        }));
      it(`nega: ${rotulo} não apaga`, () =>
        emTransacao(async (c) => {
          await concederTudo(c, t.nome);
          const antes = await linhaDe(c, t, pk);
          const r = await apagar(c, t, quem, pk);
          expect(r.linhas).toBe(0);
          await esperarIntacta(c, t, pk, antes);
        }));
    }
  });
}

describe("todas as tabelas", () => {
  it("cada tabela do banco tem a sua regra escrita aqui (tabela nova sem regra reprova)", () =>
    emTransacao(async (c) => {
      const { rows } = await c.query<{ nome: string }>(
        `select c.relname as nome from pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') order by 1`,
      );
      expect(rows.map((r) => r.nome).sort()).toEqual(TABELAS.map((t) => t.nome).sort());
    }));

  it("nega: nenhuma tabela está sem a proteção de acesso por linha", () =>
    emTransacao(async (c) => {
      const { rows } = await c.query<{ nome: string }>(
        `select c.relname as nome from pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
           and not c.relrowsecurity`,
      );
      expect(rows.map((r) => r.nome)).toEqual([]);
    }));

  it("nega: tabela nova nasce com a proteção ligada", () =>
    emTransacao(async (c) => {
      await c.query("create table public.tabela_nova_de_teste (id int)");
      await c.query("create table public.tabela_nova_de_teste_2 as select 1 as x");
      const { rows } = await c.query<{ relname: string; relrowsecurity: boolean }>(
        `select relname, relrowsecurity from pg_class
         where relname like 'tabela_nova_de_teste%' order by 1`,
      );
      expect(rows).toEqual([
        { relname: "tabela_nova_de_teste", relrowsecurity: true },
        { relname: "tabela_nova_de_teste_2", relrowsecurity: true },
      ]);
    }));

  it("nega: nenhuma visão (view) fura a proteção", () =>
    emTransacao(async (c) => {
      const { rows } = await c.query<{ nome: string }>(
        `select c.relname as nome from pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
           and not coalesce(c.reloptions @> array['security_invoker=true'], false)`,
      );
      expect(rows.map((r) => r.nome)).toEqual([]);
    }));

  it("nega: só funções conhecidas rodam com poder de dono do banco", () =>
    emTransacao(async (c) => {
      const { rows } = await c.query<{ nome: string }>(
        `select p.proname as nome from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.prosecdef order by 1`,
      );
      expect(rows.map((r) => r.nome)).toEqual(["handle_new_user"]);
    }));
});
