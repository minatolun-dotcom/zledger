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

# Update snapshots (visual regression)
docker-compose exec -T web npx playwright test --update-snapshots

# Run with retries (CI)
docker-compose exec -T web npx playwright test --retries=2
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

## 4-Phase Workflow

### Phase 1: Explore
Before writing any test, analyze the feature:
- What user flows does it support?
- What are the happy paths and error paths?
- What data state is required?
- Which API endpoints does it call?

### Phase 2: Plan
Design the test structure:
- List test cases (happy path, edge cases, error states)
- Identify shared setup (login, data creation)
- Decide between POM vs. inline selectors
- Plan test data isolation (E2E_PREFIX for all created data)

### Phase 3: Implement
Write tests using patterns below. Run after each test file to verify.

### Phase 4: Validate
- Run full suite — all tests must pass
- Verify no flaky tests (run 3x to confirm)
- Check test isolation (tests don't depend on each other's data)

## Page Object Model (POM)
For complex pages, extract locators and actions into page objects:
```typescript
// pages/VoucherFormPage.ts
export class VoucherFormPage {
  constructor(private page: Page) {}

  async selectVoucherType(type: string) {
    await this.page.getByRole('tab', { name: type }).click();
  }

  async fillParty(name: string) {
    await this.page.getByLabel('Party').fill(name);
    await this.page.getByRole('option', { name }).click();
  }

  async save() {
    await this.page.getByRole('button', { name: 'Save' }).click();
    await expect(this.page.getByText('Saved successfully')).toBeVisible();
  }
}

// specs/vouchers.spec.ts
test('create sales voucher', async ({ page }) => {
  const form = new VoucherFormPage(page);
  await form.selectVoucherType('Sales');
  await form.fillParty('Reliance Retail');
  await form.save();
});
```

## Auth Setup (Fixtures)
Reuse authenticated state across tests instead of logging in per-test:
```typescript
// fixtures.ts
import { test as base } from '@playwright/test';

export const test = base.extend({
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Login once
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@zledger.com');
    await page.getByLabel('Password').fill('admin12345');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Dashboard')).toBeVisible();
    await use(page);
    await context.close();
  },
});
```

## Visual Regression
Capture screenshots for UI-critical pages:
```typescript
test('dashboard renders correctly', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveScreenshot('dashboard.png', {
    maxDiffPixelRatio: 0.01,  // 1% tolerance
  });
});
```
- Store baseline screenshots in `tests/e2e/screenshots/`
- Update baselines with `--update-snapshots` after intentional UI changes
- Review snapshot diffs in CI before merging

## Best Practices
- **Scoped selectors**: always scope to `nav`, `table.first()`, `section` to avoid ambiguity
- **Exact matching**: Use `exact: true` on button selectors (e.g., `"Save"` vs `"Save as Template"`)
- **Narration-based**: Prefer `getByRole("link", { name: "..." })` and `getByRole("button")` over CSS selectors
- **Duplicates**: Use `.first()` for duplicated elements
- **Prefix**: Use `E2E_PREFIX` (e.g., `e2e-{Date.now()}`) for all data created during tests to avoid collisions
- **Data restoration**: After running tests, restore DB with `alembic upgrade head && python scripts/seed_demo_data.py`
- **Test isolation**: Each test creates its own data with unique prefix. Never depend on data from other tests.
- **Assertions**: Use `expect().toPass()` for polling assertions instead of fixed waits
- **Timeouts**: Prefer `waitForResponse` over `waitForTimeout` — wait for the actual API call, not an arbitrary delay

## Flaky Test Prevention
- **No fixed waits**: Replace `page.waitForTimeout(1000)` with `expect(...).toPass()` or `waitForResponse`
- **Network idle**: Use `await page.waitForLoadState('networkidle')` after navigation when API calls are expected
- **Retry on flakiness**: If a test fails 1 in 10 runs, it's flaky — fix the root cause, don't just retry
- **Screenshots on failure**: Config saves screenshots to `test-results/` automatically
- **Never disable a failing test** — fix the root cause

## CI Integration
```yaml
# .github/workflows/e2e.yml
- name: Run E2E tests
  run: |
    docker-compose up -d
    docker-compose exec -T web npx playwright test --retries=2
  env:
    CI: true
```
- Run on every PR to `main`
- Upload test results as artifacts
- Block merge if E2E tests fail

## Workflow
1. Write/update a Playwright test that reflects the new feature
2. Run the specific test file to verify the test captures the expected behavior
3. Implement the feature
4. Run the full suite
5. Fix any failures
6. Repeat until all tests pass
7. Commit
