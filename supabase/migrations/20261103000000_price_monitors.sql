-- M6: monitor de preços. Idempotente.

create table if not exists public.price_monitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text check (char_length(name) <= 80),
  kind text not null check (kind in ('weekly', 'dates', 'holiday')),
  origin char(3) not null,
  destination char(3) not null,
  -- weekly: {"kind":"weekly","slots":[{"weekday":1,"from":"00:00","to":"08:00"}]}
  -- dates: {"kind":"dates","ranges":[{"start":"2026-12-20","end":"2026-12-22","from":"06:00","to":"12:00"}]}
  -- holiday: {"kind":"holiday","leg":"outbound","window":{"from":"17:00","to":"23:59"}}
  rule jsonb not null,
  horizon_weeks int not null default 8 check (horizon_weeks between 1 and 52),
  target_cents bigint not null check (target_cents > 0),
  margin_cents bigint check (margin_cents >= 0),
  margin_pct numeric(5, 2) check (margin_pct between 0 and 100),
  airlines text[] not null default '{}',
  allow_connections boolean not null default false,
  max_duration_min int check (max_duration_min > 0),
  frequency text not null default 'daily' check (frequency in ('daily', 'twice_daily', 'weekly')),
  provider text not null default 'travelpayouts' check (provider in ('travelpayouts', 'duffel', 'serpapi')),
  active boolean not null default true,
  next_check_at timestamptz,
  last_checked_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (origin <> destination)
);

alter table public.price_monitors enable row level security;
drop policy if exists "price_monitors: dono" on public.price_monitors;
create policy "price_monitors: dono" on public.price_monitors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists price_monitors_set_updated_at on public.price_monitors;
create trigger price_monitors_set_updated_at
  before update on public.price_monitors
  for each row execute function public.set_updated_at();

create index if not exists price_monitors_user_idx on public.price_monitors (user_id, created_at);
create index if not exists price_monitors_due_idx on public.price_monitors (next_check_at) where active;

-- Uma linha por checagem: cobertura do provedor e menor preço (base da tendência e do piloto).
create table if not exists public.price_checks (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.price_monitors (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  checked_at timestamptz not null default now(),
  target_dates int not null default 0,
  dates_with_data int not null default 0,
  dates_in_window int not null default 0,
  dates_matched int not null default 0,
  requests int not null default 0,
  failed int not null default 0,
  min_price_cents bigint,
  error text check (char_length(error) <= 500)
);
alter table public.price_checks enable row level security;
drop policy if exists "price_checks: dono" on public.price_checks;
create policy "price_checks: dono" on public.price_checks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists price_checks_monitor_idx on public.price_checks (monitor_id, checked_at desc);

create table if not exists public.price_observations (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.price_monitors (id) on delete cascade,
  check_id uuid references public.price_checks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  flight_date date not null,
  -- Hora local da partida no aeroporto de origem, "YYYY-MM-DDTHH:MM".
  departs_local text not null,
  airline text not null,
  flight_number text,
  price_cents bigint not null check (price_cents >= 0),
  currency char(3) not null default 'BRL',
  transfers int not null default 0,
  duration_min int,
  provider text not null,
  found_at timestamptz,
  observed_at timestamptz not null default now(),
  -- Perto de feriado: fica fora da média de 30 dias.
  near_holiday boolean not null default false
);
alter table public.price_observations enable row level security;
drop policy if exists "price_observations: dono" on public.price_observations;
create policy "price_observations: dono" on public.price_observations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists price_observations_monitor_idx
  on public.price_observations (monitor_id, observed_at desc);
create index if not exists price_observations_date_idx
  on public.price_observations (monitor_id, flight_date);

-- Avisos de preço: um por data e queda relevante; envio adiado na janela silenciosa.
create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.price_monitors (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  flight_date date not null,
  departs_local text not null,
  airline text not null,
  flight_number text,
  price_cents bigint not null,
  signals text[] not null default '{}',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  channels text[] not null default '{}'
);
alter table public.price_alerts enable row level security;
drop policy if exists "price_alerts: dono" on public.price_alerts;
create policy "price_alerts: dono" on public.price_alerts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists price_alerts_monitor_idx on public.price_alerts (monitor_id, flight_date, created_at desc);
create index if not exists price_alerts_pending_idx on public.price_alerts (created_at) where sent_at is null;
