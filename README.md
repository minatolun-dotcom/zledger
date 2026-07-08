# Zledger

A self-hostable, professional-grade **Indian accounting system with full GST support**, inspired by Tally Prime. Built to run as a Docker stack on an Ubuntu server and accessed by users over the LAN through a modern web UI.

> Status: **Phase 29 — complete** (auth, COA, vouchers, GST engine, reports, compliance, dashboard, inventory, e-invoice, e-way bill, TDS/TCS, payments, attachments, PDF exports, company logo in PDFs & UI, automated backup & restore, 59 E2E tests, enhanced bank reconciliation, transaction flow visualization, voucher numbering, batch demo data).

---

## Tech stack

| Layer    | Technology |
|----------|------------|
| Backend  | Python · **FastAPI** · SQLAlchemy 2.0 · Alembic |
| Database | **PostgreSQL 16** (all money as `Numeric(18,2)`, no floats) |
| Frontend | **React 18 + TypeScript** · Vite · Tailwind CSS · Zustand |
| PDF      | **ReportLab** (portrait A4, company logo, stock item tables) |
| Excel    | **openpyxl** |
| Tests    | **Playwright** (54 E2E tests across 20 spec files) |
| Deploy   | **Docker Compose** (postgres + api + nginx-served SPA) |

## Features

### Core Accounting
- **Auth & Multi-company:** JWT login, company context, bootstrap admin, multi-company support.
- **Chart of Accounts:** 23 Tally-style groups, ledgers, financial years, parties — full CRUD with context menu, search, expand/collapse, balance display.
- **Double-entry Core:** 8 voucher types (Sales, Purchase, Payment, Receipt, Contra, Journal, Credit Note, Debit Note) with balance enforcement (`Σ debits == Σ credits`), append-only ledger lines.
- **Financial Year Management:** Create/edit/close/reopen FYs, overlap validation, auto-opening balance journal on close.
- **Dashboard:** Summary cards (income, expenses, profit, assets), voucher counts, recent activity, quick actions, FY-scoped data.

### GST & Tax
- **GST Engine:** CGST/SGST/IGST calculation, HSN/SAC master, reverse charge, auto GST ledgers, auto-posting to ledgers.
- **GST Registrations:** Multi-GSTIN support per company, composition scheme support.
- **GST Compliance:** GSTR-1 (B2B, B2CS, HSN summary), GSTR-3B (outward supplies, reverse charge, ITC), GSTR-4 (composition), GSTR-9 (annual), GSTR-9C (reconciliation).
- **GST Challans:** Payment tracking with apply-to-return linking.
- **E-Invoice:** GSTN IRP integration for B2B invoice registration.
- **E-Way Bill:** GSTN integration for goods movement tracking.
- **TDS/TCS:** Party-wise summary by section, deposit tracking.

### Inventory
- **Stock Groups & Items:** Hierarchical groups, units of measure, HSN/SAC codes, GST rates, opening balances.
- **Stock Entries:** Inward/outward tracking with weighted average and FIFO valuation.
- **Inventory Reports:** Stock summary, stock movement, stock ageing analysis.

### Reports & Export
- **Financial Reports:** Trial Balance, Profit & Loss, Balance Sheet, Cash Flow, Aging, Outstanding, Register — all with drill-down to ledger transactions.
- **Stock Reports:** Stock summary, stock movement, stock ageing.
- **TDS/TCS Summary:** Party-wise breakdown by section.
- **PDF Export:** 16 report types + voucher PDF, all portrait A4 with company logo (aspect-ratio preserved). Voucher PDFs show stock item details for item-type vouchers.
- **Excel Export:** All 16 report types as XLSX.
- **Day Book:** Date-range filtered, grouped by date or flat view, search, CSV/Excel/PDF export.

### Operations
- **Payments & Receivables:** Invoice-level payment allocation, aging buckets, outstanding tracking.
- **Bank Reconciliation:** CSV & Excel import with column mapping, fuzzy matching (amount/date/description/reference scoring), auto-reconcile with configurable threshold, duplicate detection, bulk delete, low-confidence match warnings.
- **Document Attachments:** File upload/download/delete on vouchers (PDF, images, Excel, Word).
- **Recurring Templates:** Schedule recurring vouchers with run-now and batch process.
- **Automated Backup:** Daily pg_dump with uploads snapshot, configurable retention, one-command restore.
- **Audit Log:** Track all entity changes with detail view.
- **Members:** Team management with owner/accountant/viewer roles.
- **Company Settings:** Company details, bank details, logo upload for PDF reports.

### UI/UX
- **Dark Mode:** Premium dark theme (Linear/Vercel-inspired) with Light/Dark/Auto (system) toggle.
- **Custom Components:** Themed Select dropdown, Calendar picker, ContextMenu, DateInput — zero native selects remaining.
- **Professional Sidebar:** 5 business modules (Accounting, Inventory, GST & Tax, Reports, Company), profile dropdown, global search (Ctrl+K).

---

## Quick start (Docker)

