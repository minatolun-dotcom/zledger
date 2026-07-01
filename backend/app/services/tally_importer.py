"""Import parsed Tally data into the database.

Accepts TallyData from tally_parser.py and creates DB records:
groups, ledgers, parties, stock groups, stock items, units, vouchers.

Also supports undo: deletes all records created by a prior import.
Also supports validation: checks data references before importing.
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.accounting import AccountGroup, Ledger, Party
from app.models.import_job import ImportJob
from app.models.masters import Unit
from app.models.stock import StockBalance, StockGroup, StockItem
from app.models.voucher import Voucher, VoucherLine
from app.services.tally_parser import (
    ParsedGroup,
    ParsedLedger,
    ParsedParty,
    ParsedStockGroup,
    ParsedStockItem,
    ParsedVoucher,
    TallyData,
)


def _find_group_by_nature(
    db: Session,
    company_id: str,
    nature: str,
) -> AccountGroup | None:
    return db.query(AccountGroup).filter(
        AccountGroup.company_id == company_id,
        AccountGroup.nature == nature,
        AccountGroup.group_type == "primary",
        AccountGroup.parent_id.is_(None),
    ).first()


def _import_groups(
    db: Session,
    company_id: str,
    groups: list[ParsedGroup],
    skip_log: list[dict] | None = None,
) -> tuple[dict[str, str], list[dict]]:
    if skip_log is None:
        skip_log = []
    name_to_id: dict[str, str] = {}
    details: list[dict] = []

    existing_map: dict[str, AccountGroup] = {}
    for ag in db.query(AccountGroup).filter(AccountGroup.company_id == company_id).all():
        existing_map[ag.name] = ag
        name_to_id[ag.name] = ag.id

    for g in groups:
        if g.name in existing_map:
            name_to_id[g.name] = existing_map[g.name].id
            skip_log.append({"entity": "groups", "item": g.name, "reason": "Already exists in DB"})
            continue
        if g.is_system:
            skip_log.append({"entity": "groups", "item": g.name, "reason": "System group, skipped"})
            continue
        parent_id = None
        if g.parent_name and g.parent_name in name_to_id:
            parent_id = name_to_id[g.parent_name]
        if not parent_id:
            primary = _find_group_by_nature(db, company_id, g.nature)
            if primary:
                parent_id = primary.id
        ag = AccountGroup(
            company_id=company_id,
            name=g.name,
            group_type=g.group_type,
            nature=g.nature,
            parent_id=parent_id,
            is_system=False,
        )
        db.add(ag)
        db.flush()
        name_to_id[g.name] = ag.id
        details.append({"name": g.name, "id": ag.id, "nature": g.nature})

    return name_to_id, details


def _import_ledgers(
    db: Session,
    company_id: str,
    ledgers: list[ParsedLedger],
    group_map: dict[str, str],
    skip_log: list[dict] | None = None,
) -> tuple[dict[str, str], list[dict]]:
    if skip_log is None:
        skip_log = []
    name_to_id: dict[str, str] = {}
    details: list[dict] = []

    existing_map: dict[str, Ledger] = {}
    for l in db.query(Ledger).filter(Ledger.company_id == company_id).all():
        existing_map[l.name] = l
        name_to_id[l.name] = l.id

    for l in ledgers:
        if l.name in existing_map:
            name_to_id[l.name] = existing_map[l.name].id
            skip_log.append({"entity": "ledgers", "item": l.name, "reason": "Already exists in DB"})
            continue
        group_id = group_map.get(l.group_name or "")
        if not group_id:
            skip_log.append({"entity": "ledgers", "item": l.name, "reason": f"Group '{l.group_name}' not found in DB or import"})
            continue
        ledger = Ledger(
            company_id=company_id,
            name=l.name,
            group_id=group_id,
            opening_balance=float(l.opening_balance),
            opening_balance_type=l.opening_balance_type,
            gstin=l.gstin or None,
            alias=l.alias or None,
            currency=l.currency or None,
            is_active=True,
        )
        db.add(ledger)
        db.flush()
        name_to_id[l.name] = ledger.id
        details.append({
            "name": l.name, "id": ledger.id, "group": l.group_name,
            "opening_balance": float(l.opening_balance),
        })

    return name_to_id, details


def _import_parties(
    db: Session,
    company_id: str,
    parties: list[ParsedParty],
    ledger_map: dict[str, str],
    skip_log: list[dict] | None = None,
) -> list[dict]:
    if skip_log is None:
        skip_log = []
    details: list[dict] = []
    existing_names: set[str] = set()
    for p in db.query(Party.name).filter(Party.company_id == company_id).all():
        existing_names.add(p.name)

    for p in parties:
        if p.name in existing_names:
            skip_log.append({"entity": "parties", "item": p.name, "reason": "Already exists in DB"})
            continue
        ledger_id = ledger_map.get(p.ledger_name or p.name)
        if not ledger_id:
            skip_log.append({"entity": "parties", "item": p.name, "reason": f"Linked ledger '{p.ledger_name or p.name}' not found"})
        party = Party(
            company_id=company_id,
            name=p.name,
            party_type=p.party_type,
            ledger_id=ledger_id,
            gstin=p.gstin or None,
            state_code=p.state_code or None,
            pan=p.pan or None,
            address=p.address or None,
            is_active=True,
        )
        db.add(party)
        db.flush()
        existing_names.add(p.name)
        details.append({"name": p.name, "id": party.id, "type": p.party_type})

    return details


def _import_stock_groups(
    db: Session,
    company_id: str,
    stock_groups: list[ParsedStockGroup],
    skip_log: list[dict] | None = None,
) -> tuple[dict[str, str], list[dict]]:
    if skip_log is None:
        skip_log = []
    name_to_id: dict[str, str] = {}
    details: list[dict] = []
    existing_map: dict[str, StockGroup] = {}
    for sg in db.query(StockGroup).filter(StockGroup.company_id == company_id).all():
        existing_map[sg.name] = sg
        name_to_id[sg.name] = sg.id

    for sg in stock_groups:
        if sg.name in existing_map:
            name_to_id[sg.name] = existing_map[sg.name].id
            skip_log.append({"entity": "stock_groups", "item": sg.name, "reason": "Already exists in DB"})
            continue
        obj = StockGroup(company_id=company_id, name=sg.name, is_active=True)
        db.add(obj)
        db.flush()
        name_to_id[sg.name] = obj.id
        details.append({"name": sg.name, "id": obj.id})

    return name_to_id, details


def _import_stock_items(
    db: Session,
    company_id: str,
    stock_items: list[ParsedStockItem],
    group_map: dict[str, str],
    skip_log: list[dict] | None = None,
) -> list[dict]:
    if skip_log is None:
        skip_log = []
    details: list[dict] = []
    existing_names: set[str] = set()
    for si in db.query(StockItem.name).filter(StockItem.company_id == company_id).all():
        existing_names.add(si.name)

    for si in stock_items:
        if si.name in existing_names:
            skip_log.append({"entity": "stock_items", "item": si.name, "reason": "Already exists in DB"})
            continue
        sg_id = group_map.get(si.group_name)
        if not sg_id:
            skip_log.append({"entity": "stock_items", "item": si.name, "reason": f"Stock group '{si.group_name}' not found"})
        item = StockItem(
            company_id=company_id,
            stock_group_id=sg_id,
            name=si.name,
            unit_of_measure=si.unit or "Nos",
            hsn_sac_code=si.hsn_sac or None,
            opening_qty=float(si.opening_qty),
            opening_rate=float(si.opening_rate),
            gst_rate=float(si.gst_rate),
            valuation_method="weighted_avg",
            is_active=True,
        )
        db.add(item)
        db.flush()
        if si.opening_qty > 0:
            sb = StockBalance(
                company_id=company_id,
                stock_item_id=item.id,
                quantity=float(si.opening_qty),
                avg_rate=float(si.opening_rate),
                total_value=float(si.opening_qty * si.opening_rate),
            )
            db.add(sb)
        existing_names.add(si.name)
        details.append({
            "name": si.name, "id": item.id, "group": si.group_name,
            "opening_qty": float(si.opening_qty),
        })

    return details


def _import_units(
    db: Session,
    company_id: str,
    names: list[str],
    skip_log: list[dict] | None = None,
) -> list[dict]:
    if skip_log is None:
        skip_log = []
    details: list[dict] = []
    existing_names: set[str] = set()
    for u in db.query(Unit.name).filter(Unit.company_id == company_id).all():
        existing_names.add(u.name)

    for name in names:
        if not name or name in existing_names:
            if name in existing_names:
                skip_log.append({"entity": "units", "item": name, "reason": "Already exists in DB"})
            continue
        u = Unit(company_id=company_id, name=name, is_active=True)
        db.add(u)
        db.flush()
        existing_names.add(name)
        details.append({"name": name, "id": u.id})

    return details


def _import_vouchers(
    db: Session,
    company_id: str,
    vouchers: list[ParsedVoucher],
    user_id: str,
    ledger_map: dict[str, str],
    skip_log: list[dict] | None = None,
) -> list[dict]:
    if skip_log is None:
        skip_log = []
    details: list[dict] = []
    seen: set[tuple[str, str]] = set()
    existing: set[tuple[str, str]] = set()
    for v in db.query(Voucher.voucher_type, Voucher.voucher_number).filter(
        Voucher.company_id == company_id,
    ).all():
        existing.add((v.voucher_type, v.voucher_number))

    for v in vouchers:
        key = (v.voucher_type, v.voucher_number)
        if key in seen:
            skip_log.append({"entity": "vouchers", "item": f"{v.voucher_number} ({v.voucher_type})", "reason": "Duplicate in import file"})
            continue
        if key in existing:
            skip_log.append({"entity": "vouchers", "item": f"{v.voucher_number} ({v.voucher_type})", "reason": "Already exists in DB"})
            continue
        seen.add(key)

        lines_to_create: list[tuple[str, float, float]] = []
        for pl in v.lines:
            ledger_id = ledger_map.get(pl.ledger_name)
            if not ledger_id:
                skip_log.append({"entity": "vouchers", "item": f"{v.voucher_number} ({v.voucher_type})", "reason": f"Ledger '{pl.ledger_name}' not found in line"})
                continue
            lines_to_create.append((ledger_id, float(pl.debit), float(pl.credit)))

        if not lines_to_create:
            skip_log.append({"entity": "vouchers", "item": f"{v.voucher_number} ({v.voucher_type})", "reason": "No valid ledger lines"})
            continue

        total_debit = sum(d for _, d, _ in lines_to_create)
        total_credit = sum(c for _, _, c in lines_to_create)
        if total_debit != total_credit:
            skip_log.append({"entity": "vouchers", "item": f"{v.voucher_number} ({v.voucher_type})", "reason": f"Unbalanced: debits {total_debit} != credits {total_credit}"})
            continue

        total = max(total_debit, total_credit)

        voucher = Voucher(
            company_id=company_id,
            voucher_type=v.voucher_type,
            voucher_number=v.voucher_number,
            voucher_date=v.voucher_date,
            narration=v.narration or None,
            reference=v.reference or None,
            place_of_supply=v.place_of_supply or None,
            document_type=v.document_type or "regular",
            subtotal=total,
            grand_total=total,
            created_by=user_id,
        )
        db.add(voucher)
        db.flush()

        for ledger_id, debit, credit in lines_to_create:
            db.add(VoucherLine(
                voucher_id=voucher.id,
                ledger_id=ledger_id,
                debit=debit,
                credit=credit,
            ))

        details.append({
            "id": voucher.id,
            "voucher_number": v.voucher_number,
            "voucher_type": v.voucher_type,
            "voucher_date": v.voucher_date,
            "narration": v.narration,
            "total": total,
        })

    return details


def preview_import(tally_data: TallyData) -> dict:
    """Return summary counts + detailed item names for preview."""
    return {
        "groups": [{"name": g.name, "parent": g.parent_name, "nature": g.nature} for g in tally_data.groups],
        "ledgers": [{"name": l.name, "group": l.group_name} for l in tally_data.ledgers],
        "parties": [{"name": p.name, "type": p.party_type} for p in tally_data.parties],
        "stock_groups": [{"name": sg.name} for sg in tally_data.stock_groups],
        "stock_items": [{"name": si.name, "group": si.group_name, "qty": float(si.opening_qty)} for si in tally_data.stock_items],
        "vouchers": [{"voucher_number": v.voucher_number, "voucher_type": v.voucher_type, "date": v.voucher_date} for v in tally_data.vouchers],
    }


def validate_import(
    db: Session,
    company_id: str,
    tally_data: TallyData,
) -> dict:
    """Check all data references without creating anything.

    Returns:
        errors: critical issues — item cannot be imported
        warnings: non-critical issues — item will be skipped or fallback used
    """
    errors: list[dict] = []
    warnings: list[dict] = []

    # Collect existing masters from DB
    existing_group_names = set()
    for ag in db.query(AccountGroup.name).filter(AccountGroup.company_id == company_id).all():
        existing_group_names.add(ag.name)

    existing_ledger_names = set()
    for l in db.query(Ledger.name).filter(Ledger.company_id == company_id).all():
        existing_ledger_names.add(l.name)

    existing_stock_group_names = set()
    for sg in db.query(StockGroup.name).filter(StockGroup.company_id == company_id).all():
        existing_stock_group_names.add(sg.name)

    existing_voucher_keys = set()
    for v in db.query(Voucher.voucher_type, Voucher.voucher_number).filter(
        Voucher.company_id == company_id,
    ).all():
        existing_voucher_keys.add((v.voucher_type, v.voucher_number))

    # ── Groups ──
    import_group_names = {g.name for g in tally_data.groups}

    for g in tally_data.groups:
        if g.name in existing_group_names:
            warnings.append({"entity": "groups", "item": g.name, "reason": "Already exists in DB, will be skipped"})
        if g.parent_name and g.parent_name not in import_group_names and g.parent_name not in existing_group_names:
            primary = _find_group_by_nature(db, company_id, g.nature)
            if primary:
                warnings.append({"entity": "groups", "item": g.name, "reason": f"Parent '{g.parent_name}' not found, will use nature-based fallback"})
            else:
                errors.append({"entity": "groups", "item": g.name, "reason": f"Parent '{g.parent_name}' not found and no fallback available"})

    # ── Ledgers ──
    all_group_names = import_group_names | existing_group_names
    for l in tally_data.ledgers:
        if l.name in existing_ledger_names:
            warnings.append({"entity": "ledgers", "item": l.name, "reason": "Already exists in DB, will be skipped"})
        elif l.group_name and l.group_name not in all_group_names:
            errors.append({"entity": "ledgers", "item": l.name, "reason": f"Group '{l.group_name}' not found in import or existing groups"})

    # ── Parties ──
    import_ledger_names = {l.name for l in tally_data.ledgers}
    for p in tally_data.parties:
        linked = p.ledger_name or p.name
        if linked not in existing_ledger_names and linked not in import_ledger_names:
            warnings.append({"entity": "parties", "item": p.name, "reason": f"Linked ledger '{linked}' not found, will save without ledger link"})

    # ── Stock Groups ──
    for sg in tally_data.stock_groups:
        if sg.name in existing_stock_group_names:
            warnings.append({"entity": "stock_groups", "item": sg.name, "reason": "Already exists in DB, will be skipped"})

    # ── Stock Items ──
    import_sg_names = {sg.name for sg in tally_data.stock_groups}
    all_sg_names = import_sg_names | existing_stock_group_names
    for si in tally_data.stock_items:
        if si.group_name and si.group_name not in all_sg_names:
            errors.append({"entity": "stock_items", "item": si.name, "reason": f"Stock group '{si.group_name}' not found in import or existing groups"})

    # ── Vouchers ──
    all_ledger_names = existing_ledger_names | import_ledger_names
    seen: set[tuple[str, str]] = set()
    for v in tally_data.vouchers:
        key = (v.voucher_type, v.voucher_number)
        if key in existing_voucher_keys:
            warnings.append({"entity": "vouchers", "item": f"{v.voucher_number} ({v.voucher_type})", "reason": "Already exists in DB, will be skipped"})
        elif key in seen:
            warnings.append({"entity": "vouchers", "item": f"{v.voucher_number} ({v.voucher_type})", "reason": "Duplicate in import file, will be skipped"})
        seen.add(key)

        for pl in v.lines:
            if pl.ledger_name and pl.ledger_name not in all_ledger_names:
                errors.append({"entity": "vouchers", "item": f"{v.voucher_number} ({v.voucher_type})", "reason": f"Ledger '{pl.ledger_name}' not found in line"})

        total_debit = sum(pl.debit for pl in v.lines)
        total_credit = sum(pl.credit for pl in v.lines)
        if total_debit > 0 and total_credit > 0 and total_debit != total_credit:
            errors.append({"entity": "vouchers", "item": f"{v.voucher_number} ({v.voucher_type})", "reason": f"Unbalanced: debits {total_debit} != credits {total_credit}"})

    return {"errors": errors, "warnings": warnings}


def execute_import(
    db: Session,
    company_id: str,
    user_id: str,
    tally_data: TallyData,
    job: ImportJob,
) -> tuple[dict, list[dict]]:
    db.flush()

    skip_log: list[dict] = []

    group_map, group_details = _import_groups(db, company_id, tally_data.groups, skip_log)
    db.flush()
    ledger_map, ledger_details = _import_ledgers(db, company_id, tally_data.ledgers, group_map, skip_log)
    db.flush()
    party_details = _import_parties(db, company_id, tally_data.parties, ledger_map, skip_log)
    db.flush()

    units_set: set[str] = set()
    for si in tally_data.stock_items:
        if si.unit:
            units_set.add(si.unit)
    unit_details = _import_units(db, company_id, list(units_set), skip_log)
    db.flush()

    sg_map, sg_details = _import_stock_groups(db, company_id, tally_data.stock_groups, skip_log)
    db.flush()
    item_details = _import_stock_items(db, company_id, tally_data.stock_items, sg_map, skip_log)
    db.flush()

    voucher_details = _import_vouchers(db, company_id, tally_data.vouchers, user_id, ledger_map, skip_log)

    details = {
        "groups": group_details,
        "ledgers": ledger_details,
        "parties": party_details,
        "stock_groups": sg_details,
        "stock_items": item_details,
        "units": unit_details,
        "vouchers": voucher_details,
    }

    return details, skip_log


def undo_import(
    db: Session,
    company_id: str,
    job: ImportJob,
) -> dict:
    """Delete all records created by this import. Returns summary of what was removed."""
    details = job.created_details or {}
    if not details:
        return {"error": "No created_details found for this job", "removed": {}}

    removed: dict[str, list[dict]] = {
        "vouchers": [], "stock_items": [], "stock_groups": [],
        "parties": [], "ledgers": [], "groups": [], "units": [],
    }
    skipped: dict[str, list[dict]] = {
        "vouchers": [], "stock_items": [], "stock_groups": [],
        "parties": [], "ledgers": [], "groups": [], "units": [],
    }

    # Delete vouchers (and their lines via cascade)
    for v in details.get("vouchers", []):
        vid = v.get("id")
        if not vid:
            continue
        voucher = db.get(Voucher, vid)
        if voucher and voucher.company_id == company_id:
            db.query(VoucherLine).filter(VoucherLine.voucher_id == vid).delete()
            db.delete(voucher)
            removed["vouchers"].append(v)
        else:
            skipped["vouchers"].append(v)

    db.flush()

    # Delete stock items (and their stock balances)
    for si in details.get("stock_items", []):
        sid = si.get("id")
        if not sid:
            continue
        item = db.get(StockItem, sid)
        if item and item.company_id == company_id:
            db.query(StockBalance).filter(StockBalance.stock_item_id == sid).delete()
            db.delete(item)
            removed["stock_items"].append(si)
        else:
            skipped["stock_items"].append(si)

    db.flush()

    # Delete stock groups
    for sg in details.get("stock_groups", []):
        sgid = sg.get("id")
        if not sgid:
            continue
        obj = db.get(StockGroup, sgid)
        if obj and obj.company_id == company_id:
            db.delete(obj)
            removed["stock_groups"].append(sg)
        else:
            skipped["stock_groups"].append(sg)

    db.flush()

    # Delete parties
    for p in details.get("parties", []):
        pid = p.get("id")
        if not pid:
            continue
        party = db.get(Party, pid)
        if party and party.company_id == company_id:
            db.delete(party)
            removed["parties"].append(p)
        else:
            skipped["parties"].append(p)

    db.flush()

    # Delete ledgers
    for l in details.get("ledgers", []):
        lid = l.get("id")
        if not lid:
            continue
        ledger = db.get(Ledger, lid)
        if ledger and ledger.company_id == company_id:
            try:
                db.delete(ledger)
                db.flush()
                removed["ledgers"].append(l)
            except Exception:
                db.rollback()
                skipped["ledgers"].append(l)
                # Re-flush to continue
                db.flush()
        else:
            skipped["ledgers"].append(l)

    # Delete groups
    for g in details.get("groups", []):
        gid = g.get("id")
        if not gid:
            continue
        group = db.get(AccountGroup, gid)
        if group and group.company_id == company_id:
            try:
                db.delete(group)
                db.flush()
                removed["groups"].append(g)
            except Exception:
                db.rollback()
                skipped["groups"].append(g)
                db.flush()
        else:
            skipped["groups"].append(g)

    # Delete units
    for u in details.get("units", []):
        uid = u.get("id")
        if not uid:
            continue
        unit = db.get(Unit, uid)
        if unit and unit.company_id == company_id:
            try:
                db.delete(unit)
                db.flush()
                removed["units"].append(u)
            except Exception:
                db.rollback()
                skipped["units"].append(u)
                db.flush()
        else:
            skipped["units"].append(u)

    result = {"removed": removed, "skipped": skipped}
    return result
