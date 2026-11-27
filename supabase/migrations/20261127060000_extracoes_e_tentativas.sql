-- Leitura com IA: consumo real, teto diário e tentativas por e-mail (P25, etapa 3).
--
-- 1) extracoes: uma linha por chamada à API da Anthropic, com os tokens que a
--    própria API informou. Serve para mostrar o gasto real ao lado do estimado e
--    para contar o teto diário (30 leituras na leitura automática e no envio de
--    print, PDF ou texto; a busca completa confirmada pelo dono fica fora).
--    Nada do conteúdo do e-mail entra aqui: só modelo, contagens e resultado.
--    Regra de acesso (docs/regras-de-acesso.md): A só lê as próprias linhas; só o
--    servidor grava. Assim ninguém apaga o próprio registro para fugir do teto.
--    Guardado por 400 dias (limpeza na rotina diária do agendador).
--
-- 2) mail_messages.attempts: quantas vezes a IA foi chamada para o e-mail. A
--    leitura interrompida no meio volta para a fila no máximo até a 3ª tentativa;
--    depois vira erro e não é cobrada de novo.
--
-- Só acrescenta: o app anterior não lê nem grava nada disto e continua funcionando.

create table if not exists public.extracoes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now(),
  -- automatica: leitura do Gmail sem confirmação; varredura: busca completa que o
  -- dono confirmou vendo o custo; envio: print, PDF ou texto na tela de passagem nova.
  origem text not null check (origem in ('automatica', 'varredura', 'envio')),
  modelo text not null check (char_length(modelo) between 1 and 100),
  reforco boolean not null default false,
  resultado text not null check (resultado in ('ok', 'vazio', 'invalido', 'erro')),
  motivo_parada text check (char_length(motivo_parada) <= 40),
  tokens_entrada integer not null default 0 check (tokens_entrada >= 0),
  tokens_saida integer not null default 0 check (tokens_saida >= 0),
  tokens_cache_leitura integer not null default 0 check (tokens_cache_leitura >= 0),
  tokens_cache_escrita integer not null default 0 check (tokens_cache_escrita >= 0)
);

create index if not exists extracoes_user_criado_idx on public.extracoes (user_id, criado_em);

alter table public.extracoes enable row level security;

drop policy if exists "extracoes: dono lê" on public.extracoes;
create policy "extracoes: dono lê" on public.extracoes
  for select using (auth.uid() = user_id);

-- Concessões escritas por inteiro (mesmo resultado na primeira e na segunda aplicação).
revoke all on public.extracoes from public, anon, authenticated, service_role;
grant select on public.extracoes to authenticated;
grant select, insert, delete on public.extracoes to service_role;
revoke all on sequence public.extracoes_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.extracoes_id_seq to service_role;

alter table public.mail_messages
  add column if not exists attempts integer not null default 0 check (attempts >= 0);
