#!/usr/bin/env bash
#
# Isolated reference environment for visual captures and smoke tests.
#
#   bash scripts/reference-env.sh up [git-ref]   # default: current working tree
#   bash scripts/reference-env.sh down
#
# It copies the code (working tree or a git revision) into e2e/.state, recreates
# a dedicated PostgreSQL database (hub_ref) from the migrations and the demo
# seed, then serves the production builds: API on :3101, front on :3100.
# The development database, the dev servers (:3000/:3001) and their
# .next/ and dist/ folders are never touched. Comparing two revisions on the
# same day (baseline from the phase start, then the current tree) keeps
# date-relative demo data identical between the two runs.
set -euo pipefail

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
STATE="$ROOT/e2e/.state"
API_PORT=3101
FRONT_PORT=3100
DB_NAME=hub_ref

stop_servers() {
  for name in backend frontend; do
    local pid_file="$STATE/$name.pid"
    if [[ -f "$pid_file" ]]; then
      kill "$(cat "$pid_file")" 2>/dev/null || true
      rm -f "$pid_file"
    fi
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

# Same server and credentials as backend/.env, other database. Refuses any
# URL whose database is not hub_ref before anything destructive runs.
reference_database_url() {
  local source
  source=$(sed -nE 's/^DATABASE_URL="?([^"]*)"?$/\1/p' "$ROOT/backend/.env")
  node -e '
    const url = new URL(process.argv[1]);
    url.pathname = "/" + process.argv[2];
    process.stdout.write(url.toString());
  ' "$source" "$DB_NAME"
}

up() {
  local ref=${1:-WORKTREE}
  stop_servers
  rm -rf "$STATE"/work-*
  local work="$STATE/work-$(date +%s)"
  mkdir -p "$work"

  echo "▶ copying code ($ref) into $work"
  if [[ "$ref" == "WORKTREE" ]]; then
    for app in backend frontend; do
      rsync -a --exclude node_modules --exclude .next --exclude dist --exclude '*.tsbuildinfo' "$ROOT/$app" "$work/"
    done
  else
    git -C "$ROOT" archive "$ref" backend frontend | tar -x -C "$work"
  fi
  # Backend: APFS clone of node_modules, so `prisma generate` for this revision
  # never rewrites the client used by the dev server. Frontend: read-only use,
  # a symlink is enough (fresh folder, never rsync --delete into it).
  cp -Rc "$ROOT/backend/node_modules" "$work/backend/node_modules" 2>/dev/null || cp -R "$ROOT/backend/node_modules" "$work/backend/node_modules"
  ln -s "$ROOT/frontend/node_modules" "$work/frontend/node_modules"

  local db_url
  db_url=$(reference_database_url)
  [[ "$db_url" == *"/$DB_NAME?"* || "$db_url" == *"/$DB_NAME" ]] || { echo "✗ refusing non-reference database URL" >&2; exit 1; }
  local admin_url=${db_url/\/$DB_NAME/\/postgres}
  admin_url=${admin_url%%\?*}

  echo "▶ recreating database $DB_NAME"
  psql "$admin_url" -q -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $DB_NAME WITH (FORCE)" -c "CREATE DATABASE $DB_NAME"

  echo "▶ backend: prisma generate, migrate, seed, build"
  (
    cd "$work/backend"
    export DATABASE_URL="$db_url"
    npx prisma generate >"$STATE/prisma.log" 2>&1
    npx prisma migrate deploy >>"$STATE/prisma.log" 2>&1
    npx ts-node prisma/seed.ts >"$STATE/seed.log" 2>&1
    # The demo seed opens no personnel file: the RH screens would stay empty.
    npx ts-node prisma/rh-dossiers-init.ts >>"$STATE/seed.log" 2>&1
    npx nest build >"$STATE/backend-build.log" 2>&1
  )

  echo "▶ backend: starting on :$API_PORT"
  (
    cd "$work/backend"
    DATABASE_URL="$db_url" PORT=$API_PORT JWT_SECRET=reference-environment-only-secret \
      FRONT_URL="http://localhost:$FRONT_PORT" CORS_ORIGINS="http://localhost:$FRONT_PORT" \
      EMAIL_TRANSPORT=log nohup node dist/main >"$STATE/backend.log" 2>&1 &
    echo $! >"$STATE/backend.pid"
  )
  wait_for "http://localhost:$API_PORT/api/societes" backend

  echo "▶ frontend: production build against :$API_PORT"
  (
    cd "$work/frontend"
    NEXT_PUBLIC_API_URL="http://localhost:$API_PORT/api" npx next build >"$STATE/frontend-build.log" 2>&1
    cp -R .next/static .next/standalone/.next/static
    cp -R public .next/standalone/public
  )

  echo "▶ frontend: starting on :$FRONT_PORT"
  (
    cd "$work/frontend/.next/standalone"
    PORT=$FRONT_PORT HOSTNAME=localhost API_INTERNE_URL="http://localhost:$API_PORT/api" \
      nohup node server.js >"$STATE/frontend.log" 2>&1 &
    echo $! >"$STATE/frontend.pid"
  )
  wait_for "http://localhost:$FRONT_PORT/" frontend

  echo "▶ reference scenario (opened project, sent contract and devis, sessions)"
  rm -rf "$STATE/auth"
  node "$ROOT/e2e/scripts/reference-scenario.mjs" "http://localhost:$API_PORT/api" "http://localhost:$FRONT_PORT" "$STATE"
  echo "✓ reference environment ready ($ref) — front http://localhost:$FRONT_PORT, API http://localhost:$API_PORT/api"
}

case "${1:-}" in
  up) up "${2:-WORKTREE}" ;;
  down) stop_servers && echo "✓ reference servers stopped" ;;
  *) echo "usage: $0 up [git-ref] | down" >&2 && exit 1 ;;
esac
