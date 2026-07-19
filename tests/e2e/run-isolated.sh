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

# ── progress helpers ──────────────────────────────────────────────
# Spinner chars for a live heartbeat during long waits (seed/reset).
SPIN=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
spin_idx=0
next_spin() { spin_idx=$(( (spin_idx + 1) % ${#SPIN[@]} )); echo -n "${SPIN[$spin_idx]}"; }

# Print a heartbeat line that overwrites itself in place. Call repeatedly.
# Usage: heartbeat "message"   (leaves cursor on the same line)
heartbeat() {
  printf "\r  %s %s" "$(next_spin)" "$1"
}

reset_db() {
  # Reset the DB WITHOUT restarting the api container. A plain `docker restart`
  # of api_e2e has been observed to intermittently wedge the docker daemon and
  # leave the api unreachable for extended windows, which made specs run
  # against a DB the api couldn't see. Instead we wipe the schema in-place via
  # psql; the api's SQLAlchemy engine uses pool_pre_ping=True, so its pooled
  # connections are transparently invalidated and reconnect to the fresh
  # schema on the next query. web_e2e (nginx) re-resolves the api upstream per
  # request, so it needs no restart either.
  docker exec "$DB" psql -U zledger -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" zledger_test >/dev/null 2>&1
  # Give the api a moment to notice its connections are gone, then let
  # pool_pre_ping reconnect. No container restart required.
  sleep 3
  # Wait for the api to be serving again (pool_pre_ping will have reconnected
  # it to the fresh, empty schema). Gate on the web proxy (:9091) since that
  # is what the specs actually hit.
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
   # Re-run migrations on the fresh schema, then bootstrap admin + demo seed.
   heartbeat "running migrations + seeding demo data…"
   docker exec "$API" alembic upgrade head >/dev/null 2>&1
   docker exec "$API" python -m app.seed >/dev/null 2>&1
   docker exec "$API" python -m scripts.seed_demo_data 2>&1 | tee /tmp/opencode/seed_demo_last.log >/dev/null
   if [ ${PIPESTATUS[0]} -ne 0 ]; then
     echo "WARN: seed_demo_data exited non-zero; tail:" >&2
     tail -5 /tmp/opencode/seed_demo_last.log >&2
   fi
    # Wait until the demo seed has actually materialised (not just that the web
    # proxy is up). A partially-seeded DB makes pages fail to load and produces
    # flaky, hard-to-diagnose E2E failures. We log in as the bootstrap admin via
    # the SAME web proxy (:9091) the specs use and confirm at least one demo
    # company is present before running the spec. Using the host-side proxy
    # (curl) — not `docker exec` — avoids hammering the docker daemon during
    # rapid resets, which previously produced false "not ready" readings.
    local ready="no"
    for i in $(seq 1 120); do
      heartbeat "waiting for seed to materialise ($i/120)…"
      ready=$(curl -s --max-time 8 -X POST http://localhost:9091/api/auth/login \
        -H "Content-Type: application/json" \
        -d '{"email":"admin@zledger.com","password":"katheikei"}' \
        | python3 -c 'import sys,json,urllib.request;
try:
    tok=json.load(sys.stdin)["access_token"]
    req=urllib.request.Request("http://localhost:9091/api/auth/me",headers={"Authorization":"Bearer "+tok})
    me=json.load(urllib.request.urlopen(req))
    print("yes" if me.get("companies") else "no")
except Exception:
    print("no")' 2>/dev/null)
      [ "$ready" = "yes" ] && break
      # Self-heal: if the api is up but seed never materialised, re-run the
      # demo seed once (covers transient seed failures / partial writes).
      if [ "$i" = "40" ] || [ "$i" = "80" ]; then
        echo -e "\n  (readiness retry $i: re-running seed_demo_data)" >&2
        docker exec "$API" python -m scripts.seed_demo_data >/dev/null 2>&1
      fi
      sleep 2
    done
    if [ "$ready" != "yes" ]; then
      echo -e "\nWARN: demo seed did not materialise after reset; proceeding anyway." >&2
    else
      echo -e "\r  \033[32m✓\033[0m seed ready — running spec"  # green check, same line
    fi
}

if [ "$#" -gt 0 ]; then
  FILES=("$@")
else
  # deterministic order: api-backend first (self-contained), then alphabetical
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
  # Run the spec with a live heartbeat so a long file doesn't look stuck.
  npx playwright test "$f" --workers=1 --reporter=list &
  pw_pid=$!
  while kill -0 "$pw_pid" 2>/dev/null; do
    heartbeat "running $(basename "$f")…"
    sleep 3
  done
  wait "$pw_pid"
  rc=$?
  echo ""  # newline after the heartbeat spinner
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
