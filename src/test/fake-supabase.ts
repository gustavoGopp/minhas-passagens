/**
 * Cliente Supabase falso, em memória, para testes de código de servidor (tick,
 * varredura). Cobre o subconjunto do query builder usado no app: select, insert,
 * upsert (onConflict/ignoreDuplicates), update, delete, filtros eq/neq/in/lt/lte/
 * gte/is, order, limit, single/maybeSingle e `.select()` depois de mutação.
 * Não é o PostgREST: não valida tipos, RLS nem constraints além do onConflict.
 */
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

class Query implements PromiseLike<{
  data: unknown;
  error: { message: string } | null;
  count?: number;
}> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private returning = false;
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private one: "single" | "maybe" | null = null;

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select() {
    if (this.op !== "select") this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.payload = rows;
    this.opts = opts;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  neq(c: string, v: unknown) {
    this.filters.push((r) => r[c] !== v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[c]));
    return this;
  }
  lt(c: string, v: string | number) {
    this.filters.push((r) => r[c] != null && (r[c] as string) < v);
    return this;
  }
  lte(c: string, v: string | number) {
    this.filters.push((r) => r[c] != null && (r[c] as string) <= v);
    return this;
  }
  gte(c: string, v: string | number) {
    this.filters.push((r) => r[c] != null && (r[c] as string) >= v);
    return this;
  }
  is(c: string, v: null) {
    this.filters.push((r) => (r[c] ?? null) === v);
    return this;
  }
  order(col: string, o: { ascending?: boolean } = {}) {
    this.orderBy = { col, asc: o.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }

  private run() {
    const rows = this.db.rows(this.table);
    const match = (r: Row) => this.filters.every((f) => f(r));
    const now = new Date().toISOString();
    let out: Row[] = [];
    if (this.op === "select") {
      out = rows.filter(match);
    } else if (this.op === "insert" || this.op === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const keys = this.opts.onConflict?.split(",") ?? [];
      for (const r of list) {
        const existing = keys.length
          ? rows.find((x) => keys.every((k) => x[k] === r[k]))
          : undefined;
        if (existing) {
          if (this.op === "insert")
            return { data: null, error: { message: "duplicate key value" } };
          if (this.opts.ignoreDuplicates) continue;
          Object.assign(existing, r, { updated_at: now });
          out.push(existing);
        } else {
          const row = { id: newId(), created_at: now, updated_at: now, ...r };
          rows.push(row);
          out.push(row);
        }
      }
    } else if (this.op === "update") {
      out = rows.filter(match);
      for (const r of out) Object.assign(r, this.payload, { updated_at: now });
    } else {
      out = rows.filter(match);
      this.db.set(
        this.table,
        rows.filter((r) => !match(r)),
      );
    }
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort(
        (a, b) => ((a[col] as string) > (b[col] as string) ? 1 : -1) * (asc ? 1 : -1),
      );
    }
    if (this.max != null) out = out.slice(0, this.max);
    const data = this.op === "select" || this.returning ? out.map((r) => ({ ...r })) : null;
    if (this.one) {
      if (!out.length)
        return this.one === "single"
          ? { data: null, error: { message: "no rows" } }
          : { data: null, error: null };
      return { data: { ...out[0] }, error: null };
    }
    return { data, error: null, count: out.length };
  }

  then<A, B>(
    ok?:
      | ((v: {
          data: unknown;
          error: { message: string } | null;
          count?: number;
        }) => A | PromiseLike<A>)
      | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, fail);
  }
}

export class FakeDb {
  private tables = new Map<string, Row[]>();
  rows(t: string) {
    if (!this.tables.has(t)) this.tables.set(t, []);
    return this.tables.get(t)!;
  }
  set(t: string, rows: Row[]) {
    this.tables.set(t, rows);
  }
  /** Cliente com a mesma forma do supabase-js (o suficiente para o código do app). */
  client() {
    return {
      from: (t: string) => new Query(this, t),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
  }
}
