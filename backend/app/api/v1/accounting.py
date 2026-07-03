"""Chart of Accounts endpoints: groups, ledgers, financial years, parties."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user
from app.models.accounting import AccountGroup, FinancialYear, Ledger, Party
from app.models.user import Company, User
from app.models.voucher import Voucher, VoucherLine
from app.schemas.accounting import (
    AccountGroupCreate,
    AccountGroupOut,
    FinancialYearCreate,
    FinancialYearOut,
    FinancialYearUpdate,
    LedgerCreate,
    LedgerOut,
    PartyCreate,
    PartyOut,
)

router = APIRouter()


# ── Financial Years ──────────────────────────────────────────────────────

@router.get("/financial-years", response_model=list[FinancialYearOut])
def list_fy(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    return db.query(FinancialYear).filter(
        FinancialYear.company_id == company.id
    ).order_by(FinancialYear.start_date).all()


@router.post("/financial-years", response_model=FinancialYearOut, status_code=201)
def create_fy(
    payload: FinancialYearCreate,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    # Reject overlapping date ranges
    overlap = db.query(FinancialYear).filter(
        FinancialYear.company_id == company.id,
        FinancialYear.start_date <= payload.end_date,
        FinancialYear.end_date >= payload.start_date,
    ).first()
    if overlap:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Date range overlaps with existing FY '{overlap.name}' ({overlap.start_date} to {overlap.end_date})",
        )
    fy = FinancialYear(company_id=company.id, **payload.model_dump())
    db.add(fy)
    db.commit()
    db.refresh(fy)
    return fy


@router.patch("/financial-years/{fy_id}/close", response_model=FinancialYearOut)
def close_financial_year(
    fy_id: str,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from decimal import Decimal
    """Toggle is_closed for a financial year. When closing, if a next FY exists,
    create an opening balance journal carrying forward balance sheet ledger balances."""
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    if not fy.is_closed:
        # Closing the FY
        fy.is_closed = True
        db.flush()

        # Find next FY
        next_fy = db.query(FinancialYear).filter(
            FinancialYear.company_id == company.id,
            FinancialYear.start_date > fy.end_date,
        ).order_by(FinancialYear.start_date).first()

        if next_fy:
            # Compute closing balances for all ledgers at FY end
            from app.services.reports import get_ledger_balances
            balances = get_ledger_balances(db, company.id, fy.start_date, fy.end_date)

            # Filter to balance sheet ledgers (assets, liabilities, capital)
            bs_ledgers = [b for b in balances if b.group_nature in ("assets", "liabilities", "capital")]

            # Check if opening journal already exists for next FY
            existing = db.query(Voucher).filter(
                Voucher.company_id == company.id,
                Voucher.narration == f"Opening balance for FY {next_fy.name}",
            ).first()

            if not existing and bs_ledgers:
                total_debit = Decimal("0")
                total_credit = Decimal("0")

                # Create opening balance journal in the next FY's first day
                v = Voucher(
                    company_id=company.id,
                    voucher_type="journal",
                    voucher_number=f"OPEN-{next_fy.name}",
                    voucher_date=next_fy.start_date,
                    narration=f"Opening balance for FY {next_fy.name}",
                    created_by=user.id,
                    subtotal=0,
                    grand_total=0,
                )
                db.add(v)
                db.flush()

                for lb in balances:
                    if lb.closing_balance == 0:
                        continue
                    if lb.group_nature not in ("assets", "liabilities", "capital"):
                        continue
                    amt = float(lb.closing_balance)
                    if lb.closing_balance_type == "Dr":
                        db.add(VoucherLine(voucher_id=v.id, ledger_id=lb.ledger_id, debit=amt, credit=0))
                        total_debit += Decimal(str(amt))
                    else:
                        db.add(VoucherLine(voucher_id=v.id, ledger_id=lb.ledger_id, debit=0, credit=amt))
                        total_credit += Decimal(str(amt))

                # Use Opening Balance Equity as counter-ledger
                ob_equity = db.query(Ledger).filter(
                    Ledger.company_id == company.id,
                    Ledger.system_code == "SYS_OPENING_BALANCE_EQUITY",
                ).first()
                if not ob_equity:
                    ob_group = db.query(AccountGroup).filter(
                        AccountGroup.company_id == company.id,
                        AccountGroup.system_code == "GRP_OPENING_BALANCE_EQUITY",
                    ).first()
                    if ob_group:
                        ob_equity = Ledger(
                            company_id=company.id,
                            name="Opening Balance Equity",
                            system_code="SYS_OPENING_BALANCE_EQUITY",
                            group_id=ob_group.id,
                            opening_balance=0,
                            opening_balance_type="Cr",
                            is_active=True,
                            is_protected=True,
                        )
                        db.add(ob_equity)
                        db.flush()

                if ob_equity and total_debit != total_credit:
                    diff = float(total_debit - total_credit)
                    if diff > 0:
                        db.add(VoucherLine(voucher_id=v.id, ledger_id=ob_equity.id, debit=0, credit=diff))
                    else:
                        db.add(VoucherLine(voucher_id=v.id, ledger_id=ob_equity.id, debit=abs(diff), credit=0))

                v.subtotal = float(max(total_debit, total_credit))
                v.grand_total = float(max(total_debit, total_credit))

                from app.services.audit import log_action, serialize_voucher
                db.flush()
                full_v = db.query(Voucher).filter(Voucher.id == v.id).first()
                log_action(
                    db, company_id=company.id, user_id=user.id,
                    action="CREATE", entity_type="voucher", entity_id=v.id,
                    new_value=serialize_voucher(full_v) if hasattr(serialize_voucher, '__call__') else {},
                    description=f"Auto-generated opening balance for FY {next_fy.name}",
                )
    else:
        fy.is_closed = False

    db.commit()
    db.refresh(fy)
    return fy


@router.patch("/financial-years/{fy_id}", response_model=FinancialYearOut)
def update_financial_year(
    fy_id: str,
    payload: FinancialYearUpdate,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    update_data = payload.model_dump(exclude_unset=True)

    if "start_date" in update_data or "end_date" in update_data:
        new_start = update_data.get("start_date", fy.start_date)
        new_end = update_data.get("end_date", fy.end_date)
        # Revalidate overlap (exclude self)
        overlap = db.query(FinancialYear).filter(
            FinancialYear.company_id == company.id,
            FinancialYear.id != fy_id,
            FinancialYear.start_date <= new_end,
            FinancialYear.end_date >= new_start,
        ).first()
        if overlap:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"Date range overlaps with existing FY '{overlap.name}' ({overlap.start_date} to {overlap.end_date})",
            )

    for k, v in update_data.items():
        setattr(fy, k, v)
    db.commit()
    db.refresh(fy)
    return fy


@router.delete("/financial-years/{fy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_financial_year(
    fy_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    # Block deletion if vouchers exist in this FY
    voucher_count = db.query(Voucher).filter(
        Voucher.company_id == company.id,
        Voucher.voucher_date >= fy.start_date,
        Voucher.voucher_date <= fy.end_date,
    ).count()
    if voucher_count > 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete '{fy.name}': {voucher_count} voucher(s) exist in this period. Close the FY instead.",
        )

    db.delete(fy)
    db.commit()


# ── Account Groups ───────────────────────────────────────────────────────

@router.get("/groups", response_model=list[AccountGroupOut])
def list_groups(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    return db.query(AccountGroup).filter(
        AccountGroup.company_id == company.id
    ).order_by(AccountGroup.nature, AccountGroup.name).all()


@router.post("/groups", response_model=AccountGroupOut, status_code=201)
def create_group(
    payload: AccountGroupCreate,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    ag = AccountGroup(company_id=company.id, **payload.model_dump())
    db.add(ag)
    db.commit()
    db.refresh(ag)
    return ag


@router.patch("/groups/{group_id}", response_model=AccountGroupOut)
def update_group(
    group_id: str,
    payload: AccountGroupCreate,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    ag = db.get(AccountGroup, group_id)
    if not ag or ag.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Group not found")
    if ag.is_system:
        # System groups: allow renaming display name only
        ag.name = payload.name
    else:
        for k, v in payload.model_dump(exclude_unset=True).items():
            setattr(ag, k, v)
    db.commit()
    db.refresh(ag)
    return ag


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(
    group_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    ag = db.get(AccountGroup, group_id)
    if not ag or ag.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Group not found")
    if ag.is_system:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot delete system group")
    child_count = db.query(AccountGroup).filter(AccountGroup.parent_id == group_id).count()
    if child_count > 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot delete group with sub-groups")
    ledger_count = db.query(Ledger).filter(Ledger.group_id == group_id).count()
    if ledger_count > 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot delete group with ledgers")
    db.delete(ag)
    db.commit()


# ── Ledgers ──────────────────────────────────────────────────────────────

@router.get("/ledgers", response_model=list[LedgerOut])
def list_ledgers(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
    group_code: str | None = None,
):
    q = db.query(Ledger).filter(Ledger.company_id == company.id)
    if group_code:
        q = q.join(Ledger.group).filter(AccountGroup.system_code == group_code)
    return q.order_by(Ledger.name).all()


@router.post("/ledgers", response_model=LedgerOut, status_code=201)
def create_ledger(
    payload: LedgerCreate,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    group = db.get(AccountGroup, payload.group_id)
    if not group or group.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Group not found")
    ledger = Ledger(company_id=company.id, **payload.model_dump())
    db.add(ledger)
    db.commit()
    db.refresh(ledger)
    return ledger


@router.patch("/ledgers/{ledger_id}", response_model=LedgerOut)
def update_ledger(
    ledger_id: str,
    payload: LedgerCreate,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    ledger = db.get(Ledger, ledger_id)
    if not ledger or ledger.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Ledger not found")
    if ledger.is_protected:
        # Protected ledgers: allow opening balance and alias changes only
        ledger.opening_balance = payload.opening_balance
        ledger.opening_balance_type = payload.opening_balance_type
        ledger.alias = payload.alias
    else:
        for k, v in payload.model_dump(exclude_unset=True).items():
            setattr(ledger, k, v)
    db.commit()
    db.refresh(ledger)
    return ledger


@router.delete("/ledgers/{ledger_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ledger(
    ledger_id: str,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    ledger = db.get(Ledger, ledger_id)
    if not ledger or ledger.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Ledger not found")
    if ledger.is_protected:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot delete system ledger")
    from sqlalchemy import select as sa_select
    from app.models.voucher import VoucherLine
    used = db.scalar(
        sa_select(VoucherLine).where(VoucherLine.ledger_id == ledger_id).limit(1)
    )
    if used:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot delete ledger used in vouchers")
    db.delete(ledger)
    db.commit()


# ── Parties ──────────────────────────────────────────────────────────────

@router.get("/parties", response_model=list[PartyOut])
def list_parties(
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    return db.query(Party).filter(
        Party.company_id == company.id
    ).order_by(Party.name).all()


@router.post("/parties", response_model=PartyOut, status_code=201)
def create_party(
    payload: PartyCreate,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    party = Party(company_id=company.id, **payload.model_dump())
    db.add(party)
    db.commit()
    db.refresh(party)
    return party


@router.patch("/parties/{party_id}", response_model=PartyOut)
def update_party(
    party_id: str,
    payload: PartyCreate,
    company: Company = Depends(get_active_company),
    db: Session = Depends(get_db),
):
    party = db.get(Party, party_id)
    if not party or party.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Party not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(party, k, v)
    db.commit()
    db.refresh(party)
    return party
