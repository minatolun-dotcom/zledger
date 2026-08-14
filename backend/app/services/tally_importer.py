"""Import parsed Tally data into the database.

Accepts TallyData from tally_parser.py and creates DB records:
groups, ledgers, parties, stock groups, stock items, units, vouchers.

Also supports undo: deletes all records created by a prior import.
Also supports validation: checks data references before importing.
"""
from __future__ import annotations

from datetime import datetime, timezone
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


def log_detail(logs: list[dict], step: str, message: str, entity: str | None = None, item: str | None = None, status: str = "info") -> None:
    """Append a timestamped entry to the operational logs list."""
    entry: dict = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "step": step,
        "message": message,
        "status": status,
    }
    if entity:
        entry["entity"] = entity
    if item:
        entry["item"] = item
    logs.append(entry)


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


# Tally uses its own native group names; map them to ZLedger's display names
# so imported masters land under the right (renamed) groups.
GROUP_NAME_ALIASES: dict[str, str] = {
    "Sundry Debtors": "Trade Receivables",
    "Sundry Creditors": "Trade Payables",
    "Deposits (Assets)": "Deposits & Security",
}


def _alias(name: str | None) -> str | None:
    if not name:
        return name
    return GROUP_NAME_ALIASES.get(name, name)


def _import_groups(
    db: Session,
    company_id: str,
    groups: list[ParsedGroup],
    skip_log: list[dict] | None = None,
    logs: list[dict] | None = None,
) -> tuple[dict[str, str], list[dict]]:
    if skip_log is None:
        skip_log = []
    if logs is None:
        logs = []
    name_to_id: dict[str, str] = {}
    details: list[dict] = []

    existing_map: dict[str, AccountGroup] = {}
    for ag in db.query(AccountGroup).filter(AccountGroup.company_id == company_id).all():
        existing_map[ag.name] = ag
        name_to_id[ag.name] = ag.id

    log_detail(logs, "groups", f"Processing {len(groups)} groups from import file", entity="groups")

    for g in groups:
        if g.name in existing_map:
            name_to_id[g.name] = existing_map[g.name].id
            skip_log.append({"entity": "groups", "item": g.name, "reason": "Already exists in DB"})
            log_detail(logs, "groups", f"Skipped '{g.name}' — already exists in DB", entity="groups", item=g.name, status="skip")
            continue
        if g.is_system:
            skip_log.append({"entity": "groups", "item": g.name, "reason": "System group, skipped"})
            log_detail(logs, "groups", f"Skipped '{g.name}' — system group", entity="groups", item=g.name, status="skip")
            continue
        parent_id = None
        parent_name = _alias(g.parent_name)
        if parent_name and parent_name in name_to_id:
            parent_id = name_to_id[parent_name]
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
        log_detail(logs, "groups", f"Created group '{g.name}' (nature={g.nature})", entity="groups", item=g.name, status="created")

    log_detail(logs, "groups", f"Groups complete: {len(details)} created, {len([s for s in skip_log if s['entity'] == 'groups'])} skipped", entity="groups")
    return name_to_id, details


def _import_ledgers(
    db: Session,
    company_id: str,
    ledgers: list[ParsedLedger],
    group_map: dict[str, str],
    skip_log: list[dict] | None = None,
    logs: list[dict] | None = None,
) -> tuple[dict[str, str], list[dict]]:
    if skip_log is None:
        skip_log = []
    if logs is None:
        logs = []
    name_to_id: dict[str, str] = {}
    details: list[dict] = []

    existing_map: dict[str, Ledger] = {}
    for l in db.query(Ledger).filter(Ledger.company_id == company_id).all():
        existing_map[l.name] = l
        name_to_id[l.name] = l.id

    log_detail(logs, "ledgers", f"Processing {len(ledgers)} ledgers from import file", entity="ledgers")

    for l in ledgers:
        if l.name in existing_map:
            name_to_id[l.name] = existing_map[l.name].id
            skip_log.append({"entity": "ledgers", "item": l.name, "reason": "Already exists in DB"})
            log_detail(logs, "ledgers", f"Skipped '{l.name}' — already exists in DB", entity="ledgers", item=l.name, status="skip")
            continue
        group_id = group_map.get(_alias(l.group_name) or "")
        if not group_id:
            skip_log.append({"entity": "ledgers", "item": l.name, "reason": f"Group '{l.group_name}' not found in DB or import"})
            log_detail(logs, "ledgers", f"Skipped '{l.name}' — group '{l.group_name}' not found", entity="ledgers", item=l.name, status="skip")
            continue
        ledger = Ledger(
            company_id=company_id,
            name=l.name,
            group_id=group_id,
            opening_balance=float(l.opening_balance),
            opening_balance_type=l.opening_balance_type,
            gstin=l.gstin or None,
            alias=l.alias or None,
            is_active=True,
        )
        db.add(ledger)
        db.flush()
        name_to_id[l.name] = ledger.id
        details.append({
            "name": l.name, "id": ledger.id, "group": l.group_name,
            "opening_balance": float(l.opening_balance),
        })
        log_detail(logs, "ledgers", f"Created ledger '{l.name}' in group '{l.group_name}'", entity="ledgers", item=l.name, status="created")

    log_detail(logs, "ledgers", f"Ledgers complete: {len(details)} created, {len([s for s in skip_log if s['entity'] == 'ledgers'])} skipped", entity="ledgers")
    return name_to_id, details


