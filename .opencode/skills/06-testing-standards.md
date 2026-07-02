# Testing Standards

## Testing Pyramid

```
    ╱╲
   ╱ E2E ╲        ← Playwright (few, high-value)
  ╱────────╲
 ╱ Integration ╲   ← API curl / service-level (medium)
╱────────────────╲
╲  Unit Tests    ╱   ← pytest (many, fast, isolated)
 ╲──────────────╱
```

## Backend Tests (pytest)
- **Location**: `tests/` (shares live database)
- **Runner**: `docker-compose exec -T api pytest tests/`
- **Fixture handling**: `conftest.py:25 Base.metadata.drop_all` runs on teardown — this **destroys all data**
- **Restoration**: After running tests, always restore:
  ```bash
  docker-compose exec -T api alembic upgrade head
  docker-compose exec -T api python scripts/seed_demo_data.py
  ```
- **Scope**: Write tests for:
  - Service functions (voucher posting, GST calculation, reports)
  - API endpoint validation (schemas, error responses)
  - Edge cases (zero values, negative amounts, closed FY errors)

## API Integration Tests
- Use `curl` against the live API for manual API testing:
  ```bash
  docker-compose exec -T api curl -X GET http://localhost:8000/api/v1/...
  ```
- Include JWT token in headers for authenticated endpoints
- Verify response status codes, JSON structure, and business logic

## Frontend Verification
- After frontend changes, rebuild and verify visually:
  ```bash
  docker-compose build web && docker-compose up -d web
  ```
- Check: page renders, dark mode toggles, form submissions work, error states display correctly
- Test with the browser DevTools open for console errors

## Manual Testing Data
- **Always** use "Apex Enterprises" (GSTIN `27AABCP1234A1Z5`, Maharashtra)
- Test company has: 19 vouchers (all 8 types), 5 parties, 7 stock items, 3 cost centres, 2 FYs, e-invoices
- All demo data is safe to modify — no preservation needed

## Regression Testing
- Run the full Playwright suite before any merge
- For backend-only changes, run API integration tests
- For frontend-only changes, run Playwright suite + visual check
- For combined changes, run both

## What to Test
| Change Type | Required Tests |
|-------------|---------------|
| CSS/typography | Visual verification only |
| Voucher logic | API tests + Playwright vouchers suite |
| New API endpoint | Integration test + schema validation |
| New page | Playwright e2e + visual verification |
| Model/migration | Alembic upgrade/downgrade + seed restore |
