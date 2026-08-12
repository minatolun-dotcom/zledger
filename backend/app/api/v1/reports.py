"""Report endpoints: Trial Balance, Profit & Loss, Balance Sheet."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, require_role
from app.models.accounting import FinancialYear
from app.models.user import Company
from app.schemas.member import CompanyRole
from app.schemas.report import (
    AgingResponse,
    BalanceSheetResponse,
    CashFlowResponse,
    LedgerTransactionResponse,
    OutstandingResponse,
    ProfitAndLossResponse,
    RegisterResponse,
    ReportGroup,
    ReportLedgerLine,
    StockAgeingResponse,
    StockAgeingLine,
    StockMovementResponse,
    StockMovementLine,
    StockSummaryResponse,
    StockSummaryLine,
    TdsTcsPartyLine,
    TdsTcsSummaryResponse,
    TrialBalanceLine,
    TrialBalanceResponse,
)
from app.services.reports import (
    get_aging,
    get_balance_sheet,
    get_cash_flow,
    get_cost_centre_pl,
    get_ledger_balances,
    get_ledger_transactions,
    get_outstanding,
    get_profit_and_loss,
    get_register,
    get_round_off_total,
    get_trial_balance,
    calculate_financial_ratios,
)
from app.services.export import (
    export_aging_pdf,
    export_aging_xlsx,
    export_balance_sheet_pdf,
    export_balance_sheet_xlsx,
    export_cash_flow_pdf,
    export_cash_flow_xlsx,
    export_ledger_transactions_pdf,
    export_ledger_transactions_xlsx,
    export_outstanding_pdf,
    export_outstanding_xlsx,
    export_profit_loss_pdf,
    export_profit_loss_xlsx,
    export_register_pdf,
    export_register_xlsx,
    export_stock_ageing_pdf,
    export_stock_ageing_xlsx,
    export_stock_movement_pdf,
    export_stock_movement_xlsx,
    export_stock_summary_pdf,
    export_stock_summary_xlsx,
    export_tds_tcs_summary_pdf,
    export_tds_tcs_summary_xlsx,
    export_trial_balance_pdf,
    export_trial_balance_xlsx,
)
from app.services.tds_tcs import get_tds_tcs_party_summary
from app.services.stock_valuation import (
    get_stock_ageing_report,
    get_stock_movement_summary,
    get_stock_valuation_report,
)

router = APIRouter()


def _lines_to_response(ledgers, fy: FinancialYear) -> dict:
    """Convert LedgerBalance dataclass list to response-friendly dicts."""
    lines = []
    total_debit = 0
    total_credit = 0
    for lb in ledgers:
        lines.append(TrialBalanceLine(
            ledger_id=lb.ledger_id,
            ledger_name=lb.ledger_name,
            group_name=lb.group_name,
            group_nature=lb.group_nature,
            opening_balance=float(lb.opening_balance),
            opening_balance_type=lb.opening_balance_type,
            total_debit=float(lb.total_debit),
            total_credit=float(lb.total_credit),
            closing_balance=float(lb.closing_balance),
            closing_balance_type=lb.closing_balance_type,
        ))
        total_debit += float(lb.total_debit)
        total_credit += float(lb.total_credit)
    return {
        "financial_year_id": fy.id,
        "financial_year_name": fy.name,
        "start_date": fy.start_date,
        "end_date": fy.end_date,
        "lines": lines,
        "total_debit": total_debit,
        "total_credit": total_credit,
    }


def _groups_to_schema(groups) -> list[ReportGroup]:
    """Convert ReportGroup dataclass list to Pydantic schema list."""
    result = []
    for g in groups:
        ledgers = []
        for lb in g.ledgers:
            ledgers.append(ReportLedgerLine(
                ledger_id=lb.ledger_id,
                ledger_name=lb.ledger_name,
                opening_balance=float(lb.opening_balance),
                opening_balance_type=lb.opening_balance_type,
                total_debit=float(lb.total_debit),
                total_credit=float(lb.total_credit),
                closing_balance=float(lb.closing_balance),
                closing_balance_type=lb.closing_balance_type,
            ))
        result.append(ReportGroup(
            group_name=g.group_name,
            group_nature=g.group_nature,
            ledgers=ledgers,
            total=float(g.total),
        ))
    return result


# ─── Trial Balance ──────────────────────────────────────────────────────────


@router.get("/trial-balance", response_model=TrialBalanceResponse)
def trial_balance(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Trial Balance for a financial year."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    ledgers = get_trial_balance(db, company.id, financial_year_id)
    data = _lines_to_response(ledgers, fy)
    ro_total = get_round_off_total(db, company.id, fy.start_date, fy.end_date)
    data["round_off_total"] = float(ro_total)
    data["round_off_type"] = "Dr" if ro_total < 0 else "Cr"
    return TrialBalanceResponse(**data)


# ─── Profit & Loss ──────────────────────────────────────────────────────────


@router.get("/profit-and-loss", response_model=ProfitAndLossResponse)
def profit_and_loss(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Profit & Loss statement for a financial year."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    result = get_profit_and_loss(db, company.id, financial_year_id)
    # Also get balance sheet for ratio calculation
    bs = get_balance_sheet(db, company.id, financial_year_id)
    ratios = calculate_financial_ratios(pl=result, bs=bs)
    ro_total = get_round_off_total(db, company.id, fy.start_date, fy.end_date)
    return ProfitAndLossResponse(
        financial_year_id=fy.id,
        financial_year_name=fy.name,
        start_date=fy.start_date,
        end_date=fy.end_date,
        income_groups=_groups_to_schema(result["income_groups"]),
        expense_groups=_groups_to_schema(result["expense_groups"]),
        total_income=float(result["total_income"]),
        total_expenses=float(result["total_expenses"]),
        net_profit=float(result["net_profit"]),
        is_profit=result["is_profit"],
        financial_ratios=ratios,
        round_off_total=float(ro_total),
        round_off_type="Dr" if ro_total < 0 else "Cr",
    )


# ─── Balance Sheet ──────────────────────────────────────────────────────────


@router.get("/balance-sheet", response_model=BalanceSheetResponse)
def balance_sheet(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Balance Sheet for a financial year."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    result = get_balance_sheet(db, company.id, financial_year_id)
    # Also get P&L for ratio calculation
    pl = get_profit_and_loss(db, company.id, financial_year_id)
    ratios = calculate_financial_ratios(pl=pl, bs=result)
    ro_total = get_round_off_total(db, company.id, fy.start_date, fy.end_date)
    return BalanceSheetResponse(
        financial_year_id=fy.id,
        financial_year_name=fy.name,
        start_date=fy.start_date,
        end_date=fy.end_date,
        asset_groups=_groups_to_schema(result["asset_groups"]),
        liability_groups=_groups_to_schema(result["liability_groups"]),
        capital_groups=_groups_to_schema(result["capital_groups"]),
        total_assets=float(result["total_assets"]),
        total_liabilities=float(result["total_liabilities"]),
        total_capital=float(result["total_capital"]),
        total_liabilities_and_capital=float(result["total_liabilities_and_capital"]),
        financial_ratios=ratios,
        round_off_total=float(ro_total),
        round_off_type="Dr" if ro_total < 0 else "Cr",
    )


# ─── Export: Trial Balance ───────────────────────────────────────────────────


@router.get("/trial-balance/pdf")
def trial_balance_pdf(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Download Trial Balance as PDF."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    pdf_bytes = export_trial_balance_pdf(db, company.id, financial_year_id)
    filename = f"trial-balance-{fy.name}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/trial-balance/xlsx")
def trial_balance_xlsx(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Download Trial Balance as Excel."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    xlsx_bytes = export_trial_balance_xlsx(db, company.id, financial_year_id)
    filename = f"trial-balance-{fy.name}.xlsx"
    return StreamingResponse(
        iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Export: Profit & Loss ───────────────────────────────────────────────────


@router.get("/profit-and-loss/pdf")
def profit_and_loss_pdf(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Download Profit & Loss as PDF."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    pdf_bytes = export_profit_loss_pdf(db, company.id, financial_year_id)
    filename = f"profit-and-loss-{fy.name}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/profit-and-loss/xlsx")
def profit_and_loss_xlsx(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Download Profit & Loss as Excel."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    xlsx_bytes = export_profit_loss_xlsx(db, company.id, financial_year_id)
    filename = f"profit-and-loss-{fy.name}.xlsx"
    return StreamingResponse(
        iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Export: Balance Sheet ───────────────────────────────────────────────────


@router.get("/balance-sheet/pdf")
def balance_sheet_pdf(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Download Balance Sheet as PDF."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    pdf_bytes = export_balance_sheet_pdf(db, company.id, financial_year_id)
    filename = f"balance-sheet-{fy.name}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/balance-sheet/xlsx")
def balance_sheet_xlsx(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Download Balance Sheet as Excel."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    xlsx_bytes = export_balance_sheet_xlsx(db, company.id, financial_year_id)
    filename = f"balance-sheet-{fy.name}.xlsx"
    return StreamingResponse(
        iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Phase 26: Ledger Transactions (Drill-down) ────────────────────────────


@router.get("/ledger-transactions", response_model=LedgerTransactionResponse)
def ledger_transactions(
    ledger_id: str,
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    voucher_type: str | None = Query(None),
    party_id: str | None = Query(None),
    status: str | None = Query(None),
    min_amount: float | None = Query(None),
    max_amount: float | None = Query(None),
):
    """Get all transactions for a single ledger within a financial year."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    
    # Build filters dict for service layer
    filters = {}
    if voucher_type:
        filters["voucher_type"] = voucher_type
    if party_id:
        filters["party_id"] = party_id
    if status:
        filters["status"] = status
    if min_amount is not None:
        filters["min_amount"] = min_amount
    if max_amount is not None:
        filters["max_amount"] = max_amount
    
    result = get_ledger_transactions(db, company.id, ledger_id, fy.start_date, fy.end_date, **filters)
    return LedgerTransactionResponse(**result)
    # REMOVED DUPLICATE RETURN


