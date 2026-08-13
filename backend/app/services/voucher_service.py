"""Voucher service: core voucher creation logic extracted from API layer."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.accounting import AccountGroup, FinancialYear, GstRegistration, Ledger, Party
from app.models.bill_reference import BillReference
from app.models.bill_adjustment import BillAdjustment
from app.models.payment_allocation import PaymentAllocation
from app.models.stock import StockEntry, StockItem
from app.models.tds_tcs import TdsTcsEntry
from app.models.user import Company, User
from app.models.voucher import Voucher, VoucherLine
from app.models.voucher_numbering import VoucherNumbering
from app.schemas.voucher import VoucherCreate
from app.services.gst import calculate_gst, calculate_gst_from_rate, get_gst_ledger_ids
from app.services.bill_wise import create_bill_reference
from app.services.stock_valuation import update_stock_balance_weighted_avg


ITEM_TYPES = frozenset({"sales", "purchase", "credit_note", "debit_note"})


def _check_fy_closed(db: Session, company_id: str, voucher_date: str) -> None:
    """Reject vouchers dated inside a closed financial year."""
    fy = db.query(FinancialYear).filter(
        FinancialYear.company_id == company_id,
        FinancialYear.start_date <= voucher_date,
        FinancialYear.end_date >= voucher_date,
        FinancialYear.is_closed.is_(True),
    ).first()
    if fy:
        from fastapi import HTTPException, status
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Financial year '{fy.name}' is closed. Cannot create or update vouchers in a closed period.",
        )


def _check_voucher_date_in_fy(db: Session, company_id: str, voucher_date: str) -> None:
    """Reject voucher dates that fall outside every financial year.

    A voucher dated beyond all FYs would be silently invisible in every
    report (reports filter by FY date ranges) — a data-integrity hole.
    Companies with no FYs at all (fresh setup) are allowed so onboarding
    isn't blocked.
    """
    count = db.query(FinancialYear.id).filter(
        FinancialYear.company_id == company_id,
    ).first()
    if not count:
        return  # No FYs configured yet — don't block setup
    in_fy = db.query(FinancialYear.id).filter(
        FinancialYear.company_id == company_id,
        FinancialYear.start_date <= voucher_date,
        FinancialYear.end_date >= voucher_date,
    ).first()
    if not in_fy:
        from fastapi import HTTPException, status
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Voucher date {voucher_date} falls outside all financial years "
                "for this company. Create or extend a financial year first."
            ),
        )


def _get_fy_year(company: Company | None, today: date | None = None) -> str:
    """Return 4-digit FY year string (e.g. '2026' for FY 2026-27 starting April 2026)."""
    if today is None:
        today = date.today()
    fy_start_month = 4  # Default April
    if today.month >= fy_start_month:
        return str(today.year)
    return str(today.year - 1)


def _fy_year_for_date(db: Session, company_id: str, voucher_date: str) -> str:
    """4-digit FY year (e.g. '2026' for FY 2026-27) the VOUCHER's date falls in.

    TallyPrime numbers a voucher by the financial year it is DATED in, not by
    today's calendar FY. A June-2027 invoice posted in August 2026 must be
    INV-2027-… (audit round 8) — the old code derived the year from
    ``date.today()`` and mis-numbered post-dated/back-dated vouchers.
    """
    fy = db.query(FinancialYear).filter(
        FinancialYear.company_id == company_id,
        FinancialYear.start_date <= voucher_date,
        FinancialYear.end_date >= voucher_date,
    ).first()
    if fy:
        # start_date is stored as an ISO string ('YYYY-MM-DD').
        return str(fy.start_date)[:4]
    d = date.fromisoformat(voucher_date)
    return str(d.year if d.month >= 4 else d.year - 1)


def _next_voucher_number(
    db: Session,
    company_id: str,
    voucher_type: str,
    voucher_date: str | None = None,
) -> str:
    import re

    numbering = db.query(VoucherNumbering).filter(
        VoucherNumbering.company_id == company_id,
        VoucherNumbering.voucher_type == voucher_type,
    ).with_for_update().first()

    if numbering:
        company = db.get(Company, company_id)
        fy_year = (
            _fy_year_for_date(db, company_id, voucher_date)
            if voucher_date is not None
            else _get_fy_year(company)
        )
        prefix = numbering.prefix
        fy_prefix = f"{prefix}-{fy_year}"

        # The sequence is PER-FY: when the financial year rolls over, reset the
        # counter to 1 (TallyPrime restarts numbering each FY). Without this a
        # company using {YEAR} prefixes would number its first FY-2027 invoice
        # INV-2027-0042 instead of INV-2027-0001 (audit round 7).
        if numbering.current_fy_year != fy_year:
            numbering.next_sequence = 1
            numbering.current_fy_year = fy_year

        # Find the max sequence for the current FY from existing vouchers
        all_numbers = db.query(Voucher.voucher_number).filter(
            Voucher.company_id == company_id,
            Voucher.voucher_type == voucher_type,
        ).all()

        max_seq = 0
        for (num,) in all_numbers:
            if num and num.startswith(fy_prefix):
                match = re.search(r'(\d+)$', num)
                if match:
                    max_seq = max(max_seq, int(match.group(1)))

        # Sync next_sequence if behind (handles seed data or first use this FY)
        seq = max(numbering.next_sequence, max_seq + 1)
        numbering.next_sequence = seq + 1

        padding = max(4, len(str(seq)))
        return f"{prefix}-{fy_year}-{str(seq).zfill(padding)}"

    # Fallback: plain integer (legacy behavior)
    last = db.scalar(
        select(Voucher)
        .where(Voucher.company_id == company_id, Voucher.voucher_type == voucher_type)
        .order_by(Voucher.created_at.desc())
        .limit(1)
    )
    if last and last.voucher_number.isdigit():
        return str(int(last.voucher_number) + 1)
    all_numbers = db.query(Voucher.voucher_number).filter(
        Voucher.company_id == company_id, Voucher.voucher_type == voucher_type
    ).all()
    max_num = 0
    for (num,) in all_numbers:
        match = re.search(r'(\d+)$', num or '')
        if match:
            max_num = max(max_num, int(match.group(1)))
    return str(max_num + 1) if max_num > 0 else "1"


def _determine_is_inter_state(db: Session, company_id: str, place_of_supply: str | None) -> bool:
    if not place_of_supply:
        return False
    primary_gst = db.query(GstRegistration).filter(
        GstRegistration.company_id == company_id,
        GstRegistration.is_primary.is_(True),
    ).first()
    if not primary_gst:
        return False
    return primary_gst.state_code != place_of_supply


def _resolve_ledger_for_line(
    db: Session, company_id: str, voucher_type: str, stock_item: StockItem | None,
) -> str:
    if not stock_item:
        return ""
    group_name_map = {"sales": "Sales Accounts", "purchase": "Purchase Accounts"}
    group_name = group_name_map.get(voucher_type)
    if not group_name:
        return ""
    ledger = db.query(Ledger).join(AccountGroup).filter(
        Ledger.company_id == company_id,
        AccountGroup.name == group_name,
        Ledger.is_active.is_(True),
    ).first()
    return ledger.id if ledger else ""


def _get_or_create_round_off_ledger(db: Session, company_id: str) -> Ledger:
    ledger = db.query(Ledger).filter(
        Ledger.company_id == company_id,
        Ledger.system_code == "SYS_ROUND_OFF",
    ).first()
    if ledger:
        return ledger
    ledger = db.query(Ledger).filter(
        Ledger.company_id == company_id, Ledger.name == "Round Off",
    ).first()
    if ledger:
        return ledger
    group = db.query(AccountGroup).filter(
        AccountGroup.company_id == company_id,
        AccountGroup.system_code == "GRP_INDIRECT_INCOMES",
    ).first()
    if not group:
        group = db.query(AccountGroup).filter(
            AccountGroup.company_id == company_id,
            AccountGroup.nature == "income",
        ).first()
    if not group:
        group = AccountGroup(
            company_id=company_id, name="Indirect Incomes",
            system_code="GRP_INDIRECT_INCOMES",
            group_type="primary", nature="income", is_system=True,
        )
        db.add(group)
        db.flush()
    ledger = Ledger(
        company_id=company_id, name="Round Off",
        system_code="SYS_ROUND_OFF", group_id=group.id,
        opening_balance=0, opening_balance_type="Cr",
        is_active=True, is_protected=True,
    )
    db.add(ledger)
    db.flush()
    return ledger


def _create_stock_entries(db: Session, company_id: str, voucher: Voucher) -> None:
    """Create stock entries for item vouchers.

    Sales → outward, purchase → inward. Credit notes reverse a sale
    (outward), debit notes reverse a purchase (inward) — TallyPrime treats
    returns as reversing the original stock movement.
    """
    mapping = {
        "sales": "outward",
        "purchase": "inward",
        "credit_note": "outward",  # reverses a sale
        "debit_note": "inward",  # reverses a purchase
    }
    entry_type = mapping.get(voucher.voucher_type)
    if not entry_type:
        return
    lines = db.query(VoucherLine).filter(VoucherLine.voucher_id == voucher.id).all()
    for vl in lines:
        if vl.stock_item_id and vl.quantity:
            se = StockEntry(
                company_id=company_id, stock_item_id=vl.stock_item_id,
                entry_type=entry_type, quantity=float(vl.quantity),
                rate=float(vl.rate or 0), total_amount=float(vl.line_total or 0),
                entry_date=voucher.voucher_date, reference=voucher.reference,
                narration=voucher.narration, voucher_id=voucher.id,
            )
            db.add(se)
            update_stock_balance_weighted_avg(
                db, company_id, vl.stock_item_id,
                entry_type, float(vl.quantity), float(vl.rate or 0),
                voucher.voucher_date,
            )


def _reverse_stock_entries(db: Session, company_id: str, voucher: Voucher) -> None:
    """Remove stock entries for a voucher and reverse their balance impact.

    Used on cancel and on edit (before the replacement lines are re-posted).
    Outward entries (sales) add back to stock; inward entries (purchase) are
    deducted. This keeps StockBalance consistent even though the StockEntry
    rows themselves are removed.
    """
    entries = db.query(StockEntry).filter(StockEntry.voucher_id == voucher.id).all()
    for se in entries:
        # Reverse the balance effect using the same weighted-average path with
        # the opposite entry type.
        opposite = "inward" if se.entry_type == "outward" else "outward"
        update_stock_balance_weighted_avg(
            db, company_id, se.stock_item_id,
            opposite, se.quantity, se.rate or 0,
            voucher.voucher_date,
        )
        db.delete(se)


def _handle_einvoice_on_cancel(db: Session, voucher: Voucher) -> None:
    """Guard/cleanup e-invoices when a voucher is cancelled.

    GSTN rules: an IRN submitted to the IRP (status ``submitted``/``generated``)
    is only cancellable via the IRP (within 24h of generation). A voucher with a
    live e-invoice must therefore NOT be cancellable until its IRN is cancelled
    first — otherwise the IRP still sees a valid invoice while the books say
    void (and a later e-invoice list/GSTR export would carry it). Draft
    e-invoices (never submitted to the IRP) are cancelled locally. Already
    cancelled/failed rows are inert.
    """
    from datetime import datetime, timezone

    from app.models.einvoice import EInvoice

    einvoices = db.query(EInvoice).filter(EInvoice.voucher_id == voucher.id).all()
    for ei in einvoices:
        if ei.status in ("submitted", "generated"):
            from fastapi import HTTPException, status as http_status
            raise HTTPException(
                http_status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"{voucher.voucher_number} has a live e-invoice "
                    f"(IRN {ei.irn or 'submitted to IRP'}). Cancel the e-invoice "
                    "first (E-Invoices page), or issue a credit note instead."
                ),
            )
        if ei.status == "draft":
            ei.status = "cancelled"
            ei.cancel_reason = "3"
            ei.cancel_remark = "Voucher cancelled"
            ei.cancelled_at = datetime.now(timezone.utc)


def _cleanup_voucher_dependents(db: Session, company_id: str, voucher: Voucher) -> None:
    """Remove a voucher's compliance/allocation dependents on cancellation.

    1. TDS/TCS entries: cancelling a voucher invalidates any TDS deducted
       against it — PENDING entries are removed or the TDS summary/returns
       would overstate the liability for a transaction that no longer exists.
       DEPOSITED/FILED entries are deliberately kept: the tax was physically
       deposited to the government with a challan, so deleting that record
       would destroy the compliance audit trail.

    2. Payment allocations: a cancelled payment/receipt must not keep its
       bill settlements. The allocation rows are removed and EVERY bill
       reference for the affected invoice is recomputed from the surviving
       allocations (paid = sum of remaining allocations), so the invoice's
       outstanding snaps back to what is actually still settled regardless of
       which reference a settlement had targeted.

    3. Credit-note bill adjustments: a cancelled credit note must roll back
       the exact attributed amount on the bill reference it adjusted
       (persisted in ``bill_adjustments``), otherwise the invoice's
       outstanding stays understated forever. Legacy adjustments made before
       the attribution table existed have no row here and survive untouched.

    DB-level ON DELETE CASCADE already handles these rows when a voucher row
    is deleted; this helper covers the soft-cancel path where the voucher row
    survives (deleting a voucher requires cancelling it first, so the cancel
    path always runs first).
    """
    # 1. TDS/TCS entries linked to this voucher (pending only — deposited/
    # filed entries carry a real challan record that must survive)
    for e in db.query(TdsTcsEntry).filter(
        TdsTcsEntry.voucher_id == voucher.id,
        TdsTcsEntry.status == "pending",
    ).all():
        db.delete(e)

    # 3. Credit/debit-note bill adjustments attributed to this voucher. Collect
    # the per-reference undo map BEFORE deleting the rows.
    adjustments = db.query(BillAdjustment).filter(
        or_(
            BillAdjustment.credit_note_voucher_id == voucher.id,
            BillAdjustment.debit_note_voucher_id == voucher.id,
        )
    ).all()
    affected_bill_ref_ids: set[str] = set()
    undo_adjustment: dict[str, Decimal] = {}
    for a in adjustments:
        affected_bill_ref_ids.add(a.bill_reference_id)
        undo_adjustment[a.bill_reference_id] = (
            undo_adjustment.get(a.bill_reference_id, Decimal("0")) + Decimal(str(a.amount))
        )
        db.delete(a)

    # 2. Payment allocations where this voucher is the payment/receipt side
    allocations = db.query(PaymentAllocation).filter(
        PaymentAllocation.payment_voucher_id == voucher.id
    ).all()
    affected_invoice_ids = {a.invoice_voucher_id for a in allocations}
    for a in allocations:
        db.delete(a)

    if not affected_invoice_ids and not affected_bill_ref_ids:
        return
    db.flush()

    # Recompute EVERY bill reference for each affected invoice (settlement
    # side) plus each directly adjusted reference (credit-note side). Each ref
    # gets its own (original + adjusted − paid): paid comes from surviving
    # allocations, adjusted_amount is rolled back by exactly what this voucher
    # was attributed, so no ref can keep a stale reduced amount after cancel.
    for invoice_id in affected_invoice_ids:
        for bill_ref in db.query(BillReference).filter(
            BillReference.invoice_voucher_id == invoice_id
        ).all():
            affected_bill_ref_ids.add(bill_ref.id)
    for bill_ref_id in affected_bill_ref_ids:
        bill_ref = db.get(BillReference, bill_ref_id)
        if not bill_ref:
            continue
        remaining_paid = (
            db.query(func.coalesce(func.sum(PaymentAllocation.amount), 0))
            .filter(PaymentAllocation.invoice_voucher_id == bill_ref.invoice_voucher_id)
            .scalar()
            or 0
        )
        paid = Decimal(str(remaining_paid))
        bill_ref.paid_amount = float(paid)
        bill_ref.adjusted_amount = float(
            Decimal(str(bill_ref.adjusted_amount))
            - undo_adjustment.get(bill_ref_id, Decimal("0"))
        )
        bill_ref.outstanding_amount = float(
            Decimal(str(bill_ref.original_amount))
            + Decimal(str(bill_ref.adjusted_amount))
            - paid
        )
        if bill_ref.outstanding_amount <= 0:
            bill_ref.status = "paid"
        elif paid > 0:
            bill_ref.status = "partial"
        else:
            bill_ref.status = "open"


def create_reversal_voucher(
    db: Session,
    company: Company,
    original: Voucher,
    reason: str,
    user_id: str,
) -> Voucher:
    """Create an explicit reversal voucher linked to a cancelled original.

    TallyPrime-style audit trail: cancelling a voucher creates a new voucher
    with the exact opposite entries, linked via original_voucher_id /
    reversed_by_voucher_id. The reversal is marked status="reversed" so it is
    excluded from every financial aggregation (posted-only filters) while
    remaining visible in the Day Book and audit trail.

    The reversal never runs _post_voucher_effects — the original's stock was
    already reversed and its bill reference excluded by the cancelled status.
    """
    number = _next_voucher_number(db, company.id, original.voucher_type, original.voucher_date)
    reversal = Voucher(
        company_id=company.id,
        voucher_type=original.voucher_type,
        voucher_number=number,
        voucher_date=original.voucher_date,
        narration=f"Reversal of {original.voucher_number} — {reason}",
        reference=original.reference,
        party_id=original.party_id,
        place_of_supply=original.place_of_supply,
        document_type=original.document_type,
        counterparty_gstin=original.counterparty_gstin,
        counterparty_state_code=original.counterparty_state_code,
        round_off_to=original.round_off_to,
        due_date=original.due_date,
        status="reversed",
        original_voucher_id=original.id,
        created_by=user_id,
        subtotal=original.subtotal,
        discount_total=original.discount_total,
        tax_total=original.tax_total,
        grand_total=original.grand_total,
    )
    db.add(reversal)
    db.flush()

    original_lines = db.query(VoucherLine).filter(VoucherLine.voucher_id == original.id).all()
    for ln in original_lines:
        db.add(VoucherLine(
            voucher_id=reversal.id,
            ledger_id=ln.ledger_id,
            stock_item_id=ln.stock_item_id,
            quantity=ln.quantity,
            rate=ln.rate,
            discount_pct=ln.discount_pct,
            discount_amount=ln.discount_amount,
            line_total=ln.line_total,
            debit=ln.credit,
            credit=ln.debit,
            taxable_value=ln.taxable_value,
            hsn_sac_id=ln.hsn_sac_id,
            is_inter_state=ln.is_inter_state,
            is_reverse_charge=ln.is_reverse_charge,
            is_rate_inclusive=ln.is_rate_inclusive,
            cgst_amount=ln.cgst_amount,
            sgst_amount=ln.sgst_amount,
            igst_amount=ln.igst_amount,
            cost_centre_id=ln.cost_centre_id,
        ))

    original.reversed_by_voucher_id = reversal.id
    db.flush()
    return reversal


def _post_voucher_effects(db: Session, company_id: str, voucher: Voucher) -> None:
    """Apply the book/inventory effects of posting a voucher.

    Creates the bill reference (sales/purchase with a party) and the stock
    entries (item vouchers). Reversal vouchers never run this — they must
    not create bill references or double-reverse inventory.
    """
    if voucher.original_voucher_id:
        return
    # Auto-create bill reference for sales/purchase invoices
    if voucher.voucher_type in ("sales", "purchase") and voucher.party_id:
        try:
            create_bill_reference(db, company_id, voucher, reference_type="new_ref")
        except Exception:
            # Don't fail voucher creation if bill reference fails
            import sys
            print(f"Warning: Failed to create bill reference for {voucher.voucher_number}", file=sys.stderr)
    db.flush()
    _create_stock_entries(db, company_id, voucher)


def _round_money(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _process_voucher_lines(
    db: Session, voucher: Voucher, payload: VoucherCreate, company: Company,
    is_inter_state: bool,
) -> dict[str, Any]:
    gst_ledger_ids = get_gst_ledger_ids(db, company.id)

    subtotal = Decimal("0")
    discount_total = Decimal("0")
    tax_total = Decimal("0")
    total_debit = Decimal("0")
    total_credit = Decimal("0")
    ledger_ids_seen: set[str] = set()
    composition_taxable = Decimal("0")

    for line in payload.lines:
        ledger_id = line.ledger_id
        stock_item = None
        if line.stock_item_id:
            stock_item = db.get(StockItem, line.stock_item_id)
            if not stock_item or stock_item.company_id != company.id:
                from fastapi import HTTPException, status
                raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Stock item {line.stock_item_id} not found")
        if not ledger_id and stock_item:
            ledger_id = _resolve_ledger_for_line(db, company.id, payload.voucher_type, stock_item)
        if not ledger_id:
            # The UI used to post the round-off adjustment line with an empty
            # ledger id when the company had no "Round Off" ledger (e.g.
            # Tally-imported or pre-seed companies, incl. all demo companies),
            # and legacy recurring templates still do. Resolve the system
            # round-off ledger here so such item vouchers save instead of
            # failing with 422 — matches _get_or_create_round_off_ledger usage
            # in the balance path below. Restricted to ITEM_TYPES: no other
            # voucher shape legitimately sends an empty-ledger amount line, and
            # those must keep rejecting loudly.
            if (
                payload.voucher_type in ITEM_TYPES
                and stock_item is None
                and line.quantity is None
                and line.rate is None
                and (line.debit or line.credit)
            ):
                ledger = _get_or_create_round_off_ledger(db, company.id)
                ledger_id = ledger.id
            else:
                from fastapi import HTTPException, status
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Ledger is required for each line")

        ledger = db.get(Ledger, ledger_id)
        if not ledger or ledger.company_id != company.id:
            from fastapi import HTTPException, status
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Ledger {ledger_id} not found")

        line_total = None
        quantity = line.quantity
        rate = line.rate
        discount_amount = Decimal(str(line.discount_amount))
        discount_pct = Decimal(str(line.discount_pct))

        effective_gst_rate = None
        if line.gst_rate is not None:
            effective_gst_rate = line.gst_rate
        elif stock_item and stock_item.gst_rate is not None and stock_item.gst_rate > 0:
            effective_gst_rate = stock_item.gst_rate

        if quantity is not None and rate is not None:
            gross = Decimal(str(quantity)) * Decimal(str(rate))
            if discount_pct > 0:
                discount_amount = _round_money(gross * discount_pct / Decimal("100"))
            inclusive_total = gross - discount_amount
            if line.is_rate_inclusive and effective_gst_rate and effective_gst_rate > 0:
                gst_divisor = Decimal("1") + Decimal(str(effective_gst_rate)) / Decimal("100")
                line_total = float(_round_money(inclusive_total / gst_divisor))
            else:
                line_total = float(_round_money(inclusive_total))
            subtotal += Decimal(str(line_total))
            discount_total += discount_amount
        elif payload.voucher_type not in ITEM_TYPES:
            # Non-item vouchers (payment/receipt/contra/journal): the transaction
            # value equals ONE side of the entry — a balanced voucher has
            # Dr == Cr. Sum the debit side only so grand_total reflects the true
            # amount (TallyPrime shows a ₹1,000 payment as ₹1,000, not ₹2,000).
            # This also fixes the income/expense chart, which buckets these
            # vouchers by grand_total.
            subtotal += Decimal(str(line.debit))

        cgst_amount = None
        sgst_amount = None
        igst_amount = None
        taxable_value = None
        hsn_sac_id = line.hsn_sac_id
        if not hsn_sac_id and stock_item and stock_item.hsn_sac_code:
            from app.models.accounting import HsnSac
            hsn_rec = db.query(HsnSac).filter(
                HsnSac.company_id == company.id,
                HsnSac.code == stock_item.hsn_sac_code,
            ).first()
            if hsn_rec:
                hsn_sac_id = hsn_rec.id

        if company.is_composition:
            if effective_gst_rate is not None and effective_gst_rate > 0:
                taxable_amount = Decimal(str(line_total or line.debit or line.credit))
                taxable_value = float(taxable_amount)
                composition_taxable += taxable_amount
            elif hsn_sac_id:
                taxable_amount = Decimal(str(line_total or line.debit or line.credit))
                taxable_value = float(taxable_amount)
                composition_taxable += taxable_amount
        elif effective_gst_rate is not None and effective_gst_rate > 0:
            taxable_amount = Decimal(str(line_total or line.debit or line.credit))
            taxable_value = float(taxable_amount)
            gst_result = calculate_gst_from_rate(
                amount=taxable_amount,
                gst_rate=Decimal(str(effective_gst_rate)),
                is_inter_state=is_inter_state,
            )
            cgst_amount = float(gst_result.cgst_amount)
            sgst_amount = float(gst_result.sgst_amount)
            igst_amount = float(gst_result.igst_amount)
            tax_total += gst_result.total_tax
        elif hsn_sac_id:
            taxable_amount = Decimal(str(line_total or line.debit or line.credit))
            taxable_value = float(taxable_amount)
            gst_result = calculate_gst(
                db=db, company_id=company.id, amount=taxable_amount,
                hsn_sac_id=hsn_sac_id, is_inter_state=is_inter_state,
                is_reverse_charge=line.is_reverse_charge,
            )
            cgst_amount = float(gst_result.cgst_amount)
            sgst_amount = float(gst_result.sgst_amount)
            igst_amount = float(gst_result.igst_amount)
            tax_total += gst_result.total_tax

        debit = line.debit
        credit = line.credit

        if line_total is not None and debit == 0 and credit == 0:
            if payload.voucher_type in ("sales", "receipt", "debit_note"):
                credit = line_total
            else:
                debit = line_total

        is_item_line = line.stock_item_id is not None or (line.quantity is not None and line.rate is not None)
        if not is_item_line and ledger_id in ledger_ids_seen:
            from fastapi import HTTPException, status
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Duplicate ledger in lines")
        ledger_ids_seen.add(ledger_id)

        total_debit += Decimal(str(debit))
        total_credit += Decimal(str(credit))

        db.add(VoucherLine(
            voucher_id=voucher.id, ledger_id=ledger_id,
            stock_item_id=line.stock_item_id, quantity=quantity, rate=rate,
            discount_pct=float(discount_pct), discount_amount=float(discount_amount),
            line_total=line_total, debit=debit, credit=credit,
            taxable_value=taxable_value, hsn_sac_id=hsn_sac_id,
            is_inter_state=is_inter_state, is_reverse_charge=line.is_reverse_charge,
            is_rate_inclusive=line.is_rate_inclusive,
            cgst_amount=cgst_amount, sgst_amount=sgst_amount, igst_amount=igst_amount,
            cost_centre_id=line.cost_centre_id,
        ))

    db.flush()

    if company.is_composition and composition_taxable > 0 and payload.voucher_type in ITEM_TYPES:
        primary_gst = db.query(GstRegistration).filter(
            GstRegistration.company_id == company.id,
            GstRegistration.is_primary.is_(True),
        ).first()
        comp_rate = Decimal(str(primary_gst.composition_rate or 0)) if primary_gst else Decimal("0")
        if comp_rate > 0:
            composition_tax = (composition_taxable * comp_rate / Decimal("100")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            tax_total = composition_tax
            comp_code = "SYS_GST_COMPOSITION_TAX"
            if comp_code in gst_ledger_ids:
                lid = gst_ledger_ids[comp_code]
                is_output = payload.voucher_type == "sales"
                is_input = payload.voucher_type == "purchase"
                is_reversal_of_output = payload.voucher_type == "credit_note"
                is_reversal_of_input = payload.voucher_type == "debit_note"
                if is_output or is_reversal_of_input:
                    total_credit += composition_tax
                else:
                    total_debit += composition_tax
                db.add(VoucherLine(
                    voucher_id=voucher.id, ledger_id=lid,
                    debit=float(composition_tax) if (is_input or is_reversal_of_output) else 0,
                    credit=float(composition_tax) if (is_output or is_reversal_of_input) else 0,
                ))

    if tax_total > 0 and payload.voucher_type in ITEM_TYPES and not company.is_composition:
        is_output = payload.voucher_type == "sales"
        is_input = payload.voucher_type == "purchase"
        is_reversal_of_output = payload.voucher_type == "credit_note"
        is_reversal_of_input = payload.voucher_type == "debit_note"

        if not is_inter_state:
            cgst_val = float(sum(
                Decimal(str(l.cgst_amount or 0))
                for l in db.query(VoucherLine).filter(VoucherLine.voucher_id == voucher.id).all()
            ))
            if cgst_val > 0:
                cgst_code = "SYS_GST_OUTPUT_CGST" if (is_output or is_reversal_of_output) else "SYS_GST_INPUT_CGST"
                if cgst_code in gst_ledger_ids:
                    lid = gst_ledger_ids[cgst_code]
                    if is_output or is_reversal_of_input:
                        total_credit += Decimal(str(cgst_val))
                    else:
                        total_debit += Decimal(str(cgst_val))
                    db.add(VoucherLine(
                        voucher_id=voucher.id, ledger_id=lid,
                        debit=float(cgst_val) if (is_input or is_reversal_of_output) else 0,
                        credit=float(cgst_val) if (is_output or is_reversal_of_input) else 0,
                    ))

            sgst_val = float(sum(
                Decimal(str(l.sgst_amount or 0))
                for l in db.query(VoucherLine).filter(VoucherLine.voucher_id == voucher.id).all()
            ))
            if sgst_val > 0:
                sgst_code = "SYS_GST_OUTPUT_SGST" if (is_output or is_reversal_of_output) else "SYS_GST_INPUT_SGST"
                if sgst_code in gst_ledger_ids:
                    lid = gst_ledger_ids[sgst_code]
                    if is_output or is_reversal_of_input:
                        total_credit += Decimal(str(sgst_val))
                    else:
                        total_debit += Decimal(str(sgst_val))
                    db.add(VoucherLine(
                        voucher_id=voucher.id, ledger_id=lid,
                        debit=float(sgst_val) if (is_input or is_reversal_of_output) else 0,
                        credit=float(sgst_val) if (is_output or is_reversal_of_input) else 0,
                    ))
        else:
            igst_val = float(sum(
                Decimal(str(l.igst_amount or 0))
                for l in db.query(VoucherLine).filter(VoucherLine.voucher_id == voucher.id).all()
            ))
            if igst_val > 0:
                igst_code = "SYS_GST_OUTPUT_IGST" if (is_output or is_reversal_of_output) else "SYS_GST_INPUT_IGST"
                if igst_code in gst_ledger_ids:
                    lid = gst_ledger_ids[igst_code]
                    if is_output or is_reversal_of_input:
                        total_credit += Decimal(str(igst_val))
                    else:
                        total_debit += Decimal(str(igst_val))
                    db.add(VoucherLine(
                        voucher_id=voucher.id, ledger_id=lid,
                        debit=float(igst_val) if (is_input or is_reversal_of_output) else 0,
                        credit=float(igst_val) if (is_output or is_reversal_of_input) else 0,
                    ))

    grand_total = subtotal + tax_total
    if payload.round_off_to is not None and payload.voucher_type in ITEM_TYPES:
        # Round-off mode semantics — matches the UI footer modes:
        #   0 = Auto (nearest rupee, half-up) · 1 = Round Up · 2 = Round Down
        # The UI posts the rounded counter amount, so the voucher balances only
        # when both sides round alike; the diff is parked on the Round Off ledger.
        mode = int(payload.round_off_to)
        if mode == 0:
            rounded = grand_total.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        elif mode == 1:
            rounded = grand_total.to_integral_value(rounding=ROUND_CEILING)
        elif mode == 2:
            rounded = grand_total.to_integral_value(rounding=ROUND_FLOOR)
        else:
            # Legacy "round to nearest multiple" (e.g. 0.50, 5, 10)
            rounded = (grand_total / Decimal(str(mode))).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * Decimal(str(mode))
        diff = rounded - grand_total
        if diff != 0:
            # The UI posts the counter (party) line at the ROUNDED amount, so the
            # adjustment must land on the side that balances it: rounded UP →
            # opposite the counter; rounded DOWN → same side as the counter.
            # Counter is a credit for purchase/credit_note, a debit for
            # sales/debit_note.
            counter_is_credit = payload.voucher_type in ("purchase", "credit_note")
            round_ledger = _get_or_create_round_off_ledger(db, company.id)
            if diff > 0 and not counter_is_credit or diff < 0 and counter_is_credit:
                total_credit += abs(diff)
                db.add(VoucherLine(
                    voucher_id=voucher.id, ledger_id=round_ledger.id,
                    debit=0, credit=float(abs(diff)),
                ))
            else:
                total_debit += abs(diff)
                db.add(VoucherLine(
                    voucher_id=voucher.id, ledger_id=round_ledger.id,
                    debit=float(abs(diff)), credit=0,
                ))
            grand_total = rounded

    # Auto-balance small rounding differences (≤0.01) via round-off ledger
    imbalance = total_debit - total_credit
    if imbalance != 0 and abs(imbalance) <= Decimal("0.01"):
        round_ledger = _get_or_create_round_off_ledger(db, company.id)
        if imbalance > 0:
            total_credit += imbalance
            db.add(VoucherLine(
                voucher_id=voucher.id, ledger_id=round_ledger.id,
                debit=0, credit=float(imbalance),
            ))
        else:
            total_debit += abs(imbalance)
            db.add(VoucherLine(
                voucher_id=voucher.id, ledger_id=round_ledger.id,
                debit=float(abs(imbalance)), credit=0,
            ))

    if total_debit != total_credit:
        from fastapi import HTTPException, status
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Voucher not balanced: debits={total_debit}, credits={total_credit}",
        )

    return {
        "subtotal": float(subtotal),
        "discount_total": float(discount_total),
        "tax_total": float(tax_total),
        "grand_total": float(grand_total),
    }


def update_voucher(
    db: Session,
    company: Company,
    voucher_id: str,
    payload: VoucherCreate,
    user_id: str,
) -> Voucher:
    """Atomically replace a voucher's lines and header.

    Unlike the old API-level create-then-reparent approach, this never
    allocates a voucher number for the replacement (no sequence burn), never
    leaves a partial commit if a later step fails, and reverses the original
    stock entries before posting the replacement lines.
    """
    from app.models.stock import StockEntry

    v = db.get(Voucher, voucher_id)
    if not v or v.company_id != company.id:
        from fastapi import HTTPException, status
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Voucher not found")
    if v.status == "cancelled":
        from fastapi import HTTPException, status
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot edit cancelled voucher")
    if v.status == "reversed":
        from fastapi import HTTPException, status
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot edit a reversal voucher")

    _check_fy_closed(db, company.id, payload.voucher_date)
    _check_voucher_date_in_fy(db, company.id, payload.voucher_date)

    if payload.party_id:
        party = db.get(Party, payload.party_id)
        if not party or party.company_id != company.id:
            from fastapi import HTTPException, status
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Party not found")

    is_inter_state = _determine_is_inter_state(db, company.id, payload.place_of_supply)

    # Reverse original stock entries before replacing lines
    _reverse_stock_entries(db, company.id, v)

    # Delete old lines
    for ln in list(v.lines):
        db.delete(ln)
    db.flush()

    # Update header
    v.voucher_type = payload.voucher_type
    v.voucher_date = payload.voucher_date
    v.narration = payload.narration
    v.reference = payload.reference
    v.party_id = payload.party_id
    v.place_of_supply = payload.place_of_supply
    v.document_type = payload.document_type
    v.counterparty_gstin = payload.counterparty_gstin
    v.counterparty_state_code = payload.counterparty_state_code
    v.round_off_to = payload.round_off_to
    v.due_date = payload.due_date

    totals = _process_voucher_lines(db, v, payload, company, is_inter_state)
    v.subtotal = totals["subtotal"]
    v.discount_total = totals["discount_total"]
    v.tax_total = totals["tax_total"]
    v.grand_total = totals["grand_total"]

    # Editing keeps the voucher posted (cancelled and reversed are rejected
    # above) and re-applies the book/inventory effects for the replacement
    # lines. Setting status explicitly also normalizes any legacy draft rows.
    v.status = "posted"
    _post_voucher_effects(db, company.id, v)

    return v


def _check_duplicate_voucher(
    db: Session,
    company_id: str,
    voucher_type: str,
    voucher_date: str,
    party_id: str | None,
    line_amounts: list[tuple[str, float]],
    narration: str | None,
) -> bool:
    """Check if a duplicate voucher already exists.
    
    Duplicate criteria: same date, type, party (or no party), and matching line amounts.
    Narration is also checked if provided.
    """
    from sqlalchemy import and_, or_
    from app.models.voucher import Voucher, VoucherLine
    
    # Get candidate vouchers with same date, type, party.
    # Only posted vouchers count as duplicates — a cancelled voucher (or its
    # reversal) must never block the legitimate re-posting of the same entry.
    query = db.query(Voucher).filter(
        Voucher.company_id == company_id,
        Voucher.voucher_type == voucher_type,
        Voucher.voucher_date == voucher_date,
        Voucher.status == "posted",
    )
    
    if party_id:
        query = query.filter(Voucher.party_id == party_id)
    else:
        query = query.filter(or_(Voucher.party_id == None, Voucher.party_id == ""))
    
    if narration:
        query = query.filter(Voucher.narration == narration)
    
    candidates = query.all()
    
    # For each candidate, compare line amounts
    for voucher in candidates:
        candidate_lines = db.query(VoucherLine).filter(VoucherLine.voucher_id == voucher.id).all()
        candidate_amounts = []
        for line in candidate_lines:
            if line.debit > 0 and line.credit > 0:
                candidate_amounts.append(("D", float(line.debit)))
                candidate_amounts.append(("C", float(line.credit)))
            elif line.debit > 0:
                candidate_amounts.append(("D", float(line.debit)))
            elif line.credit > 0:
                candidate_amounts.append(("C", float(line.credit)))
        
        # Compare sorted lists
        if sorted(candidate_amounts) == sorted(line_amounts):
            return True
    
    return False


def create_voucher(
    db: Session,
    company: Company,
    payload: VoucherCreate,
    user_id: str,
) -> Voucher:
    """Create a voucher with full double-entry processing.

    Args:
        db: Database session
        company: Company context
        payload: Voucher creation payload
        user_id: ID of the user creating the voucher (or "system" for cron)
    
    Returns:
        Created Voucher with lines loaded
    """
    _check_fy_closed(db, company.id, payload.voucher_date)
    _check_voucher_date_in_fy(db, company.id, payload.voucher_date)

    if payload.party_id:
        party = db.get(Party, payload.party_id)
        if not party or party.company_id != company.id:
            from fastapi import HTTPException, status
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Party not found")

    is_inter_state = _determine_is_inter_state(db, company.id, payload.place_of_supply)
    number = _next_voucher_number(db, company.id, payload.voucher_type, payload.voucher_date)

    # Check for duplicate based on line amounts
    # Calculate the total amount (sum of positive differences)
    line_amounts = []
    for line in payload.lines:
        if line.debit > 0 and line.credit == 0:
            line_amounts.append(("D", line.debit))
        elif line.credit > 0 and line.debit == 0:
            line_amounts.append(("C", line.credit))
        elif line.debit > 0 and line.credit > 0:
            line_amounts.append(("D", line.debit))
            line_amounts.append(("C", line.credit))
    
    # Check for duplicate
    if _check_duplicate_voucher(
        db, company.id, payload.voucher_type, payload.voucher_date,
        payload.party_id, line_amounts, payload.narration
    ):
        from fastapi import HTTPException, status
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="A voucher with the same date, type, party, and amount already exists"
        )

    voucher = Voucher(
        company_id=company.id,
        voucher_type=payload.voucher_type,
        voucher_number=number,
        voucher_date=payload.voucher_date,
        narration=payload.narration,
        reference=payload.reference,
        party_id=payload.party_id,
        place_of_supply=payload.place_of_supply,
        document_type=payload.document_type,
        counterparty_gstin=payload.counterparty_gstin,
        counterparty_state_code=payload.counterparty_state_code,
        round_off_to=payload.round_off_to,
        due_date=payload.due_date,
        created_by=user_id,
    )
    db.add(voucher)
    db.flush()

    totals = _process_voucher_lines(db, voucher, payload, company, is_inter_state)

    voucher.subtotal = totals["subtotal"]
    voucher.discount_total = totals["discount_total"]
    voucher.tax_total = totals["tax_total"]
    voucher.grand_total = totals["grand_total"]


    _post_voucher_effects(db, company.id, voucher)

    db.commit()
    db.refresh(voucher)

    return db.query(Voucher).options(joinedload(Voucher.lines)).get(voucher.id)
