"""Chart of Accounts endpoints: groups, ledgers, financial years, parties."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select as sa_select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import (
    get_active_company,
    get_current_user,
    pagination_params,
    Pagination,
    Permission,
    require_permission,
    require_role,
)
from app.models.accounting import AccountGroup, FinancialYear, Ledger, Party
from app.models.bill_reference import BillReference
from app.models.tds_tcs import TdsTcsCertificate, TdsTcsEntry
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
from app.schemas.member import CompanyRole
from app.schemas.common import BulkActionResult, BulkDeleteRequest
from app.services.audit import log_action, serialize_entity

router = APIRouter()


# ── Financial Years ──────────────────────────────────────────────────────

@router.get("/financial-years", response_model=list[FinancialYearOut])
def list_fy(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    search: str | None = Query(default=None),
    pagination: Pagination = Depends(pagination_params),
    response: Response = None,
):
    q = db.query(FinancialYear).filter(FinancialYear.company_id == company.id)
    if search:
        search_term = f"%{search}%"
        q = q.filter(FinancialYear.name.ilike(search_term))
    total = q.count()
    items = pagination.apply(q.order_by(FinancialYear.start_date)).all()
    if response is not None and pagination.limit is not None:
        response.headers.update(pagination.header(total))
    return items


@router.post("/financial-years", response_model=FinancialYearOut, status_code=201)
def create_fy(
    payload: FinancialYearCreate,
    company: Company = Depends(require_permission(Permission.MANAGE_FINANCIAL_YEARS)),
    user: User = Depends(get_current_user),
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
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="CREATE", entity_type="financial_year", entity_id=fy.id,
        new_value=serialize_entity(fy),
        description=f"Created financial year {fy.name}",
    )
    # Audit entry must survive the request — commit it (audit round 12: the
    # entry used to be rolled back at session close).
    db.commit()
    return fy


@router.patch("/financial-years/{fy_id}/close", response_model=FinancialYearOut)
def close_financial_year(
    fy_id: str,
    company: Company = Depends(require_permission(Permission.MANAGE_FINANCIAL_YEARS)),
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
    company: Company = Depends(require_permission(Permission.MANAGE_FINANCIAL_YEARS)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    old_value = serialize_entity(fy)
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
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="UPDATE", entity_type="financial_year", entity_id=fy.id,
        old_value=old_value, new_value=serialize_entity(fy),
        description=f"Updated financial year {fy.name}",
    )
    db.commit()
    return fy


@router.delete("/financial-years/{fy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_financial_year(
    fy_id: str,
    company: Company = Depends(require_permission(Permission.MANAGE_FINANCIAL_YEARS)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Financial year not found")

    if fy.is_closed:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete '{fy.name}': it is closed. Re-open it first.",
        )

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

    old_value = serialize_entity(fy)
    fy_name = fy.name
    db.delete(fy)
    db.commit()
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="DELETE", entity_type="financial_year", entity_id=fy_id,
        old_value=old_value,
        description=f"Deleted financial year {fy_name}",
    )
    db.commit()


# ── Account Groups ───────────────────────────────────────────────────────

@router.get("/groups", response_model=list[AccountGroupOut])
def list_groups(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    search: str | None = Query(default=None),
    pagination: Pagination = Depends(pagination_params),
    response: Response = None,
):
    q = db.query(AccountGroup).filter(AccountGroup.company_id == company.id)
    if search:
        search_term = f"%{search}%"
        q = q.filter(AccountGroup.name.ilike(search_term))
    total = q.count()
    items = pagination.apply(q.order_by(AccountGroup.nature, AccountGroup.name)).all()
    if response is not None and pagination.limit is not None:
        response.headers.update(pagination.header(total))
    return items


@router.get("/groups/{group_id}", response_model=AccountGroupOut)
def get_group(
    group_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    ag = db.get(AccountGroup, group_id)
    if not ag or ag.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Group not found")
    return ag


@router.post("/groups", response_model=AccountGroupOut, status_code=201)
def create_group(
    payload: AccountGroupCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = payload.model_dump()
    created_from = data.pop("created_from", None)
    # Inherit nature from parent group when not explicitly provided
    if not data.get("nature") and data.get("parent_id"):
        parent = db.get(AccountGroup, data["parent_id"])
        if parent:
            data["nature"] = parent.nature
    if not data.get("nature"):
        data["nature"] = "assets"
    ag = AccountGroup(company_id=company.id, **data)
    db.add(ag)
    db.commit()
    db.refresh(ag)
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="CREATE", entity_type="account_group", entity_id=ag.id,
        new_value=serialize_entity(ag),
        description=f"Created account group {ag.name}" + (f" (from: {created_from})" if created_from else ""),
    )
    db.commit()
    return ag


@router.patch("/groups/{group_id}", response_model=AccountGroupOut)
def update_group(
    group_id: str,
    payload: AccountGroupCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ag = db.get(AccountGroup, group_id)
    if not ag or ag.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Group not found")
    old_value = serialize_entity(ag)
    if ag.is_system:
        # System groups: allow renaming display name only
        ag.name = payload.name
    else:
        for k, v in payload.model_dump(exclude_unset=True).items():
            setattr(ag, k, v)
    db.commit()
    db.refresh(ag)
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="UPDATE", entity_type="account_group", entity_id=ag.id,
        old_value=old_value, new_value=serialize_entity(ag),
        description=f"Updated account group {ag.name}",
    )
    db.commit()
    return ag


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(
    group_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
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
    old_value = serialize_entity(ag)
    ag_name = ag.name
    db.delete(ag)
    db.commit()
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="DELETE", entity_type="account_group", entity_id=group_id,
        old_value=old_value,
        description=f"Deleted account group {ag_name}",
    )
    db.commit()


# ── Ledgers ──────────────────────────────────────────────────────────────

from app.services.reports import get_ledger_balances


@router.get("/ledgers", response_model=list[LedgerOut])
def list_ledgers(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    group_code: str | None = None,
    search: str | None = Query(default=None),
    financial_year_id: str | None = Query(default=None),
    pagination: Pagination = Depends(pagination_params),
    response: Response = None,
):
    q = db.query(Ledger).filter(Ledger.company_id == company.id)
    if group_code:
        q = q.join(Ledger.group).filter(AccountGroup.system_code == group_code)
    if search:
        search_term = f"%{search}%"
        q = q.filter(Ledger.name.ilike(search_term))
    total = q.count()
    items = pagination.apply(q.order_by(Ledger.name)).all()

    # Compute closing balances for the active FY if provided
    balance_map: dict[str, tuple[float, str]] = {}
    if financial_year_id:
        fy = db.get(FinancialYear, financial_year_id)
        if fy and fy.company_id == company.id:
            for lb in get_ledger_balances(db, company.id, str(fy.start_date), str(fy.end_date)):
                balance_map[lb.ledger_id] = (float(lb.closing_balance), lb.closing_balance_type)

    result = []
    for item in items:
        cb, cb_type = balance_map.get(item.id, (0.0, "Dr"))
        result.append({
            "id": item.id,
            "name": item.name,
            "system_code": item.system_code,
            "group_id": item.group_id,
            "opening_balance": float(item.opening_balance),
            "opening_balance_type": item.opening_balance_type,
            "closing_balance": cb,
            "closing_balance_type": cb_type,
            "gstin": item.gstin,
            "alias": item.alias,
            "bank_name": item.bank_name,
            "bank_account_number": item.bank_account_number,
            "bank_ifsc": item.bank_ifsc,
            "bank_branch": item.bank_branch,
            "is_active": item.is_active,
            "is_protected": item.is_protected,
        })

    if response is not None and pagination.limit is not None:
        response.headers.update(pagination.header(total))
    return result


@router.get("/ledgers/{ledger_id}", response_model=LedgerOut)
def get_ledger(
    ledger_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    ledger = db.get(Ledger, ledger_id)
    if not ledger or ledger.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Ledger not found")
    return ledger


@router.post("/ledgers", response_model=LedgerOut, status_code=201)
def create_ledger(
    payload: LedgerCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = db.get(AccountGroup, payload.group_id)
    if not group or group.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Group not found")
    ledger = Ledger(company_id=company.id, **payload.model_dump(exclude={"created_from"}))
    db.add(ledger)
    db.commit()
    db.refresh(ledger)
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="CREATE", entity_type="ledger", entity_id=ledger.id,
        new_value=serialize_entity(ledger),
        description=f"Created ledger {ledger.name}" + (f" (from: {payload.created_from})" if payload.created_from else ""),
    )
    db.commit()
    # Tally-prime: a ledger created under Trade Receivables/Payables IS a party
    # account. Auto-create the linked Party (with the ledger's GSTIN) so bill-wise
    # tracking, party statements, GSTIN/state capture and e-invoice counterparty
    # work immediately — the sales/purchase voucher quick-create and the COA page
    # both flow through here (round 17).
    _maybe_autocreate_party_for_ledger(db, company.id, ledger, user.id)
    db.commit()
    return ledger


@router.patch("/ledgers/{ledger_id}", response_model=LedgerOut)
def update_ledger(
    ledger_id: str,
    payload: LedgerCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ledger = db.get(Ledger, ledger_id)
    if not ledger or ledger.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Ledger not found")
    old_value = serialize_entity(ledger)
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
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="UPDATE", entity_type="ledger", entity_id=ledger.id,
        old_value=old_value, new_value=serialize_entity(ledger),
        description=f"Updated ledger {ledger.name}",
    )
    db.commit()
    return ledger


@router.delete("/ledgers/{ledger_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ledger(
    ledger_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ledger = db.get(Ledger, ledger_id)
    if not ledger or ledger.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Ledger not found")
    if ledger.is_protected:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot delete system ledger")
    used = db.scalar(
        sa_select(VoucherLine).where(VoucherLine.ledger_id == ledger_id).limit(1)
    )
    if used:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot delete ledger used in vouchers")
    # A party's account ledger must survive too — deleting it would SET NULL
    # the party's ledger link (parties.ledger_id), silently orphaning the
    # party: it would no longer resolve from the voucher party selector and
    # lose its account. Block until the party is unlinked.
    linked_party = db.query(Party).filter(Party.ledger_id == ledger_id).first()
    if linked_party:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete ledger linked to party '{linked_party.name}'. Unlink the party from this ledger first.",
        )
    old_value = serialize_entity(ledger)
    ledger_name = ledger.name
    db.delete(ledger)
    db.commit()
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="DELETE", entity_type="ledger", entity_id=ledger_id,
        old_value=old_value,
        description=f"Deleted ledger {ledger_name}",
    )
    db.commit()


@router.post("/ledgers/bulk-delete", response_model=BulkActionResult)
def bulk_delete_ledgers(
    payload: BulkDeleteRequest,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    processed = 0
    errors: list[str] = []
    for lid in payload.ids:
        ledger = db.get(Ledger, lid)
        if not ledger or ledger.company_id != company.id:
            errors.append(f"Ledger {lid} not found")
            continue
        if ledger.is_protected:
            errors.append(f"Cannot delete system ledger '{ledger.name}'")
            continue
        used = db.scalar(
            sa_select(VoucherLine).where(VoucherLine.ledger_id == lid).limit(1)
        )
        if used:
            errors.append(f"Cannot delete '{ledger.name}' — used in vouchers")
            continue
        linked_party = db.query(Party).filter(Party.ledger_id == lid).first()
        if linked_party:
            errors.append(f"Cannot delete '{ledger.name}' — linked to party '{linked_party.name}'")
            continue
        db.delete(ledger)
        processed += 1
    db.commit()
    return BulkActionResult(processed=processed, errors=errors)


# ── Parties ──────────────────────────────────────────────────────────────

@router.get("/parties", response_model=list[PartyOut])
def list_parties(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    search: str | None = Query(default=None),
    pagination: Pagination = Depends(pagination_params),
    response: Response = None,
):
    q = db.query(Party).filter(Party.company_id == company.id)
    if search:
        search_term = f"%{search}%"
        q = q.filter(Party.name.ilike(search_term))
    total = q.count()
    items = pagination.apply(q.order_by(Party.name)).all()
    if response is not None and pagination.limit is not None:
        response.headers.update(pagination.header(total))

    # Outstanding per party (open/partial bills) in one grouped query, so the
    # list can show exposure vs credit limit without an N+1.
    if items:
        party_ids = [p.id for p in items]
        rows = db.execute(
            sa_select(
                BillReference.party_id,
                func.coalesce(func.sum(BillReference.outstanding_amount), 0),
            ).where(
                BillReference.company_id == company.id,
                BillReference.party_id.in_(party_ids),
                BillReference.status.in_(["open", "partial"]),
            ).group_by(BillReference.party_id)
        ).all()
        outstanding = {pid: float(amt) for pid, amt in rows}
        for p in items:
            p.outstanding_amount = outstanding.get(p.id, 0.0)
    return items


@router.get("/parties/{party_id}", response_model=PartyOut)
def get_party(
    party_id: str,
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    party = db.get(Party, party_id)
    if not party or party.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Party not found")
    return party


@router.post("/parties", response_model=PartyOut, status_code=201)
def create_party(
    payload: PartyCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Auto-create and link a ledger for the party when none was supplied, so the
    # party can be used directly in vouchers (double-entry needs a ledger).
    ledger_id = payload.ledger_id
    if not ledger_id:
        group = (
            db.query(AccountGroup)
            .filter(AccountGroup.company_id == company.id,
                    AccountGroup.name == _party_ledger_group(payload.party_type))
            .first()
        )
        if not group:
            # Partial COA (e.g. Tally-imported company without the standard
            # groups): create the receivables/payables group on demand instead
            # of silently producing a ledger-less party that voucher forms can
            # never select.
            group = _ensure_party_group(db, company.id, payload.party_type)
        # Reuse a same-named ledger only when it is unowned; a ledger already
        # linked to another party must never be shared (rename/reclassification
        # of one party would silently change the other's account).
        existing = (
            db.query(Ledger)
            .filter(Ledger.company_id == company.id, Ledger.name == payload.name)
            .first()
        )
        if existing and not db.query(Party).filter(Party.ledger_id == existing.id).first():
            ledger_id = existing.id
        else:
            # The opening balance from the party master goes onto the
            # auto-created account ledger (Tally: opening balance is a party
            # master property). An existing same-named ledger or a supplied
            # ledger is never touched — it may already carry balances.
            ob_type = payload.opening_balance_type or "Dr"
            if ob_type not in ("Dr", "Cr"):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="opening_balance_type must be 'Dr' or 'Cr'")
            ledger = Ledger(
                company_id=company.id,
                name=payload.name,
                group_id=group.id,
                opening_balance=payload.opening_balance or 0,
                opening_balance_type=ob_type,
                is_active=True,
            )
            db.add(ledger)
            db.flush()
            ledger_id = ledger.id
    else:
        # A caller-supplied ledger must exist and belong to THIS company — a
        # foreign or bogus ledger_id would otherwise link the party to another
        # company's account (cross-company data corruption) or surface a raw
        # FK violation as a misleading 409 "already exists".
        linked = db.get(Ledger, ledger_id)
        if not linked or linked.company_id != company.id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Ledger not found in this company — parties must link to one of their own ledgers",
            )
        # One party per ledger — sharing would split party statements across
        # two parties while the ledger balance stays unified.
        _assert_ledger_unowned(db, company.id, ledger_id)

    party = Party(company_id=company.id, ledger_id=ledger_id, **payload.model_dump(exclude={"ledger_id", "created_from", "opening_balance", "opening_balance_type"}))
    db.add(party)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="A party with this name already exists",
        )
    db.refresh(party)
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="CREATE", entity_type="party", entity_id=party.id,
        new_value=serialize_entity(party),
        description=f"Created party {party.name}" + (f" (from: {payload.created_from})" if payload.created_from else ""),
    )
    db.commit()
    return party


def _party_ledger_group(party_type: str) -> str:
    """Default COA group for a new party's auto-created ledger.

    Customers and 'both' (supplier-and-customer) are receivables → Trade
    Receivables (an asset) — Tally's default group for a Both party is Sundry
    Debtors, and the Sales party-account dropdown lists receivables, so a Both
    party must land there to be selectable as a customer.
    Suppliers and the service/source party types (employee, transporter,
    agent/broker, contractor, consultant, lender) are payables → Trade
    Payables (a liability)."""
    if party_type in ("customer", "both"):
        return "Trade Receivables"
    # All other (payable) types default to Trade Payables.
    return "Trade Payables"


# Specs for creating the two party groups on demand (mirrors coa.seed_groups).
_PARTY_GROUP_SPECS: dict[str, tuple[str, str, str, str]] = {
    "Trade Receivables": ("assets", "sub", "Current Assets", "GRP_SUNDRY_DEBTORS"),
    "Trade Payables": ("liabilities", "sub", "Current Liabilities", "GRP_SUNDRY_CREDITORS"),
}


def _ensure_party_group(db: Session, company_id: str, party_type: str) -> AccountGroup:
    """Return the receivables/payables group for a party type, creating it (with
    the standard parent/nature/system code) when the company's COA lacks it."""
    name = _party_ledger_group(party_type)
    group = (
        db.query(AccountGroup)
        .filter(AccountGroup.company_id == company_id, AccountGroup.name == name)
        .first()
    )
    if group:
        return group
    nature, gtype, parent_name, system_code = _PARTY_GROUP_SPECS[name]
    parent = (
        db.query(AccountGroup)
        .filter(AccountGroup.company_id == company_id, AccountGroup.name == parent_name)
        .first()
    )
    group = AccountGroup(
        company_id=company_id,
        name=name,
        nature=nature,
        group_type=gtype,
        system_code=system_code,
        is_system=True,
        parent_id=parent.id if parent else None,
    )
    db.add(group)
    db.flush()
    return group


