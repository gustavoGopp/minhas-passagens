#!/usr/bin/env bash
# Gera os tipos do banco (P19) a partir do Supabase local, que aplicou todas as
# migrações do zero (`supabase start`). A CI roda isto e falha se o arquivo
# versionado ficar diferente: tipo velho nunca chega à main.
# Uso: npm run tipos:banco (precisa do Supabase local no ar).
set -euo pipefail
destino="src/lib/supabase/database.types.ts"
{
  echo "// Gerado por \`npm run tipos:banco\` a partir das migrações (Supabase local). Não edite à mão:"
  echo "// a CI regenera e falha se este arquivo estiver diferente."
  supabase gen types typescript --schema public 2>/dev/null
} > "$destino.tmp"
mv "$destino.tmp" "$destino"
npx prettier --write "$destino" > /dev/null
echo "Tipos gerados em $destino"
