# minhas-passagens

Organize as passagens aéreas que você comprou, acompanhe preços de rotas que interessam e veja feriados no calendário. Tudo em um app mobile-first, em português, hospedado em planos gratuitos. Cada pessoa usa as próprias chaves de API, então o custo de uma nunca cai na conta de outra.

> Projeto pessoal, em construção, com código aberto sob licença MIT. Acompanhe o andamento em [`docs/STATUS.md`](docs/STATUS.md).

## O que é

Três funcionalidades, pensadas para quem viaja com frequência (o caso de origem é a ponte aérea Rio–São Paulo semanal):

1. **Minhas passagens.** Registre compras por e-mail encaminhado, texto colado, print ou cadastro manual. O app extrai voo, localizador, horários e valor com a API da Anthropic e pede sua revisão. Mostra o próximo voo em destaque e avisa sobre check-in, conflito de horário, trecho faltando, compra duplicada, cancelamentos, reembolsos e créditos. Gastos por mês, companhia, canal de compra e rota.
2. **Monitor de preços.** Defina rotas, período (regra recorrente como "toda segunda até 8h", datas fixas, janelas flexíveis ou feriado prolongado) e preço-alvo. O sistema consulta periodicamente uma API de preços e avisa por Telegram, push ou e-mail quando o preço atinge ou se aproxima do alvo. Histórico por rota.
3. **Feriados.** Nacionais (fixos e móveis), estaduais e municipais selecionáveis, e religiosos (judaicos, com início ao pôr do sol). O app destaca feriados perto de viagens e de datas monitoradas e sugere emendas.

## Como usar

1. Abra o app e clique em **Entrar com Google**.
2. Em **Mais → Perfil**, confira fuso horário, estado (para feriados estaduais) e janela de silêncio dos avisos.
3. Em **Mais → Integrações**, cole sua chave da Anthropic (necessária para extrair passagens de e-mails, textos e prints).
4. As telas de passagens, monitor de preços e calendário chegam nos próximos marcos (veja `docs/STATUS.md`).

## Como rodar localmente

Pré-requisitos: Node.js 22 ou superior e npm.

```bash
git clone https://github.com/gustavoGopp/minhas-passagens.git
```

```bash
cd minhas-passagens && npm install
```

```bash
cp .env.example .env.local
```

Preencha o `.env.local` com os valores dos seus serviços (os nomes estão documentados no arquivo). Depois:

```bash
npm run dev
```

Abra http://localhost:3000.

Outros comandos:

| Comando             | O que faz                         |
| ------------------- | --------------------------------- |
| `npm test`          | Roda os testes de lógica (Vitest) |
| `npm run lint`      | ESLint                            |
| `npm run format`    | Prettier em todo o projeto        |
| `npm run typecheck` | Checagem de tipos do TypeScript   |
| `npm run build`     | Build de produção do Next.js      |

## Como fazer deploy (sua própria cópia)

O projeto roda inteiro em planos gratuitos. Cada passo abaixo leva poucos minutos.

### 1. Supabase (banco e login)

1. Crie um projeto em https://supabase.com (plano Free; região `South America (São Paulo)`).
2. Em **Project Settings → API**, copie a URL do projeto, a chave pública (`anon` / `publishable`) e a chave secreta (`service_role` / `secret`).
3. Aplique as migrações: **SQL Editor → New query**, cole o conteúdo de cada arquivo de `supabase/migrations/` em ordem e execute. Detalhes em [`supabase/README.md`](supabase/README.md).

### 2. Google (botão "Entrar com Google")

1. Em https://console.cloud.google.com crie um projeto e abra **APIs e serviços → Tela de permissão OAuth** (ou "Google Auth Platform"). Tipo externo; adicione seu e-mail como usuário de teste ou publique.
2. Em **Credenciais → Criar credenciais → ID do cliente OAuth**, tipo **Aplicativo da Web**:
   - Origens JavaScript autorizadas: `http://localhost:3000` e a URL do seu deploy (ex.: `https://minhas-passagens.vercel.app`).
   - URIs de redirecionamento autorizados: `https://<ref-do-projeto>.supabase.co/auth/v1/callback` (o valor exato aparece no Supabase, em **Authentication → Providers → Google**).
3. No Supabase, em **Authentication → Providers → Google**, ative e cole o Client ID e o Client Secret.
4. Em **Authentication → URL Configuration**: Site URL = URL do deploy; Redirect URLs = `https://<seu-app>.vercel.app/**` e `http://localhost:3000/**`.

### 3. Vercel (hospedagem)

1. Faça um fork deste repositório e importe-o em https://vercel.com (plano Hobby). O build é detectado automaticamente.
2. Em **Settings → Environment Variables**, cadastre:

| Variável                        | Valor                                           |
| ------------------------------- | ----------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`           | Opcional. O login usa a URL real de cada acesso |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL do projeto Supabase                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave pública do Supabase                       |
| `SUPABASE_SERVICE_ROLE_KEY`     | chave secreta do Supabase (só servidor)         |
| `BYOK_MASTER_KEY`               | 32 bytes em base64; gere com o comando abaixo   |

```bash
openssl rand -base64 32
```

3. Faça um redeploy. Abra a URL, clique em **Entrar com Google** e, em **Mais → Integrações**, cole sua chave da Anthropic.

Guarde a `BYOK_MASTER_KEY` com cuidado: ela cifra as chaves de API de todos os usuários. Se mudar, as chaves salvas deixam de ser legíveis e cada pessoa precisa colar a sua de novo.

### 4. Chaves de API de cada usuário

Cada pessoa cola as próprias chaves (Anthropic, API de preços) na tela de Integrações. Elas ficam cifradas no banco com AES-256-GCM e nunca vão ao navegador. O uso é cobrado na conta de quem forneceu a chave.

Os marcos seguintes (notificações, monitor de preços e e-mail de entrada) terão seus próprios passos documentados aqui conforme forem entregues.

## Arquitetura em uma frase

Next.js 16 (App Router, TypeScript, Tailwind) na Vercel; Supabase para login com Google, Postgres com Row Level Security e armazenamento; API da Anthropic para extrair passagens; Telegram, Web Push e Resend para avisos; agendamento com pg_cron. Detalhes, alternativas avaliadas e custos em [`docs/PESQUISA.md`](docs/PESQUISA.md).

## Segurança e privacidade

- Nenhum segredo no repositório. `.env.example` só lista nomes.
- Dados de cada usuário isolados por Row Level Security.
- E-mails e prints originais são apagados 30 dias após a extração; ficam só os dados estruturados.
- Você pode exportar e apagar sua conta a qualquer momento.

## Licença

[MIT](LICENSE).