def _maybe_autocreate_party_for_ledger(
    db: Session, company_id: str, ledger: Ledger, user_id: str,
) -> None:
    """Auto-create the linked Party for a ledger created under the party groups.

    Trade Receivables → customer, Trade Payables → supplier (mirrors
    `_party_ledger_group`). The ledger's GSTIN carries over. Skips when a
    party with the same name already exists (any group) — never creates
    duplicates; that ledger can be linked manually.
    """
    if not ledger.group_id:
        return
    group = db.get(AccountGroup, ledger.group_id)
    if not group or group.company_id != company_id:
        return
    if group.name == "Trade Receivables":
        party_type = "customer"
    elif group.name == "Trade Payables":
        party_type = "supplier"
    else:
        return
    if db.query(Party).filter(
        Party.company_id == company_id, Party.name == ledger.name
    ).first():
        return
    party = Party(
        company_id=company_id,
        name=ledger.name,
        party_type=party_type,
        ledger_id=ledger.id,
        gstin=ledger.gstin,
        is_active=True,
    )
    db.add(party)
    db.flush()
    log_action(
        db, company_id=company_id, user_id=user_id,
        action="CREATE", entity_type="party", entity_id=party.id,
        new_value=serialize_entity(party),
        description=f"Auto-created party {party.name} for its receivables/payables ledger",
    )


