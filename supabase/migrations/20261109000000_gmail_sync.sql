-- Bloco 2c: sincronização contínua do Gmail. A cada 30 min o agendador lê o
-- histórico da caixa (history.list) e passa os e-mails novos pelo mesmo
-- pré-filtro e extração. Só com a leitura automática ligada pelo dono
-- (auto_sync), na confirmação da primeira varredura. Idempotente.
alter table public.mail_accounts add column if not exists auto_sync boolean not null default false;
alter table public.mail_accounts add column if not exists last_sync_at timestamptz;

alter table public.mail_scans add column if not exists kind text not null default 'full';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mail_scans_kind_check') then
    alter table public.mail_scans add constraint mail_scans_kind_check check (kind in ('full', 'sync'));
  end if;
end $$;
