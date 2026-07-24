#!/usr/bin/env bash
# run-isolated.sh — runs the Zledger E2E suite with per-file DB isolation.
#
# Resets + re-seeds the LIVE zledger DB before each spec file, so every
# file runs against a pristine seed. The api container is restarted after
# each reset so its connection pool reconnects cleanly.
#
# Prereqs: the stack must be up, e.g.
#   docker compose up -d
#
# Usage:  ./run-isolated.sh            # all specs, isolated
#         ./run-isolated.sh specs/navigation.spec.ts   # one file

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

DB="${ZLEDGER_DB:-zledger-db-1}"
API="${ZLEDGER_API:-zledger-api-1}"
WEB="${ZLEDGER_WEB:-zledger-web-1}"
SPEC_DIR=specs

# ── progress helpers ──────────────────────────────────────────────
SPIN=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
spin_idx=0
next_spin() { spin_idx=$(( (spin_idx + 1) % ${#SPIN[@]} )); echo -n "${SPIN[$spin_idx]}"; }
heartbeat() {
  printf "\r  %s %s" "$(next_spin)" "$1"
}

reset_db() {
  # Wipe the schema and recreate empty tables.
  docker exec "$DB" psql -U zledger -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" zledger >/dev/null 2>&1
  sleep 3

  # Wait for the API to be healthy again (pool_pre_ping reconnects).
  local i code="000"
  for i in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9090/api/health 2>/dev/null)
    [ "$code" = "200" ] && break
    sleep 1
  done
  if [ "$code" != "200" ]; then
    echo "ERROR: API (:9090) did not come up after reset; aborting run." >&2
    exit 1
  fi

  # Re-run migrations on the fresh schema, then bootstrap admin + demo seed.
  heartbeat "running migrations + seeding demo data…"
  docker exec "$API" alembic upgrade head >/dev/null 2>&1
  docker exec "$API" python -m app.seed >/dev/null 2>&1
  docker exec "$API" python -m scripts.seed_demo_data 2>&1 | tee /tmp/opencode/seed_demo_last.log >/dev/null
  if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo "WARN: seed_demo_data exited non-zero; tail:" >&2
    tail -5 /tmp/opencode/seed_demo_last.log >&2
  fi

  # Wait until the seed has materialised.
  local ready="no"
  for i in $(seq 1 120); do
    heartbeat "waiting for seed to materialise ($i/120)…"
    ready=$(curl -s --max-time 8 -X POST http://localhost:9090/api/auth/login \
      -H "Content-Type: application/json" \
      -d '{"email":"admin@zledger.com","password":"katheikei"}' \
      | python3 -c 'import sys,json,urllib.request;
try:
    tok=json.load(sys.stdin)["access_token"]
    req=urllib.request.Request("http://localhost:9090/api/auth/me",headers={"Authorization":"Bearer "+tok})
    me=json.load(urllib.request.urlopen(req))
    print("yes" if me.get("companies") else "no")
except Exception:
    print("no")' 2>/dev/null)
    [ "$ready" = "yes" ] && break
    if [ "$i" = "40" ] || [ "$i" = "80" ]; then
      echo -e "\n  (readiness retry $i: re-running seed_demo_data)" >&2
      docker exec "$API" python -m scripts.seed_demo_data >/dev/null 2>&1
    fi
    sleep 2
  done
  if [ "$ready" != "yes" ]; then
    echo -e "\nWARN: demo seed did not materialise after reset; proceeding anyway." >&2
  else
    echo -e "\r  \033[32m✓\033[0m seed ready — running spec"
  fi
}

if [ "$#" -gt 0 ]; then
  FILES=("$@")
else
  mapfile -t FILES < <(ls "$SPEC_DIR"/*.spec.ts | sort)
fi

overall=0
total=${#FILES[@]}
idx=0
for f in "${FILES[@]}"; do
  idx=$((idx + 1))
  [ -f "$f" ] || { echo "SKIP (missing): $f"; continue; }
  echo ""
  echo "=================================================================="
  echo ">> [$idx/$total] RESET + $(basename "$f")"
  echo "=================================================================="
  reset_db
  npx playwright test "$f" --workers=1 --reporter=list &
  pw_pid=$!
  while kill -0 "$pw_pid" 2>/dev/null; do
    heartbeat "running $(basename "$f")…"
    sleep 3
  done
  wait "$pw_pid"
  rc=$?
  echo ""
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
