-- Estado do esquema, sem dados pessoais (só nomes de objetos e contagens).
-- query_to_xml roda as consultas dinamicamente, então tabelas ausentes não quebram o diagnóstico.
select json_build_object(
  'tabelas', (select json_agg(table_name order by table_name) from information_schema.tables where table_schema = 'public'),
  'colunas_profiles', (select json_agg(column_name order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'profiles'),
  'trigger_novo_usuario', exists (select 1 from pg_trigger where tgname = 'on_auth_user_created'),
  'funcao_handle_new_user', exists (select 1 from pg_proc where proname = 'handle_new_user'),
  'usuarios', (select count(*) from auth.users),
  'perfis', case when to_regclass('public.profiles') is not null
    then (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.profiles', false, true, '')))[1]::text end,
  'migracoes_registradas', case when to_regclass('public.app_migrations') is not null
    then (xpath('/row/n/text()', query_to_xml('select string_agg(name, '','' order by name) as n from public.app_migrations', false, true, '')))[1]::text end
) as estado;
