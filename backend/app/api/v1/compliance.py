"""Compliance endpoints: Ind-AS / Schedule III, Income Tax (old & new regime),
ICAI NCE statements, GST status."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user, require_company_role, require_role
from app.models.user import Company, User
from app.models.accounting import FinancialYear
from app.services import export as export_svc
from app.schemas.compliance import (
    ComplianceReportOut,
    DeferredTaxResponse,
    GratuityResponse,
    GstStatusResponse,
    IcaiNceResponse,
    IncomeTaxResponse,
    IndASPLResponse,
    RegimeElection,
    ScheduleIIIResponse,
)
from app.schemas.member import CompanyRole
from app.services import compliance as svc

router = APIRouter()


@router.get("/schedule-iii/balance-sheet", response_model=ScheduleIIIResponse)
def schedule_iii_balance_sheet(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    data = svc.get_schedule_iii_balance_sheet(db, company.id, financial_year_id)
    return ScheduleIIIResponse(**data)


@router.get("/indas/profit-loss", response_model=IndASPLResponse)
def indas_profit_loss(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    data = svc.get_indas_profit_loss(db, company.id, financial_year_id)
    return IndASPLResponse(**data)


@router.get("/income-tax/compute", response_model=IncomeTaxResponse)
def income_tax_compute(
    financial_year_id: str,
    regime: str | None = Query(default=None, pattern="^(old|new)$"),
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    result = svc.compute_income_tax(db, company.id, financial_year_id, regime)
    return IncomeTaxResponse(
        regime=result.regime,
        financial_year=result.financial_year,
        gross_receipts=str(result.gross_receipts),
        business_profit=str(result.business_profit),
        presumptive_section=result.presumptive_section,
        taxable_income=str(result.taxable_income),
        tax=str(result.tax),
        surcharge=str(result.surcharge),
        cess=str(result.cess),
        total_tax=str(result.total_tax),
        rebate_87a=str(result.rebate_87a),
        notes=result.notes,
    )


@router.post("/income-tax/regime", response_model=dict)
def set_regime(
    payload: RegimeElection,
    company: Company = Depends(require_company_role("owner", "admin")),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    obj = svc.set_income_tax_regime(
        db, company.id, payload.regime, payload.financial_year, payload.presumptive_section,
        payload.vehicle_count, payload.months_used,
    )
    return {"id": obj.id, "regime": obj.regime, "financial_year": obj.financial_year}


@router.get("/icai-nce", response_model=IcaiNceResponse)
def icai_nce(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    data = svc.get_icais_nce_statements(db, company.id, financial_year_id)
    return IcaiNceResponse(**data)


@router.get("/gst-status", response_model=GstStatusResponse)
def gst_status(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    data = svc.get_gst_compliance_status(db, company.id, financial_year_id)
    return GstStatusResponse(**data)


@router.get("/schedule-iii/balance-sheet/pdf")
def schedule_iii_pdf(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    pdf = export_svc.export_schedule_iii_pdf(db, company.id, financial_year_id)
    return StreamingResponse(iter([pdf]), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="schedule-iii-{fy.name}.pdf"'})


@router.get("/schedule-iii/balance-sheet/xlsx")
def schedule_iii_xlsx(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    xlsx = export_svc.export_schedule_iii_xlsx(db, company.id, financial_year_id)
    return StreamingResponse(iter([xlsx]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="schedule-iii-{fy.name}.xlsx"'})


@router.get("/income-tax/pdf")
def income_tax_pdf(
    financial_year_id: str,
    regime: str | None = Query(default=None, pattern="^(old|new)$"),
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    pdf = export_svc.export_income_tax_pdf(db, company.id, financial_year_id, regime)
    return StreamingResponse(iter([pdf]), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="income-tax-{fy.name}.pdf"'})


@router.get("/income-tax/xlsx")
def income_tax_xlsx(
    financial_year_id: str,
    regime: str | None = Query(default=None, pattern="^(old|new)$"),
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    xlsx = export_svc.export_income_tax_xlsx(db, company.id, financial_year_id, regime)
    return StreamingResponse(iter([xlsx]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="income-tax-{fy.name}.xlsx"'})


@router.get("/icai-nce/pdf")
def icai_nce_pdf(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    pdf = export_svc.export_icais_nce_pdf(db, company.id, financial_year_id)
    return StreamingResponse(iter([pdf]), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="icai-nce-{fy.name}.pdf"'})


@router.get("/icai-nce/xlsx")
def icai_nce_xlsx(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, financial_year_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")
    xlsx = export_svc.export_icais_nce_xlsx(db, company.id, financial_year_id)
    return StreamingResponse(iter([xlsx]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="icai-nce-{fy.name}.xlsx"'})


@router.get("/reports", response_model=list[ComplianceReportOut])
def list_reports(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    from app.models.compliance import ComplianceReport
    rows = db.query(ComplianceReport).filter(ComplianceReport.company_id == company.id).all()
    return [
        ComplianceReportOut(
            id=r.id, company_id=r.company_id, report_type=r.report_type,
            regime=r.regime, financial_year=r.financial_year, format=r.format,
        )
        for r in rows
    ]

@router.get("/deferred-tax", response_model=DeferredTaxResponse)
def deferred_tax(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Compute deferred tax assets and liabilities (Ind AS 12)."""
    result = svc.compute_deferred_tax(db, company.id, financial_year_id)
    return DeferredTaxResponse(
        deferred_tax_asset=str(result.deferred_tax_asset),
        deferred_tax_liability=str(result.deferred_tax_liability),
        net_dta=str(result.net_dta),
        net_dtl=str(result.net_dtl),
        timing_differences=[
            {
                "description": d["description"],
                "accounting_amount": d["accounting_amount"],
                "tax_amount": d["tax_amount"],
                "difference": d["difference"],
                "type": d["type"],
            }
            for d in result.timing_differences
        ],
        notes=result.notes,
    )


@router.get("/gratuity", response_model=GratuityResponse)
def gratuity(
    financial_year_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Compute gratuity provision (Ind AS 19 simplified PUCM)."""
    result = svc.compute_gratuity_provision(db, company.id, financial_year_id)
    return GratuityResponse(
        present_value_obligation=str(result.present_value_obligation),
        current_service_cost=str(result.current_service_cost),
        interest_cost=str(result.interest_cost),
        actuarial_gain_loss=str(result.actuarial_gain_loss),
        provision_opening=str(result.provision_opening),
        provision_closing=str(result.provision_closing),
        expense_recognized=str(result.expense_recognized),
        assumptions=result.assumptions,
        notes=result.notes,
    )
