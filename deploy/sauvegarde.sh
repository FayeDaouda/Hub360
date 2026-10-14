#!/bin/sh
# Sauvegarde de la base HUB : format pg_dump « custom » (restaurable avec
# restaurer.sh), 14 copies locales gardées, envoi vers le stockage objet si
# configuré. Lancement manuel : docker compose exec sauvegarde sauvegarde.sh
set -eu
[ -f /etc/sauvegarde.env ] && . /etc/sauvegarde.env
fichier="/sauvegardes/hub-$(date +%Y%m%d-%H%M).dump"
pg_dump -Fc -f "$fichier"
echo "Sauvegarde écrite : $fichier ($(du -h "$fichier" | cut -f1))"
ls -1t /sauvegardes/hub-*.dump | tail -n +15 | xargs -r rm -f
if [ -n "${S3_BUCKET_SAUVEGARDES:-}" ] && [ -n "${S3_ENDPOINT:-}" ]; then
  aws s3 cp "$fichier" "s3://${S3_BUCKET_SAUVEGARDES}/postgres/" --endpoint-url "$S3_ENDPOINT"
  echo "Copie envoyée vers s3://${S3_BUCKET_SAUVEGARDES}/postgres/"
else
  echo "Stockage objet non configuré : copie locale seulement."
fi
