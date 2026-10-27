#!/bin/sh
# Test de restauration sur les vraies données : la dernière sauvegarde est
# restaurée dans une base temporaire, comparée à la base en service
# (verifier-restauration.sh), puis la base temporaire est supprimée. Le
# résultat va dans derniere-verification.txt, à côté des sauvegardes, que le backend
# surveille (alerte si échec ou si le test n'a pas tourné depuis 8 jours).
# Planifié chaque dimanche juste après une sauvegarde fraîche (crontab de
# l'image) ; à la main : docker compose exec sauvegarde tester-restauration.sh
set -eu
[ -f /etc/sauvegarde.env ] && . /etc/sauvegarde.env
dossier=${SAUVEGARDES_DOSSIER:-/sauvegardes}
temporaire=hub_verification
statut="$dossier/derniere-verification.txt"
fichier=$(ls -1t "$dossier"/hub-*.dump 2>/dev/null | head -1)

ecrire() {
  printf '%s %s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$(basename "${fichier:-aucune}")" "$2" >"$statut"
  echo "Test de restauration : $1 — $2"
}

if [ -z "$fichier" ]; then
  ecrire echec "aucune sauvegarde à restaurer"
  exit 1
fi
psql -X -q -d "$PGDATABASE" -c "DROP DATABASE IF EXISTS $temporaire" -c "CREATE DATABASE $temporaire"
if ! PGDATABASE=$temporaire pg_restore --clean --if-exists --no-owner -d "$temporaire" "$fichier"; then
  psql -X -q -d "$PGDATABASE" -c "DROP DATABASE IF EXISTS $temporaire"
  ecrire echec "la restauration a échoué"
  exit 1
fi
if resultat=$(sh "$(dirname "$0")/verifier-restauration.sh" "$PGDATABASE" "$temporaire" 2>&1); then
  psql -X -q -d "$PGDATABASE" -c "DROP DATABASE $temporaire"
  ecrire ok "$(echo "$resultat" | tail -1 | sed 's/^✓ //')"
else
  psql -X -q -d "$PGDATABASE" -c "DROP DATABASE $temporaire"
  echo "$resultat"
  ecrire echec "données différentes (une écriture pendant le test peut l'expliquer : le relancer)"
  exit 1
fi
