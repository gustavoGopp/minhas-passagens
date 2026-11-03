/**
 * Tabelas do usuário na exportação de dados. As de `EXTRA_EXPORT_COLUMNS` saem
 * por inteiro (pelo RLS do próprio usuário), com as colunas que fazem sentido
 * fora do app; ficam de fora só segredos: chaves de API cifradas, chaves do
 * push (endpoint, p256dh, auth) e o token de vínculo do Telegram.
 * O teste confere que toda tabela com user_id nas migrações está aqui.
 */
export const CORE_EXPORT_TABLES = [
  "profiles",
  "user_integrations",
  "holiday_overrides",
  "bookings",
  "flights",
  "refunds_credits",
] as const;

export const EXTRA_EXPORT_COLUMNS = {
  price_monitors: "*",
  price_checks: "*",
  price_observations: "*",
  price_alerts: "*",
  notification_log: "*",
  push_subscriptions: "id, user_agent, created_at, last_seen_at",
  telegram_links: "chat_id, linked_at, updated_at",
  mail_accounts:
    "provider, email, status, connected_at, last_refresh_ok_at, last_error, updated_at",
  mail_scans: "id, status, created_at, confirmed_at, finished_at, last_error",
  mail_messages: "provider_message_id, received_at, sender_domain, class, status, created_at",
  import_candidates: "id, received_at, draft, status, booking_id, decided_at, created_at",
} as const;
