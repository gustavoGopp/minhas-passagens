# Estado

Teto de uma tela (60 linhas, conferido por teste). Aqui fica só o que está em aberto. Decisões estão em `DECISOES.md`, pendências nas issues do GitHub e o histórico no Git.

Atualizado em 27/11/2026.

## Onde estamos

- O app está em produção com as três funcionalidades: passagens (com importação do Gmail), monitor de preços e feriados. São 25 passagens e 2 contas; o cadastro de contas novas está fechado.
- A base de trabalho com IA está sendo aplicada em 6 etapas (39 mudanças). **Etapas 0, 1 e 2a feitas; a 2b está num pull request aberto, esperando o merge.** A lista completa está em https://claude.ai/artifact/DgjhGFEUdzvop9dWE2Q7wU
- Com a 2b: a migração de produção espera a CI verde e o clique do dono, e o app só é publicado depois dela; a chave de serviço tem lista curta (`scripts/chave-de-servico.mjs`); falhas do servidor vão para o banco e para o e-mail do vigia; há roteiro de emergência (`docs/EMERGENCIA.md`) e tipos do banco gerados.

## Próximo passo: etapa 3

Depois do merge da 2b, abrir uma sessão nova e colar o pedido abaixo.

> Leia `docs/ESTADO.md` e `docs/DECISOES.md`. Faça a etapa 3 da base de IA (avaliação da extração), um pull request no branch da sessão. Use a página de achados (endereço acima) para os detalhes. Antes de começar, me mostre o plano e o que depende de decisão minha. Os testes de banco e de ponta a ponta precisam continuar verdes; gabarito novo nasce de exemplos aprovados por mim.

Depois vêm a etapa 4 (qualidade contínua) e a 5 (modelo reutilizável).

## Esperando o dono

- Juntar o PR curto do Playwright (resolve o PR 51 do Dependabot, que fecha sozinho).
- **Antes de juntar a 2b:** na Vercel, criar o gancho de publicação da `main` (Settings → Git → Deploy Hooks) e guardar o endereço como segredo `PROD_VERCEL_DEPLOY_HOOK` no ambiente `producao-rotina` do GitHub. Sem ele, o app não é publicado.
- Pôr a etiqueta `aprovado-pelo-dono` no PR da 2b (muda `docs/regras-de-acesso.md`) e, depois do merge, aprovar a migração em Actions.
- Pôr o check `aprovacao` na regra da main, se ainda não estiver. Sem isso, a checagem de cenários só avisa, não bloqueia.
- Guardar a `BYOK_MASTER_KEY` num cofre de senhas.
- Escolher onde fica a segunda cópia do backup, fora do GitHub.
- Para a etapa 3: escolher a origem do gabarito da extração e onde ele fica.

## Em aberto

- Não verificado: se o gancho da Vercel publica com a publicação automática da main desligada. O primeiro merge da 2b é o teste; o plano B está em `docs/EMERGENCIA.md`.
- Os remendos para "app publicado antes da migração" (`src/lib/prices/repo.ts`, `src/lib/jobs/tick.ts`) podem sair agora que a ordem é garantida.
- PR 37 (calendário assinado com link secreto) pode agora ganhar testes de banco e de ponta a ponta antes de ser revisado.
- M7, e-mail de entrada: depende de comprar um domínio `.com.br`.
- 7 avisos de gravidade moderada em ferramentas de desenvolvimento (não vão para produção): o Dependabot deve propor a correção.
- Não verificado em tela: o aviso de moeda estrangeira no formulário só tem teste de desenho.
- A versão do npm usada na CI e no início de sessão (11.21.2) é fixada à mão em três arquivos; a do Supabase CLI (3.2.0), em `scripts/banco-teste/instalar-supabase-cli.sh`.
