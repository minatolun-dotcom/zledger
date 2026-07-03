"""E-Way Bill endpoints: generation, cancellation, vehicle update, status."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user, require_role
from app.models.accounting import GstRegistration
from app.models.eway_bill import EwayBill
from app.models.user import Company, User
from app.models.voucher import Voucher
from app.schemas.member import CompanyRole
from app.schemas.eway_bill import (
    EwayBillCancelRequest,
    EwayBillGenerateRequest,
    EwayBillListOut,
    EwayBillOut,
    EwayBillVehicleUpdateRequest,
)
from app.services.eway_bill_builder import build_eway_bill_payload
from app.services.eway_bill_client import EwayBillError, cancel_eway_bill, generate_eway_bill, update_vehicle

router = APIRouter()


def _require_eway_bill_enabled():
    if not settings.eway_bill_enabled:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="E-Way Bill is not enabled. Set EWAY_BILL_ENABLED=true in environment.",
        )


def _serialize_eway_bill(eb: EwayBill) -> dict:
    return {
        "id": eb.id,
        "voucher_id": eb.voucher_id,
        "gstin_id": eb.gstin_id,
        "eway_bill_number": eb.eway_bill_number,
        "eway_bill_date": eb.eway_bill_date,
        "valid_until": eb.valid_until,
        "irn": eb.irn,
        "supply_type": eb.supply_type,
        "sub_supply_type": eb.sub_supply_type,
        "document_type": eb.document_type,
        "document_number": eb.document_number,
        "document_date": eb.document_date,
        "from_gstin": eb.from_gstin,
        "from_trd_name": eb.from_trd_name,
        "from_state": eb.from_state,
        "to_gstin": eb.to_gstin,
        "to_trd_name": eb.to_trd_name,
        "to_state": eb.to_state,
        "hsn_code": eb.hsn_code,
        "item_description": eb.item_description,
        "quantity": float(eb.quantity) if eb.quantity else None,
        "unit": eb.unit,
        "taxable_amount": float(eb.taxable_amount),
        "cgst_amount": float(eb.cgst_amount),
        "sgst_amount": float(eb.sgst_amount),
        "igst_amount": float(eb.igst_amount),
        "cess_amount": float(eb.cess_amount),
        "total_value": float(eb.total_value),
        "transport_mode": eb.transport_mode,
        "transporter_id": eb.transporter_id,
        "transporter_name": eb.transporter_name,
        "transport_doc_number": eb.transport_doc_number,
        "transport_doc_date": eb.transport_doc_date,
        "vehicle_number": eb.vehicle_number,
        "vehicle_type": eb.vehicle_type,
        "distance_km": eb.distance_km,
        "status": eb.status,
        "error_message": eb.error_message,
        "generated_at": eb.generated_at.isoformat() if eb.generated_at else None,
        "cancelled_at": eb.cancelled_at.isoformat() if eb.cancelled_at else None,
        "cancel_reason": eb.cancel_reason,
        "cancel_remark": eb.cancel_remark,
        "created_at": eb.created_at.isoformat() if eb.created_at else None,
    }


# ─── Endpoints ───────────────────────────────────────────────────────────


@router.get("", response_model=list[EwayBillListOut])
def list_eway_bills(
    voucher_id: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    _require_eway_bill_enabled()

    q = db.query(EwayBill).filter(EwayBill.company_id == company.id)
    if voucher_id:
        q = q.filter(EwayBill.voucher_id == voucher_id)
    if status_filter:
        q = q.filter(EwayBill.status == status_filter)

    bills = q.order_by(EwayBill.created_at.desc()).all()

    result = []
    for eb in bills:
        voucher = db.get(Voucher, eb.voucher_id)
        gst_reg = db.get(GstRegistration, eb.gstin_id)
        result.append(EwayBillListOut(
            id=eb.id,
            voucher_id=eb.voucher_id,
            voucher_number=voucher.voucher_number if voucher else None,
            gstin=gst_reg.gstin if gst_reg else None,
            eway_bill_number=eb.eway_bill_number,
            eway_bill_date=eb.eway_bill_date,
            valid_until=eb.valid_until,
            vehicle_number=eb.vehicle_number,
            status=eb.status,
            total_value=float(eb.total_value),
            error_message=eb.error_message,
            created_at=eb.created_at.isoformat() if eb.created_at else None,
        ))

    return result


@router.post("/create", response_model=EwayBillOut, status_code=201)
def create_eway_bill(
    payload: EwayBillGenerateRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    _require_eway_bill_enabled()

    voucher = db.get(Voucher, payload.voucher_id)
    if not voucher or voucher.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")

    gst_reg = db.get(GstRegistration, payload.gstin_id)
    if not gst_reg or gst_reg.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="GST registration not found")

    # Check for existing E-Way Bill
    existing = db.query(EwayBill).filter(
        EwayBill.company_id == company.id,
        EwayBill.voucher_id == payload.voucher_id,
    ).first()
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"E-Way Bill already exists for this voucher (status: {existing.status})",
        )

    # Build E-Way Bill details from voucher
    from app.models.voucher import VoucherLine as VoucherLineModel
    voucher_lines = db.query(VoucherLineModel).filter(VoucherLineModel.voucher_id == payload.voucher_id).all()

    from decimal import Decimal
    total_taxable = Decimal("0")
    total_cgst = Decimal("0")
    total_sgst = Decimal("0")
    total_igst = Decimal("0")

    for vl in voucher_lines:
        taxable = Decimal(str(vl.taxable_value or (float(vl.debit or vl.credit))))
        total_taxable += taxable
        total_cgst += Decimal(str(vl.cgst_amount or 0))
        total_sgst += Decimal(str(vl.sgst_amount or 0))
        total_igst += Decimal(str(vl.igst_amount or 0))

    total_value = float(total_taxable + total_cgst + total_sgst + total_igst)

    from app.models.accounting import Party
    party = db.get(Party, voucher.party_id) if voucher.party_id else None

    eb = EwayBill(
        company_id=company.id,
        voucher_id=payload.voucher_id,
        gstin_id=payload.gstin_id,
        supply_type="O",
        sub_supply_type="0",
        document_type="INV",
        document_number=voucher.voucher_number,
        document_date=voucher.voucher_date,
        from_gstin=gst_reg.gstin,
        from_trd_name=gst_reg.legal_name,
        from_state=gst_reg.state_code,
        to_gstin=voucher.counterparty_gstin or (party.gstin if party else None),
        to_trd_name=party.name if party else "",
        to_state=voucher.counterparty_state_code or (party.state_code if party else None),
        transport_mode=payload.transport_mode,
        transporter_id=payload.transporter_id,
        transporter_name=payload.transporter_name,
        vehicle_number=payload.vehicle_number,
        distance_km=payload.distance_km,
        taxable_amount=float(total_taxable),
        cgst_amount=float(total_cgst),
        sgst_amount=float(total_sgst),
        igst_amount=float(total_igst),
        total_value=total_value,
        status="draft",
    )
    db.add(eb)
    db.commit()
    db.refresh(eb)

    return _serialize_eway_bill(eb)


@router.get("/{eway_bill_id}", response_model=EwayBillOut)
def get_eway_bill(
    eway_bill_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    _require_eway_bill_enabled()

    eb = db.get(EwayBill, eway_bill_id)
    if not eb or eb.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="E-Way Bill not found")

    return _serialize_eway_bill(eb)


@router.post("/{eway_bill_id}/generate", response_model=EwayBillOut)
async def generate_eway_bill_endpoint(
    eway_bill_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    _require_eway_bill_enabled()

    eb = db.get(EwayBill, eway_bill_id)
    if not eb or eb.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="E-Way Bill not found")

    if eb.status not in ("draft", "failed"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot generate E-Way Bill with status: {eb.status}",
        )

    try:
        payload = build_eway_bill_payload(
            db, company.id, eb.voucher_id, eb.gstin_id,
            transport_mode=eb.transport_mode,
            transporter_id=eb.transporter_id,
            transporter_name=eb.transporter_name,
            vehicle_number=eb.vehicle_number,
            distance_km=eb.distance_km,
        )
        result = await generate_eway_bill(db, company.id, eb.id, payload)
        return _serialize_eway_bill(result)
    except EwayBillError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{eway_bill_id}/cancel", response_model=EwayBillOut)
async def cancel_eway_bill_endpoint(
    eway_bill_id: str,
    payload: EwayBillCancelRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    _require_eway_bill_enabled()

    try:
        result = await cancel_eway_bill(
            db, company.id, eway_bill_id,
            payload.cancel_reason, payload.cancel_remark,
        )
        return _serialize_eway_bill(result)
    except EwayBillError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/{eway_bill_id}/vehicle", response_model=EwayBillOut)
async def update_vehicle_endpoint(
    eway_bill_id: str,
    payload: EwayBillVehicleUpdateRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    _require_eway_bill_enabled()

    try:
        result = await update_vehicle(
            db, company.id, eway_bill_id,
            payload.vehicle_number,
            payload.transport_mode,
            payload.from_place,
            payload.from_state,
            payload.to_place,
            payload.to_state,
        )
        return _serialize_eway_bill(result)
    except EwayBillError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/{eway_bill_id}/payload")
def get_eway_bill_payload(
    eway_bill_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get the E-Way Bill payload that would be submitted to GSTN (for preview)."""
    _require_eway_bill_enabled()

    eb = db.get(EwayBill, eway_bill_id)
    if not eb or eb.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="E-Way Bill not found")

    try:
        payload = build_eway_bill_payload(
            db, company.id, eb.voucher_id, eb.gstin_id,
            transport_mode=eb.transport_mode,
            transporter_id=eb.transporter_id,
            transporter_name=eb.transporter_name,
            vehicle_number=eb.vehicle_number,
            distance_km=eb.distance_km,
        )
        return payload
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
