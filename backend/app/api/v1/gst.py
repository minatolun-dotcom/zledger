"""GST endpoints: HSN/SAC master, GST Registration, GST calculations, and Returns."""
from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company
from app.models.accounting import GstRegistration, HsnSac
from app.models.user import Company
from app.schemas.gst import (
    B2BInvoiceOut,
    B2CSInvoiceOut,
    GstCalculationRequest,
    GstCalculationResponse,
    GstRegistrationCreate,
    GstRegistrationOut,
    GstReturnDetail,
    GstReturnGenerateRequest,
    GstReturnOut,
    Gstr1Response,
    Gstr3bResponse,
    HsnSacCreate,
    HsnSacOut,
    HsnSummaryOut,
)
from app.services.gst import calculate_gst

router = APIRouter()


# ─── HSN/SAC ────────────────────────────────────────────────────────────────


@router.get("/hsn-sac", response_model=list[HsnSacOut])
def list_hsn_sac(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """List all HSN/SAC codes for the company."""
    return db.query(HsnSac).filter(HsnSac.company_id == company.id).all()


@router.post("/hsn-sac", response_model=HsnSacOut, status_code=201)
def create_hsn_sac(
    payload: HsnSacCreate,
    company: Company = Depends(get_active_company),
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
    company: Company = Depends(get_active_company),
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
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Delete an HSN/SAC code."""
    hsn_sac = db.get(HsnSac, hsn_sac_id)
    if not hsn_sac or hsn_sac.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="HSN/SAC not found")
    db.delete(hsn_sac)
    db.commit()


# ─── GST Registration ───────────────────────────────────────────────────────


@router.get("/registrations", response_model=list[GstRegistrationOut])
def list_gst_registrations(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """List all GST registrations for the company."""
    return db.query(GstRegistration).filter(GstRegistration.company_id == company.id).all()


@router.post("/registrations", response_model=GstRegistrationOut, status_code=201)
def create_gst_registration(
    payload: GstRegistrationCreate,
    company: Company = Depends(get_active_company),
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
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return reg


@router.get("/registrations/{reg_id}", response_model=GstRegistrationOut)
def get_gst_registration(
    reg_id: str,
    company: Company = Depends(get_active_company),
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
    company: Company = Depends(get_active_company),
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
    db.commit()
    db.refresh(reg)
    return reg


@router.delete("/registrations/{reg_id}", status_code=204)
def delete_gst_registration(
    reg_id: str,
    company: Company = Depends(get_active_company),
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
    company: Company = Depends(get_active_company),
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
    company: Company = Depends(get_active_company),
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
            gstin=reg.gstin if reg else None,
            filed_date=r.filed_date.isoformat() if r.filed_date else None,
            ack_number=r.ack_number,
        ))
    return result


@router.post("/returns/generate", response_model=GstReturnDetail, status_code=201)
def generate_gst_return(
    payload: GstReturnGenerateRequest,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Generate a GSTR-1 or GSTR-3B return for a period."""
    from app.models.accounting import GstReturn
    from app.services.gstr import generate_gstr1, generate_gstr3b

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
        }
        gstin = data.gstin
    else:
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

    ret = GstReturn(
        company_id=company.id,
        gstin_id=payload.gstin_id,
        return_type=payload.return_type,
        period=payload.period,
        status="draft",
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
        gstin=gstin,
        filed_date=ret.filed_date.isoformat() if ret.filed_date else None,
        ack_number=ret.ack_number,
        data_json=ret.data_json,
    )


@router.get("/returns/{return_id}", response_model=GstReturnDetail)
def get_gst_return(
    return_id: str,
    company: Company = Depends(get_active_company),
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
    company: Company = Depends(get_active_company),
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