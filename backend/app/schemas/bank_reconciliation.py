"""Bank reconciliation schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class BankStatementLineOut(BaseModel):
    id: str
    company_id: str
    ledger_id: str
    transaction_date: str
    description: str
    reference: str | None = None
    debit: float
    credit: float
    balance: float | None = None
    is_reconciled: bool
    voucher_id: str | None = None
    reconciled_at: str | None = None
    created_at: str | None = None


class BankReconcileMatch(BaseModel):
    """Match a statement line to a voucher."""
    statement_line_id: str
    voucher_id: str


class BankReconcileUnmatch(BaseModel):
    """Unmatch a statement line from its voucher."""
    statement_line_id: str


class BankReconciliationOut(BaseModel):
    id: str
    company_id: str
    ledger_id: str
    statement_date: str
    opening_balance: float
    closing_balance: float
    reconciled_count: int
    is_finalized: bool
    created_at: str | None = None


class BankReconciliationCreate(BaseModel):
    """Create a reconciliation session."""
    ledger_id: str
    statement_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    opening_balance: float = 0.0
    closing_balance: float = 0.0


class BankReconciliationFinalize(BaseModel):
    """Finalize a reconciliation session."""
    closing_balance: float


class CreateVoucherFromStatement(BaseModel):
    """Create a payment/receipt voucher from a bank statement line."""
    statement_line_id: str
    voucher_type: str = Field(default="payment", pattern=r"^(payment|receipt)$")
    party_id: str | None = None
    party_ledger_id: str | None = None
    narration: str | None = None


class MarkBankCharge(BaseModel):
    """Mark a statement line as a bank charge (creates journal entry)."""
    statement_line_id: str


class BulkMarkReconciled(BaseModel):
    """Bulk mark statement lines as reconciled."""
    ids: list[str] = Field(..., min_length=1)


class BatchSuggestOut(BaseModel):
    """Top match candidate for a single statement line."""
    line_id: str
    best_candidate: dict | None = None
