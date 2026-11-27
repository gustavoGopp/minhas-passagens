-- Proteção de acesso por linha (RLS) ligada sozinha em toda tabela nova do schema
-- public (pesquisa 7.1). Hoje as 18 tabelas têm a proteção por disciplina; uma
-- tabela criada sem ela ficaria aberta para qualquer usuário logado com GRANT.
-- Com o gatilho, a tabela nasce fechada: sem policy, ninguém além do servidor
-- lê ou grava. A CI também confere o catálogo (tests/banco/regras-de-acesso.test.ts).
--
-- A função roda com o poder de quem cria a tabela (não é SECURITY DEFINER): o
-- criador é dono da tabela e pode ligar a proteção. Ninguém a chama pela API.
-- Idempotente: recria a função e o gatilho.
create or replace function public.ligar_rls_em_tabela_nova()
returns event_trigger
language plpgsql
set search_path = ''
as $$
declare
  obj record;
begin
  for obj in
    select object_identity
    from pg_event_trigger_ddl_commands()
    where object_type in ('table', 'partitioned table')
      and schema_name = 'public'
      and command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  loop
    execute format('alter table %s enable row level security', obj.object_identity);
  end loop;
end $$;

revoke all on function public.ligar_rls_em_tabela_nova() from public, anon, authenticated;

drop event trigger if exists ligar_rls_em_tabela_nova;
create event trigger ligar_rls_em_tabela_nova
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.ligar_rls_em_tabela_nova();
