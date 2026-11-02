-- Avisos por e-mail com a chave Resend do próprio usuário (grátis, 3.000/mês). Idempotente.
alter table public.user_integrations drop constraint if exists user_integrations_provider_check;
alter table public.user_integrations add constraint user_integrations_provider_check
  check (provider in ('anthropic', 'travelpayouts', 'duffel', 'serpapi', 'resend'));
