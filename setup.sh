#!/usr/bin/env bash
# Zledger — one-command setup for Linux / Git Bash / WSL2.
#
# Brings up the full Docker stack (db + api + web, plus backup; scheduler
# optional) from source, creates .env, generates a JWT secret, fixes the
# rclone token mount, waits for the API to be healthy, and (optionally) seeds
# demo data.
#
# Usage:
#   ./setup.sh                 # interactive; prompts to seed demo data + GDrive
#   ./setup.sh --no-demo       # clean instance (bootstrap admin only)
#   ./setup.sh --no-build      # reuse existing images
#   ./setup.sh --with-scheduler
#   ./setup.sh --with-gdrive   # enable Google Drive backups (skips prompt)
#   ./setup.sh --no-gdrive     # skip Google Drive setup
#   ./setup.sh --help
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BUILD=1
DEMO_PROMPT=1
SCHEDULER=0
GDRIVE_ANS=""   # ""=prompt, 1=force yes, 0=force no

usage() {
  grep -E '^#' "$0" | sed 's/^# \{0,1\}//'
}

for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    --no-demo)  DEMO_PROMPT=0 ;;
    --with-scheduler) SCHEDULER=1 ;;
    --with-gdrive) GDRIVE_ANS=1 ;;
    --no-gdrive)   GDRIVE_ANS=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; usage; exit 1 ;;
  esac
done

echo "============================================="
echo " Zledger setup"
echo "============================================="

# --- locate docker compose (v2 preferred, v1 fallback) ---
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  echo "ERROR: neither 'docker compose' (v2) nor 'docker-compose' (v1) was found." >&2
  echo "       Install Docker first: https://docs.docker.com/get-docker/" >&2
  exit 1
fi

# --- docker daemon reachable ---
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not running. Start Docker and retry." >&2
  exit 1
fi

# --- must be run from the repo root ---
if [ ! -f docker-compose.yml ] || [ ! -f .env.example ]; then
  echo "ERROR: run setup.sh from the Zledger repository root." >&2
  exit 1
fi

# --- .env ---
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example (edit it to override defaults)."
else
  echo ".env already exists; keeping your settings."
fi

# --- JWT_SECRET: generate only if missing / placeholder ---
if ! grep -qE '^JWT_SECRET=[^[:space:]]+$' .env || grep -qE '^JWT_SECRET=(change-me.*)?$' .env; then
  if command -v openssl >/dev/null 2>&1; then
    SECRET="$(openssl rand -hex 48)"
  else
    SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n')"
  fi
  if grep -qE '^JWT_SECRET=' .env; then
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${SECRET}|" .env
  else
    printf 'JWT_SECRET=%s\n' "$SECRET" >> .env
  fi
  echo "Generated a new JWT_SECRET."
else
  echo "JWT_SECRET already set; leaving it unchanged."
fi

# --- rclone token: compose bind-mounts a FILE, but it currently may be a dir ---
TOKEN_DIR="config/rclone"
if [ -d "$TOKEN_DIR/token.json" ]; then
  echo "Removing stray directory $TOKEN_DIR/token.json (compose expects a file)..."
  rm -rf "$TOKEN_DIR/token.json"
fi
if [ ! -f "$TOKEN_DIR/token.json" ]; then
  mkdir -p "$TOKEN_DIR"
  touch "$TOKEN_DIR/token.json"
  echo "Created placeholder $TOKEN_DIR/token.json (Google Drive backup stays disabled)."
fi

# --- migration/image sync guard -------------------------------------------------
# The API image runs `alembic upgrade head` on startup. If a migration file was
# added/changed in source but the `zledger-api:latest` image predates it, the
# container crashes on boot (exit 255, "Can't locate revision identified by
# 'XXXX'") and nginx returns a 502. This guard compares the set of alembic
# migration filenames baked into the current image against the source tree and
# forces a rebuild when they differ, so `./setup.sh` (even with --no-build)
# self-heals instead of 502-ing.
if docker image inspect zledger-api:latest >/dev/null 2>&1 && [ -d backend/alembic/versions ]; then
  SRC_FILES="$(cd backend/alembic/versions && ls -1 *.py 2>/dev/null | grep -v '__' | sort)"
  IMG_FILES="$(docker run --rm --entrypoint python3 zledger-api:latest -c "
