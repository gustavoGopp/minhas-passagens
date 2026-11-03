-- Conexões do Gmail, sem dados pessoais: só contagens por status, dias desde a
-- conexão e desde a última renovação do acesso (o teste dos 8 dias) e o tipo do
-- último erro técnico (código do OAuth, sem e-mail nem token).
select coalesce(json_agg(r order by r.status), '[]'::json) as gmail from (
  select status,
    count(*) as contas,
    max(round(extract(epoch from now() - connected_at) / 86400, 1)) as dias_desde_conexao,
    max(round(extract(epoch from now() - last_refresh_ok_at) / 3600, 1)) as horas_desde_renovacao_ok,
    string_agg(distinct regexp_replace(coalesce(last_error, ''), '[^a-z_ :0-9]', '', 'gi'), ', ') as erros
  from public.mail_accounts
  group by status
) r;
