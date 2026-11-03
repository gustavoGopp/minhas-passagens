-- Bloco 0 da revisão de 2026-11: avisos só contam como enviados se algum canal
-- entregou; falhas são tentadas de novo com espera crescente; fuso inválido no
-- perfil não pode mais derrubar o agendador. Idempotente.

-- 1. Tentativas por aviso (notification_log: um registro por evento).
alter table public.notification_log add column if not exists status text not null default 'sent';
alter table public.notification_log add column if not exists attempts int not null default 1;
alter table public.notification_log add column if not exists last_error text;
alter table public.notification_log add column if not exists last_attempt_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notification_log_status_check') then
    alter table public.notification_log
      add constraint notification_log_status_check check (status in ('sent', 'failed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notification_log_last_error_len') then
    alter table public.notification_log
      add constraint notification_log_last_error_len check (char_length(last_error) <= 300);
  end if;
end $$;

-- 2. Tentativas dos avisos de preço.
alter table public.price_alerts add column if not exists attempts int not null default 0;
alter table public.price_alerts add column if not exists last_error text;
alter table public.price_alerts add column if not exists last_attempt_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'price_alerts_last_error_len') then
    alter table public.price_alerts
      add constraint price_alerts_last_error_len check (char_length(last_error) <= 300);
  end if;
end $$;

-- 3. Avisos registrados sem nenhum canal (regra antiga): saem do registro para
-- voltarem a ser avaliados. Só são enviados se ainda valerem e houver canal.
delete from public.notification_log where channels = '{}' and status = 'sent';

-- 4. Fuso do perfil: só nomes da base IANA do Postgres (os mesmos do Intl).
create or replace function public.is_valid_timezone(tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

update public.profiles
set timezone = 'America/Sao_Paulo'
where not public.is_valid_timezone(timezone);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_timezone_valid') then
    alter table public.profiles
      add constraint profiles_timezone_valid check (public.is_valid_timezone(timezone));
  end if;
end $$;
