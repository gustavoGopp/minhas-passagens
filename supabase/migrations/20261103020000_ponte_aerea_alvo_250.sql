-- M6: alvo da ponte aérea do dono passa para R$ 250 por trecho (margem de R$ 50
-- mantida: "perto do alvo" até R$ 300). Só altera os monitores criados pela
-- migração anterior que ainda estão com o alvo original. Idempotente.
update public.price_monitors
set target_cents = 25000
where user_id = (select id from auth.users order by created_at limit 1)
  and name in ('Ponte aérea RJ → SP', 'Ponte aérea SP → RJ')
  and target_cents = 40000;
