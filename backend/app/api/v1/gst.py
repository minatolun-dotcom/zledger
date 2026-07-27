"""GST endpoints: HSN/SAC master, GST Registration, GST calculations, and Returns."""
from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, require_role
from app.models.accounting import GstChallan, GstRegistration, HsnSac
from app.models.user import Company
from app.schemas.member import CompanyRole
from app.schemas.gst import (
    B2BInvoiceOut,
    B2CSInvoiceOut,
    GstCalculationRequest,
    GstCalculationResponse,
    GstChallanApplyRequest,
    GstChallanCreate,
    GstChallanOut,
    GstChallanUpdate,
    GstRegistrationCreate,
    GstRegistrationOut,
    GstReturnDetail,
    GstReturnGenerateRequest,
    GstReturnOut,
    Gstr1Response,
    Gstr2bReconciliationRequest,
    Gstr2bReconciliationResponse,
    Gstr3bResponse,
    HsnSacCreate,
    HsnSacOut,
    HsnSummaryOut,
    ITCReversalRequest,
    ITCReversalResponse,
)
from app.schemas.common import BulkActionResult, BulkDeleteRequest
from app.services.gst import calculate_gst

router = APIRouter()


def _compute_gst_due_date(return_type: str, period: str) -> str:
    """Compute GST return filing due date based on return type and period.

    Indian GST filing deadlines:
    - GSTR-1: 11th of the following month
    - GSTR-3B: 20th of the following month
    - GSTR-4: 13th of month following quarter end
    - GSTR-9/9C: 31st December of the following FY
    """
    from datetime import date
    year, month = int(period[:4]), int(period[5:7])

    if return_type in ("gstr1", "gstr3b"):
        # Due date is 11th/20th of following month
        next_month = month + 1
        next_year = year
        if next_month > 12:
            next_month = 1
            next_year += 1
        day = 11 if return_type == "gstr1" else 20
        return date(next_year, next_month, day).isoformat()

    elif return_type == "gstr4":
        # Quarterly: due 13th of month following quarter end
        quarter_end_month = ((month - 1) // 3 + 1) * 3
        next_month = quarter_end_month + 1
        next_year = year
        if next_month > 12:
            next_month = 1
            next_year += 1
        return date(next_year, next_month, 13).isoformat()

    else:
        # GSTR-9/9C: due 31st December of following FY
        return date(year + 1, 12, 31).isoformat()


# ─── HSN/SAC ────────────────────────────────────────────────────────────────


@router.get("/hsn-sac", response_model=list[HsnSacOut])
def list_hsn_sac(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    search: str | None = Query(default=None),
):
    """List all HSN/SAC codes for the company."""
    q = db.query(HsnSac).filter(HsnSac.company_id == company.id)
    if search:
        search_term = f"%{search}%"
        q = q.filter(HsnSac.code.ilike(search_term) | HsnSac.description.ilike(search_term))
    return q.limit(200).all()


@router.post("/hsn-sac", response_model=HsnSacOut, status_code=201)
def create_hsn_sac(
    payload: HsnSacCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Create a new HSN/SAC code."""
    existing = db.query(HsnSac).filter(
        HsnSac.company_id == company.id,
        HsnSac.code == payload.code,
    ).first()
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"HSN/SAC code {payload.code} already exists",
        )

    hsn_sac = HsnSac(
        company_id=company.id,
        code=payload.code,
        description=payload.description,
        gst_rate=payload.gst_rate,
        code_type=payload.code_type,
    )
    db.add(hsn_sac)
    db.commit()
    db.refresh(hsn_sac)
    return hsn_sac


@router.get("/hsn-sac/{hsn_sac_id}", response_model=HsnSacOut)
def get_hsn_sac(
    hsn_sac_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Get a specific HSN/SAC code."""
    hsn_sac = db.get(HsnSac, hsn_sac_id)
    if not hsn_sac or hsn_sac.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="HSN/SAC not found")
    return hsn_sac


@router.delete("/hsn-sac/{hsn_sac_id}", status_code=204)
def delete_hsn_sac(
    hsn_sac_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Delete an HSN/SAC code."""
    hsn_sac = db.get(HsnSac, hsn_sac_id)
    if not hsn_sac or hsn_sac.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="HSN/SAC not found")
    db.delete(hsn_sac)
    db.commit()


@router.post("/hsn-sac/bulk-delete", response_model=BulkActionResult)
def bulk_delete_hsn_sac(
    payload: BulkDeleteRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Bulk delete HSN/SAC codes."""
    processed = 0
    errors: list[str] = []
    for hid in payload.ids:
        hsn_sac = db.get(HsnSac, hid)
        if not hsn_sac or hsn_sac.company_id != company.id:
            errors.append(f"HSN/SAC {hid} not found")
            continue
        db.delete(hsn_sac)
        processed += 1
    db.commit()
    return BulkActionResult(processed=processed, errors=errors)


# ─── GST Registration ───────────────────────────────────────────────────────


@router.get("/registrations", response_model=list[GstRegistrationOut])
def list_gst_registrations(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    search: str | None = Query(default=None),
):
    """List all GST registrations for the company."""
    q = db.query(GstRegistration).filter(GstRegistration.company_id == company.id)
    if search:
        search_term = f"%{search}%"
        q = q.filter(GstRegistration.gstin.ilike(search_term) | GstRegistration.state_code.ilike(search_term))
    return q.limit(200).all()


@router.post("/registrations", response_model=GstRegistrationOut, status_code=201)
def create_gst_registration(
    payload: GstRegistrationCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Create a new GST registration."""
    existing = db.query(GstRegistration).filter(
        GstRegistration.company_id == company.id,
        GstRegistration.gstin == payload.gstin,
    ).first()
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"GSTIN {payload.gstin} already registered",
        )

    # If marking as primary, unset any existing primary
    if payload.is_primary:
        db.query(GstRegistration).filter(
            GstRegistration.company_id == company.id,
            GstRegistration.is_primary.is_(True),
        ).update({"is_primary": False})

    reg = GstRegistration(
        company_id=company.id,
        gstin=payload.gstin,
        legal_name=payload.legal_name,
        trade_name=payload.trade_name,
        state_code=payload.state_code,
        pan=payload.pan,
        address=payload.address,
        is_primary=payload.is_primary,
        registration_type=payload.registration_type,
        composition_rate=payload.composition_rate,
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return reg


@router.get("/registrations/{reg_id}", response_model=GstRegistrationOut)
def get_gst_registration(
    reg_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Get a specific GST registration."""
    reg = db.get(GstRegistration, reg_id)
    if not reg or reg.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="GST registration not found")
    return reg


@router.patch("/registrations/{reg_id}", response_model=GstRegistrationOut)
def update_gst_registration(
    reg_id: str,
    payload: GstRegistrationCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Update a GST registration."""
    reg = db.get(GstRegistration, reg_id)
    if not reg or reg.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="GST registration not found")

    # Check GSTIN uniqueness if changing
    if payload.gstin != reg.gstin:
        clash = db.query(GstRegistration).filter(
            GstRegistration.company_id == company.id,
            GstRegistration.gstin == payload.gstin,
        ).first()
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="GSTIN already registered")

    # If marking as primary, unset any existing primary
    if payload.is_primary and not reg.is_primary:
        db.query(GstRegistration).filter(
            GstRegistration.company_id == company.id,
            GstRegistration.is_primary.is_(True),
        ).update({"is_primary": False})

    reg.gstin = payload.gstin
    reg.legal_name = payload.legal_name
    reg.trade_name = payload.trade_name
    reg.state_code = payload.state_code
    reg.pan = payload.pan
    reg.address = payload.address
    reg.is_primary = payload.is_primary
    reg.registration_type = payload.registration_type
    reg.composition_rate = payload.composition_rate
    db.commit()
    db.refresh(reg)
    return reg


@router.delete("/registrations/{reg_id}", status_code=204)
def delete_gst_registration(
    reg_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Delete a GST registration."""
    reg = db.get(GstRegistration, reg_id)
    if not reg or reg.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="GST registration not found")
    db.delete(reg)
    db.commit()


# ─── GST Calculation ────────────────────────────────────────────────────────


@router.post("/calculate-gst", response_model=GstCalculationResponse)
def calculate_gst_endpoint(
    payload: GstCalculationRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Calculate GST for a given amount and HSN/SAC code."""
    try:
        result = calculate_gst(
            db=db,
            company_id=company.id,
            amount=Decimal(str(payload.amount)),
            hsn_sac_id=payload.hsn_sac_id,
            is_inter_state=payload.is_inter_state,
            is_reverse_charge=payload.is_reverse_charge,
        )

        # Determine ledger names based on RCM and transaction type
        if result.is_reverse_charge:
            cgst_ledger_name = "RCM CGST Input" if not result.is_inter_state else None
            sgst_ledger_name = "RCM SGST Input" if not result.is_inter_state else None
            igst_ledger_name = "RCM IGST Input" if result.is_inter_state else None
        else:
            # For sales, use Output ledgers; for purchases, use Input ledgers
            # The caller determines this based on voucher type
            cgst_ledger_name = "CGST Output" if not result.is_inter_state else None
            sgst_ledger_name = "SGST Output" if not result.is_inter_state else None
            igst_ledger_name = "IGST Output" if result.is_inter_state else None

        return GstCalculationResponse(
            taxable_amount=float(result.taxable_amount),
            cgst_rate=float(result.cgst_rate),
            cgst_amount=float(result.cgst_amount),
            sgst_rate=float(result.sgst_rate),
            sgst_amount=float(result.sgst_amount),
            igst_rate=float(result.igst_rate),
            igst_amount=float(result.igst_amount),
            total_tax=float(result.total_tax),
            total_amount=float(result.total_amount),
            hsn_sac_code=result.hsn_sac_code,
            gst_rate=float(result.gst_rate),
            is_reverse_charge=result.is_reverse_charge,
            cgst_ledger_name=cgst_ledger_name,
            sgst_ledger_name=sgst_ledger_name,
            igst_ledger_name=igst_ledger_name,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))


# ─── GST Returns ─────────────────────────────────────────────────────────────


@router.get("/returns", response_model=list[GstReturnOut])
def list_gst_returns(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """List all GST returns for the company."""
    from app.models.accounting import GstReturn
    returns = db.query(GstReturn).filter(
        GstReturn.company_id == company.id,
    ).order_by(GstReturn.period.desc()).all()

    result = []
    for r in returns:
        reg = db.get(GstRegistration, r.gstin_id) if r.gstin_id else None
        result.append(GstReturnOut(
            id=r.id,
            return_type=r.return_type,
            period=r.period,
            status=r.status,
            due_date=r.due_date,
            gstin=reg.gstin if reg else None,
            filed_date=r.filed_date.isoformat() if r.filed_date else None,
            ack_number=r.ack_number,
        ))
    return result


@router.post("/returns/generate", response_model=GstReturnDetail, status_code=201)
def generate_gst_return(
    payload: GstReturnGenerateRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Generate a GSTR-1, GSTR-3B, or GSTR-9 return."""
    from app.models.accounting import GstReturn
    from app.services.gstr import generate_gstr1, generate_gstr3b, generate_gstr9

    # Check if return already exists for this period
    existing = db.query(GstReturn).filter(
        GstReturn.company_id == company.id,
        GstReturn.return_type == payload.return_type,
        GstReturn.period == payload.period,
    ).first()
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"Return {payload.return_type} for {payload.period} already exists",
        )

    # Generate data
    if payload.return_type == "gstr1":
        data = generate_gstr1(db, company.id, payload.period, payload.gstin_id)
        data_dict = {
            "b2b": [{"gstin": i.gstin, "place_of_supply": i.place_of_supply,
                      "invoice_number": i.invoice_number, "invoice_date": i.invoice_date,
                      "invoice_value": i.invoice_value, "taxable_value": i.taxable_value,
                      "cgst": i.cgst, "sgst": i.sgst, "igst": i.igst,
                      "reverse_charge": i.reverse_charge} for i in data.b2b],
            "b2cs": [{"place_of_supply": i.place_of_supply, "rate": i.rate,
                       "taxable_value": i.taxable_value, "cgst": i.cgst,
                       "sgst": i.sgst, "igst": i.igst} for i in data.b2cs],
            "hsn": [{"hsn_code": i.hsn_code, "description": i.description,
                      "uom": i.uom, "taxable_value": i.taxable_value,
                      "cgst": i.cgst, "sgst": i.sgst, "igst": i.igst,
                      "total_value": i.total_value} for i in data.hsn],
            "total_b2b_taxable": data.total_b2b_taxable,
            "total_b2cs_taxable": data.total_b2cs_taxable,
            "total_cgst": data.total_cgst,
            "total_sgst": data.total_sgst,
            "total_igst": data.total_igst,
        }
        gstin = data.gstin
    elif payload.return_type == "gstr3b":
        data = generate_gstr3b(db, company.id, payload.period, payload.gstin_id)
        data_dict = {
            "taxable_value": data.taxable_value,
            "cgst_payable": data.cgst_payable,
            "sgst_payable": data.sgst_payable,
            "igst_payable": data.igst_payable,
            "reverse_charge_taxable": data.reverse_charge_taxable,
            "reverse_charge_cgst": data.reverse_charge_cgst,
            "reverse_charge_sgst": data.reverse_charge_sgst,
            "reverse_charge_igst": data.reverse_charge_igst,
            "itc_cgst": data.itc_cgst,
            "itc_sgst": data.itc_sgst,
            "itc_igst": data.itc_igst,
        }
        gstin = data.gstin
    elif payload.return_type == "gstr4":
        from app.services.gstr import generate_gstr4
        data = generate_gstr4(db, company.id, payload.period, payload.gstin_id)
        data_dict = {
            "period": data.period,
            "gstin": data.gstin,
            "legal_name": data.legal_name,
            "trade_name": data.trade_name,
            "outward_turnover": data.outward_turnover,
            "composition_tax_rate": data.composition_tax_rate,
            "composition_tax_payable": data.composition_tax_payable,
            "interest": data.interest,
            "late_fee": data.late_fee,
            "total_payable": data.total_payable,
        }
        gstin = data.gstin
    elif payload.return_type == "gstr9c":
        from app.services.gstr import generate_gstr9c
        data = generate_gstr9c(db, company.id, payload.period, payload.gstin_id)
        data_dict = {
            "financial_year": data.financial_year,
            "gstin": data.gstin,
            "legal_name": data.legal_name,
            "trade_name": data.trade_name,
            "gstr9_generated": data.gstr9_generated,
            "gstr9_return_id": data.gstr9_return_id,
            "table4": [{"label": l.label, "book_value": l.book_value,
                        "return_value": l.return_value, "difference": l.difference} for l in data.table4],
            "table6": [{"label": l.label, "book_value": l.book_value,
                        "return_value": l.return_value, "difference": l.difference} for l in data.table6],
            "table8": [{"label": l.label, "book_value": l.book_value,
                        "return_value": l.return_value, "difference": l.difference} for l in data.table8],
            "total_difference": data.total_difference,
            "has_discrepancy": data.has_discrepancy,
        }
        gstin = data.gstin
    else:
        data = generate_gstr9(db, company.id, payload.period, payload.gstin_id)
        data_dict = {
            "financial_year": data.financial_year,
            "gstin": data.gstin,
            "legal_name": data.legal_name,
            "trade_name": data.trade_name,
            "taxable_outward": data.taxable_outward,
            "nil_rated_outward": data.nil_rated_outward,
            "zero_rated_outward": data.zero_rated_outward,
            "reverse_charge_inward": data.reverse_charge_inward,
            "total_outward_taxable": data.total_outward_taxable,
            "total_outward_cgst": data.total_outward_cgst,
            "total_outward_sgst": data.total_outward_sgst,
            "total_outward_igst": data.total_outward_igst,
            "itc_from_purchases_cgst": data.itc_from_purchases_cgst,
            "itc_from_purchases_sgst": data.itc_from_purchases_sgst,
            "itc_from_purchases_igst": data.itc_from_purchases_igst,
            "itc_from_reverse_charge_cgst": data.itc_from_reverse_charge_cgst,
            "itc_from_reverse_charge_sgst": data.itc_from_reverse_charge_sgst,
            "itc_from_reverse_charge_igst": data.itc_from_reverse_charge_igst,
            "total_itc_cgst": data.total_itc_cgst,
            "total_itc_sgst": data.total_itc_sgst,
            "total_itc_igst": data.total_itc_igst,
            "net_cgst_payable": data.net_cgst_payable,
            "net_sgst_payable": data.net_sgst_payable,
            "net_igst_payable": data.net_igst_payable,
            "total_tax_payable": data.total_tax_payable,
        }
        gstin = data.gstin

    ret = GstReturn(
        company_id=company.id,
        gstin_id=payload.gstin_id,
        return_type=payload.return_type,
        period=payload.period,
        status="draft",
        due_date=_compute_gst_due_date(payload.return_type, payload.period),
        data_json=data_dict,
    )
    db.add(ret)
    db.commit()
    db.refresh(ret)

    return GstReturnDetail(
        id=ret.id,
        return_type=ret.return_type,
        period=ret.period,
        status=ret.status,
        due_date=ret.due_date,
        gstin=gstin,
        filed_date=ret.filed_date.isoformat() if ret.filed_date else None,
        ack_number=ret.ack_number,
        data_json=ret.data_json,
    )


@router.get("/returns/{return_id}", response_model=GstReturnDetail)
def get_gst_return(
    return_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Get a specific GST return with full data."""
    from app.models.accounting import GstReturn
    ret = db.get(GstReturn, return_id)
    if not ret or ret.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="GST return not found")

    reg = db.get(GstRegistration, ret.gstin_id) if ret.gstin_id else None
    return GstReturnDetail(
        id=ret.id,
        return_type=ret.return_type,
        period=ret.period,
        status=ret.status,
        gstin=reg.gstin if reg else None,
        filed_date=ret.filed_date.isoformat() if ret.filed_date else None,
        ack_number=ret.ack_number,
        data_json=ret.data_json,
    )


@router.patch("/returns/{return_id}/submit")
def submit_gst_return(
    return_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Mark a GST return as submitted."""
    from app.models.accounting import GstReturn
    from datetime import date
    ret = db.get(GstReturn, return_id)
    if not ret or ret.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="GST return not found")
    if ret.status != "draft":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Only draft returns can be submitted")
    ret.status = "submitted"
    ret.filed_date = date.today()
    db.commit()
    return {"status": "submitted"}


# ─── GST Challans / Payments ────────────────────────────────────────────────


def _challan_to_dict(challan: GstChallan, db: Session) -> dict:
    """Convert challan ORM object to dict matching GstChallanOut."""
    reg = db.get(GstRegistration, challan.gstin_id) if challan.gstin_id else None
    return {
        "id": challan.id,
        "challan_number": challan.challan_number,
        "challan_date": challan.challan_date.isoformat(),
        "amount": float(challan.amount),
        "cgst_amount": float(challan.cgst_amount),
        "sgst_amount": float(challan.sgst_amount),
        "igst_amount": float(challan.igst_amount),
        "cess_amount": float(challan.cess_amount),
        "interest": float(challan.interest),
        "late_fee": float(challan.late_fee),
        "bank_name": challan.bank_name,
        "payment_mode": challan.payment_mode,
        "gstin_id": challan.gstin_id,
        "gstin": reg.gstin if reg else None,
        "gst_return_id": challan.gst_return_id,
        "status": challan.status,
        "remarks": challan.remarks,
        "created_at": challan.created_at.isoformat() if challan.created_at else None,
        "updated_at": challan.updated_at.isoformat() if challan.updated_at else None,
    }


@router.get("/challans", response_model=list[GstChallanOut])
def list_gst_challans(
    status: str | None = None,
    gst_return_id: str | None = None,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """List GST challans for the company. Optional filters by status or return."""
    q = db.query(GstChallan).filter(GstChallan.company_id == company.id)
    if status:
        q = q.filter(GstChallan.status == status)
    if gst_return_id:
        q = q.filter(GstChallan.gst_return_id == gst_return_id)
    challans = q.order_by(GstChallan.challan_date.desc()).all()
    return [_challan_to_dict(c, db) for c in challans]


@router.post("/challans", response_model=GstChallanOut, status_code=201)
def create_gst_challan(
    payload: GstChallanCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Create a GST challan record."""
    from datetime import date
    challan = GstChallan(
        company_id=company.id,
        gstin_id=payload.gstin_id,
        gst_return_id=payload.gst_return_id,
        challan_number=payload.challan_number,
        challan_date=date.fromisoformat(payload.challan_date),
        amount=payload.amount,
        cgst_amount=payload.cgst_amount,
        sgst_amount=payload.sgst_amount,
        igst_amount=payload.igst_amount,
        cess_amount=payload.cess_amount,
        interest=payload.interest,
        late_fee=payload.late_fee,
        bank_name=payload.bank_name,
        payment_mode=payload.payment_mode,
        status=payload.status,
        remarks=payload.remarks,
    )
    db.add(challan)
    db.commit()
    db.refresh(challan)
    return _challan_to_dict(challan, db)


@router.get("/challans/{challan_id}", response_model=GstChallanOut)
def get_gst_challan(
    challan_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Get a specific GST challan."""
    challan = db.get(GstChallan, challan_id)
    if not challan or challan.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="GST challan not found")
    return _challan_to_dict(challan, db)


@router.patch("/challans/{challan_id}", response_model=GstChallanOut)
def update_gst_challan(
    challan_id: str,
    payload: GstChallanUpdate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Update a GST challan."""
    from datetime import date
    challan = db.get(GstChallan, challan_id)
    if not challan or challan.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="GST challan not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "challan_date" in update_data and update_data["challan_date"] is not None:
        update_data["challan_date"] = date.fromisoformat(update_data["challan_date"])
    for key, value in update_data.items():
        setattr(challan, key, value)
    db.commit()
    db.refresh(challan)
    return _challan_to_dict(challan, db)


@router.delete("/challans/{challan_id}", status_code=204)
def delete_gst_challan(
    challan_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Delete a GST challan."""
    challan = db.get(GstChallan, challan_id)
    if not challan or challan.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="GST challan not found")
    db.delete(challan)
    db.commit()


@router.post("/challans/{challan_id}/apply")
def apply_gst_challan(
    challan_id: str,
    payload: GstChallanApplyRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Mark a challan as applied to a GST return."""
    from app.models.accounting import GstReturn
    challan = db.get(GstChallan, challan_id)
    if not challan or challan.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="GST challan not found")
    ret = db.get(GstReturn, payload.gst_return_id)
    if not ret or ret.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="GST return not found")
    challan.gst_return_id = payload.gst_return_id
    challan.status = "applied"
    db.commit()
    return {"status": "applied", "gst_return_id": payload.gst_return_id}


# ─── ITC Reversal ─────────────────────────────────────────────────────────────


@router.post("/itc-reversal", response_model=ITCReversalResponse)
def itc_reversal(
    payload: ITCReversalRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Calculate ITC reversal per Rule 42 and Rule 43 of CGST Rules."""
    from app.services.gst import calculate_itc_reversal
    try:
        result = calculate_itc_reversal(db, company.id, payload.financial_year_id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    return ITCReversalResponse(
        rule42_itc_cgst=float(result.rule42_itc_cgst),
        rule42_itc_sgst=float(result.rule42_itc_sgst),
        rule42_itc_igst=float(result.rule42_itc_igst),
        rule43_itc_cgst=float(result.rule43_itc_cgst),
        rule43_itc_sgst=float(result.rule43_itc_sgst),
        rule43_itc_igst=float(result.rule43_itc_igst),
        total_itc_cgst=0.0,
        total_itc_sgst=0.0,
        total_itc_igst=0.0,
        total_turnover=0.0,
        exempt_turnover=0.0,
        taxable_turnover=0.0,
        capital_goods_itc=0.0,
    )


# ─── GSTR-2B Reconciliation ───────────────────────────────────────────────────


@router.post("/gstr2b/reconcile", response_model=Gstr2bReconciliationResponse)
def gstr2b_reconcile(
    payload: Gstr2bReconciliationRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Reconcile purchase register against simulated GSTR-2B data."""
    from app.services.gst import generate_gstr2b_lite
    result = generate_gstr2b_lite(db, company.id, payload.period)
    return Gstr2bReconciliationResponse(
        period=result.period,
        gstin=result.gstin,
        total_invoices=result.total_invoices,
        matched=result.matched_invoices,
        mismatched=result.mismatched_invoices,
        missing=result.missing_in_books,
        extra=0,
        total_taxable=float(result.total_taxable_gstr2b),
        total_cgst=float(result.total_cgst_gstr2b),
        total_sgst=float(result.total_sgst_gstr2b),
        total_igst=float(result.total_igst_gstr2b),
        lines=[],
    )