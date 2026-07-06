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

## OWASP Top 10 Prevention

### A01: Broken Access Control
- Enforce RBAC at the API level, not just the UI level
- Never trust client-side authorization checks
- Validate `company_id` on every request — never skip the membership check
- Test access control: attempt cross-company data access, privilege escalation, unauthenticated access

### A02: Cryptographic Failures
- Never store passwords in plaintext — always hash with bcrypt/argon2
- Use `passlib` for password hashing in Python
- JWT secrets must be at least 32 characters, randomly generated
- Don't log sensitive data (passwords, tokens, full card numbers)

### A03: Injection
- SQLAlchemy ORM prevents SQL injection — never use raw SQL with f-strings or `.format()`
- Sanitize user input before rendering in HTML (use React's JSX escaping)
- Validate and sanitize file uploads (type, size, content)
- Never use `eval()` or `exec()` on user input

### A04: Insecure Design
- Apply principle of least privilege — users get minimum access needed
- Validate all inputs at the boundary (API layer), not deep in business logic
- Document threat models for financial operations (voucher creation, payments, refunds)

### A05: Security Misconfiguration
- Never leave debug mode in production (`DEBUG=False`)
- Don't expose stack traces to users — log them, show generic error messages
- CORS must not be `*` in production
- Disable directory listing in web server config

### A06: Vulnerable Components
- Run `pip-audit` periodically to check Python dependencies
- Run `npm audit` periodically to check Node.js dependencies
- Keep dependencies updated — don't ignore security patches

### A07: Auth Failures
- Implement rate limiting on login endpoints (5 attempts/minute per IP)
- Lock accounts after 10 failed attempts (30-minute lockout)
- Don't reveal whether a username exists (generic "Invalid credentials" message)
- Require strong passwords (min 12 characters, mixed case, numbers)

### A08: Software/Data Integrity
- Use signed commits or verified tags for releases
- Validate file integrity on upload (checksum if applicable)
- Don't use `pickle` or `yaml.load()` with untrusted data

### A09: Logging/Monitoring Failures
- Log all authentication events (login, logout, failed attempts)
- Log all financial operations (voucher create/update/delete, payments)
- Never log sensitive data (passwords, tokens, full account numbers)
- Use structured logging (JSON) for machine readability

### A10: SSRF Prevention
- Validate and sanitize all URLs in user input
- Don't fetch arbitrary URLs from the server (prevents internal network scanning)
- Use allowlists for external API calls

## Security Audit
Run these checks before major releases or when onboarding new dependencies:

### Secrets Scan
```bash
# Check for hardcoded secrets in source code
grep -rn --include="*.{py,ts,tsx,js,jsx}" \
  -E '(?i)(api[_-]?key|secret|password|token|bearer)\s*[=:]\s*["'\''"][^"'\'']{8,}["'\''"]' \
  --exclude-dir={node_modules,.git,dist,__pycache__} . 2>/dev/null

# Check for private keys
grep -rn 'BEGIN.*PRIVATE KEY' --exclude-dir={node_modules,.git} . 2>/dev/null

# Check .env files aren't committed
find . -name ".env*" -not -path "*/node_modules/*" -not -path "*/.git/*" -type f 2>/dev/null

# Verify .env is in .gitignore
grep -q "\.env" .gitignore && echo "OK" || echo "WARNING: .env not in .gitignore"
```

### Dependency Audit
```bash
# Python
pip-audit 2>/dev/null || echo "pip-audit not installed"

# Node.js
npm audit 2>/dev/null || echo "no package-lock.json found"
```

### Prompt Injection Surface
```bash
# Check for zero-width characters (hidden instructions)
grep -rPn '[\x{200B}-\x{200D}\x{FEFF}]' --include="*.md" . 2>/dev/null

# Check for hidden HTML comments with instructions
grep -rn '<!--' --include="*.md" . 2>/dev/null | grep -i 'ignore\|system\|admin\|override'

# Check for base64 in comments (potential payloads)
grep -rn -E '[#;].*[A-Za-z0-9+/]{20,}={0,2}' --include="*.py" --include="*.ts" \
  --exclude-dir={node_modules,.git} . 2>/dev/null | head -10
```

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
