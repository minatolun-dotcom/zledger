# Zledger

A self-hostable **Indian accounting system with full GST support**, inspired by Tally Prime. Runs as a Docker stack, accessed via a modern web UI.

---

## Tech stack

| Layer    | Technology |
|----------|------------|
| Backend  | Python · **FastAPI** · SQLAlchemy 2.0 · Alembic |
| Database | **PostgreSQL 16** (`Numeric(18,2)` for all money) |
| Frontend | **React 18 + TypeScript** · Vite · Tailwind CSS · Zustand |
| Export   | **ReportLab** (PDF) · **openpyxl** (Excel) |
| Tests    | **Playwright** (53 E2E spec files) |
| Deploy   | **Docker Compose** |

## Features

**Accounting** — Auth, multi-company, COA (23 Tally-style groups), 8 voucher types with double-entry enforcement, financial years, dashboard with summary cards.

**GST & Tax** — CGST/SGST/IGST engine, HSN/SAC master, GSTR-1/3B/4/9/9C compliance, e-invoice, e-way bill, TDS/TCS tracking.

**Inventory** — Stock groups/items, weighted average & FIFO valuation, stock summary/movement/ageing reports.

**Reports** — Trial Balance, P&L, Balance Sheet, Cash Flow, Aging, Outstanding, Register — all with drill-down. PDF & Excel export for all 16 report types. Day Book with search and export.

**Bank Reconciliation** — CSV & Excel import with column mapping, fuzzy matching (amount/date/description/reference scoring), auto-reconcile with configurable threshold, duplicate detection, bulk delete.

**Operations** — Payment allocation, document attachments, recurring templates with background scheduler, automated backup/restore, audit log, member management.

**Manufacturing** — BOMs, production orders, work centers, routings, batch tracking.

**UI/UX** — Dark mode, custom components, professional sidebar, mobile responsive, transaction flow visualization, voucher numbering config.

---

## Quick start (Docker)

### Prerequisites
- **Docker** (with Compose v2) or **Docker Desktop** installed and running.

### One-command setup

**Linux / macOS / WSL2 (Git Bash):**
```bash
./setup.sh            # builds + starts the stack, then asks to seed demo data
# Skip the demo prompt / build / enable scheduler:
./setup.sh --no-demo --no-build --with-scheduler
```

**Windows (PowerShell, run from the repo root):**
```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
# Skip the demo prompt / build / enable scheduler:
powershell -ExecutionPolicy Bypass -File .\setup.ps1 -NoDemo -NoBuild -WithScheduler
```

The script creates `.env` from `.env.example`, generates a `JWT_SECRET` if missing, fixes the Google-Drive backup token mount, waits for the API to be healthy, and (optionally) seeds 5 demo companies.

### Manual setup (equivalent steps)

```bash
cp .env.example .env
# Edit .env and set JWT_SECRET (e.g. python -c "import secrets; print(secrets.token_urlsafe(48))")

docker compose up -d --build

# Web UI:    http://<server-ip>:9090
# API docs:  http://<server-ip>:9090/api/docs
```

On first boot the API runs migrations and creates the bootstrap admin from `.env`. To load demo data afterwards:

```bash
docker compose exec api python -m scripts.seed_demo_data
```

### Backup & Restore

Backups run automatically every 24h (configurable via `BACKUP_INTERVAL_HOURS`).

```bash
# List backups
docker run --rm -v zledger_zledger_backups:/backups alpine ls -lh /backups

# Restore
./scripts/restore.sh /backups/zledger_XXXXXXXX_XXXXXX.sql.gz /backups/zledger_uploads_XXXXXXXX_XXXXXX.tar.gz
```

## Local development

**Backend**
```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev    # http://localhost:5173
```

## End-to-end tests

The Playwright suite (`tests/e2e/`) runs against the live stack on `:9090`. The `run-isolated.sh` runner resets + re-seeds the DB before each spec file for full isolation.

```bash
# Run the full suite with per-file DB isolation:
cd tests/e2e && ./run-isolated.sh
```

## Repository layout

```
Zledger/
├── docker-compose.yml
├── scripts/              # backup.sh, restore.sh, seed scripts
├── backend/
│   ├── app/
│   │   ├── api/v1/       # 25+ endpoint modules
│   │   ├── models/       # ORM models
│   │   ├── schemas/      # Pydantic schemas
│   │   └── services/     # Business logic
│   └── alembic/          # Migrations (0001–0047)
├── frontend/src/
│   ├── pages/            # 35+ page components
│   ├── components/       # Shared UI
│   └── api/              # Typed API client
└── tests/e2e/            # 84 Playwright tests
```

---

## AI Context

If you are an AI agent, start by reading `AGENTS.md` and `STATE.md`.

- [AGENTS.md](AGENTS.md) · [STATE.md](STATE.md) · [ROADMAP.md](ROADMAP.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [CHANGELOG.md](CHANGELOG.md)
