@AGENTS.md

# minhas-passagens

App pessoal, em português, para organizar passagens aéreas, monitorar preços e ver feriados. Next.js 16 na Vercel, Supabase (login com Google, Postgres com regras de acesso por linha), API da Anthropic para extrair passagens. Tudo em planos gratuitos. O repositório é **público**: código, registros da CI e artefatos podem ser lidos por qualquer pessoa.

## O dono

- Não lê código. Confere abrindo o app, vendo capturas de tela e lendo resumos.
- Escreva para ele em português simples, com frases curtas. Explique um termo técnico na primeira vez.
- "Pronto" pede evidência: o comando e a saída, a contagem, a captura. Diga também o que não foi verificado.
- Ele junta os pull requests. Cada merge na main vira produção em minutos.
- Toda mensagem termina com **"O que você tem que fazer"**: no máximo 5 itens curtos, na ordem, ou "Nada agora". Pedido do dono em 27/11.

## Verificar

```bash
npm run verify
```

Roda lint, formatação, tipos, testes e build. É o mesmo comando da CI. Banco e navegador ficam em `npm run test:banco` e `npm run test:e2e`, contra o Supabase local (`scripts/banco-teste/instalar-supabase-cli.sh`, `dockerd`, `supabase start` e as variáveis de `supabase status -o env`); a CI roda os dois. `npm run verify:rapido` pula o build; um hook roda essa versão antes de cada fim de turno e devolve a falha.

## Sempre

- **Teste antes do código, visto falhar.** Teste escrito junto com o código tende a repetir o erro do código. Para regra de negócio, os exemplos vêm de uma tabela aprovada pelo dono (veja `src/lib/trips/money.test.ts`).
- **Migração nova para toda mudança de banco**, com `GRANT` explícito se criar tabela. O Supabase não concede mais acesso automático. Trava: `scripts/migracoes.test.mjs`.
- **Dado de fora do app é validado na entrada** (formulário, resposta de API, resposta do modelo). Valor ambíguo é recusado com mensagem, nunca gravado como outra coisa.
- **Descrição do PR no modelo** de `.github/pull_request_template.md`.
- **Revisão em sessão limpa antes de entregar zona sensível** (migração, regra de acesso, chave de serviço, cifra, extração, avisos, workflow de produção): skill `revisao-limpa`.

## Peça aprovação antes de

- **Instalar pacote novo.** Modelos inventam nomes de pacote e ataques rodam na instalação. Trava: hook `pacote-novo` e `.npmrc`.
- **Mudar cenários de aceitação, gabaritos ou tabelas de exemplos aprovadas** (`tests/aceitacao/`, `docs/regras-de-acesso.md` e, na etapa 3, os gabaritos). São o que julga o seu trabalho. Trava: checagem "Aprovação do dono" e hook `etiqueta-do-dono` (a etiqueta `aprovado-pelo-dono` só o dono põe).
- **Gastar dinheiro** (API paga, plano pago) ou chamar um serviço externo com dado real do dono.
- **Mudar workflows que tocam produção** ou a configuração de login.

## Nunca

- **Juntar pull request** ou fazer push na main. Quem junta é o dono. Trava: permissão negada, hook `bloquear-comando` e a regra da main no GitHub.
- **Editar migração que já está na main.** Ela já rodou em produção. Trava: hook `proteger-migracoes` e passo da CI.
- **Disparar restauração, migração manual, agendador ou ajuste de login.** Só o dono. Trava: hook `bloquear-workflow` e os ambientes do GitHub.
- **Ler ou escrever arquivos `.env`** (o `.env.example` é liberado). Trava: permissão negada e hook `proteger-segredos`.
- **Pôr dado pessoal em registro público**: e-mail, nome, localizador, token. Diagnóstico devolve só nomes de objetos e contagens. Trava: `scripts/supabase-diagnostico-lib.mjs`.
- **Enfraquecer, pular ou apagar um teste para a verificação passar.** Se o teste parece errado, pare e diga qual regra e qual teste discordam.

## Não precisa de aprovação

Ler qualquer arquivo, rodar a verificação, criar e alterar código e testes dentro da tarefa pedida, fazer commit e push no branch da sessão, abrir pull request quando o dono pediu a entrega, disparar o diagnóstico (só leitura) e o backup a partir da main.

## Armadilhas

- O Next.js desta versão mudou em relação ao que você conhece: leia o guia em `node_modules/next/dist/docs/` antes de mexer em rotas, cache ou formulários.
- As travas evitam descuido, não são um cofre: a barreira de verdade é a regra da main e os ambientes do GitHub. Valem em sessão comum de um único repositório. Em thread de Projects, hooks e permissões deste arquivo de configuração não carregam.
- O hook de comando lê o comando inteiro, inclusive o texto de um heredoc. Para criar arquivo, use as ferramentas de escrita, não `cat <<EOF`.
- A sessão não alcança o banco. Produção só pelos workflows; um Postgres local existe na máquina da sessão (`service postgresql start`) para testar SQL.
- Horário de voo é horário local do aeroporto; a conversão usa `src/lib/airports`. Aeroporto fora das listas vale como horário de Brasília e exige conferência do dono.
- Dinheiro é guardado em centavos e na moeda original. Só `BRL` entra nas somas.
- Um modelo e um nível de esforço por sessão, escolhidos no começo; só o subagente de busca (`.claude/agents/Explore.md`) usa o modelo econômico. Ao fim, informe o consumo (`/usage`) no resumo.

## Onde está cada coisa

| O quê                                  | Onde                                       |
| -------------------------------------- | ------------------------------------------ |
| Estado atual e próximo passo           | `docs/ESTADO.md` (uma tela)                |
| Decisões e seus motivos                | `docs/DECISOES.md`                         |
| Pesquisa de fornecedores (retrato)     | `docs/PESQUISA.md`                         |
| Procedimentos (migração, diagnóstico…) | `.claude/skills/`                          |
| Travas do agente e seus testes         | `.claude/hooks/`, `scripts/hooks.test.mjs` |
| Credenciais dos workflows              | `supabase/README.md`                       |
| Emergência (app, migração, vazamento)  | `docs/EMERGENCIA.md`                       |
| Usos da chave de serviço               | `scripts/chave-de-servico.mjs`             |
| Pendências                             | issues do GitHub                           |
| Histórico do que mudou                 | Git e pull requests                        |

Regra nova neste arquivo só depois de um erro repetido, com o motivo em uma frase. A cada troca de modelo, tire o que deixou de ser necessário.
