# Zledger Evaluation & Improvement Plan

## Context

The repository is a well-built, production-quality Indian accounting system (Zledger) with strict double-entry bookkeeping, full GST support, multi-tenancy, and a clean layered architecture. The ask is: what areas exist for UI, code, and workflow improvement, and how much impact would each have?

This plan documents the honest assessment and prioritized recommendations — no code changes, no file modifications. The implementation has been partially executed: report component consolidation (6 reports refactored) and float→Decimal schema fix are complete and verified.

## Progress

### Completed
1. **Report component consolidation** — Added `ReportHeader` and `ReportActions` to `shared.tsx`, refactored 6 report components to use them (TrialBalance, P&L, BalanceSheet, CashFlow, Outstanding, Register)
2. **Decimal schema fix** — Changed all `float` fields to `Decimal` in `backend/app/schemas/voucher.py` (both VoucherLineIn and VoucherLineOut)
3. **Backend tests** — 299 passed
4. **Frontend build** — Clean (0 TypeScript errors)

### Remaining
1. Mobile sidebar responsiveness
2. Dark mode gaps
3. Model surface fragmentation
4. Monolithic model/service files
5. Pre-commit hooks
6. Migration integrity CI check
7. Parallel pytest execution