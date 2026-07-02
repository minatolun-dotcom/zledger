# Project Context – ZLedger

## Identity
ZLedger is a modern, open-source TallyPrime alternative for Indian accounting. It handles double-entry bookkeeping, GST compliance, inventory management, and financial reporting.

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic |
| Database | PostgreSQL 16 |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| State | Zustand (global), React Query (server) |
| Deployment | Docker Compose (Nginx + FastAPI + PostgreSQL) |

## Architecture
```
SPA (React) → API (FastAPI) → Services → Models → DB
```
- **Layered**: UI → API → Service → Model → DB
- **Tenancy**: Multi-company, single-tenant (one deployment, many companies)
- **Core**: Strict double-entry bookkeeping

## Folder Structure
```
backend/app/
  api/v1/        — API routes (FastAPI routers)
  services/      — Business logic (accounting rules live here)
  models/        — SQLAlchemy ORM models
  schemas/       — Pydantic validation schemas
frontend/src/
  pages/         — Page-level components (vouchers/, reports/, compliance/, etc.)
  components/    — Shared components (Select, Calendar, ContextMenu, etc.)
  store/         — Zustand stores (theme, sidebar, etc.)
```

## Key Conventions
- **API**: RESTful, versioned at `/api/v1`, consistent JSON envelopes
- **Money**: `Numeric(18,2)` in Postgres, `Decimal` in Python. No floats.
- **GST**: Explicit half-up rounding for CGST/SGST/IGST
- **Company Scoping**: All requests scoped via resolved company context
- **Naming**: `snake_case` (Python), `camelCase` (TS vars/fns), `PascalCase` (components)

## Authentication & Authorization
- JWT-based authentication
- RBAC with roles: admin, accountant, viewer
- Multi-company isolation enforced at query level
- Financial year isolation on all date-scoped queries

## Reference Docs
- `AGENTS.md` — Tiered protocol for change workflow
- `ARCHITECTURE.md` — Detailed system architecture
- `CODING_STANDARDS.md` — Code quality rules
- `STATE.md` — Current project state and milestones
