"""E-Invoice endpoints: IRN generation, cancellation, status queries, QR/PDF downloads."""
from __future__ import annotations

import base64
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user, require_role
from app.models.user import User
from app.models.accounting import GstRegistration
from app.models.einvoice import EInvoice
from app.models.voucher import Voucher, VoucherLine
from app.schemas.einvoice import (
    EInvoiceCancelRequest,
    EInvoiceGenerateRequest,
    EInvoiceListOut,
    EInvoiceOut,
)
from app.schemas.member import CompanyRole
from app.services.einvoice_builder import build_einvoice_payload
from app.services.einvoice_client import EinvoiceError, cancel_irn, generate_irn

router = APIRouter()


def _require_einvoice_enabled():
    """Check if e-invoice feature is enabled."""
    if not settings.einvoice_enabled:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="E-Invoice is not enabled. Set EINVOICE_ENABLED=true in environment.",
        )


def _serialize_einvoice(ei: EInvoice, db: Session) -> dict:
    """Serialize EInvoice to dict for response."""
    voucher = db.get(Voucher, ei.voucher_id)
    return {
        "id": ei.id,
        "voucher_id": ei.voucher_id,
        "voucher_status": voucher.status if voucher else None,
        "gstin_id": ei.gstin_id,
        "irn": ei.irn,
        "ack_no": ei.ack_no,
        "ack_dt": ei.ack_dt,
        "signed_qr_code": ei.signed_qr_code,
        "signed_invoice": ei.signed_invoice,
        "status": ei.status,
        "error_message": ei.error_message,
        "submitted_at": ei.submitted_at.isoformat() if ei.submitted_at else None,
        "generated_at": ei.generated_at.isoformat() if ei.generated_at else None,
        "cancelled_at": ei.cancelled_at.isoformat() if ei.cancelled_at else None,
        "cancel_reason": ei.cancel_reason,
        "cancel_remark": ei.cancel_remark,
        "created_at": ei.created_at.isoformat() if ei.created_at else None,
    }


# ─── Endpoints ───────────────────────────────────────────────────────────