# ─── Cost Centre P&L ──────────────────────────────────────────────────────


@router.get("/cost-centre-pl")
def cost_centre_pl(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """P&L breakdown by cost centre."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    results = get_cost_centre_pl(db, company.id, financial_year_id)
    return [
        {
            "cost_centre_id": r.cost_centre_id,
            "cost_centre_name": r.cost_centre_name,
            "net_result": r.net_result,
        }
        for r in results
    ]


# ─── Phase 20 Reports ──────────────────────────────────────────────────────


@router.get("/cash-flow", response_model=CashFlowResponse)
def cash_flow(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Cash Flow Statement for a financial year."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    result = get_cash_flow(db, company.id, fy.start_date, fy.end_date)
    return CashFlowResponse(
        financial_year_id=fy.id,
        financial_year_name=fy.name,
        start_date=fy.start_date,
        end_date=fy.end_date,
        opening_balance=result["opening_balance"],
        closing_balance=result["closing_balance"],
        net_increase=result["net_increase"],
        operating=result["operating"],
        investing=result["investing"],
        financing=result["financing"],
    )


@router.get("/aging", response_model=AgingResponse)
def aging(
    financial_year_id: str,
    type: str = "receivable",
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Aging analysis for receivables or payables."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    result = get_aging(db, company.id, fy.start_date, fy.end_date, aging_type=type)
    return AgingResponse(
        financial_year_id=fy.id,
        financial_year_name=fy.name,
        start_date=fy.start_date,
        end_date=fy.end_date,
        type=result["type"],
        lines=result["lines"],
        total=result["total"],
    )


@router.get("/outstanding", response_model=OutstandingResponse)
def outstanding(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Outstanding report: list of debtors and creditors with balances."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    result = get_outstanding(db, company.id, fy.start_date, fy.end_date)
    return OutstandingResponse(
        financial_year_id=fy.id,
        financial_year_name=fy.name,
        start_date=fy.start_date,
        end_date=fy.end_date,
        debtors=result["debtors"],
        creditors=result["creditors"],
        total_debtors=result["total_debtors"],
        total_creditors=result["total_creditors"],
    )


@router.get("/register", response_model=RegisterResponse)
def register(
    financial_year_id: str,
    voucher_type: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Register report: daybook filtered by voucher type."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    result = get_register(db, company.id, fy.start_date, fy.end_date, voucher_type=voucher_type)
    return RegisterResponse(
        financial_year_id=fy.id,
        financial_year_name=fy.name,
        start_date=fy.start_date,
        end_date=fy.end_date,
        voucher_type=result["voucher_type"],
        entries=result["entries"],
        total_debit=result["total_debit"],
        total_credit=result["total_credit"],
    )


# ─── Phase 21: TDS/TCS Summary Report ────────────────────────────────────────


@router.get("/tds-tcs-summary", response_model=TdsTcsSummaryResponse)
def tds_tcs_summary(
    financial_year_id: str,
    tds_tcs_type: str = "tds",
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """TDS/TCS party-wise summary for a financial year."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    result = get_tds_tcs_party_summary(
        db,
        company_id=company.id,
        start_date=fy.start_date,
        end_date=fy.end_date,
        tds_tcs_type=tds_tcs_type,
    )
    return TdsTcsSummaryResponse(
        financial_year_id=fy.id,
        financial_year_name=fy.name,
        start_date=fy.start_date,
        end_date=fy.end_date,
        tds_tcs_type=tds_tcs_type,
        party_lines=[TdsTcsPartyLine(**vars(l)) for l in result["party_lines"]],
        total_entries=result["total_entries"],
        total_base_amount=result["total_base_amount"],
        total_tax_amount=result["total_tax_amount"],
        pending_count=result["pending_count"],
        deposited_count=result["deposited_count"],
        filed_count=result["filed_count"],
    )


