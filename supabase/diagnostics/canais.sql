-- Canais de aviso por perfil, sem dados pessoais: só contagens por combinação de
-- preferências (Telegram, push, e-mail) e de canais de fato disponíveis (chat do
-- Telegram vinculado, assinatura de push, chave Resend). Explica avisos "nenhum".
select coalesce(json_agg(r order by r.perfis desc), '[]'::json) as canais from (
  select p.notify_email as pref_email, p.notify_push as pref_push, p.notify_telegram as pref_telegram,
    exists (select 1 from public.user_integrations i where i.user_id = p.id and i.provider = 'resend') as tem_resend,
    exists (select 1 from public.user_integrations i where i.user_id = p.id and i.provider = 'anthropic') as tem_anthropic,
    exists (select 1 from public.push_subscriptions s where s.user_id = p.id) as tem_push,
    exists (select 1 from public.telegram_links t where t.user_id = p.id and t.chat_id is not null) as tem_telegram,
    exists (select 1 from public.price_monitors m where m.user_id = p.id) as tem_monitor,
    count(*) as perfis
  from public.profiles p
  group by 1, 2, 3, 4, 5, 6, 7, 8
) r;
