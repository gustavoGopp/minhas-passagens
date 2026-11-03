# STATUS do projeto minhas-passagens

> Leia este arquivo no início de toda sessão. Ele é a memória do projeto: decisões, o que está pronto, próximos passos e as respostas da entrevista. Atualize-o ao fim de cada marco.

Última atualização: 2026-11-03 (revisão completa em `docs/REVISAO-2026-11.md`; Bloco 0 da revisão pronto)

## Estado atual

| Marco                             | Situação                                           |
| --------------------------------- | -------------------------------------------------- |
| M0 Fundação                       | Pronto                                             |
| M1 Login + banco                  | Pronto                                             |
| M2 Feriados                       | Pronto                                             |
| M3 Passagens: entrada e extração  | Pronto (MVP de passagens)                          |
| M4 Regras de passagens            | Pronto                                             |
| M5 Notificações + agendador       | Pronto (bot do Telegram depende do token do dono)  |
| M6 Monitor de preços              | Pronto; piloto do Travelpayouts até 09/11          |
| M7 E-mail de entrada              | Pendente (precisa de domínio `.com.br`, R$ 40/ano) |
| M8 Feriados × viagens e monitores | Pronto (+ segurança dos dados)                     |
| Revisão 2026-11, Bloco 0          | Pronto (ganhos rápidos; ver seção abaixo)          |
| M9 Acabamento v1 + post LinkedIn  | Pendente                                           |

## Próximos passos

1. Dono: criar `CRON_SECRET` nas variáveis da Vercel (gere com `openssl rand -base64 32`) e fazer Redeploy. **Desde o Bloco 0 o vigia diário exige o segredo**; sem ele, `/api/jobs/watchdog` responde 503 e o alerta de agendador parado fica desligado.
2. Dono: em Mais → Perfil, escolher "Cidade onde você mora" (liga o aviso de volta não comprada).
3. Dono: registrar as passagens já compradas (em 03/11 o banco tinha 0 passagens) e confirmar de quem é a 2ª conta criada em 03/11.
4. Claude: acompanhar o piloto até 09/11 com `piloto-precos.sql`. Leitura de 02/11: na janela de horário só 31,3% (CGH→SDU) e 0% (SDU→CGH). Desde o Bloco 0, erros do Travelpayouts contam como falha e não como "sem preço". Próximo bloco sugerido: piloto grátis da SerpApi (ver revisão, seção 6.6).
5. Dono: desativar no Google Cloud o secret antigo `****dmcf`.
6. Próximos blocos da revisão (escolha do dono): 1 fonte de preços, 2 importação do Gmail, 3 visual, 4 robustez, 5 testes, 6 abrir para outros.

## Histórico de incidentes

- **2026-11-02, login com Google falhando.** Causas: (a) nenhuma migração aplicada no banco; (b) Site URL do Supabase em `http://localhost:3000`; (c) Client Secret do Google no Supabase de outro secret ("Unable to exchange external code"). Correções: ponte via GitHub Actions aplicou as migrações e ajustou a Site URL; dono gerou secret novo no Google e colou no Supabase. Estado confirmado: 1 usuário, 1 perfil.

- **2026-11-02, produção parada no #10 (login) por "rate limited" na Vercel.** M4, M5 e M6 não foram publicados: cada push de branch gerava também um deploy de preview, que consumia o limite diário do plano Hobby. Correção: `vercel.json` com `git.deploymentEnabled` só para `main` (branches não geram mais preview); a produção é republicada quando o limite liberar.

- **2026-11-04, primeiros avisos de feriado sem e-mail.** O deploy do M8 registrou 8 avisos antes de a chave do Resend existir; o agendador registra o aviso mesmo sem canal, então eles não seriam reenviados. Correção a pedido do dono: migração `20261104010000_reenviar_avisos_feriado.sql` apaga só os avisos de feriado sem canal e o próximo ciclo reenvia. Diagnóstico `avisos.sql` mostra tipos, canais e contagens.

## Como o Claude opera o Supabase

