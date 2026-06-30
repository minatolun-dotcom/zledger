"""TDS/TCS endpoints: sections, entries, deposit, returns."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, get_current_user
from app.models.accounting import Party
from app.models.tds_tcs import TdsTcsEntry, TdsTcsReturn, TdsTcsSection
from app.models.user import Company, User
from app.models.voucher import Voucher
from app.schemas.tds_tcs import (
    TdsTcsDeposit,
    TdsTcsEntryCreate,
    TdsTcsEntryOut,
    TdsTcsReturnCreate,
    TdsTcsReturnFile,
    TdsTcsReturnOut,
    TdsTcsSectionCreate,
    TdsTcsSectionOut,
)
from app.services.tds_tcs import (
    calculate_tds_tcs,
    create_tds_tcs_entry,
    deposit_entries,
    generate_return,
    get_tds_tcs_summary,
    seed_tds_tcs_sections,
)

router = APIRouter()


# ─── Sections ──────────────────────────────────────────────────────────────


@router.post("/sections", response_model=TdsTcsSectionOut, status_code=201)
def create_section(
    payload: TdsTcsSectionCreate,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    section = TdsTcsSection(
        company_id=company.id,
        section_code=payload.section_code,
        section_name=payload.section_name,
        tds_tcs_type=payload.tds_tcs_type,
        rate=payload.rate,
        threshold_limit=payload.threshold_limit,
    )
    db.add(section)
    db.commit()
    db.refresh(section)

    return TdsTcsSectionOut(
        id=section.id,
        company_id=section.company_id,
        section_code=section.section_code,
        section_name=section.section_name,
        tds_tcs_type=section.tds_tcs_type,
        rate=float(section.rate),
        threshold_limit=float(section.threshold_limit),
        is_active=section.is_active,
        created_at=section.created_at.isoformat() if section.created_at else None,
    ).model_dump()


@router.get("/sections", response_model=list[TdsTcsSectionOut])
def list_sections(
    tds_tcs_type: str | None = None,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(TdsTcsSection).filter(TdsTcsSection.company_id == company.id)
    if tds_tcs_type:
        q = q.filter(TdsTcsSection.tds_tcs_type == tds_tcs_type)

    sections = q.order_by(TdsTcsSection.section_code).all()
    return [
        TdsTcsSectionOut(
            id=s.id,
            company_id=s.company_id,
            section_code=s.section_code,
            section_name=s.section_name,
            tds_tcs_type=s.tds_tcs_type,
            rate=float(s.rate),
            threshold_limit=float(s.threshold_limit),
            is_active=s.is_active,
            created_at=s.created_at.isoformat() if s.created_at else None,
        ).model_dump()
        for s in sections
    ]


@router.post("/sections/seed", status_code=201)
def seed_sections(
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Seed common TDS/TCS sections for the company."""
    seed_tds_tcs_sections(db, company.id)
    db.commit()
    return {"message": "Common TDS/TCS sections seeded"}


@router.delete("/sections/{section_id}", status_code=204)
def delete_section(
    section_id: str,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    section = db.get(TdsTcsSection, section_id)
    if not section or section.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Section not found")

    # Check if any entries use this section
    entry_count = db.query(TdsTcsEntry).filter(TdsTcsEntry.section_id == section_id).count()
    if entry_count > 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete: {entry_count} entries reference this section",
        )

    db.delete(section)
    db.commit()


# ─── Calculate ─────────────────────────────────────────────────────────────


