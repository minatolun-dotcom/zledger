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

## E2E Test Patterns (Prevent Regressions)
**All patterns below were learned from the 10 backend API test failures fixed on 2026-07-04.**

### Test Helpers (in `tests/e2e/specs/api-backend.spec.ts`)
- `getLedgerIds(request, token, cid, names)` — Fetches ledger IDs by name from COA. **Always use this instead of hardcoding `ledger_name`** (the API uses `ledger_id`).
- `registerViewerInCompany(request, adminToken, cid, email, name)` — Registers a user, adds them as viewer member, returns their token. **Use this for 403-viewer tests** (registering alone doesn't add them to a company, so `get_active_company` returns 400 before the role check).

### Voucher Payloads
- Use `voucher_date` (not `date`)
- Use `ledger_id` (not `ledger_name`)
- Recurring templates use `template_payload: dict` (not `lines`)

### GST Calculation
- Request: `{ amount, hsn_sac_id, is_inter_state }` (not `taxable_amount`, `cgst_rate`, etc.)

### Inventory Delete
- Cannot delete items with stock entries (API returns 400). Test delete BEFORE creating entries.

### Financial Years
- Seed data creates FY for 2026-2027. Use `2030+` dates for test Fys to avoid overlap.

### Attachments
- `GET /attachments/{voucher_id}` returns 404 if voucher doesn't exist (not 200).

### Model Column Sizes
- `cancelled_at` is `VARCHAR(40)` — ISO timestamps with microseconds are 32 chars. Always verify column sizes accommodate full value range.

## Common Guidelines
- **Standard Adherence:** Follow `CODING_STANDARDS.md` strictly.
- **Auto Rebuild:** After any frontend code change, run `docker-compose build web && docker-compose up -d web` automatically (no need to ask).
- **Test Data Cleanup (MANDATORY):** After EVERY test, run the cleanup command below to remove test companies, test financial years, test BOMs, test vouchers, **and orphaned test users**. Test companies include the exact name `"Test Co"` **and** any name starting with `"Test Co "` (note: the bare `"Test Co"` is a common leftover that the `Test Co %` pattern alone misses), test BOMs start with `"Test BOM "`, test vouchers have `"test"` in narration, and test FYs contain `"E2E"`. Keep the 5 demo companies (Apex, GreenLeaf, BuildRight, Medix, TechVista) untouched. **Orphaned users:** deleting a `Company` cascades its `CompanyMember` rows but leaves the `User` row (which is the parent of `memberships`). Any `User` with zero company memberships is a leftover from `register_user` — safe to delete because every real user belongs to ≥1 (demo) company.
  ```
  docker-compose exec -T api python3 -c "
  from sqlalchemy import select
  from app.core.db import get_db
  from app.models.user import Company, CompanyMember, User
  from app.models.accounting import FinancialYear
  from app.models.manufacturing import BillOfMaterials, ProductionOrder, ProductionOrderLine, BomLine
  from app.models.voucher import Voucher
  db = next(get_db())

  # Test companies + cascading deletes
  test_boms = db.query(BillOfMaterials).filter(BillOfMaterials.name.like('Test BOM%')).all()
  bom_ids = [str(b.id) for b in test_boms]
  if bom_ids:
    orders = db.query(ProductionOrder).filter(ProductionOrder.bom_id.in_(bom_ids)).all()
    order_ids = [str(o.id) for o in orders]
    if order_ids:
      for l in db.query(ProductionOrderLine).filter(ProductionOrderLine.production_order_id.in_(order_ids)).all(): db.delete(l)
    for o in orders: db.delete(o)
    for l in db.query(BomLine).filter(BomLine.bom_id.in_(bom_ids)).all(): db.delete(l)
    for b in test_boms: db.delete(b)

  # Test companies: catch BOTH the bare "Test Co" name AND "Test Co <suffix>"
  test_company_ids = set()
  for c in db.query(Company).filter(Company.name == 'Test Co').all(): test_company_ids.add(c.id)
  for c in db.query(Company).filter(Company.name.like('Test Co %')).all(): test_company_ids.add(c.id)
  for c in db.query(Company).filter(Company.name.like('%E2E%')).all(): test_company_ids.add(c.id)
  for cid in test_company_ids:
      c = db.get(Company, cid)
      if c: db.delete(c)
  for fy in db.query(FinancialYear).filter(FinancialYear.name.like('%E2E%')).all(): db.delete(fy)
  for v in db.query(Voucher).filter(Voucher.narration.in_(['test', 'Test', 'TEST'])).all(): db.delete(v)

  # Orphaned users (no company membership) → leftover test users from register_user
  db.flush()
  member_ids = select(CompanyMember.user_id)
  orphan_users = db.query(User).filter(~User.id.in_(member_ids)).all()
  for u in orphan_users: db.delete(u)

  db.commit()
  print('Test data cleaned')
  "
  ```

## Dark Mode Gotchas (learned the hard way)

### Native `<select>` dropdowns CANNOT be themed via CSS
**Problem:** The open dropdown list (popup) of a native `<select>` is rendered by the **OS/browser engine**, not the page CSS. On Linux/Chromium this means:
- `dark:bg-[#16161f]` on `<select>` only styles the **closed control**, not the open list
- `dark:[&>option]:bg-[#16161f]` Tailwind variants **do not compile** — zero CSS output
- `.dark select option { ... }` in CSS **does not affect the popup** (only the control itself)
- `color-scheme: dark` on `html.dark` helps on macOS/Windows but **not reliably on Linux**

**Do NOT waste time** trying any of these approaches:
1. ~~`dark:[&>option]:bg-...`~~ — does not compile
2. ~~`.dark select option { background: ... }`~~ — doesn't reach the popup
3. ~~`color-scheme: dark`~~ — only affects some OS/browser combos
4. ~~`appearance: none` + custom arrow~~ — only styles the control, not the list

**The ONLY fix:** Replace native `<select>` with a custom dropdown component that renders via a **React portal** (so the popup is inside the DOM tree and fully CSS-controllable).

**This project already has one:** `src/components/Select.tsx` — portal-based, keyboard-navigable, themed with `dark:bg-[#16161f]`. Use it everywhere you need a dark-themed dropdown:
```tsx
import Select from "../components/Select";

<Select
  value={selectedValue}
  onChange={(v) => setSelectedValue(v)}
  options={[
    { value: "a", label: "Option A" },
    { value: "b", label: "Option B" },
  ]}
  placeholder="All Items"
/>
```

### When to use which input
| Element | Use case | Dark themed? |
|---------|----------|-------------|
| `<Select>` (portal component) | Dropdown with options list | Yes — fully themed popup |
| `<input type="text">` | Free text | Yes — via `dark:bg` classes |
| `<DateInput>` component | Date fields | Yes — custom themed |
| Native `<select>` | **AVOID in dark mode** | **No — popup is white** |

### Use the app's custom dark palette, NOT default Tailwind slate
**Problem:** New pages/modals often use `dark:bg-slate-700`, `dark:bg-slate-800`, `dark:border-slate-600` etc. — these are Tailwind's **default slate palette**, not the app's custom dark theme. They create visual inconsistency (slightly wrong gray tones vs the rest of the app).

**Always use these custom values instead:**
| Purpose | Custom dark class | Tailwind default (AVOID) |
|---------|------------------|------------------------|
| Modal/panel background | `dark:bg-[#16161f]` | ~~`dark:bg-slate-800`~~ |
| Input/field background | `dark:bg-[#1a1a24]` | ~~`dark:bg-slate-700`~~ |
| Elevated border | `dark:border-[#282832]` | ~~`dark:border-slate-600`~~ |
| Subtle border | `dark:border-[#1a1a24]` | ~~`dark:border-slate-700`~~ |
| Primary text | `dark:text-[#f1f5f9]` | ~~`dark:text-slate-100`~~ |
| Secondary text | `dark:text-[#cbd5e1]` | ~~`dark:text-slate-300`~~ |
| Muted text | `dark:text-[#94a3b8]` | ~~`dark:text-slate-400`~~ |
| Disabled text | `dark:text-[#64748b]` | ~~`dark:text-slate-500`~~ |

**Reference:** See `src/index.css` lines 30–42 for the full `--surface-*` / `--text-*` token definitions.

## Tool Usage
- Use `glob` and `grep` to explore before editing.
- Run `alembic upgrade head` after modifying models.
- Use the `skill` tool to load domain knowledge from `.opencode/skills/` as needed.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
