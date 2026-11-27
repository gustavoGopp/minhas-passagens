#!/usr/bin/env bash
# Instala a ferramenta do Supabase (CLI) numa versão fixa, conferida pelo hash.
# Usada pela CI para subir o Supabase local; nunca toca produção.
# Para atualizar: escolha uma versão com mais de 7 dias, baixe o arquivo e troque
# VERSAO e SHA256 (sha256sum supabase_linux_amd64.tar.gz).
set -euo pipefail
VERSAO="3.2.0"
SHA256="fb88b175a817563505be02c60872060bcb8d5c869a1aa5656eaeb085d4a2f1e4"
destino="${1:-${RUNNER_TEMP:-/tmp}/supabase-cli}"

mkdir -p "$destino"
arquivo="$destino/supabase.tar.gz"
curl -sSfL -o "$arquivo" \
  "https://github.com/supabase/cli/releases/download/v${VERSAO}/supabase_linux_amd64.tar.gz"
echo "${SHA256}  ${arquivo}" | sha256sum --check --quiet
tar -xzf "$arquivo" -C "$destino" supabase
rm -f "$arquivo"
"$destino/supabase" --version
if [ -n "${GITHUB_PATH:-}" ]; then echo "$destino" >> "$GITHUB_PATH"; fi