@router.get("/calculate")
def calculate(
    section_id: str,
    base_amount: float = Query(..., gt=0),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Calculate TDS/TCS amount for a given section and base amount."""
    try:
        return calculate_tds_tcs(
            db,
            company_id=company.id,
            section_id=section_id,
            base_amount=base_amount,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e))


# ─── Entries ───────────────────────────────────────────────────────────────


@router.post("/entries", response_model=TdsTcsEntryOut, status_code=201)
def create_entry(
    payload: TdsTcsEntryCreate,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        entry = create_tds_tcs_entry(
            db,
            company_id=company.id,
            voucher_id=payload.voucher_id,
            party_id=payload.party_id,
            section_id=payload.section_id,
            base_amount=payload.base_amount,
            entry_date=payload.entry_date,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    db.commit()
    db.refresh(entry)

    section = db.get(TdsTcsSection, entry.section_id)
    party = db.get(Party, entry.party_id) if entry.party_id else None
    voucher = db.get(Voucher, entry.voucher_id)

    return TdsTcsEntryOut(
        id=entry.id,
        company_id=entry.company_id,
        voucher_id=entry.voucher_id,
        party_id=entry.party_id,
        section_id=entry.section_id,
        tds_tcs_type=entry.tds_tcs_type,
        base_amount=float(entry.base_amount),
        rate=float(entry.rate),
        deducted_amount=float(entry.deducted_amount),
        entry_date=entry.entry_date,
        status=entry.status,
        challan_number=entry.challan_number,
        deposition_date=entry.deposition_date,
        created_at=entry.created_at.isoformat() if entry.created_at else None,
        section_code=section.section_code if section else None,
        section_name=section.section_name if section else None,
        party_name=party.name if party else None,
        voucher_number=voucher.voucher_number if voucher else None,
    ).model_dump()


@router.get("/entries", response_model=list[TdsTcsEntryOut])
def list_entries(
    tds_tcs_type: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(TdsTcsEntry).filter(TdsTcsEntry.company_id == company.id)
    if tds_tcs_type:
        q = q.filter(TdsTcsEntry.tds_tcs_type == tds_tcs_type)
    if status_filter:
        q = q.filter(TdsTcsEntry.status == status_filter)

    entries = q.order_by(desc(TdsTcsEntry.entry_date)).all()

    result = []
    for entry in entries:
        section = db.get(TdsTcsSection, entry.section_id)
        party = db.get(Party, entry.party_id) if entry.party_id else None
        voucher = db.get(Voucher, entry.voucher_id)
        result.append(TdsTcsEntryOut(
            id=entry.id,
            company_id=entry.company_id,
            voucher_id=entry.voucher_id,
            party_id=entry.party_id,
            section_id=entry.section_id,
            tds_tcs_type=entry.tds_tcs_type,
            base_amount=float(entry.base_amount),
            rate=float(entry.rate),
            deducted_amount=float(entry.deducted_amount),
            entry_date=entry.entry_date,
            status=entry.status,
            challan_number=entry.challan_number,
            deposition_date=entry.deposition_date,
            created_at=entry.created_at.isoformat() if entry.created_at else None,
            section_code=section.section_code if section else None,
            section_name=section.section_name if section else None,
            party_name=party.name if party else None,
            voucher_number=voucher.voucher_number if voucher else None,
        ).model_dump())

    return result


# ─── Deposit ───────────────────────────────────────────────────────────────


@router.post("/deposit", response_model=list[TdsTcsEntryOut])
def deposit(
    payload: TdsTcsDeposit,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark entries as deposited with challan number and date."""
    try:
        entries = deposit_entries(
            db,
            company_id=company.id,
            entry_ids=payload.entry_ids,
            challan_number=payload.challan_number,
            deposition_date=payload.deposition_date,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    db.commit()

    result = []
    for entry in entries:
        db.refresh(entry)
        section = db.get(TdsTcsSection, entry.section_id)
        party = db.get(Party, entry.party_id) if entry.party_id else None
        voucher = db.get(Voucher, entry.voucher_id)
        result.append(TdsTcsEntryOut(
            id=entry.id,
            company_id=entry.company_id,
            voucher_id=entry.voucher_id,
            party_id=entry.party_id,
            section_id=entry.section_id,
            tds_tcs_type=entry.tds_tcs_type,
            base_amount=float(entry.base_amount),
            rate=float(entry.rate),
            deducted_amount=float(entry.deducted_amount),
            entry_date=entry.entry_date,
            status=entry.status,
            challan_number=entry.challan_number,
            deposition_date=entry.deposition_date,
            created_at=entry.created_at.isoformat() if entry.created_at else None,
            section_code=section.section_code if section else None,
            section_name=section.section_name if section else None,
            party_name=party.name if party else None,
            voucher_number=voucher.voucher_number if voucher else None,
        ).model_dump())

    return result


# ─── Returns ───────────────────────────────────────────────────────────────


@router.post("/returns", response_model=TdsTcsReturnOut, status_code=201)
def create_return(
    payload: TdsTcsReturnCreate,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        ret = generate_return(
            db,
            company_id=company.id,
            return_type=payload.return_type,
            quarter=payload.quarter,
            financial_year=payload.financial_year,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(e))

    db.commit()
    db.refresh(ret)

    return TdsTcsReturnOut(
        id=ret.id,
        company_id=ret.company_id,
        return_type=ret.return_type,
        quarter=ret.quarter,
        financial_year=ret.financial_year,
        status=ret.status,
        total_entries=ret.total_entries,
        total_amount=float(ret.total_amount),
        total_tax=float(ret.total_tax),
        filing_date=ret.filing_date,
        ack_number=ret.ack_number,
        created_at=ret.created_at.isoformat() if ret.created_at else None,
    ).model_dump()


@router.get("/returns", response_model=list[TdsTcsReturnOut])
def list_returns(
    return_type: str | None = None,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(TdsTcsReturn).filter(TdsTcsReturn.company_id == company.id)
    if return_type:
        q = q.filter(TdsTcsReturn.return_type == return_type)

    returns = q.order_by(desc(TdsTcsReturn.financial_year), desc(TdsTcsReturn.quarter)).all()

    return [
        TdsTcsReturnOut(
            id=r.id,
            company_id=r.company_id,
            return_type=r.return_type,
            quarter=r.quarter,
            financial_year=r.financial_year,
            status=r.status,
            total_entries=r.total_entries,
            total_amount=float(r.total_amount),
            total_tax=float(r.total_tax),
            filing_date=r.filing_date,
            ack_number=r.ack_number,
            created_at=r.created_at.isoformat() if r.created_at else None,
        ).model_dump()
        for r in returns
    ]


@router.patch("/returns/{return_id}/file", response_model=TdsTcsReturnOut)
def file_return(
    return_id: str,
    payload: TdsTcsReturnFile,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ret = db.get(TdsTcsReturn, return_id)
    if not ret or ret.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Return not found")
    if ret.status == "filed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Return is already filed")

    ret.status = "filed"
    ret.ack_number = payload.ack_number
    ret.filing_date = payload.filing_date
    db.commit()
    db.refresh(ret)

    return TdsTcsReturnOut(
        id=ret.id,
        company_id=ret.company_id,
        return_type=ret.return_type,
        quarter=ret.quarter,
        financial_year=ret.financial_year,
        status=ret.status,
        total_entries=ret.total_entries,
        total_amount=float(ret.total_amount),
        total_tax=float(ret.total_tax),
        filing_date=ret.filing_date,
        ack_number=ret.ack_number,
        created_at=ret.created_at.isoformat() if ret.created_at else None,
    ).model_dump()


# ─── Summary ───────────────────────────────────────────────────────────────


@router.get("/summary")
def summary(
    tds_tcs_type: str | None = None,
    company: Company = Depends(get_active_company),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_tds_tcs_summary(db, company_id=company.id, tds_tcs_type=tds_tcs_type)
