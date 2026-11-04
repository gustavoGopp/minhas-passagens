-- Uso de tabelas e índices do schema public, sem dados pessoais: linhas vivas
-- (contagem real das estatísticas, mais confiável que reltuples), leituras
-- sequenciais × por índice e índices nunca usados desde o último reset.
select json_build_object(
  'tabelas', (
    select json_agg(r order by r.tabela) from (
      select relname as tabela, n_live_tup as linhas, seq_scan, idx_scan,
        n_tup_ins as inseridas, n_tup_del as apagadas, last_autoanalyze::date as ultimo_analyze
      from pg_stat_user_tables where schemaname = 'public'
    ) r
  ),
  'indices_sem_uso', (
    select coalesce(json_agg(r order by r.indice), '[]'::json) from (
      select indexrelname as indice, relname as tabela,
        pg_size_pretty(pg_relation_size(indexrelid)) as tamanho
      from pg_stat_user_indexes
      where schemaname = 'public' and idx_scan = 0
    ) r
  ),
  'stats_desde', (select stats_reset from pg_stat_database where datname = current_database())
) as indices;
