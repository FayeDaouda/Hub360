#!/bin/sh
# Conservation des sauvegardes : les 7 dernières quotidiennes, les 4 dernières
# hebdomadaires (sauvegarde du dimanche) et les 12 dernières mensuelles (la
# première sauvegarde du mois). Lit des noms « hub-AAAAMMJJ-HHMM.dump » (un
# par ligne, n'importe quel ordre) et écrit ceux à supprimer. Le même calcul
# s'applique sur le serveur et sur chaque copie, à partir de leurs propres
# fichiers : une copie ne dépend jamais de ce qui reste sur le serveur.
#   ls /sauvegardes | rotation-sauvegardes.sh
set -eu
grep -E '^hub-[0-9]{8}-[0-9]{4}\.dump$' | sort -r | awk '
  # Jour de la semaine (0 = dimanche), méthode de Sakamoto.
  function jour_semaine(a, m, j) {
    if (m < 3) a -= 1
    return (a + int(a / 4) - int(a / 100) + int(a / 400) + decalage[m] + j) % 7
  }
  BEGIN { split("0 3 2 5 0 3 5 1 4 6 2 4", decalage, " ") }
  {
    noms[NR] = $0
    jour = substr($0, 5, 8); mois = substr($0, 5, 6)
    # Du plus récent au plus ancien : la première vue d un jour est la plus récente.
    if (!(jour in vus_jour)) {
      vus_jour[jour] = 1
      if (++jours <= 7) garder[$0] = 1
      if (jour_semaine(substr(jour, 1, 4) + 0, substr(jour, 5, 2) + 0, substr(jour, 7, 2) + 0) == 0 && ++dimanches <= 4) garder[$0] = 1
    }
    # La dernière vue d un mois est la plus ancienne : la première du mois.
    if (!(mois in premiere)) ordre_mois[++nb_mois] = mois
    premiere[mois] = $0
  }
  END {
    for (i = 1; i <= nb_mois && i <= 12; i++) garder[premiere[ordre_mois[i]]] = 1
    for (i = 1; i <= NR; i++) if (!(noms[i] in garder)) print noms[i]
  }
'
