"""Payments endpoints: receivables, payables, and payment allocation."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company
from app.models.user import Company
from app.schemas.payments import (
    PaymentAllocateRequest,
    PaymentAllocationOut,
    PayablesResponse,
    ReceivablesResponse,
)
from app.services.payments import (
    allocate_payment,
    delete_allocation,
    get_invoice_allocations,
    get_payables,
    get_receivables,
)

router = APIRouter()


class AllocationDeleteResponse(BaseModel):
    ok: bool


@router.get("/receivables", response_model=ReceivablesResponse)
def list_receivables(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """List outstanding sales invoices (what customers owe us)."""
    return get_receivables(db, company.id)


@router.get("/payables", response_model=PayablesResponse)
def list_payables(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """List outstanding purchase invoices (what we owe suppliers)."""
    return get_payables(db, company.id)


@router.get("/allocations/{invoice_voucher_id}", response_model=list[PaymentAllocationOut])
def list_allocations(
    invoice_voucher_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Get all payment allocations for a specific invoice."""
    return get_invoice_allocations(db, company.id, invoice_voucher_id)


@router.post("/allocate", response_model=PaymentAllocationOut, status_code=201)
def create_allocation(
    payload: PaymentAllocateRequest,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Allocate a payment voucher to an invoice."""
    try:
        alloc = allocate_payment(
            db,
            company.id,
            payload.invoice_voucher_id,
            payload.payment_voucher_id,
            payload.amount,
            payload.allocation_date,
            payload.remarks,
        )
        db.commit()
        return alloc
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/allocations/{allocation_id}", response_model=AllocationDeleteResponse)
def remove_allocation(
    allocation_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    """Delete a payment allocation."""
    ok = delete_allocation(db, company.id, allocation_id)
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Allocation not found")
    db.commit()
    return AllocationDeleteResponse(ok=True)
