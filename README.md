# minhas-passagens

Organize as passagens aéreas que você comprou, acompanhe preços de rotas que interessam e veja feriados no calendário. Tudo em um app mobile-first, em português, hospedado em planos gratuitos. Cada pessoa usa as próprias chaves de API, então o custo de uma nunca cai na conta de outra.

> Projeto pessoal, em construção, com código aberto sob licença MIT. Acompanhe o andamento em [`docs/STATUS.md`](docs/STATUS.md).

## O que é

Três funcionalidades, pensadas para quem viaja com frequência (o caso de origem é a ponte aérea Rio–São Paulo semanal):

1. **Minhas passagens.** Registre compras por e-mail encaminhado, texto colado, print ou cadastro manual. O app extrai voo, localizador, horários e valor com a API da Anthropic e pede sua revisão. Mostra o próximo voo em destaque e avisa sobre check-in, conflito de horário, trecho faltando, compra duplicada, cancelamentos, reembolsos e créditos. Gastos por mês, companhia, canal de compra e rota.
2. **Monitor de preços.** Defina rotas, período (regra recorrente como "toda segunda até 8h", datas fixas, janelas flexíveis ou feriado prolongado) e preço-alvo. O sistema consulta periodicamente uma API de preços e avisa por Telegram, push ou e-mail quando o preço atinge ou se aproxima do alvo. Histórico por rota.
3. **Feriados.** Nacionais (fixos e móveis), estaduais e municipais selecionáveis, e religiosos (judaicos, com início ao pôr do sol). O app destaca feriados perto de viagens e de datas monitoradas e sugere emendas.

## Como usar

O app ainda está em construção. Quando a primeira versão estiver no ar, este trecho terá o passo a passo: entrar com Google, colar as chaves nas Integrações, cadastrar a primeira passagem e o primeiro monitor.

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

O projeto foi desenhado para rodar inteiro em planos gratuitos. Para ter a sua cópia:

1. Faça um fork deste repositório.
2. **Vercel (Hobby):** importe o fork. O build é detectado automaticamente.
3. **Supabase (Free):** crie um projeto, aplique as migrações de `supabase/migrations` e ative o provedor Google em Authentication. Guia detalhado chega com o marco M1.
4. **Variáveis de ambiente:** copie os nomes de `.env.example` para as configurações do projeto na Vercel.
5. **Chaves de API:** cada usuário cola as próprias chaves (Anthropic, API de preços) na tela de Integrações do app. Elas ficam cifradas no banco e nunca vão ao navegador.

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
