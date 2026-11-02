-- M5: notificações e agendador. Idempotente.

-- Configuração interna do app (chaves VAPID, segredo do agendador, bot do Telegram).
-- RLS ligado e sem policies: só o service role (servidor) lê e escreve.
create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;

alter table public.profiles
  add column if not exists notify_telegram boolean not null default true,
  add column if not exists notify_push boolean not null default true,
  add column if not exists notify_email boolean not null default false;

create table if not exists public.telegram_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  link_token text unique,
  token_expires_at timestamptz,
  chat_id bigint,
  linked_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.telegram_links enable row level security;
drop policy if exists "telegram_links: dono lê" on public.telegram_links;
create policy "telegram_links: dono lê" on public.telegram_links for select using (auth.uid() = user_id);
drop policy if exists "telegram_links: dono apaga" on public.telegram_links;
create policy "telegram_links: dono apaga" on public.telegram_links for delete using (auth.uid() = user_id);
-- Escrita via servidor (service role): o webhook do Telegram não tem sessão do usuário.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions: dono" on public.push_subscriptions;
create policy "push_subscriptions: dono" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Registro de avisos enviados: evita repetir o mesmo aviso.
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_key text not null,
  title text not null,
  channels text[] not null default '{}',
  sent_at timestamptz not null default now(),
  unique (user_id, event_key)
);
alter table public.notification_log enable row level security;
drop policy if exists "notification_log: dono lê" on public.notification_log;
create policy "notification_log: dono lê" on public.notification_log for select using (auth.uid() = user_id);

create index if not exists notification_log_user_sent_idx on public.notification_log (user_id, sent_at desc);
