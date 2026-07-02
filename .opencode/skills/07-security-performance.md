# Security & Performance

## Security

### Authentication & Authorization
- **JWT**: Tokens with expiration (configurable via `JWT_EXPIRE_MINUTES`). Refresh flow for extended sessions.
- **Storage**: JWT stored in `localStorage`. No cookies.
- **RBAC Roles**: `admin` (full access), `accountant` (create/edit, no admin), `viewer` (read-only).
- **Enforcement**: Role checked per-endpoint via FastAPI dependency injection.

### Multi-Company Isolation
- Every data-accessing endpoint resolves `company_id` from the authenticated user's context.
- All queries include `WHERE company_id = :company_id` — never trust client-supplied company IDs.
- Users can only access data for companies they are members of.

### Financial Year Isolation
- Voucher creation/update rejects dates in closed FYs.
- Reports and list endpoints scope queries to the selected FY's date range.
- FY isolation enforced at the service layer, not just the API layer.

### Input Validation
- **Pydantic schemas**: All API inputs validated via Pydantic models. No raw dict access.
- **SQL Injection**: Prevented by SQLAlchemy's parameterized queries. Never use raw SQL with string formatting.
- **Money**: `Decimal` type enforced. Reject non-numeric strings and negative amounts where inapplicable.
- **Dates**: Validate date ranges (start < end), format (ISO 8601), and FY boundaries.

### Additional Controls
- Soft delete (`deleted_at` timestamp) for critical entities (ledgers, parties, vouchers).
- Audit fields (`created_at`, `updated_at`) on every table.
- System ledgers/accounts (prefixed `SYS_`) are protected from user modification.

## Performance

### Database
- **Indexes**: Ensure indexes on:
  - `vouchers(company_id, voucher_date)` — date-range queries
  - `voucher_lines(voucher_id)` — line lookups
  - `ledgers(company_id, group_id)` — COA tree queries
  - `stock_balances(company_id, stock_item_id)` — inventory valuation
  - Foreign keys that appear in WHERE clauses
- **N+1 Prevention**: Use SQLAlchemy `selectinload()` / `joinedload()` for related collections. Never lazy-load in list endpoints.
- **Pagination**: All list endpoints must support `offset`/`limit` with a reasonable default (e.g., 50) and max cap (e.g., 500).
- **Connection Pool**: Use `pool_size=10, max_overflow=20` for concurrent requests.

### API
- **Payload size**: Keep response payloads lean. Exclude unnecessary fields in list endpoints.
- **Caching**: Cache reference data (ledgers, groups, parties) on the frontend with React Query's `staleTime`.
- **Batch operations**: For bulk imports (Tally), use background jobs with status tracking, not blocking requests.

### Frontend (React)
- **Memoization**: Use `React.memo()` for table rows, list items, and components that render frequently.
- **useCallback/useMemo**: For callbacks passed as props to memoized children.
- **Virtualization**: Consider `react-window` for very large tables (1000+ rows).
- **Bundle size**: Lazy-load page components with `React.lazy()` + `Suspense`.
- **Re-renders**: Avoid inline object/array creation in render methods to prevent unnecessary child re-renders.
- **State colocation**: Keep state as close to where it's used. Avoid putting all data in global Zustand stores.

### Reports
- Report queries should be optimized aggregates, not row-by-row processing.
- Date-range filters must use database-side filtering, not application-side.
- Large result sets (e.g., DayBook) should be paginated, not loaded at once.
