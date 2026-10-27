#!/usr/bin/env bash
#
# Environnements de référence isolés pour les captures et les tests de fumée.
#
#   bash scripts/reference-env.sh up [git-ref]   # par défaut : l'arbre de travail
#   bash scripts/reference-env.sh build <git-ref>  # compile seulement (cache)
#   bash scripts/reference-env.sh down
#
# Copie le code (arbre de travail ou révision git), le compile une fois, puis
# sert HUB_E2E_ENVS environnements identiques (4 par défaut) : environnement i
# = API sur :3101+10i, front sur :3100+10i, base hub_ref (i = 0) ou hub_ref_i.
# La base est remplie une fois (démo + scénario de référence), puis clonée par
# CREATE DATABASE … TEMPLATE : mêmes données, mêmes identifiants, mêmes
# sessions partout. La base de développement, les serveurs de développement
# (:3000/:3001) et leurs dossiers .next/ et dist/ ne sont jamais touchés.
# Comparer deux révisions le même jour garde identiques les données de démo
# relatives à la date.
#
# Cache des compilations : une révision git déjà compilée (même commit, mêmes
# FRONT_BUILD_FLAGS) est reprise telle quelle depuis e2e/.cache/builds ; seules
# la base et les serveurs sont recréés. Les CACHE_KEEP (10) dernières
# compilations utilisées sont gardées, les autres supprimées.
set -euo pipefail

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
STATE="$ROOT/e2e/.state"
CACHE="$ROOT/e2e/.cache/builds"
CACHE_KEEP=${CACHE_KEEP:-10}
ENVS=${HUB_E2E_ENVS:-4}
DB_NAME=hub_ref

api_port() { echo $((3101 + 10 * $1)); }
front_port() { echo $((3100 + 10 * $1)); }
db_name() { if [[ $1 == 0 ]]; then echo "$DB_NAME"; else echo "${DB_NAME}_$1"; fi; }

stop_servers() {
  local pid_file
  for pid_file in "$STATE"/backend*.pid "$STATE"/frontend*.pid; do
    [[ -f "$pid_file" ]] || continue
    kill "$(cat "$pid_file")" 2>/dev/null || true
    rm -f "$pid_file"
  done
}

wait_for() {
  local url=$1 label=$2
  for _ in $(seq 1 90); do
    if curl -sf -o /dev/null "$url"; then return 0; fi
    sleep 1
  done
  echo "✗ $label did not answer on $url (see $STATE/$label.log)" >&2
  exit 1
}

# Dépendances de la révision copiée : clone APFS des node_modules de l'arbre de
# travail quand le lockfile est le même, installation propre sinon. Chaque
# copie a ses node_modules : `prisma generate` ne réécrit jamais le client du
# serveur de développement, et Turbopack refuse un node_modules en lien.
install_dependencies() {
  local app=$1 work=$2
  if [[ -d "$ROOT/$app/node_modules" ]] && cmp -s "$work/$app/package-lock.json" "$ROOT/$app/package-lock.json"; then
    cp -Rc "$ROOT/$app/node_modules" "$work/$app/node_modules" 2>/dev/null || cp -R "$ROOT/$app/node_modules" "$work/$app/node_modules"
  else
    echo "  $app: no matching node_modules in the working tree, clean install"
    (cd "$work/$app" && npm ci --no-audit --no-fund >"$STATE/npm-${app//\//-}.log" 2>&1)
  fi
}

# Même serveur et mêmes identifiants que backend/.env, autre base. Refuse
# toute URL dont la base n'est pas une base de référence avant toute écriture.
database_url() {
  local source
  source=$(sed -nE 's/^DATABASE_URL="?([^"]*)"?$/\1/p' "$ROOT/backend/.env")
  node -e '
    const url = new URL(process.argv[1]);
    url.pathname = "/" + process.argv[2];
    process.stdout.write(url.toString());
  ' "$source" "$1"
}

check_reference_url() {
  [[ "$1" =~ /${DB_NAME}(_[0-9]+)?(\?|$) ]] || { echo "✗ refusing non-reference database URL" >&2; exit 1; }
}

