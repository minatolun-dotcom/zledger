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
| Tests    | **Playwright** (84 E2E tests) |
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

```bash
cp .env.example .env
# Edit .env: set JWT_SECRET (e.g. python -c "import secrets; print(secrets.token_urlsafe(48))")

docker compose up -d --build

# Web UI:    http://<server-ip>:9090
# API docs:  http://<server-ip>:9090/api/docs
```

On first boot the API runs migrations and creates the bootstrap admin from `.env`.

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

If you are an AI agent, start by reading `SESSION_START.md`.

- [AGENTS.md](AGENTS.md) · [STATE.md](STATE.md) · [ROADMAP.md](ROADMAP.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [CHANGELOG.md](CHANGELOG.md)
