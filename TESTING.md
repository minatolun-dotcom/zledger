# Testing & Verification

## Backend Tests (255+ tests)
```bash
# Run inside Docker (PostgreSQL)
docker compose exec api pip install -e ".[dev]"
docker compose exec api python -m pytest tests/ -v
```

### Test Files
| File | Tests | Coverage |
|------|-------|----------|
| `test_money.py` | 20 | Money utility functions (rounding, sum, coercion) |
| `test_gst_service.py` | 14 | GST calculation (rates, rounding, inter/intra-state) |
| `test_reports_service.py` | 12 | Trial balance, P&L, balance sheet calculations |
| `test_dashboard_service.py` | 7 | Dashboard summary aggregation |
| `test_gstr_service.py` | 11 | GSTR-1/B2B/B2CS/HSN, GSTR-3B generation |
| `test_einvoice_service.py` | 21 | AES encryption, date formatting, PIN extraction, doc types |
| `test_coa.py` | 16 | Financial years, groups, ledgers, parties |
| `test_vouchers.py` | 12 | Voucher CRUD, double-entry enforcement |
| `test_gst_endpoints.py` | 12 | HSN/SAC, GST registrations, GST calculation API |
| `test_reports_endpoints.py` | 12 | Report JSON/PDF/XLSX endpoints |
| `test_einvoice_endpoints.py` | 12 | E-Invoice endpoints (enabled/disabled, CRUD, auth) |
| `test_members.py` | 10 | Member CRUD, owner protection, role enforcement |
| `test_admin_users.py` | 7 | Superadmin user management, self-deactivation prevention |
| `test_user_profile.py` | 7 | Profile update, password change, email uniqueness |
| `test_auth.py` | 8 | Registration, login, JWT |
| `test_companies.py` | 6 | Company CRUD, membership |
| `test_eway_bill.py` | ~15 | E-Way Bill generation, cancellation, vehicle update, auth |
| `test_voucher_cancel.py` | ~8 | Voucher cancellation, reversal entry creation |
| `test_stock_valuation.py` | ~12 | Weighted average, FIFO valuation, stock balance |
| `test_cost_centre.py` | ~10 | Cost centre allocation, P&L by cost centre |

### Shared Fixtures (conftest.py)
- `register_user(client, email)` → (user_data, token)
- `create_company(client, token, name)` → company dict
- `auth_header(token, company_id)` → headers dict with Authorization + X-Company-Id
- `create_db_company(db, name)` → Company record (for service-level tests)

## Docker Stack
```bash
# Build and run
docker compose up -d --build

# Verify
curl http://localhost:8080/api/health
curl http://localhost:8080/api/docs
```

## Frontend Build
```bash
cd frontend
npm run build     # TypeScript + Vite production build
npm run dev       # Dev server with API proxy
```

## Verification
- **Web UI:** `http://localhost:8080`
- **API Docs:** `http://localhost:8080/api/docs`
- **Health:** `http://localhost:8080/api/health`
