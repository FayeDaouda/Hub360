#!/bin/sh
# Envoie le code du poste de développement vers le serveur et relance le HUB.
#   deploy/envoyer.sh root@<IP-du-serveur>
# Seuls les fichiers versionnés partent, dans l'état du dernier commit
# (git archive) : un fichier non suivi du dossier (PDF, export, note) ou une
# modification non commitée reste sur le poste. Le commit envoyé est écrit
# dans /opt/hub/VERSION. deploy/.env et deploy/secrets/ du serveur ne sont
# jamais écrasés ni supprimés (créés une fois sur place).
set -eu
cible="${1:?Usage : deploy/envoyer.sh root@<IP-du-serveur>}"
racine="$(cd "$(dirname "$0")/.." && pwd)"
version="$(git -C "$racine" rev-parse --short HEAD)"
if [ -n "$(git -C "$racine" status --porcelain --untracked-files=no)" ]; then
  echo "Attention : modifications non commitées, non envoyées."
fi
copie="$(mktemp -d)"
trap 'rm -rf "${copie:?}"' EXIT
git -C "$racine" archive --format=tar HEAD | tar -x -C "$copie"
echo "$version" >"$copie/VERSION"
echo "Envoi du commit $version vers $cible"
rsync -az --delete \
  --exclude /design --exclude /e2e \
  --exclude .env --exclude /deploy/sauvegardes --exclude /deploy/secrets \
  "$copie/" "$cible:/opt/hub/"
ssh "$cible" 'cd /opt/hub/deploy && test -f .env || { echo "Créer d’abord /opt/hub/deploy/.env (cf. README)"; exit 1; }; docker compose --env-file .env up -d --build'
