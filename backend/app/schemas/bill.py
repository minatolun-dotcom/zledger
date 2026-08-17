"""Bill-wise accounting schemas."""
from __future__ import annotations

from decimal import Decimal
from pydantic import BaseModel, Field


# ─── Bill Types ───────────────────────────────────────────────────────────────

class BillType:
    """Bill type constants matching Tally Prime."""
    NEW_REF = "new_ref"           # New invoice/bill
    AGAINST_REF = "against_ref"   # Settlement against existing bill
    ADVANCE = "advance"           # Advance receipt/payment
    ON_ACCOUNT = "on_account"     # Partial, no specific bill
    OTHERS = "others"             # Other types


class BillStatus:
    """Bill status constants."""
    OPEN = "open"                 # Unpaid
    PARTIAL = "partial"           # Partially paid
    PAID = "paid"                 # Fully paid
    CANCELLED = "cancelled"       # Cancelled


# ─── Bill Reference Schemas ───────────────────────────────────────────────────

class BillReferenceCreate(BaseModel):
    """Create a bill reference."""
    invoice_voucher_id: str
    reference_type: str = BillType.NEW_REF
    bill_number: str
    bill_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    due_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    original_amount: Decimal = Field(..., ge=0)
    party_id: str | None = None
    is_advance: bool = False


class BillReferenceUpdate(BaseModel):
    """Update a bill reference."""
    adjusted_amount: Decimal | None = None
    status: str | None = None


class BillReferenceOut(BaseModel):
    """Bill reference output."""
    id: str
    company_id: str
    invoice_voucher_id: str
    # "sales" or "purchase" — derived from the invoice voucher so reports can
    # classify bills by side (a Both party's sales bills are receivables and
    # its purchase bills are payables — Tally parity).
    voucher_type: str | None = None
    reference_type: str
    bill_number: str
    bill_date: str
    due_date: str | None
    original_amount: float
    adjusted_amount: float
    paid_amount: float
    outstanding_amount: float
    status: str
    party_id: str | None
    party_name: str | None = None
    is_advance: bool
    days_overdue: int = 0
    aging_bucket: str | None = None
    created_at: str | None
    updated_at: str | None


# ─── Bill Settlement Schemas ──────────────────────────────────────────────────

class BillSettlementLine(BaseModel):
    """Single bill settlement in a payment/receipt."""
    bill_reference_id: str
    amount: Decimal = Field(..., gt=0)
    remarks: str | None = None


class BillSettlementRequest(BaseModel):
    """Settle one or more bills via payment/receipt voucher."""
    payment_voucher_id: str
    settlement_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    settlements: list[BillSettlementLine] = Field(..., min_length=1)


class BillSettlementOut(BaseModel):
    """Settlement result."""
    payment_allocation_id: str
    bill_reference_id: str
    amount: float
    remaining_outstanding: float


# ─── Outstanding Bills Schemas ────────────────────────────────────────────────

class OutstandingBillLine(BaseModel):
    """Single outstanding bill for display."""
    bill_reference_id: str
    bill_number: str
    bill_date: str
    due_date: str | None
    invoice_voucher_number: str
    invoice_date: str
    original_amount: float
    paid_amount: float
    outstanding_amount: float
    days_overdue: int
    aging_bucket: str


class OutstandingBillsResponse(BaseModel):
    """Outstanding bills for a party."""
    party_id: str
    party_name: str
    bills: list[OutstandingBillLine]
    total_outstanding: float
    oldest_bill_date: str | None
    max_days_overdue: int


# ─── Party Statement Schemas ──────────────────────────────────────────────────

class StatementLine(BaseModel):
    """Single line in party statement."""
    date: str
    voucher_type: str
    voucher_number: str
    bill_number: str | None
    debit: float
    credit: float
    balance: float
    remarks: str | None


class PartyStatementResponse(BaseModel):
    """Complete party statement."""
    party_id: str
    party_name: str
    party_type: str  # 'customer' or 'supplier'
    start_date: str
    end_date: str
    opening_balance: float
    opening_balance_type: str  # 'Dr' or 'Cr'
    transactions: list[StatementLine]
    closing_balance: float
    closing_balance_type: str
    total_debit: float
    total_credit: float


# ─── Advance Tracking Schemas ─────────────────────────────────────────────────

class AdvanceCreate(BaseModel):
    """Record an advance receipt/payment."""
    party_id: str
    amount: Decimal = Field(..., gt=0)
    advance_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    payment_voucher_id: str
    remarks: str | None = None


class AdvanceAdjustment(BaseModel):
    """Adjust advance against a bill."""
    advance_bill_id: str
    invoice_bill_id: str
    amount: Decimal = Field(..., gt=0)
    adjustment_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")


class AdvanceOut(BaseModel):
    """Advance details."""
    bill_reference_id: str
    party_id: str
    party_name: str
    amount: float
    unadjusted_amount: float
    advance_date: str
    payment_voucher_number: str
    status: str
