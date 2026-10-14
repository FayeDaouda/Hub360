#!/bin/sh
# Restaure la base HUB depuis une sauvegarde (écrase les données actuelles).
#   docker compose stop backend
#   docker compose exec sauvegarde restaurer.sh /sauvegardes/hub-AAAAMMJJ-HHMM.dump --oui
#   (ou une copie distante : s3://<bucket>/postgres/hub-….dump)
#   docker compose start backend
set -eu
[ -f /etc/sauvegarde.env ] && . /etc/sauvegarde.env
source="${1:-}"; confirmation="${2:-}"
if [ -z "$source" ] || [ "$confirmation" != "--oui" ]; then
  echo "Usage : restaurer.sh <fichier.dump | s3://…> --oui   (les données actuelles seront remplacées)"
  exit 1
fi
case "$source" in
  s3://*) aws s3 cp "$source" /tmp/restauration.dump --endpoint-url "$S3_ENDPOINT"; source=/tmp/restauration.dump ;;
esac
pg_restore --clean --if-exists --no-owner -d "$PGDATABASE" "$source"
echo "Base restaurée depuis $1."
