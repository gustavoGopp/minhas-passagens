-- M2 — preferências de feriados e feriados próprios do usuário.

alter table public.profiles
  add column holiday_city text,
  add column show_optional_holidays boolean not null default true,
  add column show_christian_holidays boolean not null default false,
  add column show_jewish_holidays boolean not null default false,
  add column jewish_israel boolean not null default false;

comment on column public.profiles.holiday_city is 'Código UF-CIDADE da semente de feriados municipais (ex.: SP-SP)';

-- Ajustes do usuário sobre o calendário: adicionar um feriado próprio
-- (ex.: municipal fora da semente) ou esconder um evento calculado.
create table public.holiday_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('add', 'hide')),
  date date not null,
  event_key text,
  name text check (char_length(name) <= 120),
  kind text check (kind in ('holiday', 'optional', 'observance')),
  created_at timestamptz not null default now(),
  check (action = 'hide' or name is not null)
);

alter table public.holiday_overrides enable row level security;

create policy "holiday_overrides: dono lê" on public.holiday_overrides
  for select using (auth.uid() = user_id);
create policy "holiday_overrides: dono insere" on public.holiday_overrides
  for insert with check (auth.uid() = user_id);
create policy "holiday_overrides: dono apaga" on public.holiday_overrides
  for delete using (auth.uid() = user_id);

create index holiday_overrides_user_date_idx on public.holiday_overrides (user_id, date);
