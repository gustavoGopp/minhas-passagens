# Pesquisa técnica (Etapa 2, 2026-10-29)

Resumo das opções avaliadas antes de começar a construir. Os números foram lidos em páginas oficiais via resultados de busca (a sessão não alcançava os sites diretamente) e devem ser reconfirmados ao criar cada conta.

## Fontes de preço de passagens

| Provedor                                                    | O que retorna                                                                                        | Azul/Gol/LATAM                                | Grátis                         | Pago                            | Fricção para indivíduo        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------ | ------------------------------- | ----------------------------- |
| Travelpayouts / Aviasales Data API (`prices_for_dates`)     | Menor preço por data com companhia, nº do voo e horário; cache de buscas de usuários nas últimas 48h | Incerto (sem evidência oficial para rotas BR) | Sim, 600 req/min               | —                               | Mínima                        |
| Duffel (live)                                               | Ofertas reais por voo                                                                                | Sim, via Travelport                           | Só test mode                   | US$ 0,005 por busca sem reserva | Alta (KYC)                    |
| SerpApi Google Flights                                      | Por voo, filtros de companhia e horário, BRL                                                         | Sim                                           | 250/mês                        | US$ 25/1k, US$ 75/5k            | Baixa                         |
| Ignav                                                       | Por voo                                                                                              | Não declarado                                 | 1.000 req                      | US$ 2/1k                        | Baixa                         |
| Amadeus Self-Service                                        | —                                                                                                    | —                                             | Encerrado em 17/07/2026        | —                               | —                             |
| Kiwi Tequila, Skyscanner, Kayak, Decolar, Sabre, Travelport | —                                                                                                    | —                                             | Convite, >100k MAU ou contrato | —                               | Inviável                      |
| FlightAPI.io, GoFlightLabs                                  | Por voo                                                                                              | Não verificado                                | Trial                          | ≥ US$ 49/mês                    | Baixa                         |
| Bibliotecas não oficiais do Google Flights                  | Por voo                                                                                              | Sim                                           | —                              | —                               | Viola termos de uso; excluído |

Decisão: adaptador plugável; piloto de 7 dias com Travelpayouts em SDU–CGH antes de fixar como fonte primária; Duffel e SerpApi opcionais com chave do usuário.

Fontes: https://www.phocuswire.com/amadeus-shut-down-self-service-apis-portal-developers · https://duffel.com/pricing · https://serpapi.com/pricing · https://support.travelpayouts.com/hc/en-us/articles/203956163 · https://support.travelpayouts.com/hc/en-us/articles/4402565416594-API-rate-limits

## Recebimento de e-mails encaminhados

| Provedor                                | Custo (~50/mês)                        | Catch-all          | Entrega                             | Assinatura      |
| --------------------------------------- | -------------------------------------- | ------------------ | ----------------------------------- | --------------- |
| Cloudflare Email Routing + Email Worker | US$ 0                                  | Só no domínio raiz | MIME cru no Worker; POST para o app | HMAC próprio    |
| Resend Inbound                          | US$ 0 (3.000/mês, 100/dia)             | MX em subdomínio   | Webhook de metadados; corpo via API | Svix            |
| Mailgun Free                            | US$ 0 (100/dia, 1 rota)                | Sim                | POST parseado                       | HMAC            |
| Postmark                                | US$ 16,50/mês                          | Sim                | JSON completo                       | Basic Auth + IP |
| SendGrid Inbound Parse                  | US$ 19,95/mês (free encerrado 05/2025) | Sim                | multipart                           | Nenhuma         |
| Amazon SES                              | ≈ US$ 0,01                             | Sim                | S3 + Lambda                         | SNS             |

Pontos de atenção: o Gmail só encaminha para endereço verificado (envia código ao destino; o app deve capturar e exibir); limite de 20 filtros com encaminhamento; contas corporativas podem bloquear; funções da Vercel aceitam no máximo 4,5 MB de corpo.

Decisão: Cloudflare Email Routing no domínio raiz (`u-<token>@dominio.com.br`), app em `app.dominio.com.br`, Resend Inbound como fallback. Domínio `.com.br` no Registro.br, R$ 40/ano.

## Extração com a API da Anthropic

| Modelo            | Input/MTok | Output/MTok | 20 e-mails + 10 prints por mês |
| ----------------- | ---------- | ----------- | ------------------------------ |
| Claude Haiku 5.5  | US$ 0,10   | US$ 0,50    | ≈ US$ 0,03                     |
| Claude Sonnet 5.5 | US$ 2      | US$ 10      | ≈ US$ 0,56                     |
| Claude Opus 5.5   | US$ 4      | US$ 20      | ≈ US$ 1,11                     |

Decisão: Haiku 5.5 padrão, Sonnet 5.5 como retry quando a validação do schema falhar. Saída estruturada por JSON Schema. Limpar HTML com `postal-mime` e `html-to-text` antes de enviar. Chave por usuário, cifrada com AES-256-GCM no servidor. Console da Anthropic aceita cadastro individual pré-pago.

Fonte: https://platform.claude.com/docs/en/about-claude/pricing

## Feriados

| Fonte                    | Nacionais + móveis | Estaduais          | Municipais         | Licença                           |
| ------------------------ | ------------------ | ------------------ | ------------------ | --------------------------------- |
| `date-holidays`          | Sim                | 27 UFs             | 6 cidades          | Código ISC; dados BR CC BY-SA 3.0 |
| Nager.Date API           | Sim                | Só SP              | Não                | MIT (rede)                        |
| BrasilAPI                | Sim                | 1 por UF           | Não                | MIT (rede)                        |
| Cálculo próprio          | Sim                | O que cadastrarmos | O que cadastrarmos | MIT                               |
| `@hebcal/core` (judaico) | Completo           | —                  | —                  | GPL-2.0-or-later                  |

Base legal: Lei 14.759/2023 (20/11 nacional desde 2024). Carnaval e Corpus Christi são ponto facultativo federal por portaria anual, não feriado nacional por lei.

Decisão: tudo local. Páscoa própria + tabela nacional por lei + semente regional gerada do `date-holidays` (com atribuição) + calendário hebraico implementado no projeto (licença MIT mantida). Modelo `holiday_events` com `starts_at_sunset`.

## Notificações e agendador

- Telegram: gratuito, um bot do app para todos, vínculo por deep link. Limites: 1 msg/s por chat.
- Web Push: `web-push` (MPL-2.0), VAPID. iOS ≥ 16.4 só com PWA instalado.
- E-mail: Resend free (3.000/mês, 100/dia). Brevo (300/dia) como fallback.
- Agendador: Supabase pg_cron + pg_net a cada minuto chamando `/api/jobs/tick`; Cloudflare Worker cron como fallback. Vercel Cron Hobby roda 1×/dia com precisão de hora; GitHub Actions atrasa e desativa após 60 dias sem commits.

## Stack

- Supabase Free: 500 MB, pg_cron/pg_net/Vault, pausa após ~7 dias sem atividade (pg_cron mitiga), sem backup (dump semanal via Actions). Pro US$ 25/mês.
- Vercel Hobby: funções 300 s, cron 1×/dia, 4 h/mês de CPU ativa, uso não comercial. Pro US$ 20/mês.
- Alternativas descartadas como base: Neon, Cloudflare Workers + D1, Railway/Fly, SvelteKit/Remix.
