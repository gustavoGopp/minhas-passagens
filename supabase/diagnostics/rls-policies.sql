-- RLS e policies de todas as tabelas, sem dados pessoais: só nomes de objetos e
-- contagens. Mostra também os buckets do Storage, as policies do Storage e se cada
-- tabela com user_id é apagada em cascata junto com auth.users (apagar a conta).
select json_build_object(
  'tabelas', (
    select json_agg(t order by t.tabela) from (
      select c.relname as tabela,
        c.relrowsecurity as rls,
        c.relforcerowsecurity as rls_forcado,
        (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
        (select string_agg(distinct p.cmd, ',' order by p.cmd) from pg_policies p
          where p.schemaname = 'public' and p.tablename = c.relname) as comandos,
        exists (select 1 from information_schema.columns ic
          where ic.table_schema = 'public' and ic.table_name = c.relname and ic.column_name = 'user_id') as tem_user_id,
        (select string_agg(distinct case con.confdeltype when 'c' then 'cascade' when 'n' then 'set null'
            when 'r' then 'restrict' when 'a' then 'no action' else con.confdeltype::text end, ',')
          from pg_constraint con
          where con.conrelid = c.oid and con.contype = 'f' and con.confrelid = 'auth.users'::regclass) as fk_auth_users
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
    ) t
  ),
  'sem_rls', (
    select coalesce(json_agg(c.relname order by c.relname), '[]'::json)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  ),
  'grants_anon_authenticated', (
    select json_agg(g order by g.tabela) from (
      select table_name as tabela, grantee, string_agg(privilege_type, ',' order by privilege_type) as privilegios
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
      group by table_name, grantee
    ) g
  ),
  'storage_buckets', (
    select coalesce(json_agg(json_build_object('bucket', id, 'publico', public,
      'limite_bytes', file_size_limit) order by id), '[]'::json)
    from storage.buckets
  ),
  'storage_policies', (
    select coalesce(json_agg(json_build_object('nome', policyname, 'comando', cmd) order by policyname), '[]'::json)
    from pg_policies where schemaname = 'storage'
  )
) as rls;
