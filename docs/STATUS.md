# STATUS do projeto minhas-passagens

> Leia este arquivo no início de toda sessão. Ele é a memória do projeto: decisões, o que está pronto, próximos passos e as respostas da entrevista. Atualize-o ao fim de cada marco.

Última atualização: 2026-11-02 (M6 pronto; piloto do Travelpayouts aguardando o token)

## Estado atual

| Marco                             | Situação                                           |
| --------------------------------- | -------------------------------------------------- |
| M0 Fundação                       | Pronto                                             |
| M1 Login + banco                  | Pronto                                             |
| M2 Feriados                       | Pronto                                             |
| M3 Passagens: entrada e extração  | Pronto (MVP de passagens)                          |
| M4 Regras de passagens            | Pronto                                             |
| M5 Notificações + agendador       | Pronto (bot do Telegram depende do token do dono)  |
| M6 Monitor de preços              | Pronto; piloto do Travelpayouts em andamento       |
| M7 E-mail de entrada              | Pendente (precisa de domínio `.com.br`, R$ 40/ano) |
| M8 Feriados × viagens e monitores | Pendente                                           |
| M9 Acabamento v1 + post LinkedIn  | Pendente                                           |

## Próximos passos

1. Dono: criar conta gratuita no Travelpayouts e colar o token em Mais → Integrações. Os dois monitores da ponte aérea já existem (migração `20261103010000_seed_ponte_aerea.sql`, alvo R$ 400 ± R$ 50, editável) e checam em até 5 min depois de salvar o token.
2. Claude: acompanhar o piloto por 7 dias com o diagnóstico `piloto-precos.sql`; se a cobertura ficar abaixo de ~80%, avisar o dono antes de manter o Travelpayouts como fonte principal (alternativa: SerpApi com a cota grátis do dono, ou Duffel).
3. Dono: cadastrar a chave da Anthropic em Integrações e registrar as passagens já compradas; desativar no Google Cloud o secret antigo `****dmcf`.
4. Dono: criar o bot no BotFather e salvar o token como segredo `TELEGRAM_BOT_TOKEN` no GitHub; Claude roda o workflow de setup.
5. M7: e-mail de entrada (precisa de domínio).

## Histórico de incidentes

- **2026-11-02, login com Google falhando.** Causas: (a) nenhuma migração aplicada no banco; (b) Site URL do Supabase em `http://localhost:3000`; (c) Client Secret do Google no Supabase de outro secret ("Unable to exchange external code"). Correções: ponte via GitHub Actions aplicou as migrações e ajustou a Site URL; dono gerou secret novo no Google e colou no Supabase. Estado confirmado: 1 usuário, 1 perfil.

- **2026-11-02, deploy do M5 com "rate limited" na Vercel.** Limite diário de deploys do plano Hobby. O merge do M6 republica a produção; regra mantida: um push por PR.

## Como o Claude opera o Supabase

- Workflows `supabase-migrate.yml` (automático no merge que muda `supabase/migrations/**`, ou manual) e `supabase-diagnostico.yml` (manual: `estado-schema.sql`, `auth-logs`, `auth-config`, ou ajuste de Site URL/Redirect URLs).
- Disparo: `gh api -X POST repos/gustavoGopp/minhas-passagens/actions/workflows/<arquivo>/dispatches -f ref=main -f 'inputs[alvo]=...'`; leitura: `gh run view <id> --log`.
- **Regra:** os logs do Actions são públicos. Diagnósticos só retornam nomes de objetos, contagens e erros técnicos, nunca dados pessoais. Toda consulta nova vira arquivo em `supabase/diagnostics/` revisável no PR.
- Migrações são idempotentes e registradas em `public.app_migrations`.

## Bloqueios conhecidos

- **Push do GitHub a partir de sessões do Claude Code**: o app do Claude no GitHub precisa estar instalado para a organização/usuário `gustavoGopp`. Sem isso, commits ficam locais à sessão.

## Decisões tomadas (com justificativa curta)

