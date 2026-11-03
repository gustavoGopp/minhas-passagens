-- Passagens por ano e sinais de duplicata ou de ano errado, sem dados pessoais:
-- só contagens (nada de localizador, rota de pessoa identificada, nome ou valor).
select json_build_object(
  'trechos_por_ano', (
    select coalesce(json_agg(r order by r.ano, r.origem, r.status), '[]'::json) from (
      select extract(year from f.departs_at)::int as ano, b.source as origem, b.status,
        count(*) as trechos
      from public.flights f join public.bookings b on b.id = f.booking_id
      group by 1, 2, 3
    ) r
  ),
  'compras_por_ano', (
    select coalesce(json_agg(r order by r.ano), '[]'::json) from (
      select extract(year from purchased_on)::int as ano, count(*) as compras
      from public.bookings group by 1
    ) r
  ),
  -- Mesmo trecho no mesmo horário em reservas diferentes (duplicata certa).
  'trechos_repetidos_mesmo_horario', (
    select count(*) from (
      select f.user_id, f.origin, f.destination, f.departs_at
      from public.flights f join public.bookings b on b.id = f.booking_id
      where b.status = 'active'
      group by 1, 2, 3, 4 having count(*) > 1
    ) x
  ),
  -- Mesmo trecho no mesmo dia em reservas diferentes (duplicata provável).
  'trechos_repetidos_mesmo_dia', (
    select count(*) from (
      select f.user_id, f.origin, f.destination, (f.departs_at at time zone 'America/Sao_Paulo')::date
      from public.flights f join public.bookings b on b.id = f.booking_id
      where b.status = 'active'
      group by 1, 2, 3, 4 having count(distinct f.booking_id) > 1
    ) x
  ),
  'localizador_em_mais_de_uma_reserva', (
    select count(*) from (
      select user_id, upper(trim(locator)) from public.bookings
      where locator is not null and trim(locator) <> ''
      group by 1, 2 having count(*) > 1
    ) x
  ),
  -- Voo antes da data da compra: sinal de ano lido errado na extração.
  'voo_antes_da_compra', (
    select count(*) from public.flights f join public.bookings b on b.id = f.booking_id
    where b.purchased_on is not null
      and (f.departs_at at time zone 'America/Sao_Paulo')::date < b.purchased_on
  ),
  -- Detalhe dos voos antes da compra (só números): quantos dias antes, se a data da
  -- compra veio do texto do e-mail ou da data de recebimento, e o tipo do e-mail.
  'voo_antes_da_compra_detalhe', (
    select coalesce(json_agg(r order by r.dias_antes), '[]'::json) from (
      select b.purchased_on - (f.departs_at at time zone 'America/Sao_Paulo')::date as dias_antes,
        case
          when c.id is null then 'sem_candidato'
          when (c.received_at at time zone 'America/Sao_Paulo')::date = b.purchased_on then 'data_do_email'
          else 'data_do_texto'
        end as origem_da_data,
        m.class as tipo_do_email
      from public.flights f
      join public.bookings b on b.id = f.booking_id
      left join public.import_candidates c on c.booking_id = b.id and c.status = 'imported'
      left join public.mail_messages m on m.id = c.message_id
      where b.purchased_on is not null
        and (f.departs_at at time zone 'America/Sao_Paulo')::date < b.purchased_on
    ) r
  ),
  -- Voo mais de 11 meses depois da compra: também suspeito (ano a mais).
  'voo_mais_de_330_dias_depois_da_compra', (
    select count(*) from public.flights f join public.bookings b on b.id = f.booking_id
    where b.purchased_on is not null
      and (f.departs_at at time zone 'America/Sao_Paulo')::date > b.purchased_on + 330
  )
) as passagens;
