-- Bloco 2b: varredura do Gmail, revisão em lote e importação. Guarda só
-- metadados (id da mensagem, data, domínio do remetente, tipo e estado), nunca
-- assunto nem corpo. Os candidatos guardam o rascunho extraído até a decisão e
-- são apagados 30 dias depois dela. Idempotente.

create table if not exists public.mail_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'listing' check (
    status in ('listing', 'filtering', 'awaiting_confirmation', 'processing', 'review', 'cancelled', 'error')
  ),
  query_index int not null default 0,
  page_token text check (char_length(page_token) <= 200),
  last_error text check (char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists mail_scans_one_active_idx on public.mail_scans (user_id)
  where status in ('listing', 'filtering', 'awaiting_confirmation', 'processing');
create index if not exists mail_scans_user_idx on public.mail_scans (user_id, created_at desc);

create table if not exists public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scan_id uuid references public.mail_scans (id) on delete set null,
  provider_message_id text not null check (char_length(provider_message_id) <= 64),
  received_at timestamptz,
  sender_domain text check (char_length(sender_domain) <= 255),
  class text check (class in ('confirmation', 'change', 'cancellation', 'checkin', 'credit', 'other')),
  status text not null default 'listed' check (
    status in ('listed', 'skipped', 'candidate', 'processing', 'extracted', 'not_booking', 'error')
  ),
  error text check (char_length(error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_message_id)
);
create index if not exists mail_messages_scan_status_idx on public.mail_messages (scan_id, status);

create table if not exists public.import_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  message_id uuid not null references public.mail_messages (id) on delete cascade,
  received_at timestamptz,
  draft jsonb not null check (jsonb_typeof(draft) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'imported', 'dismissed')),
  booking_id uuid references public.bookings (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists import_candidates_user_status_idx on public.import_candidates (user_id, status);

alter table public.mail_scans enable row level security;
alter table public.mail_messages enable row level security;
alter table public.import_candidates enable row level security;

-- O dono só lê; quem grava é o servidor (ações e agendador), sempre filtrando pelo usuário.
drop policy if exists "mail_scans: dono lê" on public.mail_scans;
create policy "mail_scans: dono lê" on public.mail_scans for select using (auth.uid() = user_id);
drop policy if exists "mail_messages: dono lê" on public.mail_messages;
create policy "mail_messages: dono lê" on public.mail_messages for select using (auth.uid() = user_id);
drop policy if exists "import_candidates: dono lê" on public.import_candidates;
create policy "import_candidates: dono lê" on public.import_candidates
  for select using (auth.uid() = user_id);

drop trigger if exists mail_scans_set_updated_at on public.mail_scans;
create trigger mail_scans_set_updated_at
  before update on public.mail_scans
  for each row execute function public.set_updated_at();
drop trigger if exists mail_messages_set_updated_at on public.mail_messages;
create trigger mail_messages_set_updated_at
  before update on public.mail_messages
  for each row execute function public.set_updated_at();