- Workflows `supabase-migrate.yml` (automático no merge que muda `supabase/migrations/**`, ou manual) e `supabase-diagnostico.yml` (manual: `estado-schema.sql`, `auth-logs`, `auth-config`, ou ajuste de Site URL/Redirect URLs).
- Disparo: `gh api -X POST repos/gustavoGopp/minhas-passagens/actions/workflows/<arquivo>/dispatches -f ref=main -f 'inputs[alvo]=...'`; leitura: `gh run view <id> --log`.
- **Regra:** os logs do Actions são públicos. Diagnósticos só retornam nomes de objetos, contagens e erros técnicos, nunca dados pessoais. Toda consulta nova vira arquivo em `supabase/diagnostics/` revisável no PR.
- Migrações são idempotentes e registradas em `public.app_migrations`.
- Diagnósticos úteis: `piloto-precos.sql` (cobertura do provedor), `avisos.sql` (avisos por tipo e canal), `uso-banco.sql` (tamanho do banco e das tabelas, % dos 500 MB, minutos desde o último tick, última retenção).

## Segurança dos dados

- **Backup:** workflow `supabase-backup.yml`, todo domingo às 03:23 (Brasília) e sob demanda. Exporta pela Management API todas as tabelas do `public` + `auth.users` e `auth.identities` em JSON, compacta e cifra com GPG (AES-256, senha no segredo `BACKUP_PASSPHRASE`) **antes** de virar artefato. Sem a senha, falha antes de exportar. Artefato `supabase-backup`, retenção de 28 dias (4 cópias). O log mostra só nomes de tabela e contagens. Não entram: arquivos do Storage (originais duram 30 dias por decisão), agendamento do `pg_cron` (o workflow de notificações recria) e configuração do Auth.
- **Teste sem guardar nada:** rodar o backup com `modo = teste` exporta e simula a restauração inteira em `begin/rollback` contra o banco real.
- **Restaurar:**
  1. Actions → **Supabase — restaurar backup** → Run workflow.
  2. `run_id`: o número no fim da URL da execução do backup (ex.: `.../actions/runs/123456789`).
  3. Primeiro rode com `simular` ligado: confere a senha, o arquivo e cada tabela, sem gravar.
  4. Depois desligue `simular` e digite `RESTAURAR` em `confirmar`. O workflow aplica as migrações (banco novo fica com o schema atual) e restaura na ordem certa (Auth primeiro, depois pais antes dos filhos). Em conflito de chave primária vale a versão do backup; linhas mais novas não são apagadas. `tabelas` restringe (ex.: `bookings,flights`).
  5. Projeto novo do Supabase: ajustar `SUPABASE_PROJECT_REF`, rodar "Supabase — notificações e agendador" e trocar as chaves do Supabase na Vercel.
  - Restaurar no computador: baixar o artefato, `gpg -d supabase-AAAA-MM-DD.tar.gz.gpg > b.tar.gz && tar xzf b.tar.gz`, e rodar `node scripts/supabase-restore.mjs backup --simular` com `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_REF` no ambiente.
  - Atenção: o GitHub desliga workflows agendados após 60 dias sem commits no repositório.
