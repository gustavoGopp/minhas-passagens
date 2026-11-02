-- Piloto do monitor de preços (M6), sem dados pessoais: só cobertura agregada
-- por provedor e rota nos últimos 7 dias (contagens e percentuais).
select case when to_regclass('public.price_checks') is null then '[]'::json else (
  select coalesce(json_agg(r order by r.rota), '[]'::json) from (
    select
      c.provider,
      m.origin || '-' || m.destination as rota,
      count(*) as checagens,
      count(*) filter (where c.error is not null) as checagens_com_erro,
      sum(c.target_dates) as datas_alvo,
      round(100.0 * sum(c.dates_with_data) / nullif(sum(c.target_dates), 0), 1) as pct_com_dado,
      round(100.0 * sum(c.dates_in_window) / nullif(sum(c.target_dates), 0), 1) as pct_na_janela,
      round(100.0 * sum(c.dates_matched) / nullif(sum(c.target_dates), 0), 1) as pct_com_filtros,
      sum(c.requests) as requisicoes,
      sum(c.failed) as falhas,
      min(c.checked_at)::date as desde
    from public.price_checks c
    join public.price_monitors m on m.id = c.monitor_id
    where c.checked_at > now() - interval '7 days'
    group by c.provider, m.origin, m.destination
  ) r
) end as piloto;
