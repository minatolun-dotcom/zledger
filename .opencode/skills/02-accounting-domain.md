# Accounting Domain Expert

## Double-Entry Bookkeeping
Every transaction has equal debits and credits. The accounting equation: `Assets = Liabilities + Equity`.

- **Debit** = Left side (increase assets/expenses, decrease liabilities/income)
- **Credit** = Right side (increase liabilities/income, decrease assets/expenses)
- Every voucher must have `sum(debits) === sum(credits)` within a tolerance of ₹0.01

## Ledger Groups & Natures
| Group Nature | Groups |
|-------------|--------|
| Assets | Bank Accounts, Cash-in-Hand, Sundry Debtors, Fixed Assets, Investments, Stock-in-Hand |
| Liabilities | Sundry Creditors, Loans, Duties & Taxes, Provisions |
| Income | Direct Income, Indirect Income, Sales Accounts |
| Expense | Direct Expenses, Indirect Expenses, Purchase Accounts |
| Equity | Capital Account, Reserves & Surplus |

Account groups have a parent-child hierarchy (e.g., `Bank Accounts` → `HDFC Bank` ledger).

## GST Computation
- **Intra-state**: CGST + SGST (each = rate/2, e.g., 9% + 9% for 18%)
- **Inter-state**: IGST (full rate, e.g., 18%)
- **Composition scheme**: Flat composition tax instead of CGST/SGST/IGST
- **Rounding**: Each GST component rounded to 2 decimals individually (half-up)
- **Inclusive tax**: Taxable value = total / (1 + rate/100)

### GST Ledgers
System ledgers prefixed `SYS_GST_` for output/input tax. E.g., `SYS_GST_OUTPUT_CGST`, `SYS_GST_INPUT_CGST`, `SYS_GST_COMPOSITION_TAX`.

## Voucher Types & Rules
| Type | Debit | Credit | GST? | Stock? |
|------|-------|--------|------|--------|
| Sales | Party/Sundry Debtors | Sales + GST + Items | Output | Yes (outward) |
| Purchase | Purchase + GST + Items | Party/Sundry Creditors | Input | Yes (inward) |
| Payment | Expense/Ledger | Bank/Cash | No | No |
| Receipt | Bank/Cash | Income/Ledger | No | No |
| Contra | Bank/Cash | Bank/Cash | No | No |
| Journal | Any ledger(s) | Any ledger(s) | No | No |
| Credit Note | Sales Returns | Party + GST reversal | Output reversal | Yes (reverse) |
| Debit Note | Party + GST reversal | Purchase Returns | Input reversal | Yes (reverse) |

### Voucher Lifecycle
1. **Create** — Draft state, lines are editable
2. **Post** — Locks the voucher, posts to ledger (append-only)
3. **Cancel** — Creates reversal entry (swaps debit/credit on all lines), deletes stock entries
4. **Duplicate** — Creates a new draft copy with next available number

## Trial Balance, P&L, Balance Sheet
- **Trial Balance**: Sum of all ledger balances (Dr = Cr for balanced books)
- **P&L**: Revenue groups (credit balance) − Expense groups (debit balance)
- **Balance Sheet**: Assets − Liabilities = Equity (closing capital = opening + P&L profit − drawings)

## Inventory Accounting
- **Stock Items**: Tracked with quantity, rate, HSN code, GST rate
- **Stock Valuation**: Weighted average (default) or FIFO
- **Stock Balance**: Running balance table updated on every sales/purchase post
- **Costing**: Items can have multiple units (e.g., Nos, Box, Kg)

## Cost Centres
- Optional allocation on voucher lines for profit/cost centre tracking
- Cost Centre P&L report breaks down income/expense per centre

## TDS/TCS
- TDS/TCS deducted at specified rates per section (e.g., 194A, 194C, 206C)
- Tracking: pending → deposited → filed status
- Party-wise summary report available

## Bank Reconciliation
- Matches bank statement entries with voucher transactions
- Tracks cleared/uncleared status per entry

## Key Rules for AI
- Never create a voucher where total debits ≠ total credits (max ₹0.01 tolerance)
- GST lines must be auto-calculated from taxable value, not user-entered
- System ledgers (prefixed `SYS_`) are auto-created and should not be editable
- Opening balance vouchers are auto-generated when closing a financial year
- Stock entries are created/deleted automatically when sales/purchase vouchers are posted/cancelled
