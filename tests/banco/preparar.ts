// Preparação única antes dos testes de banco: cria as pessoas fictícias A e B no
// Supabase local e uma linha de cada uma em cada tabela. Os testes rodam dentro
// de transações desfeitas no fim, então esta base não muda entre eles.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { TestProject } from "vitest/node";
import { ambiente, banco, fecharBanco } from "./apoio";
import { DDL_APP_MIGRATIONS, insert, TABELAS, type Contexto } from "./tabelas";

export interface Pessoa {
  id: string;
  email: string;
  ctx: Contexto;
  /** Chave da linha desta pessoa em cada tabela. */
  linhas: Record<string, string>;
}

declare module "vitest" {
  export interface ProvidedContext {
    pessoas: { A: Pessoa; B: Pessoa; senha: string; globais: Record<string, string> };
  }
}

export function adminLocal() {
  return createClient(ambiente.apiUrl, ambiente.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Cria (ou recria) uma pessoa fictícia pelo Auth local. */
export async function criarPessoa(email: string, senha: string): Promise<string> {
  const admin = adminLocal();
  const { data: lista, error: erroLista } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (erroLista) throw erroLista;
  for (const u of lista.users.filter((u) => u.email === email)) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) throw error;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { full_name: "Pessoa Fictícia" },
  });
  if (error || !data.user) throw error ?? new Error("usuário não criado");
  return data.user.id;
}

async function semear(id: string, email: string): Promise<Pessoa> {
  const ctx: Contexto = { user: id, booking: "", monitor: "", message: "" };
  const linhas: Record<string, string> = {};
  const db = banco();
  for (const t of TABELAS) {
    if (t.global) continue;
    if (t.nome === "profiles") {
      linhas.profiles = id;
      continue;
    }
    const [sql, vals] = insert(t, t.linha(ctx, "semente"));
    const { rows } = await db.query<{ pk: string }>(sql, vals);
    linhas[t.nome] = rows[0].pk;
    if (t.nome === "bookings") ctx.booking = rows[0].pk;
    if (t.nome === "price_monitors") ctx.monitor = rows[0].pk;
    if (t.nome === "mail_messages") ctx.message = rows[0].pk;
  }
  return { id, email, ctx, linhas };
}

export default async function preparar(project: TestProject) {
  try {
    await prepararBanco(project);
  } catch (e) {
    // Erro do pg ou do Auth chega sem pilha legível; repete a mensagem como Error simples.
    const err = e as { message?: string; detail?: string; table?: string };
    console.error("PREPARAR:", err.message, err.detail ?? "", err.table ?? "");
    throw new Error(
      `Preparação do banco falhou: ${err.message} ${err.detail ?? ""} ${err.table ?? ""}`,
    );
  } finally {
    await fecharBanco();
  }
}

async function prepararBanco(project: TestProject) {
  const db = banco();
  await db.query(DDL_APP_MIGRATIONS);
  const senha = randomBytes(18).toString("base64url");
  const emailA = "regras-a@example.com";
  const emailB = "regras-b@example.com";
  const A = await semear(await criarPessoa(emailA, senha), emailA);
  const B = await semear(await criarPessoa(emailB, senha), emailB);
  const globais: Record<string, string> = {};
  for (const t of TABELAS.filter((t) => t.global)) {
    await db.query(`delete from public.${t.nome} where ${t.pk}::text = $1`, ["teste_semente"]);
    const [sql, vals] = insert(t, t.linha(A.ctx, "semente"));
    globais[t.nome] = (await db.query<{ pk: string }>(sql, vals)).rows[0].pk;
  }
  project.provide("pessoas", { A, B, senha, globais });
}
