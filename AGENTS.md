# AI Agents Protocol

## General Guidelines
- **Context First:** Always read `STATE.md` and `ARCHITECTURE.md` before suggesting changes.
- **Self-Documentation:** You are responsible for keeping the project self-describing.
- **State Sync:** After completing any task, update:
  - `STATE.md`: Update progress and pending tasks.
  - `CHANGELOG.md`: Log the change and any architectural decisions.
- **Standard Adherence:** Follow `CODING_STANDARDS.md` strictly.
- **Auto Rebuild:** After any frontend code change, run `docker-compose build web && docker-compose up -d web` automatically (no need to ask).
- **Git Commit & Push:** After completing any change (code, docs, bug fixes), commit all changes and push to `origin main`. Include updated STATE.md and CHANGELOG.md in the commit.

## Tool Usage
- Use `glob` and `grep` to explore before editing.
- Run `alembic upgrade head` after modifying models.
- **Always test after every change** — use the running API and frontend (demo data is fine, don't worry about data loss). For backend changes, test via `docker-compose exec -T api curl` against the live API. For frontend changes, verify after rebuild.

## Testing
- **Always use "Apex Enterprises"** (GSTIN `27AABCP1234A1Z5`, Maharashtra) for any manual testing. It has 19 vouchers across all 8 types, 5 parties, 7 stock items, cost centres, stock valuation, e-invoices, 2 FYs with opening balance.
- All demo data is safe to use/test with — no need to preserve it.
- Backend tests (`tests/`) share the live database and will drop all tables on teardown (`conftest.py:25 Base.metadata.drop_all`). Run `alembic upgrade head && python scripts/seed_demo_data.py` to restore after running tests.
- The tests pre-existing fixture issue means tests share the app DB. This is acceptable for now — just restore with seed after.
