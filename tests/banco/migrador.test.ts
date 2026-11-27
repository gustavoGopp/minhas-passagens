// O migrador de produção (scripts/migracoes-lib.mjs) contra um Postgres de verdade
// (P18): cada migração e o seu registro numa transação só. Uma migração que falha
// no meio não deixa nada aplicado nem registrado, e as seguintes não rodam.
// Usa um schema próprio de teste e nomes de migração do ano 2099; tudo é apagado no fim.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { aplicarPendentes, listarPendentes } from "../../scripts/migracoes-lib.mjs";
import { banco, fecharBanco } from "./apoio";

const sufixo = randomUUID().slice(0, 8);
const SCHEMA = `teste_migrador_${sufixo}`;
const nome = (n: number) => `2099010100000${n}_teste_${sufixo}.sql`;

/** Mesmo jeito da API do Supabase: o texto inteiro num envio só, devolvendo as linhas do último comando. */
async function executar(sql: string) {
  const r = (await banco().query(sql)) as unknown as
    { rows: Record<string, unknown>[] } | { rows: Record<string, unknown>[] }[];
  return (Array.isArray(r) ? r[r.length - 1] : r).rows;
}

async function existeTabela(t: string) {
  const { rows } = await banco().query("select to_regclass($1) is not null as ok", [
    `${SCHEMA}.${t}`,
  ]);
  return rows[0].ok as boolean;
}

async function registradas() {
  const { rows } = await banco().query(
    "select name from public.app_migrations where name like $1 order by name",
    [`%_teste_${sufixo}.sql`],
  );
  return rows.map((r) => r.name as string);
}

afterAll(async () => {
  await banco().query(`drop schema if exists ${SCHEMA} cascade`);
  await banco().query("delete from public.app_migrations where name like $1", [
    `%_teste_${sufixo}.sql`,
  ]);
  await fecharBanco();
});

const log = () => {};

describe("migrador de produção", () => {
  const boa = { nome: nome(1), sql: `create schema ${SCHEMA};\ncreate table ${SCHEMA}.a (id int)` };
  const quebrada = {
    nome: nome(2),
    // Cria uma tabela e depois falha: a tabela não pode sobrar.
    sql: `create table ${SCHEMA}.b (id int);\ninsert into ${SCHEMA}.b values (1);\nselect 1 / 0;`,
  };
  const depois = { nome: nome(3), sql: `create table ${SCHEMA}.c (id int);` };

  it("migração que falha no meio não deixa nada aplicado nem registrado; as seguintes não rodam", async () => {
    await expect(
      aplicarPendentes({ executar, arquivos: [boa, quebrada, depois], log }),
    ).rejects.toThrow(`${quebrada.nome}: division by zero`);
    expect(await existeTabela("a")).toBe(true);
    expect(await existeTabela("b")).toBe(false);
    expect(await existeTabela("c")).toBe(false);
    expect(await registradas()).toEqual([boa.nome]);
  });

  it("a lista de pendentes mostra o que falta, sem gravar nada", async () => {
    const pendentes = await listarPendentes({ executar, arquivos: [boa, quebrada, depois] });
    expect(pendentes).toEqual([quebrada.nome, depois.nome]);
  });

  it("corrigida a migração, a próxima execução aplica e registra o que faltava", async () => {
    const corrigida = { ...quebrada, sql: `create table ${SCHEMA}.b (id int);` };
    const n = await aplicarPendentes({ executar, arquivos: [boa, corrigida, depois], log });
    expect(n).toBe(2);
    expect(await existeTabela("b")).toBe(true);
    expect(await existeTabela("c")).toBe(true);
    expect(await registradas()).toEqual([boa.nome, quebrada.nome, depois.nome]);
  });

  it("se o registro falhar, a migração também é desfeita (nunca fica aplicada sem registro)", async () => {
    const n5 = nome(5);
    // A própria migração ocupa o nome no registro: o registro do migrador falha por duplicidade.
    const sabotada = {
      nome: n5,
      sql: `create table ${SCHEMA}.e (id int);\ninsert into public.app_migrations (name) values ('${n5}');`,
    };
    await expect(aplicarPendentes({ executar, arquivos: [sabotada], log })).rejects.toThrow(
      /duplicate key/,
    );
    expect(await existeTabela("e")).toBe(false);
    expect(await registradas()).not.toContain(n5);
  });

  it("migração terminada em comentário, sem ponto e vírgula, também é registrada", async () => {
    const comComentario = {
      nome: nome(4),
      sql: `create table ${SCHEMA}.d (id int) -- sem ponto e vírgula`,
    };
    await aplicarPendentes({ executar, arquivos: [comComentario], log });
    expect(await registradas()).toContain(comComentario.nome);
  });
});
