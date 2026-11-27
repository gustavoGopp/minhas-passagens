// As regras de acesso aprovadas (docs/regras-de-acesso.md), tabela por tabela.
// Cada entrada diz o que o dono dos dados pode fazer com as próprias linhas e
// como montar uma linha fictícia. O que B e o visitante não podem é igual para
// todas: não ver, não criar em nome de A, não alterar e não apagar.

export interface Contexto {
  user: string;
  booking: string;
  monitor: string;
  message: string;
}

export interface Tabela {
  nome: string;
  /** Coluna que identifica a linha. */
  pk: string;
  /** Linha fictícia nova; `n` deixa valores únicos diferentes a cada chamada. */
  linha(ctx: Contexto, n: string): Record<string, unknown>;
  /** Coluna e valor usados nos testes de alteração. */
  alterar: { coluna: string; valor: unknown };
  /** O que o próprio dono dos dados pode fazer pelo navegador. */
  dono: { ler: boolean; criar: boolean; alterar: boolean; apagar: boolean };
  /** Tabela sem dono (configuração do servidor): ninguém logado mexe. */
  global?: boolean;
  /** A chave é o próprio usuário: para criar, a linha atual dele sai antes. */
  umaPorUsuario?: boolean;
}

const tudo = { ler: true, criar: true, alterar: true, apagar: true };
const soLer = { ler: true, criar: false, alterar: false, apagar: false };
const nada = { ler: false, criar: false, alterar: false, apagar: false };

