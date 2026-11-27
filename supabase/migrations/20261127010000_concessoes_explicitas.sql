-- Concessões de acesso explícitas. O Supabase está deixando de conceder acesso
-- automático a tabelas novas do schema public: sem GRANT, uma tabela com policy
-- responde "permission denied" ao usuário logado, o que parece falha de RLS.
-- Até aqui nenhuma migração concedia acesso; todas dependiam do padrão antigo.
--
-- Regra: tabela com RLS ligado e pelo menos uma policy é tabela do usuário e
-- recebe select/insert/update/delete para "authenticated". Quem decide o que
-- cada pessoa vê e altera continuam sendo as policies (a concessão só deixa a
-- consulta chegar até elas). Tabelas sem policy (app_config, app_migrations)
-- ficam só com o servidor. Idempotente: conceder de novo não muda nada.
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
      and exists (select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname)
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t.relname);
  end loop;
end $$;

grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
