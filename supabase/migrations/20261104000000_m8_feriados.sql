-- M8: feriados × monitores. Idempotente.

-- Monitor criado por "Monitorar este feriadão": guarda o 1º dia da folga para
-- não duplicar e para não avisar "feriado em data monitorada" num monitor que
-- já é do feriado.
alter table public.price_monitors
  add column if not exists long_weekend date;
create index if not exists price_monitors_long_weekend_idx
  on public.price_monitors (user_id, long_weekend) where long_weekend is not null;

-- O menor preço da checagem caiu numa data perto de feriado (destaque no gráfico).
alter table public.price_checks
  add column if not exists min_near_holiday boolean not null default false;

-- Preenche as checagens antigas a partir das observações gravadas.
update public.price_checks c
set min_near_holiday = true
where c.min_price_cents is not null
  and not c.min_near_holiday
  and exists (
    select 1 from public.price_observations o
    where o.check_id = c.id and o.near_holiday and o.price_cents = c.min_price_cents
  );
