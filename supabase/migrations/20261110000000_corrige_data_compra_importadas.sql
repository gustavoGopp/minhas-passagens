-- Correção única (Bloco 3): passagens importadas do Gmail cujo e-mail não trazia a
-- data da compra receberam a data do dia da importação, e os gastos foram todos
-- para o mês da importação. Aqui elas passam a usar a data de recebimento do
-- e-mail. Só mexe quando o rascunho guardou exatamente a data do dia da
-- importação (o valor padrão antigo); datas de compra reais ficam como estão.
-- Idempotente: depois de corrigida, a condição não vale mais.
update public.bookings b
set purchased_on = (c.received_at at time zone 'America/Sao_Paulo')::date
from public.import_candidates c
where c.booking_id = b.id
  and c.status = 'imported'
  and b.source = 'email'
  and c.received_at is not null
  and b.purchased_on = (b.created_at at time zone 'UTC')::date
  and c.draft ->> 'purchased_on' = b.purchased_on::text
  and (c.received_at at time zone 'America/Sao_Paulo')::date < b.purchased_on;