```bash
# 1. Configure
cp .env.example .env
# Edit .env: set a strong JWT_SECRET (e.g. python -c "import secrets; print(secrets.token_urlsafe(48))")

# 2. Build & launch
docker compose up -d --build

# 3. Use
#    Web UI:      http://<server-ip>:8080
#    API docs:    http://<server-ip>:8080/api/docs
#    Health:      http://<server-ip>:8080/api/health
```

On first boot the API runs migrations and creates the bootstrap admin from `.env`.

### Backup & Restore

Backups run automatically every 24 hours (configurable). The backup service stores database dumps and uploads snapshots in the `zledger_backups` volume.

```bash
# List available backups
docker run --rm -v zledger_zledger_backups:/backups alpine ls -lh /backups

# Restore from backup
./scripts/restore.sh /backups/zledger_XXXXXXXX_XXXXXX.sql.gz /backups/zledger_uploads_XXXXXXXX_XXXXXX.tar.gz
```

Configuration environment variables:
- `BACKUP_RETENTION_DAYS` — days to keep backups (default: 30)
- `BACKUP_INTERVAL_HOURS` — hours between backups (default: 24)

### E2E Tests

```bash
cd tests/e2e
npm install
npx playwright install chromium
npx playwright test --reporter=list
```

## Local development (without Docker)

**Backend**
```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
# Point DATABASE_URL at a local Postgres, then:
alembic upgrade head
uvicorn app.main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, proxies /api -> http://localhost:8000
```

---

## Repository layout

```
Zledger/
├── docker-compose.yml      # postgres + api + web(nginx) + backup
├── .env.example
├── scripts/
│   ├── backup.sh           # Automated database + uploads backup
│   └── restore.sh          # One-command restore from backup
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI app
│   │   ├── core/           # config, db, security, dependencies
│   │   ├── models/         # ORM (user, accounting, voucher, attachment)
│   │   ├── schemas/        # Pydantic (30+ schema files)
│   │   ├── api/v1/         # routers (20+ endpoint modules)
│   │   ├── services/       # business logic (export, gstr, payments, etc.)
│   │   └── utils/          # money, gst rules, date utils
│   └── alembic/            # migrations (0001–0032)
├── frontend/
│   └── src/
│       ├── api/            # typed API client
│       ├── components/     # shared UI (Select, Calendar, ContextMenu, etc.)
│       ├── pages/          # 30+ page components
│       ├── store/          # Zustand stores (auth, theme)
│       └── utils/          # date utils, Indian states
└── tests/
    └── e2e/                # Playwright E2E tests
        ├── specs/          # 21 spec files, 59 tests
        └── helpers/        # login, fixtures, interaction helpers
```

## Roadmap

### Completed
- [x] **Phase 1–9** — Scaffold, Auth, COA, Double-entry, GST Engine, Reports, Export, Compliance, Dashboard.
- [x] **Phase 10–17** — Voucher UI polish, Item/Amount/Journal forms, QuickCreate, DayBook, navigation redesign.
- [x] **Phase 18** — E-Way Bill + Voucher Cancellation.
- [x] **Phase 19** — Cost Centre Allocation + Stock Valuation (weighted average, FIFO).
- [x] **Phase 20** — Reports Suite (Cash Flow, Aging, Outstanding, Register) + Masters/COA UI improvements.
- [x] **Phase 21** — TDS/TCS Summary + Inventory Reports (Stock Summary, Movement, Ageing).
- [x] **Phase 22** — Tally Import (XML + Excel, validation, undo) + GSTR-9 Annual Return + GSTR-9C Reconciliation.
- [x] **Phase 23** — Composition Scheme + Recurring Vouchers.
- [x] **Phase 24** — Background Cron Processor + GSTR-9C Reconciliation.
- [x] **Phase 25** — GST Challan / Payment Tracking.
- [x] **Phase 26** — Financial Statements with Drill-Down (ledger transactions, voucher detail modal).
- [x] **Phase 27** — Payments & Receivables Management (allocation, aging buckets).
- [x] **Phase 28** — Document Attachments (upload/download/delete on vouchers).
- [x] **Phase 29** — Enhanced Export & Print (16 PDF/Excel export functions, voucher PDF, company logo integration).
- [x] **Auth fix** — `fetchMe()` only clears token on 401, not transient errors.
- [x] **E2E tests** — 59 Playwright tests across 21 spec files.

## AI Context
This project uses a persistent context system for AI agents. If you are an AI, start by reading `SESSION_START.md`.

- [AGENTS.md](AGENTS.md) - AI operational protocols.
- [STATE.md](STATE.md) - Current progress and active tasks.
- [ROADMAP.md](ROADMAP.md) - Planned milestones.
- [ARCHITECTURE.md](ARCHITECTURE.md) - System design.
- [CODING_STANDARDS.md](CODING_STANDARDS.md) - Conventions.
- [TESTING.md](TESTING.md) - Build and test guide.
- [CHANGELOG.md](CHANGELOG.md) - Decision log.

---
