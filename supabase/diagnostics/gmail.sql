-- Conexões e importação do Gmail, sem dados pessoais: só contagens por status,
-- dias desde a conexão e desde a última renovação do acesso (o teste dos 8 dias),
-- leitura automática e última sincronização, tipo do último erro técnico (sem
-- e-mail nem token) e a situação das varreduras e dos e-mails (só contagens).
select json_build_object(
  'contas', (
    select coalesce(json_agg(r order by r.status), '[]'::json) from (
      select status, auto_sync,
        count(*) as contas,
        max(round(extract(epoch from now() - connected_at) / 86400, 1)) as dias_desde_conexao,
        max(round(extract(epoch from now() - last_refresh_ok_at) / 3600, 1)) as horas_desde_renovacao_ok,
        max(round(extract(epoch from now() - last_sync_at) / 60)) as minutos_desde_sincronizacao,
        string_agg(distinct regexp_replace(coalesce(last_error, ''), '[^a-z_ :0-9]', '', 'gi'), ', ') as erros
      from public.mail_accounts
      group by status, auto_sync
    ) r
  ),
  'varreduras', (
    select coalesce(json_agg(r), '[]'::json) from (
      select kind, status, count(*) as quantidade, max(created_at)::date as ultima
      from public.mail_scans group by kind, status
    ) r
  ),
  'emails', (
    select coalesce(json_agg(r), '[]'::json) from (
      select status, count(*) as quantidade from public.mail_messages group by status
    ) r
  ),
  'candidatos', (
    select coalesce(json_agg(r), '[]'::json) from (
      select status, count(*) as quantidade from public.import_candidates group by status
    ) r
  )
) as gmail;
