# Estado

Teto de uma tela (60 linhas, conferido por teste). Aqui fica só o que está em aberto. Decisões estão em `DECISOES.md`, pendências nas issues do GitHub e o histórico no Git.

Atualizado em 27/11/2026.

## Onde estamos

- O app está em produção com as três funcionalidades: passagens (com importação do Gmail), monitor de preços e feriados. São 25 passagens e 2 contas; o cadastro de contas novas está fechado.
- A base de trabalho com IA está sendo aplicada em 6 etapas (39 mudanças). **Etapas 0 e 1 feitas; a 2a está no PR do branch `claude/practical-volta-1tatis`.** A lista completa está em https://claude.ai/artifact/DgjhGFEUdzvop9dWE2Q7wU
- A CI agora sobe um Supabase local e prova as regras de acesso (`docs/regras-de-acesso.md`), cinco fluxos do servidor e os cenários aprovados (`tests/aceitacao/cenarios.md`) no navegador, com capturas.

## Próximo passo: etapa 2b

Depois do merge da 2a, abrir uma sessão nova e colar o pedido abaixo.

> Leia `docs/ESTADO.md` e `docs/DECISOES.md`. Faça a etapa 2b da base de IA, um pull request no branch da sessão. Use a página de achados (endereço acima) para os detalhes de P18 (migração com aprovação e na ordem certa), P20 (chave de serviço com lista curta de usos), P21 (revisão em sessão limpa nas zonas sensíveis) e dos demais itens da 2b: falhas visíveis, roteiro de emergência, tipos gerados e prévia. Antes de começar, me mostre o plano e o que depende de decisão minha. Os testes de banco e de ponta a ponta da 2a precisam continuar verdes; teste novo de regra de acesso nasce de regra aprovada por mim.

Depois vêm a etapa 3 (avaliação da extração), a 4 (qualidade contínua) e a 5 (modelo reutilizável).

## Esperando o dono

- Juntar o PR da etapa 2a quando a CI estiver verde e as capturas conferidas.
- Depois do merge, pôr o check `aprovacao` na regra da main. Sem isso, a checagem de cenários só avisa, não bloqueia.
- Guardar a `BYOK_MASTER_KEY` num cofre de senhas.
- Escolher onde fica a segunda cópia do backup, fora do GitHub.
- Para a etapa 2b: decidir entre Sentry gratuito e registro só no banco; aceitar ou não um segundo projeto Supabase.
- Para a etapa 3: escolher a origem do gabarito da extração e onde ele fica.

## Em aberto

- PR 37 (calendário assinado com link secreto) pode agora ganhar testes de banco e de ponta a ponta antes de ser revisado.
- M7, e-mail de entrada: depende de comprar um domínio `.com.br`.
- 7 avisos de gravidade moderada em ferramentas de desenvolvimento (não vão para produção): o Dependabot deve propor a correção.
- Não verificado em tela: o aviso de moeda estrangeira no formulário só tem teste de desenho.
- A versão do npm usada na CI e no início de sessão (11.21.2) é fixada à mão em três arquivos; a do Supabase CLI (3.2.0), em `scripts/banco-teste/instalar-supabase-cli.sh`.
