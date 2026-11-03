-- "Ver onde comprar": quantas observações dos últimos 7 dias vieram com link da
-- fonte, por provedor do monitor e por site do link. Sem URLs, rotas nem dados
-- pessoais: só contagens. Rodar depois da migração 20261111000000_link_oferta.sql.
select coalesce(json_agg(r order by r.provedor, r.site), '[]'::json) as links from (
  select provider as provedor,
    case
      when booking_url is null then 'sem link (busca do Google Flights)'
      when booking_url like 'https://www.google.com/%' then 'google flights'
      when booking_url like 'https://www.aviasales.%' then 'aviasales'
      else 'outro'
    end as site,
    count(*) as observacoes,
    max(observed_at)::date as ultima
  from public.price_observations
  where observed_at > now() - interval '7 days'
  group by 1, 2
) r;
