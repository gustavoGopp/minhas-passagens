-- Uso aproximado do banco (plano Free: 500 MB) e saúde do agendador, sem dados
-- pessoais: só tamanhos, contagens aproximadas de linhas e minutos desde o último tick.
select json_build_object(
  'banco_mb', round(pg_database_size(current_database()) / 1048576.0, 1),
  'limite_free_mb', 500,
  'pct_do_limite', round(100.0 * pg_database_size(current_database()) / (500 * 1048576.0), 1),
  'ultimo_tick_min', (
    select round(extract(epoch from now() - value::timestamptz) / 60)
    from public.app_config where key = 'last_tick_at'
  ),
  'retencao_ultima', (select value from public.app_config where key = 'retention_last_run'),
  'tabelas', (
    select json_agg(t order by t.mb desc) from (
      select n.nspname || '.' || c.relname as tabela,
        round(pg_total_relation_size(c.oid) / 1048576.0, 2) as mb,
        greatest(c.reltuples, 0)::bigint as linhas_aprox
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname in ('public', 'auth', 'storage', 'cron', 'net')
      order by pg_total_relation_size(c.oid) desc
      limit 20
    ) t
  ),
  'observacoes_mais_antiga_dias', (
    select round(extract(epoch from now() - min(observed_at)) / 86400)
    from public.price_observations
  )
) as uso;