import os
d='/app/alembic/versions'
print('\n'.join(sorted(f for f in os.listdir(d) if f.endswith('.py') and not f.startswith('__'))))
" 2>/dev/null)"
  MISSING=""
  for f in $SRC_FILES; do
    case "$IMG_FILES" in
      *"$f"*) ;;
      *) MISSING="$MISSING $f" ;;
    esac
  done
  if [ -n "$MISSING" ]; then
    echo "WARN: api image is missing/behind on migration file(s):$MISSING"
    echo "      Forcing a rebuild of the api image so 'alembic upgrade head' succeeds on boot."
    BUILD=1
  fi
fi

# --- build + start ---
BUILD_FLAG=""
[ "$BUILD" -eq 1 ] && BUILD_FLAG="--build" || BUILD_FLAG="--no-build"
if [ "$SCHEDULER" -eq 1 ]; then
  echo "Building and starting Zledger (incl. scheduler profile)..."
  "${DC[@]}" --profile scheduler up -d "$BUILD_FLAG"
else
  echo "Building and starting Zledger..."
  "${DC[@]}" up -d "$BUILD_FLAG"
fi

# --- frontend image / E2E container sync guard ---------------------------------
# `web_e2e` has NO build context — it reuses the `zledger-web:latest` image that
# the `web` service produces. `${DC[@]} up -d` rebuilds+restarts `web` but NEVER
# recreates `web_e2e`, so the E2E stack silently keeps serving the STALE bundle
# (e.g. an old sidebar link) even though the live :9090 build was updated. This
# guard detects any web container whose running image ID differs from the
# current `zledger-web:latest` and force-recreates it so :9090 and :9091 stay in
# sync. Runs even with --no-build so an externally-built image is honored.
if docker image inspect zledger-web:latest >/dev/null 2>&1; then
  CURRENT_WEB_IMG="$(docker image inspect -f '{{.Id}}' zledger-web:latest)"
  for svc in web web_e2e; do
    if "${DC[@]}" ps -q "$svc" >/dev/null 2>&1; then
      CID="$("${DC[@]}" ps -q "$svc" 2>/dev/null | head -1)"
      if [ -n "$CID" ]; then
        RUNNING_IMG="$(docker inspect -f '{{.Image}}' "$CID" 2>/dev/null)"
        if [ "$RUNNING_IMG" != "$CURRENT_WEB_IMG" ]; then
          echo "WARN: $svc is running a stale web image; recreating it to match zledger-web:latest."
          if [ "$svc" = "web_e2e" ]; then
            "${DC[@]}" -f docker-compose.yml -f docker-compose.e2e.yml up -d web_e2e
          else
            "${DC[@]}" up -d web
          fi
        fi
      fi
    fi
  done
fi

# --- wait for API health (self-healing on migration mismatch) ---
echo "Waiting for the API to become healthy (http://localhost:9090/api/health)..."
HEALTHY=0
REBUILT=0
for i in $(seq 1 90); do
  code="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:9090/api/health 2>/dev/null || echo 000)"
  if [ "$code" = "200" ]; then
    HEALTHY=1
    echo "API is healthy."
    break
  fi
  # If the api container has exited (e.g. alembic "Can't locate revision" crash
  # loop), rebuild once and restart — this is the 502-without-a-running-api case.
  if [ "$REBUILT" -eq 0 ] && "${DC[@]}" ps -q api 2>/dev/null | grep -q .; then
    if ! docker inspect --format '{{.State.Running}}' "$("${DC[@]}" ps -q api)" 2>/dev/null | grep -q true; then
      echo "WARN: api container is not running. Rebuilding + restarting once to recover from a migration/startup crash..."
      "${DC[@]}" up -d --build api
      REBUILT=1
    fi
  fi
  sleep 2
done
if [ "$HEALTHY" -ne 1 ]; then
  echo "ERROR: API did not become healthy in time. Check logs: ${DC[*]} logs api" >&2
  exit 1
fi

# --- demo data ---
SEED=0
if [ "$DEMO_PROMPT" -eq 1 ]; then
  read -r -p "Seed demo data (5 companies + sample vouchers)? [Y/n] " ans
  case "$ans" in
    ""|y|Y|yes|YES) SEED=1 ;;
  esac