def _import_parties(
    db: Session,
    company_id: str,
    parties: list[ParsedParty],
    ledger_map: dict[str, str],
    skip_log: list[dict] | None = None,
    logs: list[dict] | None = None,
) -> list[dict]:
    if skip_log is None:
        skip_log = []
    if logs is None:
        logs = []
    details: list[dict] = []
    existing_names: set[str] = set()
    for p in db.query(Party.name).filter(Party.company_id == company_id).all():
        existing_names.add(p.name)

    log_detail(logs, "parties", f"Processing {len(parties)} parties from import file", entity="parties")

    for p in parties:
        if p.name in existing_names:
            skip_log.append({"entity": "parties", "item": p.name, "reason": "Already exists in DB"})
            log_detail(logs, "parties", f"Skipped '{p.name}' — already exists in DB", entity="parties", item=p.name, status="skip")
            continue
        ledger_id = ledger_map.get(p.ledger_name or p.name)
        if not ledger_id:
            skip_log.append({"entity": "parties", "item": p.name, "reason": f"Linked ledger '{p.ledger_name or p.name}' not found"})
            log_detail(logs, "parties", f"Warning: party '{p.name}' linked ledger '{p.ledger_name or p.name}' not found", entity="parties", item=p.name, status="warning")
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
        log_detail(logs, "parties", f"Created party '{p.name}' (type={p.party_type})", entity="parties", item=p.name, status="created")

    log_detail(logs, "parties", f"Parties complete: {len(details)} created, {len([s for s in skip_log if s['entity'] == 'parties'])} skipped", entity="parties")
    return details


def _import_stock_groups(
    db: Session,
    company_id: str,
    stock_groups: list[ParsedStockGroup],
    skip_log: list[dict] | None = None,
    logs: list[dict] | None = None,
) -> tuple[dict[str, str], list[dict]]:
    if skip_log is None:
        skip_log = []
    if logs is None:
        logs = []
    name_to_id: dict[str, str] = {}
    details: list[dict] = []
    existing_map: dict[str, StockGroup] = {}
    for sg in db.query(StockGroup).filter(StockGroup.company_id == company_id).all():
        existing_map[sg.name] = sg
        name_to_id[sg.name] = sg.id

    log_detail(logs, "stock_groups", f"Processing {len(stock_groups)} stock groups from import file", entity="stock_groups")

    for sg in stock_groups:
        if sg.name in existing_map:
            name_to_id[sg.name] = existing_map[sg.name].id
            skip_log.append({"entity": "stock_groups", "item": sg.name, "reason": "Already exists in DB"})
            log_detail(logs, "stock_groups", f"Skipped '{sg.name}' — already exists in DB", entity="stock_groups", item=sg.name, status="skip")
            continue
        obj = StockGroup(company_id=company_id, name=sg.name, is_active=True)
        db.add(obj)
        db.flush()
        name_to_id[sg.name] = obj.id
        details.append({"name": sg.name, "id": obj.id})
        log_detail(logs, "stock_groups", f"Created stock group '{sg.name}'", entity="stock_groups", item=sg.name, status="created")

    log_detail(logs, "stock_groups", f"Stock groups complete: {len(details)} created, {len([s for s in skip_log if s['entity'] == 'stock_groups'])} skipped", entity="stock_groups")
    return name_to_id, details


