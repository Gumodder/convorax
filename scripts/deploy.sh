#!/usr/bin/env bash
# Deploy da Convorax. Roda NA VPS, como root.
#
# Este script e o unico comando que a chave de deploy do GitHub consegue
# executar (forced command no authorized_keys), entao ele nao aceita argumento
# nenhum e nao le nada do ambiente do cliente SSH: tudo que ele faz esta aqui.
#
# Se qualquer passo falhar, ele volta para o commit anterior e devolve codigo
# diferente de zero. Um deploy quebrado nunca fica de pe.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/convorax/app}"
APP_USER="${APP_USER:-convorax}"
SERVICE="${SERVICE:-convorax-api}"
BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/health}"

log() { printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }
erro() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; }

como_app() { sudo -u "$APP_USER" --preserve-env=HOME "$@"; }

cd "$APP_DIR"

# ---------------------------------------------------------------------------
# De onde saimos — e para onde voltar se der errado
# ---------------------------------------------------------------------------
COMMIT_ANTERIOR="$(git rev-parse HEAD)"
log "Commit atual: ${COMMIT_ANTERIOR:0:8}"

reverter() {
  erro "Deploy falhou. Voltando para ${COMMIT_ANTERIOR:0:8}..."
  como_app git reset --hard "$COMMIT_ANTERIOR" || true
  como_app npm --prefix backend  ci --omit=dev || true
  como_app npm --prefix frontend ci || true
  como_app npm --prefix frontend run build || true
  systemctl restart "$SERVICE" || true
  erro "Revertido. O site esta no estado anterior."
}

# ---------------------------------------------------------------------------
# Codigo novo
# ---------------------------------------------------------------------------
log "Buscando $BRANCH..."
como_app git fetch --prune origin "$BRANCH"
NOVO="$(git rev-parse "origin/$BRANCH")"

if [ "$NOVO" = "$COMMIT_ANTERIOR" ]; then
  log "Ja esta em ${NOVO:0:8}. Nada a fazer."
  exit 0
fi

log "Atualizando para ${NOVO:0:8}"
git --no-pager log --oneline "$COMMIT_ANTERIOR..$NOVO" | head -20

trap reverter ERR

como_app git reset --hard "$NOVO"

# ---------------------------------------------------------------------------
# Dependencias e build
# ---------------------------------------------------------------------------
# 'npm ci' falha de proposito se o package-lock nao bater com o package.json —
# e o que a gente quer: melhor parar aqui do que subir com arvore divergente.
log "Backend: instalando dependencias"
como_app npm --prefix backend ci --omit=dev

log "Frontend: instalando dependencias"
como_app npm --prefix frontend ci

# O Vite grava as variaveis DENTRO do bundle, entao o build tem que rodar depois
# de qualquer mudanca no .env do frontend.
log "Frontend: build"
como_app npm --prefix frontend run build

if [ ! -s "$APP_DIR/frontend/dist/index.html" ]; then
  erro "O build nao gerou dist/index.html"
  false
fi

# ---------------------------------------------------------------------------
# Restart e prova de vida
# ---------------------------------------------------------------------------
log "Reiniciando $SERVICE"
systemctl restart "$SERVICE"

log "Esperando o backend responder..."
for tentativa in $(seq 1 15); do
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    break
  fi
  if [ "$tentativa" -eq 15 ]; then
    erro "O backend nao respondeu em $HEALTH_URL depois de 15 tentativas."
    erro "Ultimas linhas do log:"
    journalctl -u "$SERVICE" -n 30 --no-pager >&2 || true
    false
  fi
  sleep 2
done

# O /token TEM que exigir login. Se isso voltar 200, a reescrita do backend nao
# esta no ar e o buraco de seguranca original continua aberto — melhor reverter
# do que deixar passar.
CODIGO="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
  "http://127.0.0.1:3001/token?room=11111111-1111-4111-8111-111111111111" || echo 000)"
if [ "$CODIGO" != "401" ]; then
  erro "/token devolveu $CODIGO, esperado 401 (sem login nao pode sair token)."
  false
fi

trap - ERR

log "Deploy OK: ${COMMIT_ANTERIOR:0:8} → ${NOVO:0:8}"
curl -s --max-time 5 "$HEALTH_URL"; echo
