-- Piloto do monitor de preços, sem dados pessoais: só cobertura agregada por
-- provedor e rota nos últimos 7 dias (contagens e percentuais). A parte
-- "comparacao" mostra, nas mesmas datas das próximas 2 semanas, quantas tiveram
-- voo dentro da janela no Google Flights (SerpApi) e no Travelpayouts.
select case when to_regclass('public.price_checks') is null then '[]'::json else json_build_object(
  'por_provedor', (
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
  ),
  'comparacao', (
    select coalesce(json_agg(r order by r.rota), '[]'::json) from (
      select
        m.origin || '-' || m.destination as rota,
        count(*) as checagens,
        sum(c.near_dates) as datas_proximas,
        round(100.0 * sum(c.near_in_window) / nullif(sum(c.near_dates), 0), 1) as pct_janela_serpapi,
        round(100.0 * sum(c.near_tp_in_window) / nullif(sum(c.near_dates), 0), 1) as pct_janela_travelpayouts,
        round(100.0 * sum(c.near_with_data) / nullif(sum(c.near_dates), 0), 1) as pct_dado_serpapi,
        round(100.0 * sum(c.near_tp_with_data) / nullif(sum(c.near_dates), 0), 1) as pct_dado_travelpayouts
      from public.price_checks c
      join public.price_monitors m on m.id = c.monitor_id
      where c.checked_at > now() - interval '7 days' and c.near_provider = 'serpapi'
      group by m.origin, m.destination
    ) r
  ),
  'serpapi_buscas_mes', (
    select coalesce(sum(near_requests), 0) from public.price_checks
    where near_provider = 'serpapi' and checked_at >= date_trunc('month', now())
  ),
  'pulos', (
    select coalesce(json_agg(r), '[]'::json) from (
      select near_skipped as motivo, count(*) as vezes from public.price_checks
      where near_skipped is not null and checked_at > now() - interval '7 days'
      group by near_skipped
    ) r
  )
) end as piloto;
