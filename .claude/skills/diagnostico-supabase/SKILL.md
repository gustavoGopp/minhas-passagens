---
name: diagnostico-supabase
description: Consultar o estado do banco de produção sem gravar nada e sem expor dado pessoal. Use para investigar um problema em produção, conferir uma migração ou medir uso.
---

# Diagnóstico do Supabase

A sessão não alcança o banco. O diagnóstico roda pelo workflow **Supabase — diagnóstico**, só a partir da main, em modo somente leitura. Os registros da execução são públicos.

## Rodar uma consulta que já existe

1. Escolha o alvo em `supabase/diagnostics/` (por exemplo `estado-schema.sql`, `grants-tabelas.sql`, `passagens-conferir.sql`, `uso-banco.sql`, `avisos.sql`, `agendador.sql`), ou `auth-logs`, ou `auth-config`.
2. Dispare o workflow `supabase-diagnostico.yml` com `ref: main` e a entrada `alvo`.
3. Leia o resultado no registro do passo "Diagnóstico (somente leitura)".

## Criar uma consulta nova

1. Arquivo `.sql` em `supabase/diagnostics/`, com um comentário no topo dizendo o que mede.
2. Devolva **só nomes de objetos, contagens, datas e sim/não**. Nunca e-mail, nome, localizador, assunto, texto de erro ou identificador de pessoa. Agrupe e conte.
3. A consulta precisa entrar na main por pull request antes de rodar: outro branch é recusado pelo ambiente do GitHub.
4. Se a saída tiver formato de e-mail, token, CPF, telefone ou segredo, o script recusa e não imprime nada (`scripts/supabase-diagnostico-lib.mjs`). Ajuste a consulta; não contorne a trava.

## O que não fazer

- Não use o diagnóstico para alterar nada: a API recusa gravação nesse modo.
- Ajustes de login (URL do site, abrir ou fechar cadastro) ficam no workflow "Supabase — ajustes de login", que só o dono dispara e aprova.
