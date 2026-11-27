#!/usr/bin/env bash
# Comando único de verificação: o mesmo no computador, na sessão do agente e na CI.
#   npm run verify          tudo (lint, formatação, tipos, testes, build)
#   npm run verify:rapido   sem o build (é o que o hook de parada roda)
# Saída curta: uma linha por etapa. O detalhe completo fica em .verificar.log;
# quando uma etapa falha, as últimas linhas dela aparecem aqui.
set -u
cd "$(dirname "$0")/.."
modo="${1:-completo}"
log=.verificar.log
: > "$log"

etapas=("lint:npm run lint" "formatação:npm run format:check" "tipos:npm run typecheck" "testes:npm test")
[ "$modo" = "rapido" ] || etapas+=("build:npm run build")

falhou=0
for etapa in "${etapas[@]}"; do
  nome="${etapa%%:*}"
  comando="${etapa#*:}"
  inicio=$SECONDS
  saida=$(mktemp)
  if $comando > "$saida" 2>&1; then
    echo "ok      $nome ($((SECONDS - inicio))s)"
  else
    falhou=1
    echo "FALHOU  $nome ($((SECONDS - inicio))s): $comando"
    tail -n 40 "$saida" | sed 's/^/    /'
  fi
  { echo "===== $nome: $comando"; cat "$saida"; } >> "$log"
  rm -f "$saida"
done

if [ "$falhou" -ne 0 ]; then
  echo "VERIFICAÇÃO FALHOU. Detalhe completo em $log"
  exit 1
fi
echo "VERIFICAÇÃO OK ($modo)"