@router.get("", response_model=list[EInvoiceListOut])
def list_einvoices(
    voucher_id: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """List e-invoices for the company with optional filters."""
    if not settings.einvoice_enabled:
        # Feature disabled — a read-only list must not 400. Returning an empty
        # list lets clients (e.g. the GST page default tab) render the empty
        # state without a console error. Mutations still 400 via
        # _require_einvoice_enabled().
        return []

    q = db.query(EInvoice).filter(EInvoice.company_id == company.id)
    if voucher_id:
        q = q.filter(EInvoice.voucher_id == voucher_id)
    if status_filter:
        q = q.filter(EInvoice.status == status_filter)

    einvoices = q.order_by(EInvoice.created_at.desc()).all()

    result = []
    for ei in einvoices:
        voucher = db.get(Voucher, ei.voucher_id)
        gst_reg = db.get(GstRegistration, ei.gstin_id)
        result.append(EInvoiceListOut(
            id=ei.id,
            voucher_id=ei.voucher_id,
            voucher_number=voucher.voucher_number if voucher else None,
            voucher_status=voucher.status if voucher else None,
            gstin=gst_reg.gstin if gst_reg else None,
            irn=ei.irn,
            ack_no=ei.ack_no,
            status=ei.status,
            error_message=ei.error_message,
            created_at=ei.created_at.isoformat() if ei.created_at else None,
        ))

    return result


@router.post("/create", response_model=EInvoiceOut, status_code=201)
def create_einvoice(
    payload: EInvoiceGenerateRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Create an e-invoice record for a voucher (pre-generate state)."""
    _require_einvoice_enabled()

    voucher = db.get(Voucher, payload.voucher_id)
    if not voucher or voucher.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")

    if not voucher.counterparty_gstin:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="E-Invoice requires a B2B voucher with counterparty GSTIN",
        )

    gst_reg = db.get(GstRegistration, payload.gstin_id)
    if not gst_reg or gst_reg.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="GST registration not found")

    # Check for existing e-invoice
    existing = db.query(EInvoice).filter(
        EInvoice.company_id == company.id,
        EInvoice.voucher_id == payload.voucher_id,
    ).first()
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"E-Invoice already exists for this voucher (status: {existing.status})",
        )

    ei = EInvoice(
        company_id=company.id,
        voucher_id=payload.voucher_id,
        gstin_id=payload.gstin_id,
        status="draft",
    )
    db.add(ei)
    db.commit()
    db.refresh(ei)

    return _serialize_einvoice(ei, db)


@router.get("/{einvoice_id}", response_model=EInvoiceOut)
def get_einvoice(
    einvoice_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Get e-invoice details by ID."""
    _require_einvoice_enabled()

    ei = db.get(EInvoice, einvoice_id)
    if not ei or ei.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="E-Invoice not found")

    return _serialize_einvoice(ei, db)


@router.post("/{einvoice_id}/generate", response_model=EInvoiceOut)
async def generate_irn_endpoint(
    einvoice_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate IRN by submitting to GSTN."""
    _require_einvoice_enabled()

    ei = db.get(EInvoice, einvoice_id)
    if not ei or ei.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="E-Invoice not found")

    if ei.status not in ("draft", "failed"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot generate IRN for e-invoice with status: {ei.status}",
        )

    try:
        payload = build_einvoice_payload(db, company.id, ei.voucher_id, ei.gstin_id)
        result = await generate_irn(db, company.id, ei.voucher_id, payload)
        # Statutory action — record it in the audit trail (round 12).
        from app.services.audit import log_action
        voucher_no = None
        if ei.voucher_id:
            vch = db.get(Voucher, ei.voucher_id)
            voucher_no = vch.voucher_number if vch else None
        log_action(
            db, company_id=company.id, user_id=user.id,
            action="UPDATE", entity_type="e_invoice", entity_id=ei.id,
            description=f"Generated IRN for {voucher_no or ei.voucher_id}",
        )
        db.commit()
        return _serialize_einvoice(result, db)
    except EinvoiceError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{einvoice_id}/cancel", response_model=EInvoiceOut)
async def cancel_irn_endpoint(
    einvoice_id: str,
    payload: EInvoiceCancelRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cancel an IRN within 24 hours of generation."""
    _require_einvoice_enabled()

    try:
        result = await cancel_irn(
            db, company.id, einvoice_id,
            payload.cancel_reason, payload.cancel_remark,
        )
        # Statutory action — record it in the audit trail (round 12).
        from app.services.audit import log_action
        log_action(
            db, company_id=company.id, user_id=user.id,
            action="UPDATE", entity_type="e_invoice", entity_id=einvoice_id,
            description=(
                f"Cancelled e-invoice {einvoice_id[:8]}: {payload.cancel_reason}"
            ),
        )
        db.commit()
        return _serialize_einvoice(result, db)
    except EinvoiceError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/{einvoice_id}/qr")
def get_einvoice_qr(
    einvoice_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Get e-invoice QR code as PNG image."""
    _require_einvoice_enabled()

    ei = db.get(EInvoice, einvoice_id)
    if not ei or ei.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="E-Invoice not found")

    if not ei.signed_qr_code:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="QR code not available")

    # The signed_qr_code from GSTN is a base64-encoded QR image
    try:
        qr_data = base64.b64decode(ei.signed_qr_code)
        return Response(content=qr_data, media_type="image/png")
    except Exception:
        # If it's not a valid base64 PNG, generate one from the IRN text
        try:
            import qrcode
            qr = qrcode.QRCode(version=1, box_size=10, border=5)
            qr.add_data(f"IRN: {ei.irn}\nAck No: {ei.ack_no}\nAck Date: {ei.ack_dt}")
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")
            import io
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            return Response(content=buffer.getvalue(), media_type="image/png")
        except ImportError:
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="QR code generation not available",
            )


@router.get("/{einvoice_id}/invoice-data")
def get_einvoice_data(
    einvoice_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Get the e-invoice payload that would be submitted to GSTN (for preview)."""
    _require_einvoice_enabled()

    ei = db.get(EInvoice, einvoice_id)
    if not ei or ei.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="E-Invoice not found")

    try:
        payload = build_einvoice_payload(db, company.id, ei.voucher_id, ei.gstin_id)
        return payload
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
