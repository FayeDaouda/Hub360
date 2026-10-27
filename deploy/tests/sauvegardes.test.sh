#!/bin/sh
# Test de bout en bout des copies de sauvegarde, dans l'image de sauvegarde
# (CI) : la Storage Box et le second fournisseur sont remplacés par des
# dossiers locaux (alias rclone), le reste est réel (pg_dump, age, rclone,
# restauration, comparaison). Base d'origine : $PGDATABASE (démo).
#   docker run … -v deploy/tests:/tests:ro hub-sauvegarde sh /tests/sauvegardes.test.sh
set -eu
origine=$PGDATABASE
racine=$(mktemp -d)
mkdir -p "$racine/sauvegardes" "$racine/boite/hub" "$racine/distant/seau/hub"
export SAUVEGARDES_DOSSIER="$racine/sauvegardes"
export SAUVEGARDE_BOITE_HOTE=essai RCLONE_CONFIG_BOITE_TYPE=alias RCLONE_CONFIG_BOITE_REMOTE="$racine/boite"
export SAUVEGARDE_DISTANT_BUCKET=seau RCLONE_CONFIG_DISTANT_TYPE=alias RCLONE_CONFIG_DISTANT_REMOTE="$racine/distant"
age-keygen -o "$racine/cle.txt" 2>/dev/null
export SAUVEGARDE_CLE_PUBLIQUE="$(age-keygen -y "$racine/cle.txt")"

# Anciennes copies : seule la conservation 7 / 4 / 12 doit en rester.
for j in 01 02 03 04 05 06 07 08 09 10; do
  : >"$racine/boite/hub/hub-202601${j}-0230.dump"
  : >"$racine/distant/seau/hub/hub-202601${j}-0230.dump.age"
done

sauvegarde.sh
nom=$(ls "$racine/sauvegardes" | grep -E '^hub-.*\.dump$')
test -s "$racine/boite/hub/$nom"
chiffree="$racine/distant/seau/hub/$nom.age"
head -1 "$chiffree" | grep -q '^age-encryption.org/v1$'
if grep -q PGDMP "$chiffree"; then echo "✗ copie distante lisible en clair"; exit 1; fi
echo "✓ copies écrites : Storage Box en clair, second fournisseur chiffré"

reste_boite=$(ls "$racine/boite/hub" | wc -l | tr -d ' ')
reste_distant=$(ls "$racine/distant/seau/hub" | wc -l | tr -d ' ')
# Gardées : 7 quotidiennes (la sauvegarde du jour et du 10 au 05/01), le
# dimanche 04/01 et la première de janvier (01/01) ; les 02 et 03/01 partent.
[ "$reste_boite" = 9 ] && [ "$reste_distant" = 9 ] || {
  echo "✗ conservation des copies : $reste_boite et $reste_distant fichiers"
  ls "$racine/boite/hub" "$racine/distant/seau/hub"
  exit 1
}
echo "✓ conservation appliquée aux copies"

for copie in distant boite; do
  base="hub_${copie}"
  psql -X -q -d "$origine" -c "DROP DATABASE IF EXISTS $base" -c "CREATE DATABASE $base"
  if [ "$copie" = distant ]; then
    PGDATABASE=$base SAUVEGARDE_CLE_PRIVEE="$racine/cle.txt" restaurer.sh "distant:seau/hub/$nom.age" --oui
  else
    PGDATABASE=$base restaurer.sh "boite:hub/$nom" --oui
  fi
  verifier-restauration.sh "$origine" "$base"
  psql -X -q -d "$origine" -c "DROP DATABASE $base"
done
echo "✓ copies restaurées et identiques à la base d'origine"
rm -rf "$racine"
