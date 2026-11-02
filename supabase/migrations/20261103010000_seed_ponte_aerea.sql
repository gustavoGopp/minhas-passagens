-- M6: cria os dois monitores da ponte aérea semanal para o dono da instância
-- (usuário mais antigo), só se ele ainda não tiver nenhum monitor. Idempotente.
-- Janelas da entrevista de 2026-10-29; alvo R$ 400 com margem de R$ 50 (editável no app).
-- Sem token do Travelpayouts, a checagem só registra "configure a chave"; ao salvar
-- o token, o app antecipa a próxima checagem para o próximo ciclo do agendador.
with dono as (
  select u.id from auth.users u
  where not exists (select 1 from public.price_monitors m where m.user_id = u.id)
    and u.id = (select id from auth.users order by created_at limit 1)
)
insert into public.price_monitors (
  user_id, name, kind, origin, destination, rule, horizon_weeks, target_cents, margin_cents,
  airlines, allow_connections, frequency, provider, active, next_check_at
)
select d.id, v.name, 'weekly', v.origin, v.destination, v.rule::jsonb, 8, 40000, 5000,
  array['AD', 'G3', 'LA'], false, 'daily', 'travelpayouts', true, now()
from dono d
cross join (values
  ('Ponte aérea RJ → SP', 'SDU', 'CGH',
   '{"kind":"weekly","slots":[{"weekday":1,"from":"00:00","to":"08:00"},{"weekday":0,"from":"12:00","to":"23:59"}]}'),
  ('Ponte aérea SP → RJ', 'CGH', 'SDU',
   '{"kind":"weekly","slots":[{"weekday":4,"from":"18:00","to":"23:59"},{"weekday":5,"from":"00:00","to":"13:00"}]}')
) as v(name, origin, destination, rule);
