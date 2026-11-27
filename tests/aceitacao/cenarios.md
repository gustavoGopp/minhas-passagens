# Cenários de aceitação

Aprovados pelo dono em 27/11/2026. Cada cenário tem um teste com o código no título (C1 a C7 em `tests/e2e/`, C8 em `tests/integracao/agendador.test.ts`); `scripts/cenarios.test.mjs` confere a ligação. Mudar este arquivo pede a etiqueta `aprovado-pelo-dono` no pull request.

## C1 — Entrar só pelo Google

- **Dado** que não entrei no app
- **Quando** abro qualquer página do app
- **Então** vou para a tela de entrada, cujo único caminho é "Entrar com Google"
- **E**, já tendo entrado, a tela de entrada me leva direto ao início

## C2 — Passagem em reais

- **Dado** que entrei no app
- **Quando** cadastro uma ida e volta Santos Dumont–Congonhas de R$ 1.000,00
- **Então** ela aparece com R$ 1.000,00 e os dois trechos
- **E** um valor ambíguo como "1,234" é recusado com mensagem, sem salvar

## C3 — Aeroporto desconhecido

- **Dado** que entrei no app
- **Quando** cadastro um voo saindo de um aeroporto fora das listas
- **Então** o app pede que eu confira os horários e só salva depois que marco "Conferi os horários"

## C4 — Próximo voo

- **Dado** que tenho um voo daqui a alguns dias
- **Quando** abro o início
- **Então** vejo o próximo voo com origem, destino e o horário local do aeroporto de partida

## C5 — Monitor de preço

- **Dado** que entrei no app
- **Quando** crio um monitor Santos Dumont → Congonhas com alvo de R$ 250
- **Então** ele aparece na lista de monitores com o alvo de R$ 250

## C6 — Sem internet

- **Dado** que já abri o app neste aparelho
- **Quando** fico sem internet e abro o app
- **Então** vejo o aviso "Sem conexão" e os próximos voos guardados, não a tela de erro do navegador

## C7 — Cada um vê o seu

- **Dado** que Ana e Bruno têm passagens
- **Quando** Bruno abre a lista ou o endereço de uma passagem da Ana
- **Então** não vê nada da Ana

## C8 — Aviso uma vez só

- **Dado** que o check-in de um voo abriu
- **Quando** o agendador roda várias vezes
- **Então** o aviso chega uma única vez
- **E**, se o envio falhar, chega na tentativa seguinte, também uma única vez