| Tema                | Decisão                                                                                                                                                                                                                                                          | Por quê                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Stack               | Next.js 16 (App Router, TS, Tailwind 4) na Vercel Hobby; Supabase Free (Auth Google, Postgres com RLS, Storage); Vitest; Prettier                                                                                                                                | Planos gratuitos, Auth + RLS prontos; alternativas (Neon, Cloudflare D1, SvelteKit) não reduzem custo |
| Separação de custos | Cada usuário usa as próprias chaves (BYOK) para Anthropic e API de preços, cifradas com AES-256-GCM no servidor. Telegram (bot único), Web Push e e-mail de alerta não exigem chave                                                                              | Gasto de terceiros nunca cai na conta do dono                                                         |
| Licença             | MIT mantida. Calendário hebraico implementado no projeto (sem `@hebcal/core`, que é GPL)                                                                                                                                                                         | Compatibilidade de licença                                                                            |
| Feriados            | Cálculo local: Páscoa (Meeus/Jones/Butcher) + tabela nacional por lei + semente de UFs e 6 cidades gerada do `date-holidays` (dados CC BY-SA, atribuir) + cadastro manual de municipais. Carnaval e Corpus Christi modelados como `optional` (ponto facultativo) | Sem dependência de API em runtime                                                                     |
| Aeroportos          | Cada aeroporto é um lugar distinto (SDU ≠ GIG, CGH ≠ GRU ≠ VCP). Trecho faltando pode ser silenciado com "cheguei por outro meio"                                                                                                                                | Decisão da entrevista                                                                                 |
| Extração            | Haiku 5.5 padrão; retry com Sonnet 5.5 se a validação do schema falhar; saída estruturada por JSON Schema; fuso vem da tabela de aeroportos, não do modelo                                                                                                       | Custo de centavos por mês                                                                             |
| E-mail de entrada   | Cloudflare Email Routing + Email Worker no domínio raiz (`u-<token>@dominio.com.br`); app em `app.dominio.com.br`; Resend Inbound como fallback                                                                                                                  | Custo zero; catch-all só funciona no apex                                                             |
| Preços              | Adaptador plugável. Piloto de 7 dias com Travelpayouts/Aviasales (grátis) em SDU–CGH antes de fixar; Duffel e SerpApi opcionais com chave do usuário                                                                                                             | Amadeus Self-Service encerrado em 07/2026; demais fontes inviáveis para indivíduos                    |
| Agendador           | Supabase pg_cron + pg_net chamando `POST /api/jobs/tick` a cada minuto; Cloudflare Worker cron como fallback; Vercel Cron só reconciliação diária                                                                                                                | Precisão de minuto para check-in, custo zero, evita pausa do Supabase                                 |
| Notificações        | Imediatas: preço no alvo, check-in (abertura por cia + 24h), nova passagem por e-mail. Janela silenciosa 23h–7h exceto check-in                                                                                                                                  | Entrevista                                                                                            |
| Retenção            | Original (e-mail/print) guardado 30 dias e apagado; ficam só dados estruturados                                                                                                                                                                                  | Entrevista                                                                                            |
| Gastos              | Competência pela data da compra; reembolso na data de recebimento; agrupar por mês, companhia, canal, etiqueta pessoal/trabalho e rota                                                                                                                           | Entrevista                                                                                            |

## Respostas da entrevista (2026-10-29)

- **Objetivo:** uso pessoal, outras pessoas usando, vitrine no LinkedIn, possível produto. v1 só para o dono. Sucesso = três funcionalidades funcionando, mesmo simples. Sem prazo.
- **Rotina:** ponte aérea SDU↔CGH toda semana. RJ→SP segunda até 8h ou domingo tarde/noite. SP→RJ quinta a partir das 18h ou sexta até 13h.
- **Companhias:** Azul, Gol, LATAM. Internacional como capacidade futura (modelo multi-moeda, UI em R$).
- **Canais de compra:** site da companhia, agências online (123milhas, Zupper, Decolar), milhas (Smiles, TudoAzul, LATAM Pass, Livelo), agência corporativa.
- **Dores:** monitorar manualmente, esquecer check-in, comprar duplicado ou trecho errado, não saber gastos e créditos, perder promoção.
- **Monitor:** regra recorrente semanal + datas fixas/janelas + feriado prolongado. Horizonte longo e ajustável. Alvo em R$ com margem + sinais de histórico (média 30 dias, mínimo). Menor tarifa (item pessoal). Por monitor: conexão permitida e duração máxima, filtro de companhias, frequência (diário / 2× dia / semanal) com cota exibida.
- **Avisos:** e-mail, push (PWA) e Telegram, só ferramentas gratuitas. Imediatos para preço, check-in e nova passagem. Silêncio 23h–7h exceto check-in.
- **Feriados:** nacionais (fixos e móveis), estaduais e municipais selecionáveis (dono: SP), judaicos (início ao pôr do sol). Avisar perto de viagem/data monitorada, sugerir emendas, marcar preço inflado no histórico.
- **Orçamento:** até R$ 50/mês só para o uso do dono, gastando o mínimo. Domínio novo aceito.
- **Privacidade:** original 30 dias; RLS por usuário; exportar e apagar conta.
- **Visual:** pt-BR, PWA mobile-first instalável, responsivo para desktop, tema automático.
- **Login:** Google.
- **Check-in:** dois avisos (abertura por companhia + 24h antes se não marcado).
- **Créditos:** status cancelada/remarcada; reembolso em dinheiro; crédito/voucher com validade e saldo; milhas separadas de R$.
- **Regras:** conflito = sobreposição ou conexão < ~1h; duplicata = mesma rota, mesmo dia, localizadores diferentes; "cheguei por outro meio" silencia trecho faltando.
- **Custos de terceiros:** separação obrigatória (BYOK). Cadastro aberto na instância do dono, mas nada que custe funciona sem chave própria.

