#!/bin/sh
# Restaure la base HUB depuis une sauvegarde (écrase les données actuelles) :
#   docker compose stop backend
#   docker compose exec sauvegarde restaurer.sh <source> --oui
#   docker compose start backend
# Source : un fichier du serveur (/sauvegardes/hub-AAAAMMJJ-HHMM.dump), la
# Storage Box (boite:hub/hub-….dump) ou la copie chiffrée
# (distant:<bucket>/hub/hub-….dump.age, avec SAUVEGARDE_CLE_PRIVEE : le
# chemin, dans le conteneur, du fichier de clé privée age apporté pour
# l'occasion, jamais laissé sur le serveur).
set -eu
[ -f /etc/sauvegarde.env ] && . /etc/sauvegarde.env
source="${1:-}"; confirmation="${2:-}"
if [ -z "$source" ] || [ "$confirmation" != "--oui" ]; then
  echo "Usage : restaurer.sh <fichier.dump | boite:hub/… | distant:…/….dump.age> --oui   (les données actuelles seront remplacées)"
  exit 1
fi
travail=$(mktemp -d)
trap 'rm -rf "$travail"' EXIT
fichier=$source
case "$source" in
  boite:* | distant:*)
    rclone copyto "$source" "$travail/telechargee"
    fichier="$travail/telechargee"
    ;;
esac
case "$source" in
  *.age)
    age -d -i "${SAUVEGARDE_CLE_PRIVEE:?SAUVEGARDE_CLE_PRIVEE : fichier de clé privée age}" -o "$travail/dechiffree" "$fichier"
    fichier="$travail/dechiffree"
    ;;
esac
pg_restore --clean --if-exists --no-owner -d "$PGDATABASE" "$fichier"
echo "Base restaurée depuis $source."