def _import_stock_items(
    db: Session,
    company_id: str,
    stock_items: list[ParsedStockItem],
    group_map: dict[str, str],
    skip_log: list[dict] | None = None,
    logs: list[dict] | None = None,
) -> list[dict]:
    if skip_log is None:
        skip_log = []
    if logs is None:
        logs = []
    details: list[dict] = []
    existing_names: set[str] = set()
    for si in db.query(StockItem.name).filter(StockItem.company_id == company_id).all():
        existing_names.add(si.name)

    log_detail(logs, "stock_items", f"Processing {len(stock_items)} stock items from import file", entity="stock_items")

    for si in stock_items:
        if si.name in existing_names:
            skip_log.append({"entity": "stock_items", "item": si.name, "reason": "Already exists in DB"})
            log_detail(logs, "stock_items", f"Skipped '{si.name}' — already exists in DB", entity="stock_items", item=si.name, status="skip")
            continue
        sg_id = group_map.get(si.group_name)
        if not sg_id:
            skip_log.append({"entity": "stock_items", "item": si.name, "reason": f"Stock group '{si.group_name}' not found"})
            log_detail(logs, "stock_items", f"Skipped '{si.name}' — stock group '{si.group_name}' not found", entity="stock_items", item=si.name, status="skip")
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
        log_detail(logs, "stock_items", f"Created stock item '{si.name}' in group '{si.group_name}' (qty={si.opening_qty})", entity="stock_items", item=si.name, status="created")

    log_detail(logs, "stock_items", f"Stock items complete: {len(details)} created, {len([s for s in skip_log if s['entity'] == 'stock_items'])} skipped", entity="stock_items")
    return details


