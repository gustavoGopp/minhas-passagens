---
name: revisao-limpa
description: Pedir a revisão de um pull request a uma sessão nova, que não participou da escrita. Use antes de entregar mudança em zona sensível (migrações, regras de acesso, chave de serviço, cifra, extração, avisos, workflows de produção).
---

# Revisão em sessão limpa

Quem escreveu o código tende a não ver o próprio erro. Na etapa 0, um revisor de fora achou 19 problemas, 2 graves. A revisão é só leitura do diff: não substitui os testes nem a CI.

## Quando pedir

Se o PR toca qualquer um destes, a revisão é obrigatória antes de dizer "pronto":

- `supabase/migrations/`, `docs/regras-de-acesso.md`, `tests/banco/`;
- a lista curta da chave de serviço (`scripts/chave-de-servico.mjs`) ou os arquivos dela;
- `src/lib/crypto/`, `src/lib/integrations/`, `src/lib/extract/`, `src/lib/notify/`, `src/lib/mail/`;
- `.github/workflows/` que tocam produção, `vercel.json`, `.claude/hooks/`.

Fora disso, não peça: revisão em tudo é custo sem retorno.

## Como pedir

1. Faça push do branch e abra o PR (a revisão lê o diff do PR).
2. Abra uma **sessão nova** com a ferramenta `create_session` (servidor `claude-code-remote`), no mesmo repositório e no branch do PR. A sessão nova recebe só:
   - o número do PR e o comando para ver o diff: `git diff origin/main...HEAD`;
   - a especificação: o que o dono pediu e as regras aprovadas que valem (cite os arquivos, não cole a conversa);
   - o pedido: "Revise só o diff. Aponte apenas o que é grave: dado de uma pessoa visível a outra, gravação errada, falha silenciosa, produção sem a aprovação do dono, teste que não prova o que diz. Para cada achado: arquivo, linha, o que acontece e um cenário concreto. Não altere arquivos, não faça push, não comente no GitHub."
   - **Nunca** a conversa desta sessão nem o seu resumo do que fez.
3. Espere o resultado (`list_events` da sessão nova). Confira cada achado no código: o revisor erra também.
4. Corrija o que for real, com teste quando couber, e rode `npm run verify` de novo.
5. No PR, na seção "Revisão em sessão limpa": quantos achados, quais foram corrigidos e por que os outros foram descartados.

"Sem achados" não conta como aprovação: quem aprova é o dono, com a CI verde.

Fora da nuvem (Claude Code no computador), o equivalente é abrir uma sessão nova no mesmo repositório e pedir `/code-review` com o mesmo texto do passo 2.
