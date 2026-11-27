#!/bin/bash
# Início de sessão na nuvem: instala as dependências do projeto quando o
# package-lock.json mudou. No computador do dono não faz nada.
# Modelo da documentação do Claude Code (cloud-environments). Origem: pesquisa 1.3.
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 1
hashes=node_modules/.install_pkgs.sha256

if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  # Apaga os hashes antes: se a instalação falhar, roda de novo na próxima sessão.
  rm -f "$hashes"
  # O .npmrc (quarentena de versões novas) exige npm 11.10 ou mais novo.
  # Mesma versão fixada da CI (.github/workflows/ci.yml).
  versao=$(npm -v 2>/dev/null || echo 0.0.0)
  maior=${versao%%.*}
  resto=${versao#*.}
  menor=${resto%%.*}
  if [ "$maior" -lt 11 ] || { [ "$maior" -eq 11 ] && [ "$menor" -lt 10 ]; }; then
    npm install -g npm@11.21.2 --no-audit --no-fund >/dev/null 2>&1 ||
      echo "Aviso: não consegui atualizar o npm ($versao). A quarentena de versões novas do .npmrc não vale nesta sessão." >&2
  fi
  if npm ci --no-audit --no-fund; then
    sha256sum .claude/hooks/instalar-pacotes.sh package.json package-lock.json .npmrc > "$hashes" 2>/dev/null || rm -f "$hashes"
  fi
fi
exit 0
