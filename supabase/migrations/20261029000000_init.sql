-- minhas-passagens — migração inicial (M1)
-- Idempotente: pode ser reaplicada sem erro (o banco pode ter sido criado à mão antes do runner).
-- Perfis, integrações por usuário (chaves cifradas) e RLS.

create extension if not exists "pgcrypto";

-- Função genérica para manter updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: 1 linha por usuário de auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  timezone text not null default 'America/Sao_Paulo',
  uf char(2),
  city_ibge text,
  quiet_hours_start time not null default '23:00',
  quiet_hours_end time not null default '07:00',
  original_retention_days integer not null default 30 check (original_retention_days between 0 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: dono lê" on public.profiles;
create policy "profiles: dono lê" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles: dono atualiza" on public.profiles;
create policy "profiles: dono atualiza" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
-- insert é feito pelo trigger abaixo (security definer); delete acontece em cascata ao apagar o usuário.

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Cria o perfil automaticamente no primeiro login.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- user_integrations: chaves de API próprias de cada usuário (BYOK), cifradas
-- no servidor com AES-256-GCM. A coluna encrypted_key nunca vai ao cliente:
-- só Server Actions/route handlers a leem.
-- ---------------------------------------------------------------------------
create table if not exists public.user_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'travelpayouts', 'duffel', 'serpapi')),
  encrypted_key text not null,
  key_hint text not null,
  status text not null default 'active' check (status in ('active', 'invalid')),
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.user_integrations enable row level security;

drop policy if exists "integrations: dono lê" on public.user_integrations;
create policy "integrations: dono lê" on public.user_integrations
  for select using (auth.uid() = user_id);
drop policy if exists "integrations: dono insere" on public.user_integrations;
create policy "integrations: dono insere" on public.user_integrations
  for insert with check (auth.uid() = user_id);
drop policy if exists "integrations: dono atualiza" on public.user_integrations;
create policy "integrations: dono atualiza" on public.user_integrations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "integrations: dono apaga" on public.user_integrations;
create policy "integrations: dono apaga" on public.user_integrations
  for delete using (auth.uid() = user_id);

drop trigger if exists user_integrations_set_updated_at on public.user_integrations;
create trigger user_integrations_set_updated_at
  before update on public.user_integrations
  for each row execute function public.set_updated_at();

create index if not exists user_integrations_user_id_idx on public.user_integrations (user_id);

-- Garante perfil para usuários que entraram antes desta migração existir.
insert into public.profiles (id, email, display_name)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
from auth.users u
on conflict (id) do nothing;
