#!/bin/sh
# Envoie le code du poste de développement vers le serveur et relance le HUB.
#   deploy/envoyer.sh root@<IP-du-serveur>
# Le fichier deploy/.env du serveur n'est jamais écrasé (créé une fois sur place).
set -eu
cible="${1:?Usage : deploy/envoyer.sh root@<IP-du-serveur>}"
racine="$(cd "$(dirname "$0")/.." && pwd)"
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude dist --exclude .git \
  --exclude scratchpad --exclude design --exclude '*.tsbuildinfo' \
  --exclude .env --exclude .env.local --exclude deploy/sauvegardes \
  "$racine/" "$cible:/opt/hub/"
ssh "$cible" 'cd /opt/hub/deploy && test -f .env || { echo "Créer d’abord /opt/hub/deploy/.env (cf. README)"; exit 1; }; docker compose --env-file .env up -d --build'
