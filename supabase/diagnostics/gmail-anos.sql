-- Item 3a: por que passagens antigas (ex.: Azul) não entraram pela varredura do
-- Gmail. Só a conta do dono (usuário mais antigo) e só contagens: domínio do
-- remetente × ano × etapa do pré-filtro, candidatos da importação, passagens por
-- companhia e ano, e a situação das varreduras.
-- Privacidade (os logs do Actions são públicos): o domínio só aparece pelo nome
-- quando é de companhia, agência ou programa de milhas; webmail vira "webmail" e
-- os demais "outros". Sem assunto, corpo, localizador, ids ou texto de erro.
with dono as (
  select id from auth.users order by created_at limit 1
),
msgs as (
  select
    case
      when m.sender_domain is null then '(sem domínio)'
      when m.sender_domain ~* '(^|\.)(gmail|googlemail|hotmail|outlook|live|msn|yahoo|icloud|me|uol|bol|terra|ig)\.com(\.br)?$'
        then 'webmail'
      when m.sender_domain ~* '(azul|voegol|latam|smiles|milhas|decolar|zupper|viajanet|submarino|livelo|cvc|booking\.com|expedia|hurb|kayak|skyscanner|passagens|viagens|copaair|aerolineas|avianca|flytap|amadeus|sabre|esferas|iupp)'
        then lower(m.sender_domain)
      else 'outros'
    end as dominio,
    coalesce(extract(year from m.received_at at time zone 'America/Sao_Paulo')::int::text, '(sem data)') as ano,
    case
      when m.status = 'listed' then '1 listado, cabeçalho não lido'
      when m.status = 'skipped' then '2 barrado no cabeçalho'
      when m.status in ('candidate', 'processing') then '3 passou no cabeçalho, não processado'
      when m.status = 'not_booking' and m.class is null then '4 barrado no corpo (pré-filtro)'
      when m.status = 'not_booking' then '5 IA: não é passagem'
      when m.status = 'extracted' then '6 extraído'
      else '7 erro técnico'
    end as etapa,
    m.id
  from public.mail_messages m
  where m.user_id = (select id from dono)
)
select json_build_object(
  'total_emails', (select count(*) from msgs),
  'por_etapa', (
    select coalesce(json_agg(r order by r.etapa), '[]'::json) from (
      select etapa, count(*) as emails from msgs group by etapa
    ) r
  ),
  'azul_por_ano_e_etapa', (
    select coalesce(json_agg(r order by r.ano, r.etapa), '[]'::json) from (
      select ano, etapa, count(*) as emails
      from msgs where dominio ~ 'azul'
      group by ano, etapa
    ) r
  ),
  'por_dominio_ano_etapa', (
    select coalesce(json_agg(r order by r.dominio, r.ano, r.etapa), '[]'::json) from (
      select dominio, ano, etapa, count(*) as emails
      from msgs group by dominio, ano, etapa
    ) r
  ),
  'candidatos_por_dominio_ano', (
    select coalesce(json_agg(r order by r.dominio, r.ano, r.status), '[]'::json) from (
      select g.dominio, g.ano, c.status, count(*) as candidatos
      from public.import_candidates c
      join msgs g on g.id = c.message_id
      group by g.dominio, g.ano, c.status
    ) r
  ),
  'passagens_por_companhia_ano', (
    select coalesce(json_agg(r order by r.companhia, r.ano, r.origem), '[]'::json) from (
      select b.airline as companhia,
        coalesce(extract(year from f.primeiro at time zone 'America/Sao_Paulo')::int::text, '(sem voo)') as ano,
        b.source as origem,
        b.status,
        count(*) as passagens
      from public.bookings b
      left join lateral (
        select min(departs_at) as primeiro from public.flights where booking_id = b.id
      ) f on true
      where b.user_id = (select id from dono)
      group by 1, 2, 3, 4
    ) r
  ),
  'varreduras', (
    select coalesce(json_agg(r order by r.tipo, r.status), '[]'::json) from (
      select kind as tipo, status,
        count(*) as quantidade,
        max(query_index) as consultas_concluidas,
        count(*) filter (where last_error is not null) as com_erro,
        min(created_at)::date as primeira,
        max(created_at)::date as ultima
      from public.mail_scans
      where user_id = (select id from dono)
      group by kind, status
    ) r
  )
) as gmail_anos;
