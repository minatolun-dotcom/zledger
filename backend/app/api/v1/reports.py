"""Report endpoints: Trial Balance, Profit & Loss, Balance Sheet."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company
from app.models.accounting import FinancialYear
from app.models.user import Company
from app.schemas.report import (
    BalanceSheetResponse,
    ProfitAndLossResponse,
    ReportGroup,
    ReportLedgerLine,
    TrialBalanceLine,
    TrialBalanceResponse,
)
from app.services.reports import (
    get_balance_sheet,
    get_cost_centre_pl,
    get_ledger_balances,
    get_profit_and_loss,
    get_trial_balance,
)
from app.services.export import (
    export_balance_sheet_pdf,
    export_balance_sheet_xlsx,
    export_profit_loss_pdf,
    export_profit_loss_xlsx,
    export_trial_balance_pdf,
    export_trial_balance_xlsx,
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
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Trial Balance for a financial year."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    ledgers = get_trial_balance(db, company.id, financial_year_id)
    data = _lines_to_response(ledgers, fy)
    return TrialBalanceResponse(**data)


# ─── Profit & Loss ──────────────────────────────────────────────────────────


@router.get("/profit-and-loss", response_model=ProfitAndLossResponse)
def profit_and_loss(
    financial_year_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Profit & Loss statement for a financial year."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    result = get_profit_and_loss(db, company.id, financial_year_id)
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
    )


# ─── Balance Sheet ──────────────────────────────────────────────────────────


@router.get("/balance-sheet", response_model=BalanceSheetResponse)
def balance_sheet(
    financial_year_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Balance Sheet for a financial year."""
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    result = get_balance_sheet(db, company.id, financial_year_id)
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
    )


# ─── Export: Trial Balance ───────────────────────────────────────────────────


@router.get("/trial-balance/pdf")
def trial_balance_pdf(
    financial_year_id: str,
    company: Company = Depends(get_active_company),
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
    company: Company = Depends(get_active_company),
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
    company: Company = Depends(get_active_company),
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
    company: Company = Depends(get_active_company),
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
    company: Company = Depends(get_active_company),
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
    company: Company = Depends(get_active_company),
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


# ─── Cost Centre P&L ──────────────────────────────────────────────────────


@router.get("/cost-centre-pl")
def cost_centre_pl(
    financial_year_id: str,
    company: Company = Depends(get_active_company),
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
