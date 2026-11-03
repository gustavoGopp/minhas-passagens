-- Calendário assinado: RLS e policies da tabela e contagens (links ativos, lidos
-- nas últimas 24 h). Sem hashes, ids nem dados pessoais.
select json_build_object(
  'rls_ligada', (select relrowsecurity from pg_class where oid = 'public.calendar_feeds'::regclass),
  'policies', (
    select coalesce(json_agg(json_build_object('nome', policyname, 'comando', cmd) order by policyname), '[]'::json)
    from pg_policies where schemaname = 'public' and tablename = 'calendar_feeds'
  ),
  'links_ativos', (select count(*) from public.calendar_feeds),
  'lidos_24h', (select count(*) from public.calendar_feeds where last_fetched_at > now() - interval '24 hours')
) as calendario;
