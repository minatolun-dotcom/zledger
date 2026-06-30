# Zledger

A self-hostable, professional-grade **Indian accounting system with full GST support**, inspired by Tally Prime. Built to run as a Docker stack on an Ubuntu server and accessed by users over the LAN through a modern web UI.

> Status: **Phase 9 — complete** (all core features: auth, COA, vouchers, GST engine, reports, compliance, dashboard).

---

## Tech stack

| Layer    | Technology |
|----------|------------|
| Backend  | Python · **FastAPI** · SQLAlchemy 2.0 · Alembic |
| Database | **PostgreSQL 16** (all money as `Numeric(18,2)`, no floats) |
| Frontend | **React 18 + TypeScript** · Vite · Tailwind CSS · Zustand |
| Deploy   | **Docker Compose** (postgres + api + nginx-served SPA) |

## Features

- **Auth & Multi-company:** JWT login, company context, bootstrap admin, multi-company support.
- **Chart of Accounts:** 23 Tally-style groups, ledgers, financial years, parties.
- **Double-entry Core:** Vouchers with balance enforcement (`Σ debits == Σ credits`), append-only ledger lines.
- **GST Engine:** CGST/SGST/IGST calculation, HSN/SAC master, reverse charge, auto GST ledgers, auto-posting to ledgers.
- **GST Registrations:** Multi-GSTIN support per company.
- **Financial Reports:** Trial Balance, Profit & Loss, Balance Sheet — all with PDF and Excel export.
- **GST Compliance:** GSTR-1 (B2B, B2CS, HSN summary), GSTR-3B (outward supplies, reverse charge, ITC).
- **Dashboard:** Summary cards (income, expenses, profit, assets), voucher counts, recent activity, quick actions.
- **Financial Year Selector:** Global FY selector in the header, persisted across sessions.

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
├── docker-compose.yml      # postgres + api + web(nginx)
├── .env.example
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI app
│   │   ├── core/           # config, db, security
│   │   ├── models/         # ORM
│   │   ├── schemas/        # Pydantic
│   │   ├── api/v1/         # routers
│   │   ├── services/       # business logic
│   │   └── utils/          # money, gst rules
│   └── alembic/            # migrations
└── frontend/
    └── src/                # React + TS app
```

## Roadmap

- [x] **Phase 1** — Scaffold: bootable Docker stack, health check, Alembic baseline.
- [x] **Phase 2** — Auth + multi-company (JWT login, company context, bootstrap admin, frontend auth flow).
- [x] **Phase 3** — Chart of Accounts (seeded Tally-style groups, ledgers, financial years, parties, GST registration) + Masters UI.
- [x] **Phase 4** — Double-entry core (vouchers with balance enforcement) + voucher entry UI.
- [x] **Phase 5** — GST engine (CGST/SGST/IGST, HSN, RCM, auto GST ledgers) + live tax preview.
- [x] **Phase 6** — Reports: Trial Balance, Profit & Loss, Balance Sheet (printable with PDF/Excel export).
- [x] **Phase 7** — Printing & Export: server-side PDF (reportlab) and Excel (openpyxl) generation.
- [x] **Phase 8** — Compliance: GSTR-1, GSTR-3B return generation, GST auto-posting to ledgers.
- [x] **Phase 9** — Polish: dashboard with summary cards, FY selector in header, documentation.

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
