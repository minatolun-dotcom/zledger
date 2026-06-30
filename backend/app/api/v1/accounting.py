"""Chart of Accounts endpoints: groups, ledgers, financial years, parties."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company
from app.models.accounting import AccountGroup, FinancialYear, Ledger, Party
from app.models.user import Company
from app.schemas.accounting import (
    AccountGroupCreate,
    AccountGroupOut,
    FinancialYearCreate,
    FinancialYearOut,
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
    fy = FinancialYear(company_id=company.id, **payload.model_dump())
    db.add(fy)
    db.commit()
    db.refresh(fy)
    return fy


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
):
    return db.query(Ledger).filter(
        Ledger.company_id == company.id
    ).order_by(Ledger.name).all()


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
