# Playwright QA

## Purpose
Ensure every feature change is validated through end-to-end Playwright tests before committing. Never stop after compilation succeeds — always run the full suite.

## Setup
- **Location**: `tests/e2e/`
- **Config**: `tests/e2e/playwright.config.ts` (chromium, headless, 60s timeout)
- **Base URL**: `http://localhost:8080`
- **Helpers**: `tests/e2e/helpers/` (login.ts, fixtures.ts, interaction.ts)

## Commands
```bash
# Full test suite (from host)
docker-compose exec -T web npx playwright test

# Specific test file
docker-compose exec -T web npx playwright test tests/e2e/specs/vouchers.spec.ts

# UI mode (debugging)
docker-compose exec web npx playwright test --ui

# Show HTML report
docker-compose exec -T web npx playwright show-report
```

## Test Structure
```
tests/e2e/
  playwright.config.ts
  package.json
  tsconfig.json
  helpers/
    login.ts          — Full UI login flow (admin@example.com / admin123)
    fixtures.ts       — Test data constants (Apex Enterprises, E2E_PREFIX)
    interaction.ts    — Custom Select, DateInput, voucher type tab, line fillers, save
  specs/
    auth.spec.ts      — Login/logout/redirect/unauthenticated (6 tests)
    navigation.spec.ts — Sidebar modules, search, profile, theme (16 tests)
    vouchers.spec.ts   — All 8 voucher types (8 tests)
```

## Best Practices
- **Scoped selectors**: always scope to `nav`, `table.first()`, `section` to avoid ambiguity
- **Exact matching**: Use `exact: true` on button selectors (e.g., `"Save"` vs `"Save as Template"`)
- **Narration-based**: Prefer `getByRole("link", { name: "..." })` and `getByRole("button")` over CSS selectors
- **Duplicates**: Use `.first()` for duplicated elements
- **Prefix**: Use `E2E_PREFIX` (e.g., `e2e-{Date.now()}`) for all data created during tests to avoid collisions
- **Data restoration**: After running tests, restore DB with `alembic upgrade head && python scripts/seed_demo_data.py`

## Workflow
1. Write/update a Playwright test that reflects the new feature
2. Run the specific test file to verify the test captures the expected behavior
3. Implement the feature
4. Run the full suite
5. Fix any failures
6. Repeat until all tests pass
7. Commit

## Flaky Tests
- If a test is flaky, increase timeout (max 60s), not tolerance
- Use `expect().toPass()` for polling assertions instead of fixed waits
- Screenshots on failure are saved to `test-results/`
- Never disable a failing test — fix the root cause