export const TABELAS: Tabela[] = [
  {
    nome: "profiles",
    pk: "id",
    linha: (c) => ({ id: c.user, email: null }),
    alterar: { coluna: "home_city", valor: "Cidade fictícia" },
    dono: { ler: true, criar: false, alterar: true, apagar: false },
    umaPorUsuario: true,
  },
  {
    nome: "user_integrations",
    pk: "id",
    linha: (c, n) => ({
      user_id: c.user,
      provider: n === "semente" ? "travelpayouts" : "serpapi",
      encrypted_key: "cifrado-ficticio",
      key_hint: "1234",
    }),
    alterar: { coluna: "key_hint", valor: "9999" },
    dono: tudo,
  },
  {
    nome: "holiday_overrides",
    pk: "id",
    linha: (c) => ({
      user_id: c.user,
      action: "add",
      date: "2027-01-02",
      name: "Feriado fictício",
    }),
    alterar: { coluna: "name", valor: "Outro nome" },
    dono: { ler: true, criar: true, alterar: false, apagar: true },
  },
  {
    nome: "bookings",
    pk: "id",
    linha: (c, n) => ({ user_id: c.user, locator: `T${n}`.slice(0, 20), amount_cents: 100000 }),
    alterar: { coluna: "notes", valor: "alterada" },
    dono: tudo,
  },
  {
    nome: "flights",
    pk: "id",
    linha: (c) => ({
      booking_id: c.booking,
      user_id: c.user,
      origin: "SDU",
      destination: "CGH",
      departs_at: "2027-03-01T11:00:00Z",
    }),
    alterar: { coluna: "flight_number", valor: "G31234" },
    dono: tudo,
  },
  {
    nome: "refunds_credits",
    pk: "id",
    linha: (c) => ({ user_id: c.user, kind: "credit", amount_cents: 1000 }),
    alterar: { coluna: "notes", valor: "alterado" },
    dono: tudo,
  },
  {
    nome: "app_config",
    pk: "key",
    linha: (_c, n) => ({ key: `teste_${n}`, value: "valor fictício" }),
    alterar: { coluna: "value", valor: "alterado" },
    dono: nada,
    global: true,
  },
  {
    nome: "telegram_links",
    pk: "user_id",
    linha: (c, n) => ({ user_id: c.user, link_token: `tok-${c.user}-${n}`, chat_id: 1 }),
    alterar: { coluna: "chat_id", valor: 2 },
    dono: { ler: true, criar: false, alterar: false, apagar: true },
    umaPorUsuario: true,
  },
  {
    nome: "push_subscriptions",
    pk: "id",
    linha: (c, n) => ({
      user_id: c.user,
      endpoint: `https://push.example.com/${c.user}/${n}`,
      p256dh: "chave-ficticia",
      auth: "auth-ficticio",
    }),
    alterar: { coluna: "p256dh", valor: "outra" },
    dono: tudo,
  },
  {
    nome: "notification_log",
    pk: "id",
    linha: (c, n) => ({ user_id: c.user, event_key: `teste:${n}`, title: "Aviso fictício" }),
    alterar: { coluna: "title", valor: "alterado" },
    dono: soLer,
  },
  {
    nome: "price_monitors",
    pk: "id",
    linha: (c) => ({
      user_id: c.user,
      kind: "dates",
      origin: "SDU",
      destination: "CGH",
      rule: {},
      target_cents: 25000,
    }),
    alterar: { coluna: "target_cents", valor: 1 },
    dono: tudo,
  },
  {
    nome: "price_checks",
    pk: "id",
    linha: (c) => ({ monitor_id: c.monitor, user_id: c.user, provider: "travelpayouts" }),
    alterar: { coluna: "error", valor: "alterado" },
    dono: soLer,
  },
  {
    nome: "price_observations",
    pk: "id",
    linha: (c) => ({
      monitor_id: c.monitor,
      user_id: c.user,
      flight_date: "2027-03-01",
      departs_local: "08:00",
      airline: "G3",
      price_cents: 30000,
      provider: "travelpayouts",
    }),
    alterar: { coluna: "price_cents", valor: 1 },
    dono: soLer,
  },
  {
    nome: "price_alerts",
    pk: "id",
    linha: (c) => ({
      monitor_id: c.monitor,
      user_id: c.user,
      flight_date: "2027-03-01",
      departs_local: "08:00",
      airline: "G3",
      price_cents: 24000,
    }),
    alterar: { coluna: "price_cents", valor: 1 },
    dono: soLer,
  },
  {
    nome: "mail_accounts",
    pk: "user_id",
    linha: (c) => ({ user_id: c.user, email: "caixa@example.com" }),
    alterar: { coluna: "email", valor: "outra@example.com" },
    dono: soLer,
    umaPorUsuario: true,
  },
  {
    nome: "mail_scans",
    pk: "id",
    // Só uma busca ativa por pessoa (mail_scans_one_active_idx): as novas nascem encerradas.
    linha: (c, n) => ({ user_id: c.user, status: n === "semente" ? "listing" : "cancelled" }),
    alterar: { coluna: "last_error", valor: "alterado" },
    dono: soLer,
  },
  {
    nome: "mail_messages",
    pk: "id",
    linha: (c, n) => ({ user_id: c.user, provider_message_id: `msg-${n}`.slice(0, 64) }),
    alterar: { coluna: "error", valor: "alterado" },
    dono: soLer,
  },
  {
    nome: "import_candidates",
    pk: "id",
    linha: (c) => ({ user_id: c.user, message_id: c.message, draft: {} }),
    alterar: { coluna: "status", valor: "dismissed" },
    dono: soLer,
  },
  {
    nome: "registro_falhas",
    pk: "id",
    linha: () => ({ origem: "teste", mensagem: "Falha fictícia" }),
    alterar: { coluna: "mensagem", valor: "alterada" },
    dono: nada,
    global: true,
  },
  {
    nome: "app_migrations",
    pk: "name",
    linha: (_c, n) => ({ name: `teste_${n}` }),
    alterar: { coluna: "name", valor: "alterado" },
    dono: nada,
    global: true,
  },
];

/** Monta um INSERT parametrizado que devolve a chave da linha. */
export function insert(t: Tabela, linha: Record<string, unknown>): [string, unknown[]] {
  const cols = Object.keys(linha);
  const vals = cols.map((c) => {
    const v = linha[c];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  });
  const sql = `insert into public.${t.nome} (${cols.join(", ")}) values (${cols
    .map((_, i) => `$${i + 1}`)
    .join(", ")}) returning ${t.pk}::text as pk`;
  return [sql, vals];
}

/** Mesma DDL de scripts/supabase-migrate.mjs, que cria esta tabela em produção. */
export const DDL_APP_MIGRATIONS = `create table if not exists public.app_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table public.app_migrations enable row level security;`;
