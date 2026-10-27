#!/bin/sh
# Test de la conservation 7 / 4 / 12 : 400 jours de sauvegardes (02:30 chaque
# nuit, et 03:30 le dimanche avant le test de restauration), jusqu'au mardi
# 27/10/2026.
#   sh deploy/tests/rotation-sauvegardes.test.sh
set -eu
# Le script du dépôt, ou celui de l'image de sauvegarde (CI).
rotation="$(dirname "$0")/../rotation-sauvegardes.sh"
[ -f "$rotation" ] || rotation=$(command -v rotation-sauvegardes.sh)
noms=$(awk 'BEGIN {
  # Jours du 23/09/2025 au 27/10/2026 (400 jours), sans dépendre de date(1).
  split("31 28 31 30 31 30 31 31 30 31 30 31", fin, " ")
  a = 2025; m = 9; j = 23; js = 2   # 23/09/2025 : un mardi (0 = dimanche)
  for (n = 0; n < 400; n++) {
    printf "hub-%04d%02d%02d-0230.dump\n", a, m, j
    if (js == 0) printf "hub-%04d%02d%02d-0330.dump\n", a, m, j
    js = (js + 1) % 7
    lim = fin[m] + (m == 2 && a % 4 == 0 && (a % 100 != 0 || a % 400 == 0))
    if (++j > lim) { j = 1; if (++m > 12) { m = 1; a++ } }
  }
}')
a_supprimer=$(printf '%s\n' "$noms" | sh "$rotation")
gardees=$(printf '%s\n' "$noms" | grep -vxF "$a_supprimer" | sort)
attendues=$(sort <<'LISTE'
hub-20261027-0230.dump
hub-20261026-0230.dump
hub-20261025-0330.dump
hub-20261024-0230.dump
hub-20261023-0230.dump
hub-20261022-0230.dump
hub-20261021-0230.dump
hub-20261018-0330.dump
hub-20261011-0330.dump
hub-20261004-0330.dump
hub-20261001-0230.dump
hub-20260901-0230.dump
hub-20260801-0230.dump
hub-20260701-0230.dump
hub-20260601-0230.dump
hub-20260501-0230.dump
hub-20260401-0230.dump
hub-20260301-0230.dump
hub-20260201-0230.dump
hub-20260101-0230.dump
hub-20251201-0230.dump
hub-20251101-0230.dump
LISTE
)
if [ "$gardees" = "$attendues" ]; then
  echo "✓ conservation 7 / 4 / 12 : $(printf '%s\n' "$gardees" | wc -l | tr -d ' ') sauvegardes gardées sur $(printf '%s\n' "$noms" | wc -l | tr -d ' ')"
else
  echo "✗ conservation inattendue (attendues, puis gardées) :"
  travail=$(mktemp -d)
  printf '%s\n' "$attendues" >"$travail/attendues"
  printf '%s\n' "$gardees" >"$travail/gardees"
  diff -u "$travail/attendues" "$travail/gardees" || true
  rm -rf "$travail"
  exit 1
fi