## Fora de escopo da v1

Monitor internacional e conversão de moeda; WhatsApp; compra no app; raspagem de sites; pular semanas por feriado; resumo diário; cota paga pelo dono para convidados.

## Convenções

- Commits pequenos e frequentes; push ao fim de cada etapa; GitHub é a única fonte da verdade.
- Nenhum segredo no repositório; `.env.example` lista os nomes.
- Lógica (datas, alertas, feriados, preços) em `src/lib/*` pura e testada com Vitest (`TZ=UTC` no runner).
- Toda função que gera custo verifica a chave do usuário e, sem ela, mostra estado "configurar".

## O que o M2 entregou

- `src/lib/holidays/`: Páscoa (Meeus), nacionais por lei com Carnaval/Cinzas/Corpus Christi como facultativos, 20/11 desde 2024; semente de 27 UFs e 6 cidades (`src/data/feriados-regionais.json`, gerada por `scripts/gerar-feriados-regionais.mjs` a partir do date-holidays, CC BY-SA 3.0); calendário hebraico próprio (diáspora e Israel, início ao pôr do sol, Tishá BeAv adiado do Shabat); cristãos móveis opcionais; `getHolidays`, `holidaysBetween`, `holidaysNear`.
- Migração `20261029010000_holidays.sql`: preferências no perfil e tabela `holiday_overrides` com RLS.
- Telas: Perfil (UF, cidade, facultativos, cristãos, judaicos, Israel) e `/app/calendario` (lista anual por mês, próximo feriado, ocultar, adicionar feriado próprio).
- Testes: 69 no total.

## O que o MVP de passagens entregou (2026-11-02)

- Migração `20261102000000_bookings.sql`: `bookings` (compra) e `flights` (trechos) com RLS, no modelo definitivo do plano.
- `src/lib/trips`: horário local ↔ UTC pelo fuso do aeroporto, próximos/passados, gasto por mês (milhas separadas), rascunho de formulário ↔ linhas do banco.
- `src/lib/extract`: extração com a chave do usuário (Haiku 5.5, reforço com Sonnet 5.5 se a validação falhar), saída estruturada; texto, imagem ou PDF.
- Telas: `/app` (próximo voo com contagem, feriado perto, check-in manual; próximos; gasto do mês; anteriores), `/app/passagens/nova` (Colar texto, Print/PDF, Manual), `/app/passagens/[id]` (editar, cancelar, apagar).
- Testes: 90 no total.

## O que o M4 entregou (2026-11-02)

- `src/lib/trips/checkin.ts`: janelas de check-in por companhia (Azul 72h, Gol e LATAM 48h, outras 24h; fecha 1h antes) e horários dos dois avisos para o M5. Valores públicos de 2026, numa tabela única para ajuste.
- `src/lib/trips/rules.ts`: alertas calculados na hora (sem tabela): check-in aberto, sobreposição, conexão < 60 min, trecho faltando (janela de 30 dias, silenciável por "Cheguei por outro meio" em `flights.ignore_missing_leg`), compra duplicada (mesma rota e dia local, reservas diferentes), crédito vencendo em até 30 dias.
- `src/lib/trips/reports.ts`: gasto por mês (canceladas incluídas, reembolsos no mês do recebimento), por companhia, canal, pessoal/trabalho, preço médio por trecho e saldo de créditos.
- Migração `20261102010000_refunds_credits.sql` com RLS.
- Telas: alertas no topo de Passagens com ações rápidas, estado do check-in no cartão do próximo voo, `/app/creditos`, `/app/gastos`, reembolsos/créditos na página da passagem.
- Testes: 104 no total.

## O que o M5 entregou (2026-11-02)

