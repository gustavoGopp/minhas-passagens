-- Concessões de acesso (GRANT) das tabelas do schema public, sem dados pessoais:
-- só nomes de tabelas, de papéis e sim/não. O Supabase está deixando de conceder
-- acesso automático a tabelas novas; uma tabela com policy e sem concessão ao
-- papel "authenticated" responde "permission denied" ao usuário logado, o que
-- parece falha de RLS. A lista "com_policy_sem_acesso" deve vir vazia.
select json_build_object(
  'tabelas', (
    select json_agg(t order by t.tabela) from (
      select c.relname as tabela,
        has_table_privilege('authenticated', c.oid, 'select') as logado_le,
        has_table_privilege('authenticated', c.oid, 'insert') as logado_insere,
        has_table_privilege('authenticated', c.oid, 'update') as logado_altera,
        has_table_privilege('authenticated', c.oid, 'delete') as logado_apaga,
        has_table_privilege('anon', c.oid, 'select') as visitante_le,
        has_table_privilege('service_role', c.oid, 'select') as servidor_le,
        c.relrowsecurity as rls,
        (select count(*) from pg_policies p
          where p.schemaname = 'public' and p.tablename = c.relname) as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
    ) t
  ),
  'com_policy_sem_acesso', (
    select coalesce(json_agg(c.relname order by c.relname), '[]'::json)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and exists (select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname)
      and not has_table_privilege('authenticated', c.oid, 'select')
  ),
  'sem_acesso_do_servidor', (
    select coalesce(json_agg(c.relname order by c.relname), '[]'::json)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and not has_table_privilege('service_role', c.oid, 'select')
  ),
  'privilegios_padrao_do_schema', (
    select coalesce(json_agg(json_build_object(
      'dono', pg_get_userbyid(d.defaclrole),
      'tipo', d.defaclobjtype,
      'concessoes', d.defaclacl::text)), '[]'::json)
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    where n.nspname = 'public'
  )
) as grants;
