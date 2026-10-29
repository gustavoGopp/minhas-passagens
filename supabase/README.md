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
