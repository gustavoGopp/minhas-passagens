-- Calendário assinado (.ics, item 2): um link secreto por usuário, que o Google
-- Agenda ou o iPhone relê sozinho. O banco guarda só o sha256 do token (o link
-- aparece uma vez, logo depois de gerado). Trocar o link sobrescreve o hash e o
-- antigo para de funcionar. Idempotente.
create table if not exists public.calendar_feeds (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_fetched_at timestamptz
);

alter table public.calendar_feeds enable row level security;

-- O dono só lê (quando foi criado, última leitura) e apaga (desligar).
-- Criar e trocar o link e marcar a leitura passam pelo servidor (service role),
-- como em telegram_links: a rota do calendário não tem sessão do usuário.
drop policy if exists "calendar_feeds: dono lê" on public.calendar_feeds;
create policy "calendar_feeds: dono lê" on public.calendar_feeds
  for select using (auth.uid() = user_id);
drop policy if exists "calendar_feeds: dono apaga" on public.calendar_feeds;
create policy "calendar_feeds: dono apaga" on public.calendar_feeds
  for delete using (auth.uid() = user_id);
