-- Passagens importadas do Gmail que foram apagadas (o rascunho continua em
-- import_candidates por 30 dias, com booking_id nulo), sem dados pessoais: só contagens.
select json_build_object(
  'importadas_total', (select count(*) from public.import_candidates where status = 'imported'),
  'importadas_apagadas', (
    select count(*) from public.import_candidates where status = 'imported' and booking_id is null
  ),
  'passagens_hoje', (select count(*) from public.bookings),
  'trechos_hoje', (select count(*) from public.flights),
  'passagens_por_origem', (
    select coalesce(json_agg(r), '[]'::json) from (
      select source as origem, status, count(*) as quantidade from public.bookings group by 1, 2
    ) r
  )
) as restauracao;
