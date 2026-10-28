#!/usr/bin/env bash
# Prepara a VPS para receber deploy automatico do GitHub Actions.
# Roda UMA VEZ, na VPS, como root:
#
#   bash /opt/convorax/app/scripts/setup-deploy-key.sh
#
# No fim ele imprime exatamente o que colar em cada secret do GitHub.
#
# A chave criada aqui NAO da shell na maquina: o authorized_keys amarra ela a um
# unico comando (o deploy.sh). Quem roubar a chave consegue disparar um deploy
# do seu proprio repositorio — e mais nada. Sem shell, sem tunel, sem sftp.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/convorax/app}"
APP_USER="${APP_USER:-convorax}"
CHAVE="/root/.ssh/convorax_deploy"
COMANDO="/usr/local/bin/convorax-deploy"

[ "$(id -u)" -eq 0 ] || { echo "Rode como root."; exit 1; }
[ -d "$APP_DIR" ] || { echo "Nao achei $APP_DIR. Clone o repositorio primeiro (DEPLOY.md, passo 2)."; exit 1; }

# ---------------------------------------------------------------------------
# 1. O comando unico que a chave pode executar
# ---------------------------------------------------------------------------
install -m 755 "$APP_DIR/scripts/deploy.sh" "$COMANDO"
echo "✓ $COMANDO instalado"

# ---------------------------------------------------------------------------
# 2. A chave
# ---------------------------------------------------------------------------
if [ -f "$CHAVE" ]; then
  echo "✓ chave ja existe em $CHAVE (reaproveitando)"
else
  ssh-keygen -t ed25519 -f "$CHAVE" -N "" -C "github-actions-convorax" >/dev/null
  echo "✓ chave nova gerada"
fi

# ---------------------------------------------------------------------------
# 3. authorized_keys com forced command
# ---------------------------------------------------------------------------
mkdir -p /root/.ssh && chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys

PUB="$(cat "$CHAVE.pub")"
LINHA="command=\"$COMANDO\",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding $PUB"

# remove versao antiga da mesma chave antes de regravar, para nao duplicar
IMPRESSAO="$(awk '{print $2}' "$CHAVE.pub")"
grep -vF "$IMPRESSAO" /root/.ssh/authorized_keys > /root/.ssh/authorized_keys.novo || true
mv /root/.ssh/authorized_keys.novo /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
printf '%s\n' "$LINHA" >> /root/.ssh/authorized_keys
echo "✓ authorized_keys amarrado ao comando unico"

# ---------------------------------------------------------------------------
# 4. Confere que o usuario da aplicacao consegue falar com o GitHub
# ---------------------------------------------------------------------------
if sudo -u "$APP_USER" git -C "$APP_DIR" ls-remote origin -q >/dev/null 2>&1; then
  echo "✓ $APP_USER alcanca o repositorio"
else
  echo "⚠ $APP_USER NAO alcanca o repositorio — o deploy vai falhar no git fetch."
  echo "  Se o repo for privado, configure a credencial do $APP_USER antes."
fi

# ---------------------------------------------------------------------------
# 5. O que colar no GitHub
# ---------------------------------------------------------------------------
cat <<FIM

═══════════════════════════════════════════════════════════════════════
Agora vá em: Settings → Secrets and variables → Actions → New secret
(no repositório, em github.com/Gumodder/convorax)

Crie os quatro secrets abaixo.

───────────────────────────── VPS_HOST ─────────────────────────────
$(curl -s --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')

───────────────────────────── VPS_USER ─────────────────────────────
root

────────────────────────── VPS_KNOWN_HOSTS ─────────────────────────
$(ssh-keyscan -t ed25519 127.0.0.1 2>/dev/null | sed "s/^127.0.0.1/$(curl -s --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')/")

─────────────────────────── VPS_SSH_KEY ────────────────────────────
(copie TUDO, incluindo as linhas BEGIN e END)

$(cat "$CHAVE")
───────────────────────────────────────────────────────────────────────

Depois disso, apague a chave privada daqui — ela já estará no GitHub:

    shred -u $CHAVE

Teste sem sair da VPS:

    $COMANDO

FIM
