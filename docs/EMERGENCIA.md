# Emergência

Uma tela, para ler uma vez com calma e consultar na hora do problema. Na dúvida, abra uma sessão do Claude Code e cole a seção que se aplica.

## O app quebrou depois de um merge

1. **Volte o app para a versão anterior.** Na Vercel: projeto → **Deployments** → na publicação anterior, **⋯ → Instant Rollback**. No plano gratuito só dá para voltar **um passo**. Isso não desfaz o banco nem as variáveis de ambiente.
2. Depois do rollback, a Vercel deixa de trocar a versão no ar sozinha. Quando a correção entrar na main e o workflow publicar, confira em **Deployments** que a versão nova está no ar; se não estiver, use **⋯ → Promote** nela.
3. Peça a correção numa sessão nova, com o link do PR que quebrou.

## O app não foi publicado depois do merge

O workflow **Supabase — migrações e publicação** publica o app depois da CI verde e, se houver migração, do seu clique. Em **Actions**, abra a última execução:

- **Esperando aprovação:** havia migração; clique em **Review deployments → Approve**.
- **Falta o segredo `PROD_VERCEL_DEPLOY_HOOK`:** crie o gancho na Vercel (**Settings → Git → Deploy Hooks**, branch `main`) e guarde o endereço nesse segredo, no ambiente `producao-rotina` do GitHub. Depois, **Re-run jobs**.
- **O gancho foi chamado, mas nada mudou na Vercel:** publique à mão em **Deployments → ⋯ → Redeploy** na versão mais nova da main e avise numa sessão (o gancho pode não funcionar com a publicação automática desligada).
- **A CI da main falhou:** nada foi publicado de propósito. Peça a correção.

## Uma migração deu errado

- Migração **não tem desfazer**. Cada uma roda numa transação: se falhou no meio, nada dela ficou gravado e o app não foi publicado. Peça a correção numa sessão nova, que cria uma migração nova.
- Se ela **rodou e estragou dados**, a recuperação é pelo backup, com você presente: skill `restaurar-backup` (`.claude/skills/restaurar-backup/SKILL.md`).

## Recebi o e-mail de falhas do vigia

O vigia diário manda o resumo das falhas do servidor das últimas 24 horas. Se for algo que você nota no app, abra uma sessão e cole o e-mail. A sessão investiga com o diagnóstico do banco, que só lê.

## Suspeita de vazamento (alguém viu o que não devia)

1. Na Vercel, troque `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` (gere novas no Supabase e com `openssl rand -base64 32`) e publique de novo.
2. Revogue o acesso ao Gmail em https://myaccount.google.com/permissions e troque as suas chaves de API (Anthropic, preços, Resend) nos sites de cada uma; depois cole as novas em **Mais → Integrações**.
3. Não troque a `BYOK_MASTER_KEY` sem um plano: as chaves salvas deixam de abrir.
4. Enquanto o app for de uso particular, não há comunicação obrigatória. Se ele for aberto a outras pessoas, a ANPD pede comunicação de incidente em 3 dias úteis.