- Migração `20261102020000_notifications.sql`: `app_config` (sem policies, só service role), preferências de canal no perfil, `telegram_links`, `push_subscriptions`, `notification_log` (um aviso por evento).
- Workflow **Supabase — notificações e agendador** (`scripts/supabase-setup-jobs.mjs`, idempotente): gera chaves VAPID e segredo do agendador em `app_config`, grava a URL do app, agenda `pg_cron` a cada 5 min chamando `POST /api/jobs/tick` via `pg_net`, e, se houver `TELEGRAM_BOT_TOKEN` no GitHub, registra o webhook do bot. Nada sensível é impresso.
- `src/lib/notify`: eventos devidos (check-in na abertura e 24h antes; demais alertas do M4), janela silenciosa (só o de 24h fura), canais Telegram/push/e-mail (Resend opcional).
- Rotas: `/api/jobs/tick` (Bearer do `jobs_secret`), `/api/telegram/webhook` (`/start <token>` vincula; `/parar` desvincula), `/api/push/key`.
- PWA: `manifest.webmanifest`, ícones, `public/sw.js`. Tela `/app/notificacoes` com conectar Telegram, ativar push no aparelho, canais, teste e últimos avisos.
- Testes: 109 no total.

## O que o M6 entregou (2026-11-02)

- Migração `20261103000000_price_monitors.sql` (RLS por usuário): `price_monitors` (tipo semanal/datas/feriado prolongado, regra em JSON, horizonte, alvo + margem em R$ ou %, companhias, conexão, duração máxima, frequência, provedor, `next_check_at`), `price_checks` (cobertura e menor preço por checagem, base da tendência e do piloto), `price_observations` (até 5 voos mais baratos por data, com `near_holiday`) e `price_alerts` (fila de avisos, um por data e queda relevante).
- `src/lib/prices` (puro e testado):
  - `rule.ts` expande a regra em datas e janelas no horário local da origem; `PONTE_AEREA` traz as janelas da entrevista; feriado prolongado = folga ≥ 3 dias com emenda de terça/quinta.
  - `providers/` é o adaptador plugável: Travelpayouts `prices_for_dates` (uma requisição por data, token no cabeçalho `X-Access-Token`, mercado `br`), Duffel e SerpApi opcionais. Todos validam a chave de graça.
  - `filter.ts` aplica no cliente aeroporto exato (SDU ≠ GIG), janela, companhia (JJ = LA), conexão e duração.
  - `alerts.ts` define os sinais: no alvo, perto do alvo, menor já visto (≥ 5 observações) e ≤ 90% da média de 30 dias (≥ 10 observações, sem as datas a ±2 dias de feriado via `holidaysNear`). Repete o aviso da mesma data só com nova queda de R$ 10 ou 3%.
  - `schedule.ts` agenda as checagens às 7h (diário), 7h e 19h (2× ao dia) ou segunda 7h (semanal), no fuso do usuário, com desvio de 0–24 min por monitor. Também estima a cota (1 requisição por data-alvo).
- Agendador: `/api/jobs/tick` roda até 5 monitores vencidos por tick e envia os avisos pendentes (um por monitor, até 5 datas) pelos canais do M5. A janela silenciosa adia o envio, avisos de datas passadas são descartados e cada envio entra em `notification_log`. Falhas do monitor não derrubam os demais avisos.
- Telas:
  - `/app/monitor`: lista com último preço e tendência, datas e req/mês; estado "configurar Travelpayouts" sem token; atalho da ponte aérea.
  - `/app/monitor/novo` e `/app/monitor/[id]/editar`: formulário com cota estimada e aviso de cota grátis estourada.
  - `/app/monitor/[id]`: gráfico SVG do menor preço por checagem com linha do alvo, preços da última checagem com selo "feriado perto", avisos, "Verificar agora" (no máximo a cada 10 min), pausar e apagar.
  - `/app/monitor/piloto`: cobertura SDU↔CGH, mercados `br` e padrão, limite de 80%.
- Integrações: validação real e gratuita dos tokens de Travelpayouts, Duffel e SerpApi.
- Diagnóstico `supabase/diagnostics/piloto-precos.sql`: cobertura agregada dos últimos 7 dias por provedor e rota, sem dados pessoais.
- Monitores da ponte aérea do dono criados por migração idempotente; salvar uma chave de preço antecipa a checagem dos monitores daquele provedor.
- Testes: 135 no total.
- Pendências conhecidas: a documentação do Travelpayouts não abriu nesta sessão (domínio fora da rede permitida). O formato foi implementado de forma tolerante (aeroporto ou cidade, horário com fuso ou UTC) e o piloto confirma com dados reais. Ainda não há limpeza automática de observações antigas.
