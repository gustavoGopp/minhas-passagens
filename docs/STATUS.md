# STATUS do projeto minhas-passagens

> Leia este arquivo no início de toda sessão. Ele é a memória do projeto: decisões, o que está pronto, próximos passos e as respostas da entrevista. Atualize-o ao fim de cada marco.

Última atualização: 2026-10-29 (M1 implementado; aguardando contas para validar)

## Estado atual

| Marco                             | Situação                                                       |
| --------------------------------- | -------------------------------------------------------------- |
| M0 Fundação                       | **Em andamento** nesta sessão                                  |
| M1 Login + banco                  | Pendente (precisa de conta Supabase e credencial Google OAuth) |
| M2 Feriados                       | Pendente                                                       |
| M3 Passagens: entrada e extração  | Pendente                                                       |
| M4 Regras de passagens            | Pendente                                                       |
| M5 Notificações + agendador       | Pendente                                                       |
| M6 Monitor de preços              | Pendente (piloto Travelpayouts primeiro)                       |
| M7 E-mail de entrada              | Pendente (precisa de domínio `.com.br`, R$ 40/ano)             |
| M8 Feriados × viagens e monitores | Pendente                                                       |
| M9 Acabamento v1 + post LinkedIn  | Pendente                                                       |

## Próximos passos

1. Terminar M0: commit e push da fundação; conectar o repositório na Vercel (Hobby) para preview.
2. M1: criar projeto Supabase (free), credencial Google OAuth, variáveis na Vercel. Pedir confirmação ao dono antes (contas gratuitas, mas exigem dados dele).

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
