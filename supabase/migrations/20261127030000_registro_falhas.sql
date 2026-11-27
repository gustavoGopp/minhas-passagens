-- Registro de falhas do servidor (P23, decisão do dono de 27/11: só no banco, com
-- resumo no e-mail do vigia diário). O registro gratuito da Vercel some em 1 hora;
-- aqui a falha fica 30 dias (limpeza na rotina diária do agendador).
--
-- Regra de acesso aprovada em 27/11: ninguém lê nem grava, nem logado; só o servidor.
-- Por isso: proteção por linha ligada, nenhuma policy e nenhum grant a anon ou
-- authenticated. Sem coluna de usuário: a mensagem é cortada no app e serve para
-- diagnóstico, não para rastrear pessoas.
create table if not exists public.registro_falhas (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  -- De onde veio: "agendador:precos", "acao:importar", "requisicao:/api/...".
  origem text not null check (char_length(origem) between 1 and 120),
  mensagem text not null check (char_length(mensagem) between 1 and 500)
);

alter table public.registro_falhas enable row level security;

-- Concessões escritas por inteiro: o padrão do Supabase e a migração
-- 20261127010000 (se rodar de novo) concedem mais do que isto. Assim o resultado
-- é o mesmo na primeira e na segunda aplicação.
revoke all on public.registro_falhas from public, anon, authenticated, service_role;
grant select, insert, delete on public.registro_falhas to service_role;
revoke all on sequence public.registro_falhas_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.registro_falhas_id_seq to service_role;

create index if not exists registro_falhas_criado_em_idx on public.registro_falhas (criado_em);
