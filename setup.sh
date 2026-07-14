#!/usr/bin/env bash
# Zledger — one-command setup for Linux / Git Bash / WSL2.
#
# Brings up the full Docker stack (db + api + web, plus backup; scheduler
# optional) from source, creates .env, generates a JWT secret, fixes the
# rclone token mount, waits for the API to be healthy, and (optionally) seeds
# demo data.
#
# Usage:
#   ./setup.sh                 # interactive; prompts to seed demo data
#   ./setup.sh --no-demo       # clean instance (bootstrap admin only)
#   ./setup.sh --no-build      # reuse existing images
#   ./setup.sh --with-scheduler
#   ./setup.sh --help
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BUILD=1
DEMO_PROMPT=1
SCHEDULER=0

usage() {
  grep -E '^#' "$0" | sed 's/^# \{0,1\}//'
}

for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    --no-demo)  DEMO_PROMPT=0 ;;
    --with-scheduler) SCHEDULER=1 ;;
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

# --- wait for API health ---
echo "Waiting for the API to become healthy (http://localhost:9090/api/health)..."
HEALTHY=0
for i in $(seq 1 90); do
  code="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:9090/api/health 2>/dev/null || echo 000)"
  if [ "$code" = "200" ]; then
    HEALTHY=1
    echo "API is healthy."
    break
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
