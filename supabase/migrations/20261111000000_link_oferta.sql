-- "Ver onde comprar" (item 1): link da oferta devolvido pela fonte de preços
-- (Google Flights pela SerpApi, Aviasales pelo Travelpayouts). Sem link, o app
-- monta uma busca do Google Flights na hora. Só https e até 1.000 caracteres.
-- A RLS das duas tabelas (dono) já cobre a coluna, e a exportação sai com "*".
-- Idempotente.
alter table public.price_observations add column if not exists booking_url text;
alter table public.price_alerts add column if not exists booking_url text;

alter table public.price_observations drop constraint if exists price_observations_booking_url_check;
alter table public.price_observations add constraint price_observations_booking_url_check
  check (booking_url is null or (booking_url like 'https://%' and length(booking_url) <= 1000));

alter table public.price_alerts drop constraint if exists price_alerts_booking_url_check;
alter table public.price_alerts add constraint price_alerts_booking_url_check
  check (booking_url is null or (booking_url like 'https://%' and length(booking_url) <= 1000));
