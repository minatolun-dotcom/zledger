"""Voucher service: core voucher creation logic extracted from API layer."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.accounting import AccountGroup, FinancialYear, GstRegistration, Ledger, Party
from app.models.stock import StockEntry, StockItem
from app.models.user import Company, User
from app.models.voucher import Voucher, VoucherLine
from app.models.voucher_numbering import VoucherNumbering
from app.schemas.voucher import VoucherCreate
from app.services.gst import calculate_gst, calculate_gst_from_rate, get_gst_ledger_ids
from app.services.stock_valuation import update_stock_balance_weighted_avg


ITEM_TYPES = frozenset({"sales", "purchase", "credit_note", "debit_note"})


def _check_fy_closed(db: Session, company_id: str, voucher_date: str) -> None:
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


def _get_fy_year(company: Company | None, today: date | None = None) -> str:
    """Return 4-digit FY year string (e.g. '2026' for FY 2026-27 starting April 2026)."""
    if today is None:
        today = date.today()
    fy_start_month = 4  # Default April
    if today.month >= fy_start_month:
        return str(today.year)
    return str(today.year - 1)


def _next_voucher_number(db: Session, company_id: str, voucher_type: str) -> str:
    import re

    numbering = db.query(VoucherNumbering).filter(
        VoucherNumbering.company_id == company_id,
        VoucherNumbering.voucher_type == voucher_type,
    ).with_for_update().first()

    if numbering:
        company = db.get(Company, company_id)
        fy_year = _get_fy_year(company)
        prefix = numbering.prefix
        fy_prefix = f"{prefix}-{fy_year}"

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
    if voucher.voucher_type not in ("sales", "purchase"):
        return
    lines = db.query(VoucherLine).filter(VoucherLine.voucher_id == voucher.id).all()
    for vl in lines:
        if vl.stock_item_id and vl.quantity:
            entry_type = "outward" if voucher.voucher_type == "sales" else "inward"
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


def _round_money(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("0.01"))


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
                line_total = float(inclusive_total)
            subtotal += Decimal(str(line_total))
            discount_total += discount_amount
        elif payload.voucher_type not in ITEM_TYPES:
            if line.debit > 0:
                subtotal += Decimal(str(line.debit))
            elif line.credit > 0:
                subtotal += Decimal(str(line.credit))

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
            if payload.voucher_type in ("sales", "receipt"):
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
                is_input = payload.voucher_type in ("purchase", "debit_note")
                is_reversal = payload.voucher_type == "credit_note"
                if is_output:
                    total_credit += composition_tax
                elif is_input or is_reversal:
                    total_debit += composition_tax
                db.add(VoucherLine(
                    voucher_id=voucher.id, ledger_id=lid,
                    debit=float(composition_tax) if (is_input or is_reversal) else 0,
                    credit=float(composition_tax) if is_output else 0,
                ))

    if tax_total > 0 and payload.voucher_type in ITEM_TYPES and not company.is_composition:
        is_output = payload.voucher_type == "sales"
        is_input = payload.voucher_type in ("purchase", "debit_note")
        is_reversal = payload.voucher_type == "credit_note"

        if not is_inter_state:
            cgst_val = float(sum(
                Decimal(str(l.cgst_amount or 0))
                for l in db.query(VoucherLine).filter(VoucherLine.voucher_id == voucher.id).all()
            ))
            if cgst_val > 0:
                cgst_code = "SYS_GST_OUTPUT_CGST" if (is_output or is_reversal) else "SYS_GST_INPUT_CGST"
                if cgst_code in gst_ledger_ids:
                    lid = gst_ledger_ids[cgst_code]
                    if is_output:
                        total_credit += Decimal(str(cgst_val))
                    elif is_input or is_reversal:
                        total_debit += Decimal(str(cgst_val))
                    db.add(VoucherLine(
                        voucher_id=voucher.id, ledger_id=lid,
                        debit=float(cgst_val) if (is_input or is_reversal) else 0,
                        credit=float(cgst_val) if is_output else 0,
                    ))

            sgst_val = float(sum(
                Decimal(str(l.sgst_amount or 0))
                for l in db.query(VoucherLine).filter(VoucherLine.voucher_id == voucher.id).all()
            ))
            if sgst_val > 0:
                sgst_code = "SYS_GST_OUTPUT_SGST" if (is_output or is_reversal) else "SYS_GST_INPUT_SGST"
                if sgst_code in gst_ledger_ids:
                    lid = gst_ledger_ids[sgst_code]
                    if is_output:
                        total_credit += Decimal(str(sgst_val))
                    elif is_input or is_reversal:
                        total_debit += Decimal(str(sgst_val))
                    db.add(VoucherLine(
                        voucher_id=voucher.id, ledger_id=lid,
                        debit=float(sgst_val) if (is_input or is_reversal) else 0,
                        credit=float(sgst_val) if is_output else 0,
                    ))
        else:
            igst_val = float(sum(
                Decimal(str(l.igst_amount or 0))
                for l in db.query(VoucherLine).filter(VoucherLine.voucher_id == voucher.id).all()
            ))
            if igst_val > 0:
                igst_code = "SYS_GST_OUTPUT_IGST" if (is_output or is_reversal) else "SYS_GST_INPUT_IGST"
                if igst_code in gst_ledger_ids:
                    lid = gst_ledger_ids[igst_code]
                    if is_output:
                        total_credit += Decimal(str(igst_val))
                    elif is_input or is_reversal:
                        total_debit += Decimal(str(igst_val))
                    db.add(VoucherLine(
                        voucher_id=voucher.id, ledger_id=lid,
                        debit=float(igst_val) if (is_input or is_reversal) else 0,
                        credit=float(igst_val) if is_output else 0,
                    ))

    grand_total = subtotal + tax_total
    if payload.round_off_to and payload.round_off_to > 0 and payload.voucher_type in ITEM_TYPES:
        round_off_to = Decimal(str(payload.round_off_to))
        rounded = (grand_total / round_off_to).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * round_off_to
        diff = rounded - grand_total
        if diff != 0:
            round_ledger = _get_or_create_round_off_ledger(db, company.id)
            if diff > 0:
                total_credit += diff
                db.add(VoucherLine(
                    voucher_id=voucher.id, ledger_id=round_ledger.id,
                    debit=0, credit=float(diff),
                ))
            else:
                total_debit += abs(diff)
                db.add(VoucherLine(
                    voucher_id=voucher.id, ledger_id=round_ledger.id,
                    debit=float(abs(diff)), credit=0,
                ))
            grand_total = rounded

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
    
    # Get candidate vouchers with same date, type, party
    query = db.query(Voucher).filter(
        Voucher.company_id == company_id,
        Voucher.voucher_type == voucher_type,
        Voucher.voucher_date == voucher_date,
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

    if payload.party_id:
        party = db.get(Party, payload.party_id)
        if not party or party.company_id != company.id:
            from fastapi import HTTPException, status
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Party not found")

    is_inter_state = _determine_is_inter_state(db, company.id, payload.place_of_supply)
    number = _next_voucher_number(db, company.id, payload.voucher_type)

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

    db.flush()
    _create_stock_entries(db, company.id, voucher)

    db.commit()
    db.refresh(voucher)

    return db.query(Voucher).options(joinedload(Voucher.lines)).get(voucher.id)