def _assert_ledger_unowned(
    db: Session, company_id: str, ledger_id: str, exclude_party_id: str | None = None,
) -> None:
    """Reject linking a ledger that already belongs to another party.

    Two parties sharing one ledger is a divergence: rename-sync and
    reclassification on one silently change the other's account, and party
    statements split while the ledger balance stays unified."""
    q = db.query(Party).filter(
        Party.company_id == company_id, Party.ledger_id == ledger_id,
    )
    if exclude_party_id:
        q = q.filter(Party.id != exclude_party_id)
    owner = q.first()
    if owner:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Ledger already linked to party '{owner.name}' — each party needs its own ledger",
        )


@router.patch("/parties/{party_id}", response_model=PartyOut)
def update_party(
    party_id: str,
    payload: PartyCreate,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    party = db.get(Party, party_id)
    if not party or party.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Party not found")
    old_value = serialize_entity(party)
    old_name = party.name
    old_party_type = party.party_type
    update_data = payload.model_dump(exclude_unset=True)
    # A re-link must point at one of THIS company's ledgers and must not be
    # another party's account (see create_party). Explicitly nulling the link
    # is rejected too — a ledger-less party can't be picked in the voucher
    # forms (parties resolve by ledger_id) and silently loses bill tracking.
    if "ledger_id" in update_data:
        if update_data.get("ledger_id") is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="A party must stay linked to a ledger — supply a valid ledger_id to re-home it",
            )
        linked = db.get(Ledger, update_data["ledger_id"])
        if not linked or linked.company_id != company.id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Ledger not found in this company — parties must link to one of their own ledgers",
            )
        _assert_ledger_unowned(db, company.id, update_data["ledger_id"], exclude_party_id=party.id)
    for k, v in update_data.items():
        if k in ("opening_balance", "opening_balance_type"):
            continue  # ledger-side fields, synced below
        setattr(party, k, v)
    # Opening balance is a property of the party's account (its linked ledger),
    # not of the party row — sync it there so the master screen round-trips.
    if ("opening_balance" in update_data or "opening_balance_type" in update_data) and party.ledger_id:
        account = db.get(Ledger, party.ledger_id)
        if account:
            ob_type = update_data.get("opening_balance_type") or account.opening_balance_type or "Dr"
            if ob_type not in ("Dr", "Cr"):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="opening_balance_type must be 'Dr' or 'Cr'")
            # null opening_balance means "leave unchanged" on edit — the column
            # is non-nullable (defaults 0), so never write None.
            if update_data.get("opening_balance") is not None:
                account.opening_balance = update_data["opening_balance"]
            account.opening_balance_type = ob_type
    # Keep the party's account in sync: when the party is renamed and the
    # linked ledger still carries the party's old name (i.e. it was the
    # auto-created account ledger), rename it too. Without this the party and
    # its ledger diverge — voucher selectors and reports show the stale name.
    # A ledger with a different name is treated as user-named and left alone.
    if party.ledger_id and "name" in update_data and update_data["name"] != old_name:
        party_ledger = db.get(Ledger, party.ledger_id)
        if party_ledger and party_ledger.company_id == company.id and party_ledger.name == old_name:
            party_ledger.name = update_data["name"]
    # Reclassify the account when the party type changes (customer ⇄ supplier
    # moves the ledger between Trade Receivables and Trade Payables, Tally-prime
    # behavior). Only auto-classified party ledgers move — a ledger the user
    # linked into another group stays where it is.
    if "party_type" in update_data and update_data["party_type"] != old_party_type:
        _maybe_reclassify_party_ledger(db, company.id, party, update_data["party_type"])
    db.commit()
    db.refresh(party)
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="UPDATE", entity_type="party", entity_id=party.id,
        old_value=old_value, new_value=serialize_entity(party),
        description=f"Updated party {party.name}",
    )
    db.commit()
    return party


