-- Saúde do agendador, sem dados pessoais e SEM segredos: a coluna cron.job.command
-- (que contém o Bearer do agendador) e return_message nunca são lidas. Mostra os
-- jobs do pg_cron, as execuções e as respostas HTTP do pg_net (o pg_net guarda só
-- as últimas horas) e os totais que o /api/jobs/tick devolveu.
select json_build_object(
  'jobs', (
    select coalesce(json_agg(json_build_object('nome', jobname, 'agenda', schedule, 'ativo', active)
      order by jobname), '[]'::json)
    from cron.job
  ),
  'execucoes_24h', (
    select coalesce(json_agg(r order by r.status), '[]'::json) from (
      select status, count(*) as quantidade, max(start_time) as ultima,
        round(avg(extract(epoch from end_time - start_time))::numeric, 2) as seg_medio
      from cron.job_run_details
      where start_time > now() - interval '24 hours'
      group by status
    ) r
  ),
  'http_respostas', (
    select coalesce(json_agg(r order by r.status_code nulls first), '[]'::json) from (
      select status_code, timed_out, count(*) as quantidade,
        min(created) as primeira, max(created) as ultima
      from net._http_response
      group by status_code, timed_out
    ) r
  ),
  'tick_totais', (
    select json_build_object(
      'respostas_json', count(*),
      'avisos_enviados', sum(nullif(content::jsonb ->> 'sent', '')::int),
      'avisos_adiados', sum(nullif(content::jsonb ->> 'deferred', '')::int),
      'precos_checados', sum(nullif(content::jsonb -> 'prices' ->> 'checked', '')::int),
      'precos_falhas', sum(nullif(content::jsonb -> 'prices' ->> 'failed', '')::int),
      'ticks_com_erro_precos', count(*) filter (where content::jsonb -> 'prices' ? 'error'),
      'ticks_com_erro_retencao', count(*) filter (where content::jsonb -> 'retention' ? 'error')
    )
    from net._http_response
    where status_code = 200 and content_type like 'application/json%' and content like '{"ok":true%'
  ),
  'config', (
    select json_build_object(
      'ultimo_tick_min', (select round(extract(epoch from now() - value::timestamptz) / 60)
        from public.app_config where key = 'last_tick_at'),
      'vigia_ultima_reconciliacao', (select value from public.app_config where key = 'watchdog_run_at'),
      'vigia_ultimo_email', (select value from public.app_config where key = 'watchdog_alert_at'),
      'chaves_config', (select json_agg(key order by key) from public.app_config)
    )
  )
) as agendador;
