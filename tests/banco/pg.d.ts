// Tipos mínimos do pacote `pg`, só o que os testes de banco usam.
// Evita instalar outro pacote (@types/pg) só para isso.
declare module "pg" {
  export interface QueryResult<R = Record<string, unknown>> {
    rows: R[];
    rowCount: number | null;
  }
  export interface PoolClient {
    query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<R>>;
    release(): void;
  }
  export class Pool {
    constructor(config: { connectionString: string; max?: number });
    connect(): Promise<PoolClient>;
    query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<R>>;
    end(): Promise<void>;
  }
  const pg: { Pool: typeof Pool };
  export default pg;
}
