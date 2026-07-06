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

## React Performance Patterns
Apply these patterns when writing or reviewing React components:

### Memoization
- **`React.memo()`** for table rows, list items, and components that render frequently with the same props
- **`useCallback`** for callbacks passed as props to memoized children
- **`useMemo`** for expensive computations (sorting, filtering large datasets)
- **Don't memo** simple primitives or components that rarely re-render — it adds overhead without benefit

```tsx
// Good: memoize table rows
const VoucherRow = React.memo(({ voucher }: { voucher: Voucher }) => (
  <tr>...</tr>
));

// Bad: inline component definition (creates new reference every render)
function VoucherTable({ vouchers }: { vouchers: Voucher[] }) {
  return (
    <table>
      {vouchers.map(v => <tr key={v.id}>...</tr>)}  // new <tr> each render
    </table>
  );
}
```

### State Colocation
- Keep state as close to where it's used as possible
- Don't put all data in global Zustand stores unless multiple components need it
- Lift state up only when siblings need to share it
- Server state belongs in React Query, not local state

### Bundle Optimization
- **Lazy-load** page components with `React.lazy()` + `Suspense`
- **Import directly** — avoid barrel file imports (`import { Button } from '@/components'` → `import { Button } from '@/components/Button'`)
- **Dynamic imports** for heavy components (charts, PDF viewers, code editors)

### Rendering Performance
- **Avoid inline objects/arrays** in render — they create new references every render, breaking memoization
- **Use functional setState** when new state depends on previous state
- **Lazy useState init** — pass a function to useState for expensive initial values
- **Derive state during render** — don't use useEffect to compute derived state

```tsx
// Bad: inline object breaks memoization
<ExpensiveComponent style={{ color: 'red' }} />

// Good: hoist the object
const style = { color: 'red' };
<ExpensiveComponent style={style} />

// Bad: useEffect for derived state
const [filtered, setFiltered] = useState([]);
useEffect(() => {
  setFiltered(items.filter(i => i.active));  // unnecessary re-render
}, [items]);

// Good: derive during render
const filtered = useMemo(() => items.filter(i => i.active), [items]);
```

### Hook Rules
- Only call hooks at the top level — never inside loops, conditions, or nested functions
- Only call hooks from React functions (components or custom hooks)
- Custom hooks must start with `use`

### Re-render Prevention
- Use `startTransition` for non-urgent updates (search filtering, tab switching)
- Use `useDeferredValue` for expensive renders that shouldn't block input
- Split hooks with independent dependencies to avoid unnecessary re-renders
