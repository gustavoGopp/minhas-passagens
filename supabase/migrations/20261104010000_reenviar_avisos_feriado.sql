-- Reenvio único (pedido do dono em 2026-11-04): os primeiros avisos de feriado do M8
-- foram registrados antes da chave do Resend e não saíram por nenhum canal.
-- Apaga só os avisos de feriado sem canal; o próximo ciclo do agendador os envia
-- de novo (respeitando a janela silenciosa). Avisos entregues não são tocados.
delete from public.notification_log
where channels = '{}'
  and (
    event_key like 'holiday-flight:%'
    or event_key like 'holiday-monitor:%'
    or event_key like 'long-weekend:%'
  );
