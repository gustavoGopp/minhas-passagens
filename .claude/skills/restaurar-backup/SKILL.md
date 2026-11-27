---
name: restaurar-backup
description: Recuperar dados do banco a partir de um backup. Use só com o dono presente, quando houver perda de dados ou para ensaiar a restauração.
---

# Restaurar backup

Só o dono dispara e aprova. O papel do agente é orientar passo a passo e conferir o resultado. Um hook bloqueia o disparo pelo agente.

## Como o backup funciona

- Workflow **Supabase — backup**: todo domingo exporta as tabelas em JSON, compacta e cifra com a senha `PROD_BACKUP_PASSPHRASE` antes de virar artefato. Guarda 28 dias (4 cópias).
- No dia 1º de cada mês roda em **modo de teste**: exporta e simula a restauração inteira, sem gravar nada.
- O vigia diário do app manda e-mail ao dono se a última cópia tiver mais de 8 dias.
- O GitHub desliga workflows agendados depois de 60 dias sem commits. Se o e-mail de backup atrasado chegar, é a primeira coisa a conferir.
- Não entram no backup: arquivos do Storage, o agendamento do `pg_cron` e a configuração de login.
- Sem a `BYOK_MASTER_KEY` (guardada na Vercel e no cofre de senhas do dono), o backup não recupera as chaves dos usuários nem o acesso ao Gmail.

## Passo a passo para o dono

1. Em Actions → **Supabase — backup**, abra a execução da cópia desejada e anote o número no fim do endereço (o `run_id`).
2. Em Actions → **Supabase — restaurar backup** → Run workflow, informe o `run_id` e deixe **simular** ligado. Aprove a execução quando o GitHub pedir. Confira no registro a contagem de cada tabela.
3. Se a simulação estiver certa, rode de novo com **simular** desligado e `RESTAURAR` no campo de confirmação. Aprove.
4. Em conflito, vale a versão do backup; linhas mais novas não são apagadas. O campo `tabelas` restringe a restauração (por exemplo `bookings,flights`).

## Depois de restaurar

- Rode o diagnóstico `restauracao.sql` e `estado-schema.sql` e compare as contagens com as do registro da restauração.
- Projeto novo do Supabase: ajustar a variável `SUPABASE_PROJECT_REF`, pedir ao dono para rodar "Supabase — notificações e agendador" e trocar as chaves do Supabase na Vercel.
