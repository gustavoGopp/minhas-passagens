// Apoio aos testes que rodam contra o Supabase local (`supabase start`).
// As variáveis vêm de `supabase status -o env`: DB_URL, API_URL, ANON_KEY e
// SERVICE_ROLE_KEY. Só existem no ambiente de teste; nada aqui toca produção.
import pg, { type Pool, type PoolClient } from "pg";

function exigir(nome: string): string {
  const v = process.env[nome];
  if (!v) {
    throw new Error(
      `Falta ${nome}. Suba o banco com "supabase start" e rode com as variáveis de "supabase status -o env".`,
    );
  }
  if (nome !== "ANON_KEY" && nome !== "SERVICE_ROLE_KEY" && !/127\.0\.0\.1|localhost/.test(v)) {
    throw new Error(
      `${nome} não aponta para o banco local. Os testes só rodam contra o Supabase local.`,
    );
  }
  return v;
}

export const ambiente = {
  get dbUrl() {
    return exigir("DB_URL");
  },
  get apiUrl() {
    return exigir("API_URL");
  },
  get anonKey() {
    return exigir("ANON_KEY");
  },
  get serviceKey() {
    return exigir("SERVICE_ROLE_KEY");
  },
};

let pool: Pool | undefined;
export function banco(): Pool {
  pool ??= new pg.Pool({ connectionString: ambiente.dbUrl, max: 4 });
  return pool;
}

export async function fecharBanco() {
  await pool?.end();
  pool = undefined;
}

/** Roda fn numa transação que é sempre desfeita no fim. */
export async function emTransacao<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await banco().connect();
  try {
    await c.query("begin");
    return await fn(c);
  } finally {
    await c.query("rollback");
    c.release();
  }
}

export type Quem = { id: string } | "visitante";

/** Passa a agir como o usuário logado (papel authenticated) ou como visitante (anon). */
export async function como(c: PoolClient, quem: Quem) {
  if (quem === "visitante") {
    await c.query("set local role anon");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ role: "anon" }),
    ]);
  } else {
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: quem.id, role: "authenticated" }),
    ]);
  }
}

/** Volta a agir como o dono do banco, que enxerga tudo (para conferir o estado). */
export async function comoServidor(c: PoolClient) {
  await c.query("reset role");
  await c.query("select set_config('request.jwt.claims', '', true)");
}

export interface Tentativa {
  ok: boolean;
  linhas: number;
  erro?: string;
  rows: Record<string, unknown>[];
}

/** Tenta um comando sem derrubar a transação: erro vira { ok: false }. */
export async function tentar(
  c: PoolClient,
  sql: string,
  params: unknown[] = [],
): Promise<Tentativa> {
  await c.query("savepoint tentativa");
  try {
    const r = await c.query(sql, params);
    await c.query("release savepoint tentativa");
    return { ok: true, linhas: r.rowCount ?? 0, rows: r.rows };
  } catch (e) {
    await c.query("rollback to savepoint tentativa");
    return { ok: false, linhas: 0, erro: (e as Error).message, rows: [] };
  }
}
