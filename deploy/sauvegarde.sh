#!/bin/sh
# Sauvegarde de la base HUB, chaque nuit à 02:30 (et à la demande :
# docker compose exec sauvegarde sauvegarde.sh) :
#   1. pg_dump au format « custom », restaurable avec restaurer.sh ;
#   2. copie sur la Storage Box Hetzner (SFTP, clé SSH), si configurée ;
#   3. seconde copie chez un autre fournisseur (stockage compatible S3),
#      chiffrée avec age pour une clé publique : la clé privée n'est jamais
#      sur le serveur, une copie volée reste illisible ;
#   4. conservation 7 quotidiennes / 4 hebdomadaires / 12 mensuelles
#      (rotation-sauvegardes.sh), sur le serveur et sur chaque copie.
# Configuration : deploy/.env (docs/mise-en-production.md). Sans elle, seule
# la copie sur le serveur est faite.
set -eu
[ -f /etc/sauvegarde.env ] && . /etc/sauvegarde.env
dossier=${SAUVEGARDES_DOSSIER:-/sauvegardes}
nom="hub-$(date +%Y%m%d-%H%M).dump"
pg_dump -Fc -f "$dossier/$nom"
echo "Sauvegarde écrite : $dossier/$nom ($(du -h "$dossier/$nom" | cut -f1))"

# Supprime, dans un dossier distant, ce que la conservation ne garde pas.
conserver_distant() {
  rclone lsf "$1" --files-only | sed 's/\.age$//' | rotation-sauvegardes.sh | while read -r ancien; do
    rclone deletefile "$1/$ancien$2"
  done
}

if [ -n "${SAUVEGARDE_BOITE_HOTE:-}" ]; then
  rclone copyto "$dossier/$nom" "boite:hub/$nom"
  conserver_distant boite:hub ""
  echo "Copie envoyée sur la Storage Box ($SAUVEGARDE_BOITE_HOTE)."
else
  echo "Storage Box non configurée : pas de copie hors du serveur."
fi

if [ -n "${SAUVEGARDE_DISTANT_BUCKET:-}" ]; then
  age -r "${SAUVEGARDE_CLE_PUBLIQUE:?SAUVEGARDE_CLE_PUBLIQUE manquante}" -o "$dossier/$nom.age" "$dossier/$nom"
  rclone copyto "$dossier/$nom.age" "distant:$SAUVEGARDE_DISTANT_BUCKET/hub/$nom.age"
  rm -f "$dossier/$nom.age"
  conserver_distant "distant:$SAUVEGARDE_DISTANT_BUCKET/hub" .age
  echo "Copie chiffrée envoyée chez le second fournisseur ($SAUVEGARDE_DISTANT_BUCKET)."
else
  echo "Second fournisseur non configuré : pas de copie chiffrée."
fi

ls -1 "$dossier" | rotation-sauvegardes.sh | while read -r ancien; do rm -f "$dossier/$ancien"; done
