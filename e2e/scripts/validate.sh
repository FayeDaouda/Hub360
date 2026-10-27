#!/usr/bin/env bash
#
# Validation d'une PR avant fusion : série complète de captures (deux thèmes,
# tous les écrans, le verre) contre la référence prise sur la base, puis tests
# de fumée, puis forme des réponses de l'API (clés et types relevés pendant les
# captures, scripts/api-shapes.mjs : une clé disparue ou de type changé fait
# échouer). C'est la seule série qui vaut pour une fusion (jamais visual:quick).
#
#   bash scripts/validate.sh <git-ref> [base]        # base : main par défaut
#
# La branche est compilée pendant que la référence de la base est capturée.
# La référence n'est reprise que si la base, le jour ou le harnais ont changé
# (.reference/.meta) : plusieurs PR du même jour sur la même base la partagent.
set -euo pipefail

REF=${1:?git-ref}
BASE=${2:-main}
cd "$(dirname "$0")/.."
mkdir -p .state

harness=$(find playwright.config.ts support visual scripts -type f | sort | xargs cat | shasum | cut -c1-12)
meta="$(git rev-parse "$BASE^{commit}") $(date +%Y-%m-%d) $harness"

bash scripts/reference-env.sh build "$REF" >.state/prebuild.log 2>&1 &
prebuild=$!

if [[ "$(cat .reference/.meta 2>/dev/null)" != "$meta" ]]; then
  bash scripts/reference-env.sh up "$BASE"
  rm -rf .reference/api-shapes
  HUB_API_SHAPES_DIR="$PWD/.reference/api-shapes" npm run visual:baseline
  echo "$meta" >.reference/.meta
else
  echo "▶ reference of $BASE already taken today with this harness"
fi

wait "$prebuild" || { echo "✗ build of $REF failed (see .state/prebuild.log)" >&2; exit 1; }
bash scripts/reference-env.sh up "$REF"
status=0
rm -rf .state/api-shapes
HUB_API_SHAPES_DIR="$PWD/.state/api-shapes" npm run visual || status=$?
npm run smoke || status=$?
node scripts/api-shapes.mjs .reference/api-shapes .state/api-shapes || status=$?
bash scripts/reference-env.sh down
exit $status