@router.delete("/parties/{party_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_party(
    party_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a party and (when safe) its unused account ledger.

    Guardrails: a party that still has vouchers, bill references, or TDS
    entries/certificates cannot be deleted — its history must be removed or
    re-homed first. The linked ledger is deleted along with the party only
    when it has no opening balance and no voucher usage (i.e. it is a fresh
    auto-created account); otherwise it is left in place (the party was its
    only link, so it becomes deletable via the COA again).
    """
    party = db.get(Party, party_id)
    if not party or party.company_id != company.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Party not found")

    voucher_count = db.query(Voucher).filter(Voucher.party_id == party_id).count()
    if voucher_count > 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete party '{party.name}': {voucher_count} voucher(s) reference it. Delete or re-home those entries first.",
        )
    bill_ref = db.query(BillReference).filter(BillReference.party_id == party_id).first()
    if bill_ref:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete party '{party.name}': it has outstanding/settled bill references.",
        )
    tds_entry = db.query(TdsTcsEntry).filter(TdsTcsEntry.party_id == party_id).first()
    if tds_entry:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete party '{party.name}': TDS/TCS entries reference it.",
        )
    tds_cert = db.query(TdsTcsCertificate).filter(TdsTcsCertificate.party_id == party_id).first()
    if tds_cert:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete party '{party.name}': TDS/TCS certificates reference it.",
        )

    old_value = serialize_entity(party)
    party_name = party.name
    ledger_to_delete = None
    if party.ledger_id:
        ledger = db.get(Ledger, party.ledger_id)
        if (
            ledger
            and ledger.company_id == company.id
            and float(ledger.opening_balance or 0) == 0
            and not ledger.is_protected
        ):
            used = db.scalar(
                sa_select(VoucherLine).where(VoucherLine.ledger_id == party.ledger_id).limit(1)
            )
            if not used:
                ledger_to_delete = ledger

    db.delete(party)
    if ledger_to_delete:
        db.delete(ledger_to_delete)
    db.commit()
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="DELETE", entity_type="party", entity_id=party_id,
        old_value=old_value,
        description=f"Deleted party {party_name}"
        + (" and its account ledger" if ledger_to_delete else " (ledger kept)"),
    )
    db.commit()


def _maybe_reclassify_party_ledger(
    db: Session, company_id: str, party: Party, new_party_type: str,
) -> None:
    """Move an auto-classified party ledger between Trade Receivables and
    Trade Payables when the party type changes (Tally-prime behavior).

    Conservative: only ledgers sitting in one of the two party default groups
    (and carrying the party's name — i.e. auto-created, not user-linked into
    some other group) are reclassified. User-named/user-grouped ledgers are
    left exactly where they are.
    """
    if not party.ledger_id:
        return
    ledger = db.get(Ledger, party.ledger_id)
    if not ledger or ledger.company_id != company_id or ledger.name != party.name:
        return
    current_group = db.get(AccountGroup, ledger.group_id)
    if not current_group or current_group.name not in ("Trade Receivables", "Trade Payables"):
        return
    target_group_name = _party_ledger_group(new_party_type)
    if current_group.name == target_group_name:
        return
    target_group = (
        db.query(AccountGroup)
        .filter(AccountGroup.company_id == company_id, AccountGroup.name == target_group_name)
        .first()
    )
    if not target_group:
        return
    ledger.group_id = target_group.id