def _import_units(
    db: Session,
    company_id: str,
    names: list[str],
) -> list[dict]:
    details: list[dict] = []
    existing_names: set[str] = set()
    for u in db.query(Unit.name).filter(Unit.company_id == company_id).all():
        existing_names.add(u.name)

    for name in names:
        if not name or name in existing_names:
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
    logs: list[dict] | None = None,
    party_map: dict[str, str] | None = None,
) -> list[dict]:
    """Import parsed vouchers, preserving party linkage.

    Audit round 12: the old importer dropped ``ParsedVoucher.party_name``,
    so imported sales/purchase vouchers had no ``party_id`` and no bill
    reference — they never appeared in Outstanding Bills, party statements,
    or the receivables/payables aging, and could not be settled bill-wise.
    ``party_map`` (party name → id) restores the link and sales/purchase
    invoices get their bill reference created so migrated books participate
    in bill-wise accounting from day one.
    """
    if skip_log is None:
        skip_log = []
    if logs is None:
        logs = []
    party_map = party_map or {}
    details: list[dict] = []
    seen: set[tuple[str, str]] = set()
    existing: set[tuple[str, str]] = set()
    for v in db.query(Voucher.voucher_type, Voucher.voucher_number).filter(
        Voucher.company_id == company_id,
    ).all():
        existing.add((v.voucher_type, v.voucher_number))

    log_detail(logs, "vouchers", f"Processing {len(vouchers)} vouchers from import file", entity="vouchers")

    for v in vouchers:
        key = (v.voucher_type, v.voucher_number)
        if key in seen:
            skip_log.append({"entity": "vouchers", "item": f"{v.voucher_number} ({v.voucher_type})", "reason": "Duplicate in import file"})
            log_detail(logs, "vouchers", f"Skipped '{v.voucher_number} ({v.voucher_type})' — duplicate in import file", entity="vouchers", item=f"{v.voucher_number} ({v.voucher_type})", status="skip")
            continue
        if key in existing:
            skip_log.append({"entity": "vouchers", "item": f"{v.voucher_number} ({v.voucher_type})", "reason": "Already exists in DB"})
            log_detail(logs, "vouchers", f"Skipped '{v.voucher_number} ({v.voucher_type})' — already exists in DB", entity="vouchers", item=f"{v.voucher_number} ({v.voucher_type})", status="skip")
            continue
        seen.add(key)

        lines_to_create: list[tuple[str, float, float]] = []
        for pl in v.lines:
            ledger_id = ledger_map.get(pl.ledger_name)
            if not ledger_id:
                skip_log.append({"entity": "vouchers", "item": f"{v.voucher_number} ({v.voucher_type})", "reason": f"Ledger '{pl.ledger_name}' not found in line"})
                log_detail(logs, "vouchers", f"Skipped '{v.voucher_number} ({v.voucher_type})' — ledger '{pl.ledger_name}' not found in line", entity="vouchers", item=f"{v.voucher_number} ({v.voucher_type})", status="skip")
                continue
            lines_to_create.append((ledger_id, float(pl.debit), float(pl.credit)))

        if not lines_to_create:
            skip_log.append({"entity": "vouchers", "item": f"{v.voucher_number} ({v.voucher_type})", "reason": "No valid ledger lines"})
            log_detail(logs, "vouchers", f"Skipped '{v.voucher_number} ({v.voucher_type})' — no valid ledger lines", entity="vouchers", item=f"{v.voucher_number} ({v.voucher_type})", status="skip")
            continue

        total_debit = sum(d for _, d, _ in lines_to_create)
        total_credit = sum(c for _, _, c in lines_to_create)
        if total_debit != total_credit:
            skip_log.append({"entity": "vouchers", "item": f"{v.voucher_number} ({v.voucher_type})", "reason": f"Unbalanced: debits {total_debit} != credits {total_credit}"})
            log_detail(logs, "vouchers", f"Skipped '{v.voucher_number} ({v.voucher_type})' — unbalanced (debits={total_debit}, credits={total_credit})", entity="vouchers", item=f"{v.voucher_number} ({v.voucher_type})", status="skip")
            continue

        total = max(total_debit, total_credit)

        # Restore party linkage: the party ledger line in the Tally XML is
        # the counterparty of the transaction, and the imported Party rows
        # carry the same name (round 12 — the old code dropped this and the
        # voucher was party-less).
        party_id = party_map.get(v.party_name or "")

        voucher = Voucher(
            company_id=company_id,
            voucher_type=v.voucher_type,
            voucher_number=v.voucher_number,
            voucher_date=v.voucher_date,
            narration=v.narration or None,
            reference=v.reference or None,
            place_of_supply=v.place_of_supply or None,
            document_type=v.document_type or "regular",
            party_id=party_id,
            subtotal=total,
            grand_total=total,
            created_by=user_id,
            status="posted",
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

        # Imported sales/purchase invoices need a bill reference so they
        # show in Outstanding Bills and can be settled bill-wise (round 12).
        # A failure must not abort the whole import: scope the bill-ref work
        # to a savepoint and roll back only that, keeping the voucher+lines.
        if v.voucher_type in ("sales", "purchase") and party_id:
            nested = db.begin_nested()
            try:
                from app.services.bill_wise import sync_bill_reference
                sync_bill_reference(db, company_id, voucher, reference_type="new_ref")
                if nested.is_active:
                    nested.commit()
            except Exception:  # noqa: BLE001 — never fail the import on bill-ref issues
                if nested.is_active:
                    try:
                        nested.rollback()
                    except Exception:  # noqa: BLE001
                        pass
                import sys
                import traceback
                traceback.print_exc(file=sys.stderr)

        details.append({
            "id": voucher.id,
            "voucher_number": v.voucher_number,
            "voucher_type": v.voucher_type,
            "voucher_date": v.voucher_date,
            "narration": v.narration,
            "total": total,
        })
        log_detail(logs, "vouchers", f"Created voucher '{v.voucher_number} ({v.voucher_type})' — ₹{total:,.2f}", entity="vouchers", item=f"{v.voucher_number} ({v.voucher_type})", status="created")

    log_detail(logs, "vouchers", f"Vouchers complete: {len(details)} created, {len([s for s in skip_log if s['entity'] == 'vouchers'])} skipped", entity="vouchers")
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
) -> tuple[dict, list[dict], list[dict]]:
    db.flush()

    skip_log: list[dict] = []
    logs: list[dict] = []

    log_detail(logs, "start", f"Starting import: {len(tally_data.groups)} groups, {len(tally_data.ledgers)} ledgers, {len(tally_data.parties)} parties, {len(tally_data.stock_groups)} stock groups, {len(tally_data.stock_items)} stock items, {len(tally_data.vouchers)} vouchers")

    group_map, group_details = _import_groups(db, company_id, tally_data.groups, skip_log, logs)
    db.flush()
    ledger_map, ledger_details = _import_ledgers(db, company_id, tally_data.ledgers, group_map, skip_log, logs)
    db.flush()
    party_details = _import_parties(db, company_id, tally_data.parties, ledger_map, skip_log, logs)
    db.flush()

    units_set: set[str] = set()
    for si in tally_data.stock_items:
        if si.unit:
            units_set.add(si.unit)
    unit_details = _import_units(db, company_id, list(units_set))
    db.flush()

    sg_map, sg_details = _import_stock_groups(db, company_id, tally_data.stock_groups, skip_log, logs)
    db.flush()
    item_details = _import_stock_items(db, company_id, tally_data.stock_items, sg_map, skip_log, logs)
    db.flush()

    # Build the party map (name → id) from BOTH pre-existing and freshly
    # imported parties so imported vouchers can be linked (round 12).
    from app.models.accounting import Party as PartyModel
    party_map: dict[str, str] = {}
    for p in db.query(PartyModel).filter(PartyModel.company_id == company_id).all():
        party_map[p.name] = p.id

    voucher_details = _import_vouchers(
        db, company_id, tally_data.vouchers, user_id, ledger_map, skip_log, logs,
        party_map=party_map,
    )

    total_created = sum(len(v) for v in [group_details, ledger_details, party_details, sg_details, item_details, unit_details, voucher_details])
    total_skipped = len(skip_log)
    log_detail(logs, "complete", f"Import complete: {total_created} records created, {total_skipped} items skipped")

    details = {
        "groups": group_details,
        "ledgers": ledger_details,
        "parties": party_details,
        "stock_groups": sg_details,
        "stock_items": item_details,
        "units": unit_details,
        "vouchers": voucher_details,
    }

    return details, skip_log, logs


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