# Compile la révision dans $1 (backend dist/, front .next/standalone). Le
# paquet partagé (packages/domain, absent des révisions d'avant S0c) est
# compilé d'abord : le back et le front lisent son dist/.
build() {
  local work=$1
  if [[ -d "$work/packages/domain" ]]; then
    install_dependencies packages/domain "$work"
    echo "▶ shared package: build"
    (cd "$work/packages/domain" && npm run build >"$STATE/domain-build.log" 2>&1)
  fi
  install_dependencies backend "$work"
  install_dependencies frontend "$work"
  echo "▶ backend: prisma generate, build"
  (
    cd "$work/backend"
    npx prisma generate >"$STATE/prisma-generate.log" 2>&1
    npx nest build >"$STATE/backend-build.log" 2>&1
  )
  echo "▶ frontend: production build against :$(api_port 0)"
  (
    cd "$work/frontend"
    # Le script de build de la révision, comme en production. FRONT_BUILD_FLAGS
    # ajoute des options pour une comparaison ponctuelle (ex. --webpack).
    NEXT_PUBLIC_API_URL="http://localhost:$(api_port 0)/api" npm run build -- ${FRONT_BUILD_FLAGS:-} >"$STATE/frontend-build.log" 2>&1
  )
  # Next 16 place server.js sous le chemin de la racine d'espace de travail
  # déduite (le lockfile le plus proche au-dessus, ici e2e/) : on le cherche.
  local server
  server=$(find "$work/frontend/.next/standalone" -name server.js -not -path '*/node_modules/*' | head -1)
  cp -R "$work/frontend/.next/static" "$(dirname "$server")/.next/static"
  cp -R "$work/frontend/public" "$(dirname "$server")/public"
  touch "$work/.complete"
}

# Garde les CACHE_KEEP compilations les plus récemment utilisées.
prune_cache() {
  local keep=$1
  ls -1t "$CACHE" 2>/dev/null | tail -n +$((CACHE_KEEP + 1)) | while read -r old; do
    [[ "$old" == "$keep" ]] && continue
    rm -rf "${CACHE:?}/$old"
    echo "  cache : compilation $old supprimée (plus de $CACHE_KEEP)"
  done
}

start_env() {
  local i=$1 work=$2 server
  local db_url
  db_url=$(database_url "$(db_name "$i")")
  (
    cd "$work/backend"
    DATABASE_URL="$db_url" PORT=$(api_port "$i") JWT_SECRET=reference-environment-only-secret \
      FRONT_URL="http://localhost:$(front_port "$i")" CORS_ORIGINS="http://localhost:$(front_port "$i")" \
      EMAIL_TRANSPORT=log nohup node dist/main >"$STATE/backend-$i.log" 2>&1 &
    echo $! >"$STATE/backend-$i.pid"
  )
  server=$(find "$work/frontend/.next/standalone" -name server.js -not -path '*/node_modules/*' | head -1)
  (
    cd "$(dirname "$server")"
    PORT=$(front_port "$i") HOSTNAME=localhost API_INTERNE_URL="http://localhost:$(api_port "$i")/api" \
      nohup node server.js >"$STATE/frontend-$i.log" 2>&1 &
    echo $! >"$STATE/frontend-$i.pid"
  )
}

# Compilation d'une révision git dans le cache (sans base ni serveur) : sert à
# préparer une branche pendant que les captures de la référence tournent.
build_ref() {
  local ref=$1 key work
  mkdir -p "$STATE" "$CACHE"
  key="$(git -C "$ROOT" rev-parse "$ref^{commit}")$(printf '%s' "${FRONT_BUILD_FLAGS:-}" | shasum | cut -c1-8)"
  work="$CACHE/$key"
  if [[ ! -f "$work/.complete" ]]; then
    rm -rf "$work"
    mkdir -p "$work"
    echo "▶ copying code ($ref) into $work"
    git -C "$ROOT" archive "$ref" backend frontend $(git -C "$ROOT" ls-tree --name-only "$ref" packages) | tar -x -C "$work"
    build "$work"
  else
    echo "▶ cached build of $ref ($key)"
  fi
  touch "$work"
  prune_cache "$key"
  BUILT="$work"
}