else
  SEED=0
fi

if [ "$SEED" -eq 1 ]; then
  echo "Seeding demo data (this can take a minute)..."
  "${DC[@]}" exec -T api python -m scripts.seed_demo_data
  echo "Demo data seeded."
else
  echo "Skipping demo data — clean instance (bootstrap admin only)."
fi

# --- Google Drive (rclone) backup (optional) ---
setup_gdrive() {
  local TOKEN_FILE="config/rclone/token.json"
  local ENABLE=0

  if [ "$GDRIVE_ANS" = "1" ]; then
    ENABLE=1
  elif [ "$GDRIVE_ANS" = "0" ]; then
    ENABLE=0
  else
    read -r -p "Enable Google Drive backups (via rclone in the backup container)? [y/N] " ans
    case "$ans" in y|Y|yes|YES) ENABLE=1 ;; esac
  fi

  if [ "$ENABLE" -ne 1 ]; then
    echo "Google Drive backup skipped. To enable later, see config/rclone/README.md"
    return 0
  fi

  echo ""
  echo "rclone and its dependencies are already bundled inside the 'backup' container"
  echo "(backend/backup/Dockerfile -> 'apk add rclone'), so no host install is needed."

  # Reuse an existing token if present.
  if [ -s "$TOKEN_FILE" ] && grep -q '{' "$TOKEN_FILE"; then
    echo "Existing token found at $TOKEN_FILE — reusing it."
  else
    echo ""
    echo "Authorize Google Drive. Run this on a machine with a browser"
    echo "(it can be this one, or another machine if this is a headless server):"
    echo ""
    echo "    ${DC[*]} run --rm --entrypoint rclone backup authorize gdrive"
    echo ""
    echo "Sign in and grant access; rclone then prints a JSON token."
    echo "Paste that JSON token below (it starts with '{' and ends with '}'):"
    echo ""
    local TOKEN=""
    read -r TOKEN
    if [ -z "$TOKEN" ]; then
      echo "No token provided — Google Drive backup NOT enabled."
      return 0
    fi
    if [[ "$TOKEN" != {* ]]; then
      echo "ERROR: token does not look like JSON (should start with '{'). Aborting." >&2
      return 1
    fi
    printf '%s\n' "$TOKEN" > "$TOKEN_FILE"
    echo "Saved token to $TOKEN_FILE"
  fi

  # Enable in .env
  if grep -qE '^GDRIVE_ENABLED=' .env; then
    sed -i 's/^GDRIVE_ENABLED=.*/GDRIVE_ENABLED=true/' .env
  else
    printf 'GDRIVE_ENABLED=true\n' >> .env
  fi
  echo "Set GDRIVE_ENABLED=true in .env"

  # Recreate backup so the new env + token are picked up (restart alone won't reload env).
  echo "Recreating backup service to apply Google Drive config..."
  "${DC[@]}" up -d backup

  # Best-effort verification
  local REMOTE="$(grep -E '^GDRIVE_REMOTE_PATH=' .env | cut -d= -f2)"
  REMOTE="${REMOTE:-zledger-backups}"
  echo "Verifying Google Drive access (best effort)..."
  if "${DC[@]}" exec -T backup rclone lsd "gdrive:${REMOTE}" >/dev/null 2>&1; then
    echo "Google Drive connection OK — backups will also upload to gdrive:${REMOTE}"
  else
    echo "Could not verify (non-fatal). Check '${DC[*]} logs backup' after the next cycle."
  fi
}
setup_gdrive

# --- done ---
ADMIN_EMAIL="$(grep -E '^BOOTSTRAP_ADMIN_EMAIL=' .env | cut -d= -f2)"
ADMIN_PASS="$(grep -E '^BOOTSTRAP_ADMIN_PASSWORD=' .env | cut -d= -f2)"
echo ""
echo "============================================="
echo " Zledger is ready!"
echo "   Web UI:   http://localhost:9090"
echo "   API docs: http://localhost:9090/api/docs"
echo "   Admin:    $ADMIN_EMAIL"
echo "   Password: $ADMIN_PASS"
echo "============================================="
