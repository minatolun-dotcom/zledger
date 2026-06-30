#!/bin/sh
# Zledger API entrypoint: run migrations, seed bootstrap admin, then start uvicorn.
set -e

echo "[zledger] Running database migrations..."
alembic upgrade head

echo "[zledger] Seeding initial data (idempotent)..."
python -m app.seed

echo "[zledger] Starting uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
