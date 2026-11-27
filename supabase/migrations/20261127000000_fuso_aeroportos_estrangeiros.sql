-- Correção única de dados: trechos com aeroporto estrangeiro gravados antes de o
-- app conhecer o fuso desses aeroportos. Até aqui, todo horário de aeroporto fora
-- da tabela brasileira era convertido como se fosse horário de Brasília. Com a
-- lista de aeroportos estrangeiros (src/data/airports-intl.json), os trechos já
-- gravados passariam a aparecer com a hora deslocada. Esta migração relê o
-- horário digitado (o instante gravado visto em Brasília) no fuso do aeroporto.
--
-- Roda uma vez só: grava a marca "fuso_estrangeiros_corrigido" em app_config, com
-- a contagem de trechos alterados, na mesma transação da correção. Aeroportos
-- fora das duas listas não mudam (continuam valendo como horário de Brasília).
-- A lista abaixo espelha src/data/airports-intl.json; um teste falha se ficarem
-- diferentes.
do $$
declare
  alterados integer := 0;
begin
  if exists (select 1 from public.app_config where key = 'fuso_estrangeiros_corrigido') then
    return;
  end if;

  with fuso(iata, zona) as (
    values
      ('LIS', 'Europe/Lisbon'), ('OPO', 'Europe/Lisbon'), ('FAO', 'Europe/Lisbon'),
      ('FNC', 'Atlantic/Madeira'), ('MAD', 'Europe/Madrid'), ('BCN', 'Europe/Madrid'),
      ('CDG', 'Europe/Paris'), ('ORY', 'Europe/Paris'), ('LHR', 'Europe/London'),
      ('LGW', 'Europe/London'), ('FCO', 'Europe/Rome'), ('MXP', 'Europe/Rome'),
      ('FRA', 'Europe/Berlin'), ('MUC', 'Europe/Berlin'), ('AMS', 'Europe/Amsterdam'),
      ('ZRH', 'Europe/Zurich'), ('BRU', 'Europe/Brussels'), ('DUB', 'Europe/Dublin'),
      ('IST', 'Europe/Istanbul'), ('MIA', 'America/New_York'), ('FLL', 'America/New_York'),
      ('MCO', 'America/New_York'), ('JFK', 'America/New_York'), ('EWR', 'America/New_York'),
      ('BOS', 'America/New_York'), ('IAD', 'America/New_York'), ('ATL', 'America/New_York'),
      ('ORD', 'America/Chicago'), ('DFW', 'America/Chicago'), ('IAH', 'America/Chicago'),
      ('LAX', 'America/Los_Angeles'), ('SFO', 'America/Los_Angeles'), ('LAS', 'America/Los_Angeles'),
      ('YYZ', 'America/Toronto'), ('YUL', 'America/Toronto'), ('MEX', 'America/Mexico_City'),
      ('CUN', 'America/Cancun'), ('PTY', 'America/Panama'), ('PUJ', 'America/Santo_Domingo'),
      ('SJO', 'America/Costa_Rica'), ('HAV', 'America/Havana'), ('AUA', 'America/Aruba'),
      ('CUR', 'America/Curacao'), ('EZE', 'America/Argentina/Buenos_Aires'), ('AEP', 'America/Argentina/Buenos_Aires'),
      ('COR', 'America/Argentina/Cordoba'), ('MDZ', 'America/Argentina/Mendoza'), ('BRC', 'America/Argentina/Salta'),
      ('USH', 'America/Argentina/Ushuaia'), ('SCL', 'America/Santiago'), ('MVD', 'America/Montevideo'),
      ('PDP', 'America/Montevideo'), ('ASU', 'America/Asuncion'), ('LIM', 'America/Lima'),
      ('CUZ', 'America/Lima'), ('BOG', 'America/Bogota'), ('MDE', 'America/Bogota'),
      ('CTG', 'America/Bogota'), ('UIO', 'America/Guayaquil'), ('GYE', 'America/Guayaquil'),
      ('LPB', 'America/La_Paz'), ('VVI', 'America/La_Paz'), ('CCS', 'America/Caracas'),
      ('DXB', 'Asia/Dubai'), ('DOH', 'Asia/Qatar'), ('TLV', 'Asia/Jerusalem'),
      ('JNB', 'Africa/Johannesburg'), ('CPT', 'Africa/Johannesburg'), ('ADD', 'Africa/Addis_Ababa'),
      ('CMN', 'Africa/Casablanca'), ('LAD', 'Africa/Luanda'), ('NRT', 'Asia/Tokyo'),
      ('HND', 'Asia/Tokyo')
  )
  update public.flights f set
    departs_at = coalesce(
      (select (f.departs_at at time zone 'America/Sao_Paulo') at time zone z.zona
         from fuso z where z.iata = f.origin),
      f.departs_at),
    arrives_at = coalesce(
      (select (f.arrives_at at time zone 'America/Sao_Paulo') at time zone z.zona
         from fuso z where z.iata = f.destination),
      f.arrives_at)
  where f.origin in (select iata from fuso) or f.destination in (select iata from fuso);
  get diagnostics alterados = row_count;

  insert into public.app_config (key, value)
  values ('fuso_estrangeiros_corrigido',
    alterados || ' trechos em ' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'));
end $$;