- **Agendador parado:** todo tick autorizado grava `app_config.last_tick_at`. O vigia `/api/jobs/watchdog` roda 1×/dia pelo Vercel Cron (`vercel.json`, 11:17 UTC; no plano Hobby a hora pode variar dentro da hora), independente do `pg_cron`. Se o último tick tiver mais de 30 min: roda um tick de reconciliação (no máximo 1/h, sem gravar `last_tick_at`, para não esconder o problema) e manda e-mail ao dono (usuário mais antigo) com a chave Resend dele (no máximo 1 a cada 20 h). **Exige `CRON_SECRET` na Vercel** (sem ele responde 503). As duas travas (reconciliação e e-mail) são reservas atômicas em `app_config`: chamadas simultâneas não rodam ticks em paralelo.
- **Retenção:** uma vez por dia (UTC), o tick apaga `price_observations` com mais de 180 dias e `price_checks` com mais de 365 dias, e pausa monitores de feriadão 10 dias depois do início. Registro em `app_config.retention_last_run`.

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
| Agendador           | Supabase pg_cron + pg_net chamando `POST /api/jobs/tick` a cada 5 min; Vercel Cron diário como vigia e reconciliação (o fallback por Cloudflare Worker não foi implementado)                                                                                     | Precisão suficiente para check-in, custo zero, evita pausa do Supabase                                |
| Notificações        | Imediatas: preço no alvo, check-in (abertura por cia + 24h), nova passagem por e-mail. Janela silenciosa 23h–7h exceto check-in                                                                                                                                  | Entrevista                                                                                            |
| Retenção            | O original (texto, print, PDF) não é guardado: vai só para a extração e é descartado; ficam só dados estruturados. Preços: observações 180 dias, checagens 365 dias                                                                                              | Entrevista; banco Free de 500 MB                                                                      |
| Backup              | Export JSON semanal via Actions, cifrado com GPG AES-256 (segredo `BACKUP_PASSPHRASE`), artefato de 28 dias; restauração por workflow com simulação                                                                                                              | Supabase Free não tem backup; repositório e logs públicos                                             |
| Vigia do agendador  | Vercel Cron diário em `/api/jobs/watchdog`: tick > 30 min → reconciliação + e-mail ao dono pela chave Resend dele                                                                                                                                                | Independe do pg_cron; custo zero                                                                      |
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

## Avisos por e-mail com chave própria (2026-11-02)

- Provedor `resend` em Integrações (migração `20261103030000_resend_provider.sql`). A chave é do usuário, cifrada como as demais. Ao salvar, o app envia um e-mail de teste para o e-mail da conta e liga `notify_email`.
- Sem domínio próprio, o Resend só entrega no e-mail da conta que criou a chave, por isso a conta do Resend precisa ser do mesmo Gmail do app. Remetente: `onboarding@resend.dev`; com o domínio do M7, passa a ser o do app.
- O agendador e o botão de teste usam a chave do usuário; `RESEND_API_KEY` da instalação continua como fallback.
- Testes: 138 no total.

## O que o M8 entregou (2026-11-03)

- `src/lib/notify/holiday-events.ts` (puro, testado): três avisos pelo agendador, um por evento (`notification_log`), nenhum urgente (respeitam a janela silenciosa):
  - `holiday-flight:<voo>:<data>`: feriado a até 3 dias de um voo meu (data local da origem; voos ativos nos próximos 30 dias);
  - `holiday-monitor:<monitor>:<1ª data>`: feriado a ±2 dias de datas monitoradas, agrupadas em blocos de até 3 dias, com "o preço tende a subir". Ficam de fora os monitores do tipo feriado prolongado e os criados para um feriadão;
  - `long-weekend:<início>`: feriadão nas próximas 8 semanas, com a emenda sugerida.
- Feriados com as preferências do perfil (UF, cidade, facultativos, judaicos com início ao pôr do sol) e os ajustes do calendário (`holidaysAround`, `overridesFromRows`). A tela inicial passou a respeitar os ajustes e a usar ±3 dias.
- `rule.ts`: `longWeekends` devolve os dias de emenda (`bridges`); `upcomingLongWeekends`, `bridgeSuggestion`, `longWeekendPlan` (ida SP → RJ na véspera a partir das 18h ou no 1º dia até 13h; volta RJ → SP no último dia a partir das 12h ou no dia seguinte até 8h, as janelas da ponte aérea) e `horizonFor`.
- Telas: selo "feriado perto" nos voos (início e calendário); seção "Próximos feriadões" nas duas telas, com "Monitorar este feriadão", que cria os 2 monitores (tipo datas, copiando alvo, companhias e provedor do monitor semanal da mesma rota, ou R$ 250 ± R$ 50) e depois mostra "✓ Monitorando"; o calendário mostra os voos de cada mês.
- Monitor: o gráfico destaca (âmbar, com legenda) as checagens cujo menor preço caiu perto de feriado; a tabela destaca as linhas.
- Migração `20261104000000_m8_feriados.sql`: `price_monitors.long_weekend` e `price_checks.min_near_holiday`, com preenchimento das checagens antigas.
- Agendador refatorado em `src/lib/jobs/tick.ts` (`runTick`), usado pela rota do pg_cron e pelo vigia. Pacote de segurança dos dados descrito em "Segurança dos dados".
- Datas comemorativas (ex.: Chanucá) não geram aviso nem selo; continuam fora da média de 30 dias do monitor. Avisos de monitor cobrem as próximas 8 semanas.
- Testes: 160 no total.

