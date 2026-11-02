-- MVP de passagens: compras (bookings) e trechos (flights), com RLS.
-- Idempotente.

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  locator text check (char_length(locator) <= 20),
  airline text not null default 'OTHER' check (char_length(airline) <= 10),
  seller text check (char_length(seller) <= 80),
  channel text not null default 'airline' check (channel in ('airline', 'agency', 'miles', 'corporate')),
  amount_cents bigint check (amount_cents >= 0),
  currency char(3) not null default 'BRL',
  miles integer check (miles >= 0),
  taxes_cents bigint check (taxes_cents >= 0),
  purchased_on date,
  tag text not null default 'personal' check (tag in ('personal', 'work')),
  status text not null default 'active' check (status in ('active', 'cancelled', 'rebooked')),
  source text not null default 'manual' check (source in ('manual', 'text', 'image', 'email')),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flights (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  airline text not null default 'OTHER' check (char_length(airline) <= 10),
  flight_number text check (char_length(flight_number) <= 10),
  origin char(3) not null,
  destination char(3) not null,
  departs_at timestamptz not null,
  arrives_at timestamptz,
  passenger text check (char_length(passenger) <= 120),
  checkin_done boolean not null default false,
  ignore_missing_leg boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bookings enable row level security;
alter table public.flights enable row level security;

drop policy if exists "bookings: dono" on public.bookings;
create policy "bookings: dono" on public.bookings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "flights: dono" on public.flights;
create policy "flights: dono" on public.flights
  for all using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = auth.uid())
  );

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

drop trigger if exists flights_set_updated_at on public.flights;
create trigger flights_set_updated_at
  before update on public.flights
  for each row execute function public.set_updated_at();

create index if not exists bookings_user_purchased_idx on public.bookings (user_id, purchased_on);
create index if not exists flights_user_departs_idx on public.flights (user_id, departs_at);
create index if not exists flights_booking_idx on public.flights (booking_id);
