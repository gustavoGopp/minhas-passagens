-- segunda entrega: o app publicado com a etapa 2b já lê a chave cifrada e grava o
-- histórico de preço pelo servidor; este arquivo só fecha os acessos antigos.
-- Juntar só depois que a 2b estiver no ar (a migração roda antes da publicação).
--
-- Regras de acesso aprovadas pelo dono em 27/11 (P20, docs/regras-de-acesso.md):
--
-- 1. Histórico de preço (price_checks, price_observations, price_alerts): cada
--    pessoa só lê o seu; só o servidor grava. Antes, a policy "for all" deixava
--    qualquer pessoa logada criar, alterar e apagar o próprio histórico pela API,
--    e o agendador trata essas linhas como confiáveis (ex.: alerta já enviado).
--    O botão "Verificar agora" já grava pelo servidor.
-- 2. A chave de API cifrada (user_integrations.encrypted_key) não é lida pelo
--    navegador, nem pelo dono. A leitura fica por coluna: tudo menos a cifra.
--    O dono continua criando, trocando e apagando a própria chave.
--
-- Só ajusta policies e concessões; nenhum dado muda. Pode rodar duas vezes.

-- 1. Histórico de preço: troca "dono: tudo" por "dono lê".
drop policy if exists "price_checks: dono" on public.price_checks;
drop policy if exists "price_checks: dono lê" on public.price_checks;
create policy "price_checks: dono lê" on public.price_checks
  for select using (auth.uid() = user_id);

drop policy if exists "price_observations: dono" on public.price_observations;
drop policy if exists "price_observations: dono lê" on public.price_observations;
create policy "price_observations: dono lê" on public.price_observations
  for select using (auth.uid() = user_id);

drop policy if exists "price_alerts: dono" on public.price_alerts;
drop policy if exists "price_alerts: dono lê" on public.price_alerts;
create policy "price_alerts: dono lê" on public.price_alerts
  for select using (auth.uid() = user_id);

revoke insert, update, delete on public.price_checks, public.price_observations,
  public.price_alerts from anon, authenticated;
grant select on public.price_checks, public.price_observations, public.price_alerts
  to authenticated;

-- 2. Chave cifrada: leitura por coluna, sem encrypted_key.
revoke select on public.user_integrations from anon, authenticated;
grant select (id, user_id, provider, key_hint, status, validated_at, created_at, updated_at)
  on public.user_integrations to authenticated;