## O que o Bloco 0 da revisão entregou (2026-11-03)

- **Avisos só contam como enviados quando algum canal entrega** (`src/lib/notify/delivery.ts`, puro e testado). Sem canal configurado, nada é registrado: o aviso sai quando houver canal, se ainda valer. Canal falhou: nova tentativa com espera de 5, 10, 20, 40 e 80 min (até 6 tentativas). `notification_log` ganhou `status`, `attempts`, `last_error` e `last_attempt_at`; `price_alerts` ganhou `attempts`, `last_error` e `last_attempt_at`. Aviso de preço sem canal é encerrado com `last_error = 'sem canal'` (preço é perecível). A tela de Notificações mostra "falhou, tentando de novo".
- **Tick isolado:** `try/catch` por usuário e por canal; timeout de 10 s no Telegram e no push; `userErrors` e `failed` no resultado do tick. Fuso do perfil validado no banco (`profiles_timezone_valid`, função `is_valid_timezone`).
- **Editar passagem não recria trechos** (`planLegChanges` em `src/lib/trips/draft.ts`): mantém ids, "check-in feito" e "cheguei por outro meio"; zera o check-in só se o voo mudar. Chaves de check-in incluem o horário, então uma remarcação gera aviso novo.
- **Vigia** exige `CRON_SECRET` e usa reserva atômica (`claimInterval`); `safeEqual` compara hashes.
- **Exportação** cobre todas as tabelas do usuário (`src/lib/account/export-tables.ts`; um teste lê as migrações e falha se faltar alguma).
- **Volta não comprada:** perfil com "Cidade onde você mora" (`profiles.home_city`); a última ida que termina fora de casa nos próximos 45 dias gera alerta e aviso, com "Volto por outro meio" (`flights.ignore_missing_return`).
- **Travelpayouts:** qualquer `success:false` é falha da data (não "sem preço"); 429 tenta mais uma vez.
- **Front-end:** `not-found`, `error`, `global-error` e `loading` em pt-BR; `io()` antes do cliente do Supabase (some o aviso de `Date.now()` na pré-renderização); contraste AA nos dois temas e rótulos que faltavam (axe: 0 violações em todas as telas); cabeçalhos `frame-ancestors`/`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Textos corrigidos: retenção dos originais (o campo de dias saiu do perfil), "e-mail encaminhado" na página inicial, README.
- Migração `20261105000000_avisos_entrega.sql` (idempotente). Apaga os avisos antigos registrados sem nenhum canal, para serem reavaliados.
- Testes: 182 no total.

## Bloco 2a: conectar o Gmail (2026-11-03)

- Integrações → **Gmail**: OAuth separado do login, escopo só de leitura (`gmail.readonly`), PKCE e cookie de estado assinado (`/api/gmail/start`, `/api/gmail/callback`). O refresh token fica em `user_integrations` (provider `gmail`) cifrado com **BYOK v2** (AES-256-GCM com AAD `user_id:provider`; chaves v1 antigas continuam legíveis e as novas já saem em v2).
- `mail_accounts` (RLS: dono só lê): e-mail, `history_id`, status (`active`/`expired`), datas e último erro técnico. Sem corpo nem assunto de e-mail.
- **Teste dos 8 dias:** o tick renova o acesso no máximo a cada 20 h. `invalid_grant` marca `expired` e gera o aviso "Reconecte o Gmail". O diagnóstico `gmail.sql` mostra status, dias desde a conexão e horas desde a última renovação OK.
- "Desconectar" e "Apagar conta" revogam o acesso no Google. A exportação inclui `mail_accounts`.
- Variáveis na Vercel: `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` (passo a passo no README, seção 5). Migração `20261106000000_gmail.sql`.

## Bloco 1: piloto da SerpApi e agendador robusto (2026-11-03)

- **Piloto híbrido** (`src/lib/prices/hybrid.ts`, puro e testado): com chave `serpapi` do usuário e monitor no Travelpayouts, as datas das próximas 2 semanas também vão ao Google Flights pela SerpApi. O Travelpayouts continua em todas as datas, para comparar nas mesmas datas. O menor preço dos dois alimenta observações e avisos.
- **Cota grátis protegida:** teto de 240 buscas/mês (o plano grátis tem 250), contado em `price_checks.near_requests` e conferido no `account.json` da SerpApi (que não gasta busca). Sem cota, a checagem segue só no Travelpayouts com `near_skipped = 'cota do mês'`. Nunca passa para o plano pago.
- `price_checks` ganhou `near_provider`, `near_dates`, `near_with_data`, `near_in_window`, `near_requests`, `near_tp_with_data`, `near_tp_in_window` e `near_skipped` (migração `20261107000000_piloto_serpapi.sql`). O `piloto-precos.sql` mostra a comparação, as buscas do mês e os motivos de pulo.
- Tela **Preços → Piloto**: tabela Google Flights × Travelpayouts (datas com voo na janela, 7 dias) e "buscas da SerpApi neste mês: X de 240".
- **Agendador:** avisos de preço e retenção rodam antes das checagens. Cada monitor é reservado antes de checar (`claimMonitor`; uma falha no meio volta a vencer em 30 min). Novas checagens param depois de 35 s do tick. No máximo 60 datas por checagem.

## Bloco 2b: importar passagens do Gmail (2026-11-03)

- **Passagens → Importar do Gmail** (`/app/passagens/importar`). A varredura anda em etapas curtas (`src/lib/mail/scan.ts`), pela tela (enquanto aberta) e pelo agendador (com o tempo que sobra no tick):
  1. **listing:** duas consultas com `in:anywhere` e `includeSpamTrash=true` (por remetente e por termos, 5 anos), só os ids;
  2. **filtering:** cabeçalhos (remetente, assunto, lista de e-mails), **sem IA**;
  3. **awaiting_confirmation:** mostra quantos e-mails parecem passagens e a estimativa de custo (`src/lib/mail/cost.ts`) e **espera o dono confirmar**;
  4. **processing:** baixa o corpo, aplica o pré-filtro por sinais (localizador, aeroporto, voo, valor) e só então chama o Haiku 5.5 com a chave do dono. Usa `allowEmpty` (propaganda não dispara o reforço com Sonnet) e a data do e-mail para deduzir o ano;
  5. **review:** lista para revisão.
- Cada e-mail é reservado antes da extração: duas chamadas ao mesmo tempo não pagam duas vezes. "Cancelar" vale na hora. Chave recusada ou sem crédito para a varredura com o motivo.
- **Revisão em lote:** a deduplicação (`src/lib/mail/dedupe.ts`) é recalculada contra as passagens atuais. Classifica cada candidato em nova, remarcação (mesmo localizador, outro horário: troca só os trechos e mantém valores), cancelamento ou já cadastrada (vem desmarcada). Inclui o link "Abrir no Gmail".
- **Dados:** `mail_scans`, `mail_messages` (só id, data, domínio do remetente, tipo e estado: **sem assunto nem corpo**) e `import_candidates` (rascunho até a decisão; apagado 30 dias depois). RLS só de leitura para o dono; tudo na exportação e na cascata. Migração `20261108000000_gmail_importacao.sql`.
- Testes com um Supabase falso em memória (`src/test/fake-supabase.ts`) e Gmail, Google e Anthropic falsos: listagem sem duplicar, filtro sem IA, confirmação antes de gastar, só metadados no banco, extração única sob concorrência, cancelamento e chave recusada. Um bug achado assim: o pré-filtro gravava "skip", que o CHECK do banco recusaria.

## Bloco 2c: sincronização contínua do Gmail (2026-11-03)

- Na confirmação da primeira varredura, o dono marca (vem marcado) "ler sozinho os e-mails novos de viagem". Em Integrações → Gmail dá para ligar e desligar (`mail_accounts.auto_sync`).
- A cada 30 min, o tick lê `history.list` desde o `history_id`, separa só os ids ainda não vistos e cria uma varredura `kind = 'sync'`. Ela usa o mesmo pré-filtro e a mesma extração, **sem pedir confirmação de novo** (o dono já autorizou), e o `history_id` avança. Com o histórico expirado (404), refaz a busca dos últimos 30 dias.
- Quando a sincronização deixa candidatos pendentes, sai o aviso "Passagens novas no Gmail" (um por sincronização), que leva à tela de revisão.
- `gmail.sql` passou a mostrar a leitura automática, os minutos desde a última sincronização e as contagens de varreduras, e-mails e candidatos.
- Migração `20261109000000_gmail_sync.sql`.

## Bloco 3, parte 1: anos claros, calendário em grade e duplicadas (2026-11-03)

- Pedido do dono depois da 1ª importação: passagens de 2026 e 2027 pareciam do mesmo ano, e havia duplicadas. O diagnóstico `passagens-anos.sql` (só contagens) mostrou 24 trechos em 2026, 2 em 2027, 1 trecho repetido e **15 voos com data de compra depois do voo**. Nos e-mails sem data de compra, o app usava o dia da importação.
- **Datas:** `formatInZone` mostra o ano sempre que não é o ano atual (no fuso do aeroporto). As listas de Passagens agrupam por ano, com o ano como título.
- **Calendário:** um mês por vez em grade (domingo a sábado), só com dias daquele mês, com voo (azul), feriado (vermelho), facultativo (âmbar) e hoje (anel). O ano fica grande no topo, os 12 meses viram atalhos com marcadores e o título é "Novembro de 2026". A navegação de mês vira o ano explicitamente. Abre no mês atual. Lógica pura em `src/lib/calendar/grid.ts`.
- **Importação:** a data da compra cai na data do e-mail quando não vem no texto. O prompt explica como deduzir o ano (o voo vem depois do e-mail e é o mais perto). A revisão mostra "confira o ano" para voo antes do e-mail ou quase um ano depois. A deduplicação também pega o mesmo voo e horário com códigos diferentes (pedido da agência × localizador).
- **Duplicada antiga:** o alerta "Possível compra duplicada" vale também para voos passados vindos do e-mail, com links para as duas.
- Migração `20261110000000_corrige_data_compra_importadas.sql`: corrige a data da compra das passagens já importadas para a data do e-mail, só onde ficou o valor padrão antigo.

## Bloco 3, parte 2: visual novo (2026-11-03)

- **Paleta:** a escala `zinc` do Tailwind foi redefinida em `globals.css` (`@theme`) com neutros próprios, e entraram os tokens `brand` (anil `#1E4FD8`, `#8FB0FF` no escuro), `brand-soft` e `on-brand-muted`. Fundo de "papel" (`#F6F5F1`) no claro e `#0E1116` no escuro. Contraste AA conferido por script e pelo axe.
- **Componentes base** em `src/components/ui.tsx` (`button`, `Card`, `Badge`, `SectionTitle`, `LinkButton`). Botões principais em anil e cartões e listas com fundo próprio em todas as telas.
- **Navegação:** barra de baixo com ícones (SVG próprio), 56 px mais a área segura do iPhone, item ativo destacado e "Mais" ativo nas telas de conta. No desktop, a barra vai para o topo e o conteúdo fica em `max-w-3xl`.
- **Próximo voo como cartão de embarque:** códigos IATA grandes em fonte mono, picote e canhoto com o localizador e o check-in. O canhoto fica verde quando o check-in abre.
- **"Comece por aqui"** (`src/lib/onboarding.ts`): Gmail, chave da Anthropic, avisos por e-mail, cidade de casa e monitor, marcados sozinhos. O cartão some quando tudo está feito.
- **Gráfico de preços:** texto com ~12 px reais no celular, linha em anil e faixa verde "no alvo".
- axe com 0 violações em todas as telas nos dois temas. Lighthouse das páginas públicas igual ao de antes (96–100).
