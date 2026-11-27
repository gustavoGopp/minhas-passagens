# Estado

Teto de uma tela (60 linhas, conferido por teste). Aqui fica só o que está em aberto. Decisões estão em `DECISOES.md`, pendências nas issues do GitHub e o histórico no Git.

Atualizado em 27/11/2026.

## Onde estamos

- O app está em produção com as três funcionalidades: passagens (com importação do Gmail), monitor de preços e feriados. São 25 passagens e 2 contas; o cadastro de contas novas está fechado.
- A base de trabalho com IA está sendo aplicada em 6 etapas (39 mudanças). **Etapas 0 e 1 feitas.** A lista completa, com a evidência de cada item, está em https://claude.ai/artifact/DgjhGFEUdzvop9dWE2Q7wU

## Próximo passo: etapa 2a

Abrir uma sessão nova e colar o pedido abaixo.

> Leia `docs/ESTADO.md` e `docs/DECISOES.md`. Faça a etapa 2a da base de IA, um pull request no branch da sessão, nesta ordem:
>
> 1. Prove que as travas carregam: tente um push forçado e a edição de uma migração antiga; os dois devem ser bloqueados. Diga o resultado.
> 2. **P17:** job na CI com Postgres de verdade que aplica todas as migrações do zero, duas vezes, e roda testes de regras de acesso com dois usuários em cada tabela (cada teste provado quebrando a regra de propósito). Inclua o gatilho que liga a proteção em tabela nova e a sonda com a chave pública. Antes de escrever os testes, me mostre as regras em português ("B não vê passagem de A") para eu aprovar.
> 3. **P29:** testes de integração de cinco fluxos do servidor contra esse banco: ciclo do agendador (aviso sai uma vez só), salvar e editar passagem, importar do Gmail, checagem de preço com aviso e apagar conta.
> 4. **P15:** testes de ponta a ponta com Playwright em 5 percursos (entrar, cadastrar passagem, ver o próximo voo, criar monitor, abrir sem internet), com capturas em celular e desktop, claro e escuro, e checagem de acessibilidade. Só dados fictícios: o repositório é público.
> 5. **P16:** cenários de aceitação em português, que eu aprovo antes, protegidos por uma checagem que roda a versão da main.
>
> Use a página de achados (endereço acima) para os detalhes e a evidência de P15, P16, P17 e P29. Ao fim, peça uma revisão em sessão limpa e descreva o PR no modelo do repositório.

Depois vêm a etapa 2b (migrações com aprovação e ordem de publicação, chave de serviço, falhas visíveis, revisão limpa, roteiro de emergência, tipos gerados, prévia), a 3 (avaliação da extração), a 4 (qualidade contínua) e a 5 (modelo reutilizável).

## Esperando o dono

- Apagar os segredos gerais antigos do repositório e revogar a credencial antiga do Supabase.
- Criar a regra da main (PR obrigatório, check `gate`, sem push forçado) e ligar "apagar o branch ao mesclar". É a barreira de verdade contra envio direto para a main; as travas do agente só evitam descuido.
- Guardar a `BYOK_MASTER_KEY` num cofre de senhas.
- Escolher onde fica a segunda cópia do backup, fora do GitHub.
- Para a etapa 2b: decidir entre Sentry gratuito e registro só no banco; aceitar ou não um segundo projeto Supabase.
- Para a etapa 3: escolher a origem do gabarito da extração e onde ele fica.

## Em aberto

- PR 37 (calendário assinado com link secreto) aguarda a etapa 2 para ser testado e revisado.
- M7, e-mail de entrada: depende de comprar um domínio `.com.br`.
- 7 avisos de gravidade moderada em ferramentas de desenvolvimento (não vão para produção): o Dependabot deve propor a correção.
- Não verificado em tela: o formulário com moeda e o aviso de aeroporto desconhecido só têm teste de desenho; a etapa 2a traz os testes de ponta a ponta.
- A versão do npm usada na CI e no início de sessão (11.21.2) é fixada à mão em três arquivos.
