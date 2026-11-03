-- Bloco 2a: conectar o Gmail (só leitura). O refresh token fica cifrado em
-- user_integrations (provider 'gmail', BYOK v2 com AAD); aqui ficam o estado da
-- conexão e a base da sincronização. Sem corpo nem assunto de e-mail. Idempotente.

alter table public.user_integrations drop constraint if exists user_integrations_provider_check;
alter table public.user_integrations add constraint user_integrations_provider_check
  check (provider in ('anthropic', 'travelpayouts', 'duffel', 'serpapi', 'resend', 'gmail'));

create table if not exists public.mail_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null default 'gmail' check (provider in ('gmail')),
  email text check (char_length(email) <= 320),
  history_id text check (char_length(history_id) <= 40),
  status text not null default 'active' check (status in ('active', 'expired')),
  connected_at timestamptz not null default now(),
  last_refresh_ok_at timestamptz,
  last_error text check (char_length(last_error) <= 300),
  updated_at timestamptz not null default now()
);

alter table public.mail_accounts enable row level security;

-- O dono só lê; quem grava é o servidor (callback do OAuth e agendador).
drop policy if exists "mail_accounts: dono lê" on public.mail_accounts;
create policy "mail_accounts: dono lê" on public.mail_accounts
  for select using (auth.uid() = user_id);

drop trigger if exists mail_accounts_set_updated_at on public.mail_accounts;
create trigger mail_accounts_set_updated_at
  before update on public.mail_accounts
  for each row execute function public.set_updated_at();
