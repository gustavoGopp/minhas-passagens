-- Passagens e valores já gravados que as regras novas (etapa 0) recusariam, sem dados
-- pessoais: só contagens. Serve para o dono saber quantos registros conferir.
-- As duas listas de aeroportos abaixo espelham src/data/airports-br.json e
-- src/data/airports-intl.json; um teste falha se ficarem diferentes.
with br(iata) as (
  select unnest(array[
      'SDU', 'GIG', 'CGH', 'GRU', 'VCP', 'BSB', 'CNF', 'PLU', 'SSA', 'REC', 'FOR', 'POA',
      'CWB', 'FLN', 'BEL', 'MAO', 'GYN', 'VIX', 'NAT', 'MCZ', 'JPA', 'AJU', 'SLZ', 'THE',
      'CGB', 'CGR', 'PMW', 'PVH', 'RBR', 'BVB', 'MCP', 'NVT', 'JOI', 'LDB', 'MGF', 'IGU',
      'UDI', 'RAO', 'SJP', 'BPS', 'IOS', 'JDO', 'PNZ', 'CPV', 'IMP', 'STM', 'CXJ', 'XAP',
      'CAC', 'PPB', 'VDC', 'FEN', 'JTC', 'MOC', 'IPN', 'JJG', 'PET', 'MAB', 'CKS', 'SJK'
  ])
),
estrangeiros(iata) as (
  select unnest(array[
      'LIS', 'OPO', 'FAO', 'FNC', 'MAD', 'BCN', 'CDG', 'ORY', 'LHR', 'LGW', 'FCO', 'MXP',
      'FRA', 'MUC', 'AMS', 'ZRH', 'BRU', 'DUB', 'IST', 'MIA', 'FLL', 'MCO', 'JFK', 'EWR',
      'BOS', 'IAD', 'ATL', 'ORD', 'DFW', 'IAH', 'LAX', 'SFO', 'LAS', 'YYZ', 'YUL', 'MEX',
      'CUN', 'PTY', 'PUJ', 'SJO', 'HAV', 'AUA', 'CUR', 'EZE', 'AEP', 'COR', 'MDZ', 'BRC',
      'USH', 'SCL', 'MVD', 'PDP', 'ASU', 'LIM', 'CUZ', 'BOG', 'MDE', 'CTG', 'UIO', 'GYE',
      'LPB', 'VVI', 'CCS', 'DXB', 'DOH', 'TLV', 'JNB', 'CPT', 'ADD', 'CMN', 'LAD', 'NRT',
      'HND'
  ])
)
select json_build_object(
  'trechos', (select count(*) from public.flights),
  'trechos_fora_da_lista_brasileira', (
    select count(*) from public.flights f
    where f.origin not in (select iata from br) or f.destination not in (select iata from br)
  ),
  'trechos_com_aeroporto_desconhecido', (
    select count(*) from public.flights f
    where f.origin not in (select iata from br union select iata from estrangeiros)
       or f.destination not in (select iata from br union select iata from estrangeiros)
  ),
  'trechos_com_chegada_antes_da_partida', (
    select count(*) from public.flights f where f.arrives_at is not null and f.arrives_at <= f.departs_at
  ),
  'correcao_do_fuso_dos_estrangeiros', (
    select value from public.app_config where key = 'fuso_estrangeiros_corrigido'
  ),
  'passagens', (select count(*) from public.bookings),
  'passagens_com_valor_menor_que_10_reais', (
    select count(*) from public.bookings b where b.amount_cents between 1 and 999
  ),
  'passagens_em_outra_moeda', (
    select count(*) from public.bookings b where b.currency <> 'BRL'
  ),
  'passagens_com_compra_depois_do_voo', (
    select count(*) from public.bookings b
    where b.purchased_on is not null and b.purchased_on > (
      select min((f.departs_at at time zone 'America/Sao_Paulo')::date)
      from public.flights f where f.booking_id = b.id
    )
  ),
  'monitores_com_alvo_menor_que_10_reais', (
    select count(*) from public.price_monitors m where m.target_cents between 1 and 999
  ),
  'creditos_com_valor_menor_que_10_reais', (
    select count(*) from public.refunds_credits c where c.amount_cents between 1 and 999
  )
) as conferir;
