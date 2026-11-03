-- Bloco 1: piloto híbrido. As datas das próximas 2 semanas também são buscadas
-- na SerpApi (Google Flights, cota grátis) e a cobertura dos dois provedores fica
-- registrada nas mesmas datas, para comparar. Idempotente.
alter table public.price_checks add column if not exists near_provider text;
alter table public.price_checks add column if not exists near_dates int not null default 0;
alter table public.price_checks add column if not exists near_with_data int not null default 0;
alter table public.price_checks add column if not exists near_in_window int not null default 0;
alter table public.price_checks add column if not exists near_requests int not null default 0;
alter table public.price_checks add column if not exists near_tp_with_data int not null default 0;
alter table public.price_checks add column if not exists near_tp_in_window int not null default 0;
alter table public.price_checks add column if not exists near_skipped text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'price_checks_near_skipped_len') then
    alter table public.price_checks
      add constraint price_checks_near_skipped_len check (char_length(near_skipped) <= 80);
  end if;
end $$;

-- Contagem das buscas do mês por usuário e provedor (cota da SerpApi).
create index if not exists price_checks_user_near_idx
  on public.price_checks (user_id, near_provider, checked_at)
  where near_provider is not null;
