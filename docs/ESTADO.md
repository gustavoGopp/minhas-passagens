# Estado

Teto de uma tela (60 linhas, conferido por teste). Aqui fica só o que está em aberto. Decisões estão em `DECISOES.md`, pendências nas issues do GitHub e o histórico no Git.

Atualizado em 27/11/2026.

## Onde estamos

- O app está em produção com as três funcionalidades: passagens (com importação do Gmail), monitor de preços e feriados. São 25 passagens e 2 contas; o cadastro de contas novas está fechado.
- A base de trabalho com IA está sendo aplicada em 6 etapas (39 mudanças). **Etapas 0, 1, 2a e 2b feitas.** A lista completa está em https://claude.ai/artifact/DgjhGFEUdzvop9dWE2Q7wU
- Com a 2b: a migração de produção espera a CI verde e o clique do dono, e o app só é publicado depois dela; a chave de serviço tem lista curta (`scripts/chave-de-servico.mjs`); falhas do servidor vão para o banco e para o e-mail do vigia; há roteiro de emergência (`docs/EMERGENCIA.md`) e tipos do banco gerados. O histórico de preço só o servidor grava e a chave cifrada não vai ao navegador.

## Próximo passo: etapa 3 em andamento (PR 55)

Já no PR 55 (branch claude/sharp-mendel-im56vf): corretor, limites, rodada de verdade pela etiqueta `avaliar-extracao`, teto de 30 leituras, 3 tentativas e gasto real. O P26 (e-mail como dado) está no branch claude/sharp-mendel-im56vf-p26 e entra depois da rodada 1. Falta o gabarito. Com o conector do Gmail ligado, abrir uma sessão nova no branch do PR e colar:

> Leia `docs/ESTADO.md`, `docs/DECISOES.md` e o plano no PR 55. Continue a etapa 3 no branch claude/sharp-mendel-im56vf. Procure no meu Gmail (só leitura, `in:anywhere`, as buscas de `scanQueries` em `src/lib/mail/gmail.ts`) os e-mails de passagem; mostre primeiro só a lista (data, remetente, assunto com localizador mascarado) separada por tipo, e eu escolho. Anonimize antes de gravar e me mostre as trocas. Depois: teste de repetição, rodada 1, juntar o P26, rodada 2, revisão limpa e entrega.

Depois vêm a etapa 4 (qualidade contínua) e a 5 (modelo reutilizável).

## Esperando o dono

- Pôr o check `aprovacao` na regra da main, se ainda não estiver. Sem isso, a checagem de cenários só avisa, não bloqueia.
- Guardar a `BYOK_MASTER_KEY` num cofre de senhas.
- Escolher onde fica a segunda cópia do backup, fora do GitHub.
- Para a etapa 3: ligar o conector do Gmail; criar o ambiente `avaliacao-ia` com a chave da avaliação.

## Em aberto

- Os remendos para "app publicado antes da migração" (`src/lib/prices/repo.ts`, `src/lib/jobs/tick.ts`) podem sair agora que a ordem é garantida.
- PR 37 (calendário assinado com link secreto) pode agora ganhar testes de banco e de ponta a ponta antes de ser revisado.
- M7, e-mail de entrada: depende de comprar um domínio `.com.br`.
- 7 avisos de gravidade moderada em ferramentas de desenvolvimento (não vão para produção): o Dependabot deve propor a correção.
- Não verificado em tela: o aviso de moeda estrangeira no formulário só tem teste de desenho.
- A versão do npm usada na CI e no início de sessão (11.21.2) é fixada à mão em três arquivos; a do Supabase CLI (3.2.0), em `scripts/banco-teste/instalar-supabase-cli.sh`.
