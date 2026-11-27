---
name: nova-migracao
description: Criar uma mudança no banco de dados (tabela, coluna, regra de acesso, correção de dados). Use sempre que uma tarefa exigir alterar o Postgres do Supabase.
---

# Nova migração

Uma migração roda sozinha em produção quando o pull request entra na main. Não existe desfazer: o conserto de uma migração errada é outra migração.

1. **Arquivo novo** em `supabase/migrations/`, com o nome `AAAAMMDDHHMMSS_descricao.sql` (data e hora maiores que as da última). Nunca edite um arquivo que já está na main: um hook e a CI recusam.
2. **Pode rodar duas vezes sem erro.** Use `create table if not exists`, `add column if not exists`, `drop policy if exists` antes de `create policy`, e blocos `do $$ ... $$` com uma checagem no começo para correções de dados.
3. **Tabela nova** leva, no mesmo arquivo:
   - `alter table ... enable row level security;`
   - as policies (quem lê e quem grava cada linha, sempre por `auth.uid() = user_id`);
   - `grant select, insert, update, delete on ... to authenticated;` (só os comandos necessários). Sem o `grant`, o usuário logado recebe "permission denied".
   - a tabela na lista de exportação da conta (`src/lib/account/export-tables.ts`); um teste falha se faltar.
4. **Só acrescente.** Renomear ou apagar coluna vira duas entregas: primeiro o app passa a usar o novo; numa entrega seguinte o antigo sai.
5. **Correção de dados** vai num arquivo separado da mudança de estrutura, guarda uma marca em `app_config` na mesma transação (modelo: `20261127000000_fuso_aeroportos_estrangeiros.sql`) e registra quantas linhas alterou.
6. **Teste num Postgres de verdade** antes de abrir o PR. Na sessão da nuvem: `service postgresql start`, criar um banco vazio, aplicar todas as migrações em ordem e aplicar de novo. Mostre a saída.
7. **No PR**, preencha "Mexe no banco?" dizendo o que a migração faz em português simples.

Depois do merge, confira a execução do workflow "Supabase — migrações" e rode o diagnóstico `estado-schema.sql` (veja a skill `diagnostico-supabase`).