up() {
  local ref=${1:-WORKTREE}
  stop_servers
  mkdir -p "$STATE" "$CACHE"
  rm -rf "$STATE"/work-*

  local work
  if [[ "$ref" == "WORKTREE" ]]; then
    work="$STATE/work-$(date +%s)"
    mkdir -p "$work"
    echo "▶ copying code (working tree) into $work"
    for app in backend frontend packages; do
      [[ -d "$ROOT/$app" ]] || continue
      rsync -a --exclude node_modules --exclude .next --exclude dist --exclude '*.tsbuildinfo' "$ROOT/$app" "$work/"
    done
    build "$work"
  else
    build_ref "$ref"
    work=$BUILT
  fi

  local db_url admin_url
  db_url=$(database_url "$DB_NAME")
  check_reference_url "$db_url"
  admin_url=${db_url/\/$DB_NAME/\/postgres}
  admin_url=${admin_url%%\?*}

  echo "▶ recreating database $DB_NAME, migrations and demo seed"
  local i
  for i in $(seq 0 $((ENVS - 1))); do
    psql "$admin_url" -q -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $(db_name "$i") WITH (FORCE)"
  done
  psql "$admin_url" -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DB_NAME"
  (
    cd "$work/backend"
    export DATABASE_URL="$db_url"
    npx prisma migrate deploy >"$STATE/prisma.log" 2>&1
    npx ts-node prisma/seed.ts >"$STATE/seed.log" 2>&1
    # La démo n'ouvre aucun dossier du personnel : les écrans RH resteraient vides.
    npx ts-node prisma/rh-dossiers-init.ts >>"$STATE/seed.log" 2>&1
  )

  echo "▶ environment 0: starting, then reference scenario"
  start_env 0 "$work"
  wait_for "http://localhost:$(api_port 0)/api/societes" backend-0
  wait_for "http://localhost:$(front_port 0)/" frontend-0
  rm -rf "$STATE/auth"
  node "$ROOT/e2e/scripts/reference-scenario.mjs" "http://localhost:$(api_port 0)/api" "http://localhost:$(front_port 0)" "$STATE"
  # Fin des connexions du scénario : les tests de fumée attendent que la limite
  # de connexions par minute soit écoulée (sinon 429).
  date +%s >"$STATE/scenario-done"

  if ((ENVS > 1)); then
    echo "▶ cloning $DB_NAME into $((ENVS - 1)) environment(s)"
    # TEMPLATE exige qu'aucune connexion ne soit ouverte sur la base modèle.
    kill "$(cat "$STATE/backend-0.pid")" && rm -f "$STATE/backend-0.pid"
    sleep 1
    for i in $(seq 1 $((ENVS - 1))); do
      psql "$admin_url" -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE $(db_name "$i") TEMPLATE $DB_NAME"
    done
    kill "$(cat "$STATE/frontend-0.pid")" && rm -f "$STATE/frontend-0.pid"
    for i in $(seq 0 $((ENVS - 1))); do start_env "$i" "$work"; done
    for i in $(seq 0 $((ENVS - 1))); do
      wait_for "http://localhost:$(api_port "$i")/api/societes" "backend-$i"
      wait_for "http://localhost:$(front_port "$i")/" "frontend-$i"
    done
  fi
  # Sessions : le front garde la session dans le localStorage de son origine
  # (hub_session), propre à chaque port : une copie par environnement, son
  # origine pointée sur le front de l'environnement (support/reference.ts,
  # storageStateOf).
  node -e '
    const fs = require("fs"), path = require("path");
    const [dir, count] = [process.argv[1], Number(process.argv[2])];
    for (const file of fs.readdirSync(dir).filter((f) => /^[a-z]+\.json$/.test(f))) {
      const state = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      for (let i = 1; i < count; i++) {
        const origin = `http://localhost:${3100 + 10 * i}`;
        const copy = { ...state, origins: state.origins.map((o) => ({ ...o, origin })) };
        fs.writeFileSync(path.join(dir, file.replace(".json", `@${i}.json`)), JSON.stringify(copy));
      }
    }
  ' "$STATE/auth" "$ENVS"
  printf '{ "count": %s }\n' "$ENVS" >"$STATE/envs.json"
  echo "✓ $ENVS reference environment(s) ready ($ref) — env 0: front http://localhost:$(front_port 0), API http://localhost:$(api_port 0)/api"
}

case "${1:-}" in
  up) up "${2:-WORKTREE}" ;;
  build) build_ref "${2:?git-ref}" ;;
  down) stop_servers && echo "✓ reference servers stopped" ;;
  *) echo "usage: $0 up [git-ref] | build <git-ref> | down" >&2 && exit 1 ;;
esac
