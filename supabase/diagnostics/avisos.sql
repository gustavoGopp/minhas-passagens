-- Avisos registrados por tipo e canal, sem dados pessoais: só o prefixo da chave
-- do evento (ex.: long-weekend, holiday-monitor), canais e contagens.
select coalesce(json_agg(r order by r.tipo, r.canais), '[]'::json) as avisos from (
  select split_part(event_key, ':', 1) as tipo,
    case when channels = '{}' then 'nenhum' else array_to_string(channels, '+') end as canais,
    count(*) as quantidade,
    max(sent_at)::date as ultimo
  from public.notification_log
  group by 1, 2
) r;
