"""Day Book service: chronological voucher listing with filters.

Provides the core query engine for the Day Book report, supporting:
- All voucher types
- Chronological ordering
- Multiple filter dimensions
- Server-side pagination
- Summary computation
- Grouped-by-date output
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.accounting import Party
from app.models.user import User
from app.models.voucher import Voucher, VoucherLine
from app.utils.money import to_money


@dataclass
class DayBookFilters:
    company_id: str
    start_date: str | None = None
    end_date: str | None = None
    voucher_type: str | None = None
    party_id: str | None = None
    ledger_id: str | None = None
    created_by: str | None = None
    voucher_number: str | None = None
    narration: str | None = None
    search: str | None = None
    status: str | None = None
    min_amount: Decimal | None = None
    max_amount: Decimal | None = None


@dataclass
class DayBookEntry:
    id: str
    voucher_date: str
    voucher_number: str
    voucher_type: str
    party_name: str | None
    narration: str | None
    debit: Decimal
    credit: Decimal
    status: str
    created_by_name: str | None
    party_id: str | None
    round_off: Decimal = Decimal("0")


@dataclass
class DayBookSummary:
    total_vouchers: int
    total_debit: Decimal
    total_credit: Decimal


@dataclass
class DayBookResult:
    entries: list[DayBookEntry]
    total: int
    summary: DayBookSummary


def query_daybook(
    db: Session,
    filters: DayBookFilters,
    sort_by: str = "voucher_date",
    sort_order: str = "asc",
    page: int = 1,
    page_size: int = 50,
    group_by_date: bool = False,
) -> DayBookResult:
    """Query vouchers with aggregated debit/credit for the Day Book.

    Returns paginated, filtered, sorted voucher entries with per-voucher
    debit/credit totals and a summary of all matching vouchers.
    """
    # Base query: vouchers with aggregated line totals
    line_agg = (
        db.query(
            VoucherLine.voucher_id,
            func.coalesce(func.sum(VoucherLine.debit), Decimal("0")).label("total_debit"),
            func.coalesce(func.sum(VoucherLine.credit), Decimal("0")).label("total_credit"),
        )
        .group_by(VoucherLine.voucher_id)
        .subquery()
    )

    # We need to find the primary party-facing ledger for each voucher.
    # For sales/purchase/receipt/payment with a party_id, the party ledger is the
    # main one. For other types we show the first non-GST ledger.
    # We handle this by joining party name directly and showing first name.

    party_subq = (
        db.query(
            Party.id,
            Party.name,
        )
        .subquery()
    )

    q = db.query(
        Voucher.id,
        Voucher.voucher_date,
        Voucher.voucher_number,
        Voucher.voucher_type,
        Voucher.narration,
        Voucher.party_id,
        Voucher.status,
        Voucher.created_by,
        Voucher.grand_total,
        Voucher.subtotal,
        Voucher.tax_total,
        User.name.label("created_by_name"),
        party_subq.c.name.label("party_name"),
        line_agg.c.total_debit,
        line_agg.c.total_credit,
    ).outerjoin(
        party_subq, party_subq.c.id == Voucher.party_id
    ).outerjoin(
        User, User.id == Voucher.created_by
    ).outerjoin(
        line_agg, line_agg.c.voucher_id == Voucher.id
    ).filter(
        Voucher.company_id == filters.company_id,
    )

    # ── Apply filters ──────────────────────────────────────────────────
    if filters.start_date:
        q = q.filter(Voucher.voucher_date >= filters.start_date)
    if filters.end_date:
        q = q.filter(Voucher.voucher_date <= filters.end_date)
    if filters.voucher_type:
        q = q.filter(Voucher.voucher_type == filters.voucher_type)
    if filters.party_id:
        q = q.filter(Voucher.party_id == filters.party_id)
    if filters.created_by:
        q = q.filter(Voucher.created_by == filters.created_by)
    if filters.status:
        q = q.filter(Voucher.status == filters.status)
    if filters.min_amount is not None:
        q = q.filter(line_agg.c.total_debit >= filters.min_amount)
    if filters.max_amount is not None:
        q = q.filter(line_agg.c.total_debit <= filters.max_amount)
    if filters.voucher_number:
        q = q.filter(Voucher.voucher_number.ilike(f"%{filters.voucher_number}%"))
    if filters.narration:
        q = q.filter(Voucher.narration.ilike(f"%{filters.narration}%"))

    # Global search across voucher_number, reference, party name, narration
    if filters.search:
        search_term = f"%{filters.search}%"
        q = q.filter(
            or_(
                Voucher.voucher_number.ilike(search_term),
                Voucher.reference.ilike(search_term),
                Voucher.narration.ilike(search_term),
                party_subq.c.name.ilike(search_term),
            )
        )

    # If ledger_id filter is specified, filter vouchers that have at least
    # one line with that ledger
    if filters.ledger_id:
        ledger_voucher_ids = (
            db.query(VoucherLine.voucher_id)
            .filter(VoucherLine.ledger_id == filters.ledger_id)
            .distinct()
            .subquery()
        )
        q = q.filter(Voucher.id.in_(ledger_voucher_ids))

    # ── Count total (before pagination) ────────────────────────────────
    count_q = q.with_entities(func.count(func.distinct(Voucher.id)))
    total = count_q.scalar() or 0

    # ── Compute summary (over all matching, before pagination) ──────────
    summary_q = (
        db.query(
            func.count(func.distinct(Voucher.id)).label("total_vouchers"),
            func.coalesce(func.sum(line_agg.c.total_debit), Decimal("0")).label("total_debit"),
            func.coalesce(func.sum(line_agg.c.total_credit), Decimal("0")).label("total_credit"),
        )
        .outerjoin(line_agg, line_agg.c.voucher_id == Voucher.id)
        .filter(Voucher.company_id == filters.company_id)
    )
    if filters.start_date:
        summary_q = summary_q.filter(Voucher.voucher_date >= filters.start_date)
    if filters.end_date:
        summary_q = summary_q.filter(Voucher.voucher_date <= filters.end_date)
    if filters.voucher_type:
        summary_q = summary_q.filter(Voucher.voucher_type == filters.voucher_type)
    if filters.party_id:
        summary_q = summary_q.filter(Voucher.party_id == filters.party_id)
    if filters.created_by:
        summary_q = summary_q.filter(Voucher.created_by == filters.created_by)
    if filters.status:
        summary_q = summary_q.filter(Voucher.status == filters.status)
    if filters.min_amount is not None:
        summary_q = summary_q.filter(line_agg.c.total_debit >= filters.min_amount)
    if filters.max_amount is not None:
        summary_q = summary_q.filter(line_agg.c.total_debit <= filters.max_amount)
    if filters.voucher_number:
        summary_q = summary_q.filter(Voucher.voucher_number.ilike(f"%{filters.voucher_number}%"))
    if filters.narration:
        summary_q = summary_q.filter(Voucher.narration.ilike(f"%{filters.narration}%"))
    if filters.search:
        search_term = f"%{filters.search}%"
        summary_q = summary_q.filter(
            or_(
                Voucher.voucher_number.ilike(search_term),
                Voucher.reference.ilike(search_term),
                Voucher.narration.ilike(search_term),
                party_subq.c.name.ilike(search_term),
            )
        )
    if filters.ledger_id:
        summary_q = summary_q.filter(Voucher.id.in_(ledger_voucher_ids))

    summary_row = summary_q.first()
    summary = DayBookSummary(
        total_vouchers=summary_row.total_vouchers if summary_row else 0,
        total_debit=to_money(summary_row.total_debit) if summary_row else Decimal("0"),
        total_credit=to_money(summary_row.total_credit) if summary_row else Decimal("0"),
    )

    # ── Sorting ────────────────────────────────────────────────────────
    sort_map = {
        "voucher_date": Voucher.voucher_date,
        "voucher_number": Voucher.voucher_number,
        "voucher_type": Voucher.voucher_type,
        "amount": line_agg.c.total_debit,
    }
    sort_col = sort_map.get(sort_by, Voucher.voucher_date)
    if sort_order == "desc":
        sort_col = sort_col.desc()
    else:
        sort_col = sort_col.asc()
    q = q.order_by(sort_col)

    # For chronological default, also secondary sort by voucher number
    if sort_by == "voucher_date" or not sort_by:
        if sort_order == "desc":
            q = q.order_by(Voucher.voucher_date.desc(), Voucher.voucher_number.desc())
        else:
            q = q.order_by(Voucher.voucher_date.asc(), Voucher.voucher_number.asc())

    # ── Pagination ─────────────────────────────────────────────────────
    offset = (page - 1) * page_size
    rows = q.offset(offset).limit(page_size).all()

    entries = []
    for row in rows:
        # Round-off adjustment: grand_total − (subtotal + tax). Non-zero only
        # when the voucher was rounded (round_off_to mode or the ≤0.01
        # auto-balance path), shown as its own line in the Day Book UI.
        round_off = to_money(
            Decimal(str(row.grand_total or 0)) - Decimal(str(row.subtotal or 0)) - Decimal(str(row.tax_total or 0))
        )
        entries.append(DayBookEntry(
            id=row.id,
            voucher_date=row.voucher_date,
            voucher_number=row.voucher_number,
            voucher_type=row.voucher_type,
            party_name=row.party_name,
            narration=row.narration,
            debit=to_money(row.total_debit or 0),
            credit=to_money(row.total_credit or 0),
            status=row.status,
            created_by_name=row.created_by_name,
            party_id=row.party_id,
            round_off=round_off,
        ))

    return DayBookResult(
        entries=entries,
        total=total,
        summary=summary,
    )


def get_daybook_summary(
    db: Session,
    filters: DayBookFilters,
) -> DayBookSummary:
    """Quick summary without fetching entries (for summary cards)."""
    party_subq = (
        db.query(Party.id, Party.name).subquery()
    )
    line_agg = (
        db.query(
            VoucherLine.voucher_id,
            func.coalesce(func.sum(VoucherLine.debit), Decimal("0")).label("total_debit"),
            func.coalesce(func.sum(VoucherLine.credit), Decimal("0")).label("total_credit"),
        )
        .group_by(VoucherLine.voucher_id)
        .subquery()
    )

    q = (
        db.query(
            func.count(func.distinct(Voucher.id)).label("total_vouchers"),
            func.coalesce(func.sum(line_agg.c.total_debit), Decimal("0")).label("total_debit"),
            func.coalesce(func.sum(line_agg.c.total_credit), Decimal("0")).label("total_credit"),
        )
        .outerjoin(line_agg, line_agg.c.voucher_id == Voucher.id)
        .filter(Voucher.company_id == filters.company_id)
    )

    if filters.start_date:
        q = q.filter(Voucher.voucher_date >= filters.start_date)
    if filters.end_date:
        q = q.filter(Voucher.voucher_date <= filters.end_date)
    if filters.voucher_type:
        q = q.filter(Voucher.voucher_type == filters.voucher_type)
    if filters.status:
        q = q.filter(Voucher.status == filters.status)
    if filters.min_amount is not None:
        q = q.filter(line_agg.c.total_debit >= filters.min_amount)
    if filters.max_amount is not None:
        q = q.filter(line_agg.c.total_debit <= filters.max_amount)
    if filters.search:
        search_term = f"%{filters.search}%"
        q = q.outerjoin(party_subq, party_subq.c.id == Voucher.party_id).filter(
            or_(
                Voucher.voucher_number.ilike(search_term),
                Voucher.narration.ilike(search_term),
                party_subq.c.name.ilike(search_term),
            )
        )

    row = q.first()
    return DayBookSummary(
        total_vouchers=row.total_vouchers if row else 0,
        total_debit=to_money(row.total_debit) if row else Decimal("0"),
        total_credit=to_money(row.total_credit) if row else Decimal("0"),
    )
