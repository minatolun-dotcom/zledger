#!/usr/bin/env bash
# run-isolated.sh — runs the Zledger E2E suite with per-file DB isolation.
#
# The suite shares one mutable `zledger_test` DB across all spec files and runs
# serially (playwright.config.ts: workers=1). Without isolation, an early spec
# that creates companies/vouchers pollutes the seed and breaks later specs
# that assume a clean DB. This runner resets + re-seeds `zledger_test`
# BEFORE EACH spec file, so every file runs against a pristine seed.
#
# Prereqs: the hermetic stack must be up, e.g.
#   POSTGRES_DB=zledger_test docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d api_e2e web_e2e
#
# Usage:  ./run-isolated.sh            # all specs, isolated
#         ./run-isolated.sh specs/navigation.spec.ts   # one file

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

DB="${ZLEDGER_DB:-zledger-db-1}"
API="${ZLEDGER_API:-zledger_api_e2e_1}"
WEB="${ZLEDGER_WEB:-zledger_web_e2e_1}"
SPEC_DIR=specs

reset_db() {
  # Drop + recreate the DB, then RESTART both the api and web containers so
  # their connection pools reconnect to the fresh DB. (A plain TRUNCATE
  # races with the api's pooled connections and silently leaves a
  # polluted/empty DB; and web_e2e can die if left up while api is
  # restarted — so restart it too.) Specs hit :9091 (the web proxy),
  # so we gate on THAT being reachable, not just api health.
  docker exec "$DB" psql -U zledger -c "DROP DATABASE IF EXISTS zledger_test WITH (FORCE);" >/dev/null 2>&1
  docker exec "$DB" psql -U zledger -c "CREATE DATABASE zledger_test;" >/dev/null 2>&1
  # Restart only the api so its connection pool reconnects to the fresh DB.
  docker restart "$API" >/dev/null 2>&1
  # The web proxy caches the api upstream IP; re-resolve it ONLY if :9091 is
  # unreachable (avoid restarting web on every file — rapid restarts can leave
  # the web container exited, which would hang the whole run).
  local i code="000"
  for i in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9091/api/health 2>/dev/null)
    [ "$code" = "200" ] && break
    sleep 1
  done
  if [ "$code" != "200" ]; then
    docker start "$WEB" >/dev/null 2>&1
    for i in $(seq 1 60); do
      code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9091/api/health 2>/dev/null)
      [ "$code" = "200" ] && break
      sleep 1
    done
  fi
  if [ "$code" != "200" ]; then
    echo "ERROR: web_e2e (:9091) did not come up after reset; aborting run." >&2
    exit 1
  fi
  # Ensure bootstrap admin + demo seed data.
  docker exec "$API" python -m app.seed >/dev/null 2>&1
  docker exec "$API" python -m scripts.seed_demo_data >/dev/null 2>&1
}

if [ "$#" -gt 0 ]; then
  FILES=("$@")
else
  # deterministic order: api-backend first (self-contained), then alphabetical
  mapfile -t FILES < <(ls "$SPEC_DIR"/*.spec.ts | sort)
fi

overall=0
for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "SKIP (missing): $f"; continue; }
  echo ""
  echo "=================================================================="
  echo ">> RESET + $(basename "$f")"
  echo "=================================================================="
  reset_db
  npx playwright test "$f" --workers=1 --reporter=list
  rc=$?
  [ "$rc" -ne 0 ] && overall=1
done

echo ""
echo "==================== isolation run complete ===================="
if [ "$overall" -ne 0 ]; then
  echo "FAILURES PRESENT"
else
  echo "ALL GREEN"
fi
exit $overall
