# Regras de acesso

Aprovadas pelo dono em 27/11/2026. Cada regra é um teste em `tests/banco/regras-de-acesso.test.ts`, rodado na CI contra um Supabase de verdade. A CI também prova que cada teste falha quando a regra é quebrada de propósito (`scripts/banco-teste/quebrar-regras.mjs`). Mudar este arquivo pede a etiqueta `aprovado-pelo-dono` no pull request.

A e B são duas pessoas com conta. "Visitante" é quem usa só a chave pública, sem login.

## Para todas as tabelas

- O visitante não lê nem grava nenhuma tabela.
- Toda tabela tem a proteção de acesso por linha ligada; tabela nova nasce com ela ligada.
- Nenhuma visão (view) fura a proteção.
- Só funções de uma lista conhecida rodam com poder de dono do banco (hoje, só `handle_new_user`).
- Cada tabela que o app usa responde ao usuário logado.

## A controla os próprios dados; B não vê, não cria em nome de A, não altera e não apaga os de A

- `bookings` (passagens) e `refunds_credits` (reembolsos e créditos).
- `flights` (trechos). B também não pendura trecho numa passagem de A.
- `user_integrations` (chaves de API cifradas).
- `push_subscriptions` (avisos no celular).
- `price_monitors`, `price_checks`, `price_observations` e `price_alerts` (preços). Hoje A consegue criar e alterar o próprio histórico de preço pelo navegador; fechar isso é a P20 (etapa 2b).

## Regras parciais

- `profiles`: A vê e altera só o próprio perfil. Ninguém cria perfil à mão (nasce no primeiro login) nem apaga pelo app.
- `holiday_overrides` (feriados ajustados): A vê, cria e apaga os próprios. Ninguém altera.
- `telegram_links`: A vê e desfaz o próprio vínculo. Ninguém cria vínculo pelo navegador.

## A só lê; só o servidor grava

- `notification_log` (avisos enviados). Impede apagar o registro para receber um aviso de novo.
- `mail_accounts`, `mail_scans`, `mail_messages` e `import_candidates` (Gmail e importação).

## Ninguém, nem logado

- `app_config` (segredos do agendador) e `app_migrations`. Só o servidor.
