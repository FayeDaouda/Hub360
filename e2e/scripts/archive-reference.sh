#!/usr/bin/env bash
#
# Archive la référence de captures sur laquelle reposait une décision de
# fusion, pour pouvoir la vérifier après coup.
#
#   bash scripts/archive-reference.sh <n° de PR> <réf. de base> <réf. comparée> <journal du run>
#
# À lancer juste après la comparaison qui valide la PR, avant la fusion.
# L'archive contient e2e/.reference (la référence prise sur <réf. de base>),
# le journal du run et les commits en jeu. Elle va dans la version GitHub
# « captures-references » (une pièce jointe par PR) ; les pièces de plus de
# RETENTION_DAYS jours sont supprimées : quelques mois d'historique.
set -euo pipefail

PR=${1:?numéro de PR}
BASE_REF=${2:?révision de la référence (ex. main)}
COMPARED_REF=${3:?révision comparée (ex. la branche de la PR)}
RUN_LOG=${4:?journal du run de comparaison}
RETENTION_DAYS=${RETENTION_DAYS:-120}
TAG=captures-references

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
REFERENCE="$ROOT/e2e/.reference"
[[ -d "$REFERENCE" ]] || { echo "✗ pas de référence dans $REFERENCE" >&2; exit 1; }
[[ -f "$RUN_LOG" ]] || { echo "✗ journal introuvable : $RUN_LOG" >&2; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
NAME="pr-$PR-$(date -u +%Y%m%d)-$(git -C "$ROOT" rev-parse --short "$COMPARED_REF")"
mkdir "$WORK/$NAME"
cp -R "$REFERENCE" "$WORK/$NAME/reference"
cp "$RUN_LOG" "$WORK/$NAME/run.log"
{
  echo "PR             #$PR"
  echo "date (UTC)     $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "référence      $BASE_REF $(git -C "$ROOT" rev-parse "$BASE_REF")"
  echo "comparée       $COMPARED_REF $(git -C "$ROOT" rev-parse "$COMPARED_REF")"
  echo "harnais        $(git -C "$ROOT" rev-parse HEAD) ($(git -C "$ROOT" branch --show-current))"
  echo "captures       $(find "$REFERENCE" -name '*.png' | wc -l | tr -d ' ')"
} >"$WORK/$NAME/metadata.txt"
tar -C "$WORK" -czf "$WORK/$NAME.tar.gz" "$NAME"

if ! gh release view "$TAG" >/dev/null 2>&1; then
  gh release create "$TAG" --prerelease --title "Références des captures" \
    --notes "Référence de captures utilisée pour chaque fusion (e2e/scripts/archive-reference.sh), conservée $RETENTION_DAYS jours."
fi
gh release upload "$TAG" "$WORK/$NAME.tar.gz" --clobber
echo "✓ archivée : $TAG / $NAME.tar.gz"

# Rétention : les archives de plus de RETENTION_DAYS jours sont supprimées.
LIMIT=$(date -u -v-"${RETENTION_DAYS}"d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "-$RETENTION_DAYS days" +%Y-%m-%dT%H:%M:%SZ)
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
gh api "repos/$REPO/releases/tags/$TAG" --jq ".assets[] | select(.created_at < \"$LIMIT\") | \"\(.id) \(.name)\"" |
  while read -r id name; do
    gh api -X DELETE "repos/$REPO/releases/assets/$id" >/dev/null
    echo "  supprimée (plus de $RETENTION_DAYS jours) : $name"
  done
