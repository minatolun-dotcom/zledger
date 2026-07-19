# Compliance Module

Statutory compliance APIs and UI for Indian entities. The module is gated by the
`compliance` module (enabled by default on all companies). Access the UI at
`/compliance` after selecting an active financial year.

All endpoints are under the prefix `/compliance` and require a valid company
session (`X-Company-Id` header). The `income-tax/regime` election additionally
requires `owner` or `admin` company role.

## Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/compliance/schedule-iii/balance-sheet?financial_year_id=` | viewer | Schedule III (divided format) balance sheet |
| GET | `/compliance/indas/profit-loss?financial_year_id=` | viewer | Ind-AS Statement of Profit & Loss |
| GET | `/compliance/income-tax/compute?financial_year_id=&regime=` | viewer | Compute tax under old/new regime |
| POST | `/compliance/income-tax/regime` | owner/admin | Persist a regime election for a FY |
| GET | `/compliance/icai-nce?financial_year_id=` | viewer | ICAI NCE combined statements + notes |
| GET | `/compliance/gst-status?financial_year_id=` | viewer | GSTR-1 / 3B / 9 filing status |
| GET | `/compliance/schedule-iii/balance-sheet/pdf` | viewer | PDF export |
| GET | `/compliance/schedule-iii/balance-sheet/xlsx` | viewer | XLSX export |
| GET | `/compliance/income-tax/pdf?regime=` | viewer | PDF export |
| GET | `/compliance/income-tax/xlsx?regime=` | viewer | XLSX export |
| GET | `/compliance/icai-nce/pdf` | viewer | PDF export |
| GET | `/compliance/icai-nce/xlsx` | viewer | XLSX export |
| GET | `/compliance/reports` | viewer | List saved compliance reports |

`regime` accepts `old` or `new`. When omitted from `compute`, the company's
stored election (or `new` as default) is used.

### Regime election request body
```json
{ "regime": "new", "financial_year": "2026-2027", "presumptive_section": null }
```
`presumptive_section` is optional and must be one of `44AD`, `44ADA`, `44AE`.

## curl examples

```bash
# Schedule III balance sheet (PDF)
curl -H "X-Company-Id: <cid>" -H "Authorization: Bearer <token>" \
  "http://localhost:8000/compliance/schedule-iii/balance-sheet/pdf?financial_year_id=<fy_id>" \
  -o schedule-iii.pdf

# Income tax compute under new regime
curl -H "X-Company-Id: <cid>" -H "Authorization: Bearer <token>" \
  "http://localhost:8000/compliance/income-tax/compute?financial_year_id=<fy_id>&regime=new"

# Elect new regime (owner/admin)
curl -X POST -H "X-Company-Id: <cid>" -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"regime":"new","financial_year":"2026-2027"}' \
  "http://localhost:8000/compliance/income-tax/regime"
```

## Which statement applies to which entity type

The engine derives figures from the company's chart of accounts and vouchers; the
appropriate statement is selected by the company's constitution type:

| Statement | Typical applicability |
|-----------|----------------------|
| Schedule III (Companies Act) Balance Sheet | Companies (Pvt Ltd, Public, OPC, LLP) |
| Ind-AS P&L | Companies following Ind-AS |
| Income Tax computation | All entities (presumptive sections auto-detected for eligible turnover) |
| ICAI NCE statements | Companies / professionals requiring ICAI-format reporting |
| GST status | Entities registered under GST |

## Frontend

`src/pages/CompliancePage.tsx` renders five tabs — **Schedule III BS**, **Ind-AS
P&L**, **Income Tax**, **ICAI NCE**, **GST Status** — with a financial-year
selector (from `useFyStore`). The Income Tax tab lets an owner/admin toggle the
old/new regime, compute the liability, elect the regime, and download PDF/XLSX.
Other tabs expose PDF/XLSX downloads through `api.download` / `downloadFile`.

Deep-link a tab with `?tab=income-tax` etc. (the page strips the query param on
mount).