# ─── Phase 21: Inventory Reports ─────────────────────────────────────────────


@router.get("/stock-summary", response_model=StockSummaryResponse)
def stock_summary(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Stock summary: current balance per item with valuation."""
    results = get_stock_valuation_report(db, company.id)
    total_qty = sum(r.quantity for r in results)
    total_val = sum(r.total_value for r in results)
    return StockSummaryResponse(
        lines=[StockSummaryLine(
            stock_item_id=r.stock_item_id,
            stock_item_name=r.stock_item_name,
            quantity=r.quantity,
            avg_rate=r.avg_rate,
            total_value=r.total_value,
            valuation_method=r.valuation_method,
        ) for r in results],
        total_quantity=total_qty,
        total_value=total_val,
    )


@router.get("/stock-movement", response_model=StockMovementResponse)
def stock_movement(
    stock_item_id: str | None = None,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Stock movement summary: opening/inward/outward/closing per item."""
    results = get_stock_movement_summary(db, company.id, stock_item_id=stock_item_id)
    return StockMovementResponse(
        lines=[StockMovementLine(
            stock_item_id=r["stock_item_id"],
            stock_item_name=r["stock_item_name"],
            opening_qty=r["opening_qty"],
            opening_value=r["opening_value"],
            inward_qty=r["inward_qty"],
            inward_value=r["inward_value"],
            outward_qty=r["outward_qty"],
            outward_value=r["outward_value"],
            closing_qty=r["closing_qty"],
            closing_value=r["closing_value"],
        ) for r in results]
    )


@router.get("/stock-ageing", response_model=StockAgeingResponse)
def stock_ageing(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Stock ageing report: how long items have been in stock."""
    results = get_stock_ageing_report(db, company.id)
    total_qty = sum(r["quantity"] for r in results)
    total_val = sum(r["total_value"] for r in results)
    return StockAgeingResponse(
        lines=[StockAgeingLine(
            stock_item_id=r["stock_item_id"],
            stock_item_name=r["stock_item_name"],
            quantity=r["quantity"],
            avg_rate=r["avg_rate"],
            total_value=r["total_value"],
            last_entry_date=r["last_entry_date"],
            days_since_entry=r["days_since_entry"],
            ageing_bucket=r["ageing_bucket"],
        ) for r in results],
        total_quantity=total_qty,
        total_value=total_val,
    )


# ─── Export: Cash Flow ───────────────────────────────────────────────────────


@router.get("/cash-flow/pdf")
def cash_flow_pdf(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    pdf_bytes = export_cash_flow_pdf(db, company.id, financial_year_id)
    filename = f"cash-flow-{fy.name}.pdf"
    return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/cash-flow/xlsx")
def cash_flow_xlsx(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    xlsx_bytes = export_cash_flow_xlsx(db, company.id, financial_year_id)
    filename = f"cash-flow-{fy.name}.xlsx"
    return StreamingResponse(iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ─── Export: Aging ───────────────────────────────────────────────────────────


@router.get("/aging/pdf")
def aging_pdf(
    financial_year_id: str,
    type: str = "receivable",
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    pdf_bytes = export_aging_pdf(db, company.id, financial_year_id, aging_type=type)
    label = "receivables" if type == "receivable" else "payables"
    filename = f"aging-{label}-{fy.name}.pdf"
    return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/aging/xlsx")
def aging_xlsx(
    financial_year_id: str,
    type: str = "receivable",
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    xlsx_bytes = export_aging_xlsx(db, company.id, financial_year_id, aging_type=type)
    label = "receivables" if type == "receivable" else "payables"
    filename = f"aging-{label}-{fy.name}.xlsx"
    return StreamingResponse(iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ─── Export: Outstanding ─────────────────────────────────────────────────────


@router.get("/outstanding/pdf")
def outstanding_pdf(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    pdf_bytes = export_outstanding_pdf(db, company.id, financial_year_id)
    filename = f"outstanding-{fy.name}.pdf"
    return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/outstanding/xlsx")
def outstanding_xlsx(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    xlsx_bytes = export_outstanding_xlsx(db, company.id, financial_year_id)
    filename = f"outstanding-{fy.name}.xlsx"
    return StreamingResponse(iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ─── Export: Register ────────────────────────────────────────────────────────


@router.get("/register/pdf")
def register_pdf(
    financial_year_id: str,
    voucher_type: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    pdf_bytes = export_register_pdf(db, company.id, financial_year_id, voucher_type)
    filename = f"register-{voucher_type}-{fy.name}.pdf"
    return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/register/xlsx")
def register_xlsx(
    financial_year_id: str,
    voucher_type: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    xlsx_bytes = export_register_xlsx(db, company.id, financial_year_id, voucher_type)
    filename = f"register-{voucher_type}-{fy.name}.xlsx"
    return StreamingResponse(iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ─── Export: TDS/TCS Summary ────────────────────────────────────────────────


@router.get("/tds-tcs-summary/pdf")
def tds_tcs_summary_pdf(
    financial_year_id: str,
    tds_tcs_type: str = "tds",
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    pdf_bytes = export_tds_tcs_summary_pdf(db, company.id, financial_year_id, tds_tcs_type=tds_tcs_type)
    label = tds_tcs_type.upper()
    filename = f"{label}-summary-{fy.name}.pdf"
    return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/tds-tcs-summary/xlsx")
def tds_tcs_summary_xlsx(
    financial_year_id: str,
    tds_tcs_type: str = "tds",
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    xlsx_bytes = export_tds_tcs_summary_xlsx(db, company.id, financial_year_id, tds_tcs_type=tds_tcs_type)
    label = tds_tcs_type.upper()
    filename = f"{label}-summary-{fy.name}.xlsx"
    return StreamingResponse(iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ─── Export: Stock Summary ───────────────────────────────────────────────────


@router.get("/stock-summary/pdf")
def stock_summary_pdf(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    pdf_bytes = export_stock_summary_pdf(db, company.id)
    return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="stock-summary.pdf"'})


@router.get("/stock-summary/xlsx")
def stock_summary_xlsx(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    xlsx_bytes = export_stock_summary_xlsx(db, company.id)
    return StreamingResponse(iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="stock-summary.xlsx"'})


# ─── Export: Stock Movement ──────────────────────────────────────────────────


@router.get("/stock-movement/pdf")
def stock_movement_pdf(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    pdf_bytes = export_stock_movement_pdf(db, company.id)
    return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="stock-movement.pdf"'})


@router.get("/stock-movement/xlsx")
def stock_movement_xlsx(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    xlsx_bytes = export_stock_movement_xlsx(db, company.id)
    return StreamingResponse(iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="stock-movement.xlsx"'})


# ─── Export: Stock Ageing ────────────────────────────────────────────────────


@router.get("/stock-ageing/pdf")
def stock_ageing_pdf(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    pdf_bytes = export_stock_ageing_pdf(db, company.id)
    return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="stock-ageing.pdf"'})


@router.get("/stock-ageing/xlsx")
def stock_ageing_xlsx(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    xlsx_bytes = export_stock_ageing_xlsx(db, company.id)
    return StreamingResponse(iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="stock-ageing.xlsx"'})


# ─── Export: Ledger Transactions ─────────────────────────────────────────────


@router.get("/ledger-transactions/pdf")
def ledger_transactions_pdf(
    ledger_id: str,
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    pdf_bytes = export_ledger_transactions_pdf(db, company.id, ledger_id, financial_year_id)
    filename = f"ledger-{ledger_id[:8]}-{fy.name}.pdf"
    return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/ledger-transactions/xlsx")
def ledger_transactions_xlsx(
    ledger_id: str,
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    xlsx_bytes = export_ledger_transactions_xlsx(db, company.id, ledger_id, financial_year_id)
    filename = f"ledger-{ledger_id[:8]}-{fy.name}.xlsx"
    return StreamingResponse(iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})
