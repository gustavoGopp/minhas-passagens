-- Retenção dos originais (e-mails, prints e PDFs), sem dados pessoais: objetos por
-- bucket do Storage, idade do mais antigo e tamanho total; origem das passagens
-- (manual, texto, imagem, e-mail) só em contagens; perfis por prazo de retenção.
select json_build_object(
  'storage_objetos', (
    select coalesce(json_agg(r order by r.bucket), '[]'::json) from (
      select bucket_id as bucket, count(*) as objetos,
        round(extract(epoch from now() - min(created_at)) / 86400) as mais_antigo_dias,
        round(sum(coalesce((metadata ->> 'size')::bigint, 0)) / 1048576.0, 2) as mb
      from storage.objects group by bucket_id
    ) r
  ),
  'passagens_por_origem', (
    select coalesce(json_agg(r order by r.origem), '[]'::json) from (
      select source as origem, count(*) as quantidade from public.bookings group by source
    ) r
  ),
  'perfis_por_retencao_dias', (
    select coalesce(json_agg(r order by r.dias), '[]'::json) from (
      select original_retention_days as dias, count(*) as perfis from public.profiles group by 1
    ) r
  )
) as retencao;
