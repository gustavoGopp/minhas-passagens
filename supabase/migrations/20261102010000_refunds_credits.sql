-- M4: reembolsos em dinheiro e créditos/vouchers com validade. Idempotente.

create table if not exists public.refunds_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  kind text not null check (kind in ('refund', 'credit')),
  provider text check (char_length(provider) <= 80),
  amount_cents bigint not null check (amount_cents >= 0),
  remaining_cents bigint check (remaining_cents >= 0),
  currency char(3) not null default 'BRL',
  issued_on date not null default current_date,
  expires_on date,
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.refunds_credits enable row level security;

drop policy if exists "refunds_credits: dono" on public.refunds_credits;
create policy "refunds_credits: dono" on public.refunds_credits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists refunds_credits_set_updated_at on public.refunds_credits;
create trigger refunds_credits_set_updated_at
  before update on public.refunds_credits
  for each row execute function public.set_updated_at();

create index if not exists refunds_credits_user_idx on public.refunds_credits (user_id, expires_on);
