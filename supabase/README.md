# Banco de dados (Supabase)

As migrações em `migrations/` são a fonte da verdade do esquema. Todas as tabelas têm Row Level Security: cada usuário só enxerga as próprias linhas.

## Aplicar as migrações

**Opção A, sem instalar nada:** abra o projeto no painel do Supabase → SQL Editor → cole o conteúdo de cada arquivo de `migrations/` em ordem de nome → Run.

**Opção B, com a CLI:**

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <ref-do-projeto>
```

```bash
npx supabase db push
```

## Convenções

- Um arquivo por mudança, nome `AAAAMMDDHHMMSS_descricao.sql`.
- Nunca edite uma migração já aplicada em produção; crie outra.
- Colunas com segredo (ex.: `user_integrations.encrypted_key`) só são lidas no servidor.

## Credenciais dos workflows

Os workflows que tocam o banco de produção rodam em dois ambientes do GitHub (Settings → Environments), ambos restritos ao branch `main`. As credenciais existem só neles, com nomes começados por `PROD_`. Não há credencial de produção nos segredos gerais do repositório: sem o ambiente configurado, o job falha.

| Ambiente          | Aprovação do dono | Workflows                                | Segredos                                                                          |
| ----------------- | ----------------- | ---------------------------------------- | --------------------------------------------------------------------------------- |
| `producao-rotina` | Não               | backup, diagnóstico, migrações           | `PROD_SUPABASE_ACCESS_TOKEN`, `PROD_BACKUP_PASSPHRASE`                            |
| `producao-risco`  | Sim               | restauração, agendador, ajustes de login | `PROD_SUPABASE_ACCESS_TOKEN`, `PROD_BACKUP_PASSPHRASE`, `PROD_TELEGRAM_BOT_TOKEN` |

O teste `scripts/workflows.test.mjs` falha se um workflow ler os segredos gerais antigos ou usar um segredo `PROD_` fora de um ambiente.
