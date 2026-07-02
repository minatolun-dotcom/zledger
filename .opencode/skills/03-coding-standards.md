# Coding Standards

## Backend (Python/FastAPI)
- **Typing:** Strict type hints for all function signatures.
- **Money:** Use `decimal.Decimal` for all currency. NEVER use `float`.
- **Async:** Use `async def` for API endpoints; use `await` for DB calls.
- **Errors:** Use FastAPI `HTTPException` for API errors with clear detail messages.
- **Naming:** `snake_case` for variables and functions; `PascalCase` for classes.
- **Models:** SQLAlchemy 2.0 style with `mapped_column`, `relationship` for FKs.
- **Migrations:** Alembic auto-generation via `alembic revision --autogenerate`.
- **Services:** All business logic in `services/` — never in API routes.

## Frontend (TypeScript/React)
- **Typing:** Strict TypeScript. Avoid `any` where possible.
- **State:**
  - Global state → Zustand (e.g., theme, sidebar, auth).
  - Server state → React Query (e.g., API data, vouchers, ledgers).
- **Styling:** Tailwind CSS (Utility-first). No vanilla CSS files except `index.css` for global resets and dark mode variables.
- **Naming:** `camelCase` for variables/functions; `PascalCase` for components.
- **Components:** Prefer composition over inheritance. Extract shared logic into hooks (`use*`).
- **Modals/Overlays:** Use `createPortal` for dropdowns, `position: fixed` with high z-index for overlays (Calendar, ContextMenu, Select).

## API Standards
- **REST:** Standard RESTful paths (nouns, not verbs).
- **Versioning:** All API endpoints prefixed with `/api/v1`.
- **Response:** Consistent JSON envelopes with `detail` for errors.
- **Context:** Company ID must be passed/resolved for every data-accessing endpoint.
- **Pagination:** List endpoints should support `offset`/`limit` params.

## Database
- **Money:** `Numeric(18,2)` for all monetary columns.
- **Dates:** `Date` for dates, `DateTime(timezone=True)` for timestamps.
- **IDs:** UUID primary keys for all tables.
- **Audit:** `created_at`, `updated_at` on every table.
- **Soft delete:** `deleted_at` nullable timestamp for soft-deletable entities.

## Testing
- **Backend:** pytest with fixture conftest.py (drops all tables on teardown — restore with seed).
- **Frontend:** Playwright for e2e tests in `tests/e2e/`.
- **Test data:** Use "Apex Enterprises" (Maharashtra, GSTIN `27AABCP1234A1Z5`) for all manual testing.
