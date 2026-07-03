# AI Agents Protocol

## Skills
This project uses dedicated skill files for domain knowledge and standards. Skills are automatically loaded by context. Two are always active:

| Always Loaded | On-Demand (by trigger) |
|--------------|----------------------|
| `01-project-context` | `03-coding-standards`, `04-ui-ux-guidelines` |
| `02-accounting-domain` | `05-playwright-qa`, `06-testing-standards` |
| | `07-security-performance`, `08-documentation` |

Use `skill` tool to load an on-demand skill explicitly if needed.

## Change Tiers

### Small Fix (CSS/typography only)
1. Make the fix
2. Rebuild if frontend: `docker-compose build web && docker-compose up -d web`
3. Commit and push (no docs update needed)

### Full Protocol (logic/behavior, new features, model/schema, multi-file)
1. **Context First:** Always read `STATE.md` and `ARCHITECTURE.md` before suggesting changes.
2. Make the fix
3. Rebuild if frontend: `docker-compose build web && docker-compose up -d web`
4. **Test:** Use the running API and frontend (demo data is fine, don't worry about data loss). For backend changes, test via `docker-compose exec -T api curl` against the live API. For frontend changes, verify after rebuild.
5. **State Sync:** Update `STATE.md` (progress/pending tasks) and `CHANGELOG.md` (log the change).
6. **Commit & Push:** Commit all changes including updated STATE.md and CHANGELOG.md, push to `origin main`.

## Feature Dependency Audit Checklist
**Use this checklist when adding any new feature or model field.** The 6 production bugs fixed on 2026-07-04 all came from skipping these steps.

### Model / Schema Changes
- [ ] New DB columns → **Alembic migration created?** (`alembic revision --autogenerate`)
- [ ] ORM model fields match DB columns (no phantom fields)
- [ ] Pydantic schemas include/exclude the new fields correctly

### Downstream Query Audit
- [ ] Search all services that query the affected table — do they need filter updates?
- [ ] Example: adding `cancel_reason` to Voucher → payments service, reports, daybook all query vouchers
- [ ] Search pattern: `grep -r "ModelName" backend/app/services/`

### Public vs Auth Endpoints
- [ ] Which new endpoints need auth? Which must be public?
- [ ] Static assets served via `<img>`, `<link>`, `<script>` → **cannot send auth headers** → must be public
- [ ] PDF exports, logo serving, file downloads → verify auth requirements

### Seed / Demo Data
- [ ] New model fields that affect demo data → seed script updated?
- [ ] New relationships (FKs) → seed script creates related records?
- [ ] Re-seed after changes: `docker-compose exec -T api python -m scripts.seed_demo_data`

### Frontend
- [ ] New API fields → TypeScript interfaces updated?
- [ ] Error handling uses `e?.message` (not `e?.detail`) — `ApiError` exposes string as `.message`
- [ ] LocalStorage keys scoped per company if multi-tenant

### Testing
- [ ] E2E tests cover the new feature
- [ ] Tests verify error paths, not just happy paths
- [ ] Tests verify public endpoints work without auth (if applicable)
- [ ] Run full test suite before committing

## Common Guidelines
- **Standard Adherence:** Follow `CODING_STANDARDS.md` strictly.
- **Auto Rebuild:** After any frontend code change, run `docker-compose build web && docker-compose up -d web` automatically (no need to ask).

## Tool Usage
- Use `glob` and `grep` to explore before editing.
- Run `alembic upgrade head` after modifying models.
- Use the `skill` tool to load domain knowledge from `.opencode/skills/` as needed.
