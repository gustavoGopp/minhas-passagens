# Banco de dados (Supabase)

As migrações em `migrations/` são a fonte da verdade do esquema. Todas as tabelas têm Row Level Security: cada usuário só enxerga as próprias linhas.

## Aplicar as migrações

O workflow **Supabase — migrações e publicação** (`.github/workflows/supabase-migrate.yml`) faz, depois de cada merge na main:

1. espera a CI terminar verde na main;
2. lista, só lendo, as migrações de `migrations/` ainda não registradas em `public.app_migrations`;
3. se houver, espera o clique do dono (ambiente `producao-risco`) e aplica cada uma com o seu registro numa transação só: ou entram as duas, ou nenhuma;
4. só então publica o app na Vercel, pelo gancho de publicação (a Vercel não publica a main sozinha). Migração recusada ou com erro: o app não é publicado.

O dono também pode dispará-lo à mão. Migração não tem desfazer: o conserto é uma migração nova (veja `docs/EMERGENCIA.md`).

Não use `supabase db push` nem cole SQL no painel: a CLI do Supabase mantém outro registro e reaplicaria tudo. O passo a passo para criar uma migração está em [`.claude/skills/nova-migracao/SKILL.md`](../.claude/skills/nova-migracao/SKILL.md).

## Convenções

- Um arquivo por mudança, nome `AAAAMMDDHHMMSS_descricao.sql`.
- Nunca edite uma migração que já está na main; crie outra. Um hook do agente e um passo da CI recusam a edição.
- Toda migração pode rodar duas vezes sem erro, e migração que cria tabela traz o próprio `GRANT`.
- Colunas com segredo (ex.: `user_integrations.encrypted_key`) só são lidas no servidor.

## Credenciais dos workflows

Os workflows que tocam o banco de produção rodam em dois ambientes do GitHub (Settings → Environments), ambos restritos ao branch `main`. As credenciais existem só neles, com nomes começados por `PROD_`. Não há credencial de produção nos segredos gerais do repositório: sem o ambiente configurado, o job falha.

| Ambiente          | Aprovação do dono | Workflows                                                   | Segredos                                                                          |
| ----------------- | ----------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `producao-rotina` | Não               | backup, diagnóstico, lista de migrações e publicação do app | `PROD_SUPABASE_ACCESS_TOKEN`, `PROD_BACKUP_PASSPHRASE`, `PROD_VERCEL_DEPLOY_HOOK` |
| `producao-risco`  | Sim               | aplicar migrações, restauração, agendador, ajustes de login | `PROD_SUPABASE_ACCESS_TOKEN`, `PROD_BACKUP_PASSPHRASE`, `PROD_TELEGRAM_BOT_TOKEN` |

O teste `scripts/workflows.test.mjs` falha se um workflow ler os segredos gerais antigos ou usar um segredo `PROD_` fora de um ambiente.
