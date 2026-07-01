"""Import parsed Tally data into the database.

Accepts TallyData from tally_parser.py and creates DB records:
groups, ledgers, parties, stock groups, stock items, units, vouchers.
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
) -> tuple[dict[str, str], int]:
    name_to_id: dict[str, str] = {}
    created_count = 0

    existing_map: dict[str, AccountGroup] = {}
    for ag in db.query(AccountGroup).filter(AccountGroup.company_id == company_id).all():
        existing_map[ag.name] = ag
        name_to_id[ag.name] = ag.id

    for g in groups:
        if g.name in existing_map:
            continue
        if g.is_system:
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
        created_count += 1

    return name_to_id, created_count


def _import_ledgers(
    db: Session,
    company_id: str,
    ledgers: list[ParsedLedger],
    group_map: dict[str, str],
) -> tuple[dict[str, str], int]:
    name_to_id: dict[str, str] = {}
    created_count = 0

    existing_map: dict[str, Ledger] = {}
    for l in db.query(Ledger).filter(Ledger.company_id == company_id).all():
        existing_map[l.name] = l
        name_to_id[l.name] = l.id

    for l in ledgers:
        if l.name in existing_map:
            name_to_id[l.name] = existing_map[l.name].id
            continue
        group_id = group_map.get(l.group_name or "")
        if not group_id:
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
        created_count += 1

    return name_to_id, created_count


def _import_parties(
    db: Session,
    company_id: str,
    parties: list[ParsedParty],
    ledger_map: dict[str, str],
) -> int:
    count = 0
    existing_names: set[str] = set()
    for p in db.query(Party.name).filter(Party.company_id == company_id).all():
        existing_names.add(p.name)

    for p in parties:
        if p.name in existing_names:
            continue
        ledger_id = ledger_map.get(p.ledger_name or p.name)
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
        existing_names.add(p.name)
        count += 1
    return count


def _import_stock_groups(
    db: Session,
    company_id: str,
    stock_groups: list[ParsedStockGroup],
) -> tuple[dict[str, str], int]:
    name_to_id: dict[str, str] = {}
    created_count = 0
    existing_map: dict[str, StockGroup] = {}
    for sg in db.query(StockGroup).filter(StockGroup.company_id == company_id).all():
        existing_map[sg.name] = sg
        name_to_id[sg.name] = sg.id

    for sg in stock_groups:
        if sg.name in existing_map:
            continue
        obj = StockGroup(company_id=company_id, name=sg.name, is_active=True)
        db.add(obj)
        db.flush()
        name_to_id[sg.name] = obj.id
        created_count += 1

    return name_to_id, created_count


def _import_stock_items(
    db: Session,
    company_id: str,
    stock_items: list[ParsedStockItem],
    group_map: dict[str, str],
) -> int:
    count = 0
    existing_names: set[str] = set()
    for si in db.query(StockItem.name).filter(StockItem.company_id == company_id).all():
        existing_names.add(si.name)

    for si in stock_items:
        if si.name in existing_names:
            continue
        item = StockItem(
            company_id=company_id,
            stock_group_id=group_map.get(si.group_name),
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
        count += 1
    return count


def _import_units(db: Session, company_id: str, units: list[str]) -> int:
    count = 0
    existing_names: set[str] = set()
    for u in db.query(Unit.name).filter(Unit.company_id == company_id).all():
        existing_names.add(u.name)

    for name in units:
        if not name or name in existing_names:
            continue
        db.add(Unit(company_id=company_id, name=name, is_active=True))
        existing_names.add(name)
        count += 1
    return count


def _import_vouchers(
    db: Session,
    company_id: str,
    vouchers: list[ParsedVoucher],
    user_id: str,
    ledger_map: dict[str, str],
) -> int:
    count = 0
    seen: set[tuple[str, str]] = set()
    existing: set[tuple[str, str]] = set()
    for v in db.query(Voucher.voucher_type, Voucher.voucher_number).filter(
        Voucher.company_id == company_id,
    ).all():
        existing.add((v.voucher_type, v.voucher_number))

    for v in vouchers:
        key = (v.voucher_type, v.voucher_number)
        if key in seen or key in existing:
            continue
        seen.add(key)

        lines_to_create: list[tuple[str, float, float]] = []
        for pl in v.lines:
            ledger_id = ledger_map.get(pl.ledger_name)
            if not ledger_id:
                continue
            lines_to_create.append((ledger_id, float(pl.debit), float(pl.credit)))

        if not lines_to_create:
            continue

        total = max(sum(d for _, d, _ in lines_to_create), sum(c for _, _, c in lines_to_create))

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

        count += 1
    return count


def preview_import(tally_data: TallyData) -> dict:
    return {
        "groups": len(tally_data.groups),
        "ledgers": len(tally_data.ledgers),
        "parties": len(tally_data.parties),
        "stock_groups": len(tally_data.stock_groups),
        "stock_items": len(tally_data.stock_items),
        "vouchers": len(tally_data.vouchers),
    }


def execute_import(
    db: Session,
    company_id: str,
    user_id: str,
    tally_data: TallyData,
    job: ImportJob,
) -> dict:
    db.flush()

    group_map, group_count = _import_groups(db, company_id, tally_data.groups)
    db.flush()
    ledger_map, ledger_count = _import_ledgers(db, company_id, tally_data.ledgers, group_map)
    db.flush()
    party_count = _import_parties(db, company_id, tally_data.parties, ledger_map)
    db.flush()

    units_set: set[str] = set()
    for si in tally_data.stock_items:
        if si.unit:
            units_set.add(si.unit)
    unit_count = _import_units(db, company_id, list(units_set))
    db.flush()

    sg_map, sg_count = _import_stock_groups(db, company_id, tally_data.stock_groups)
    db.flush()
    item_count = _import_stock_items(db, company_id, tally_data.stock_items, sg_map)
    db.flush()

    voucher_count = _import_vouchers(db, company_id, tally_data.vouchers, user_id, ledger_map)

    counts = {
        "groups": group_count,
        "ledgers": ledger_count,
        "parties": party_count,
        "stock_groups": sg_count,
        "stock_items": item_count,
        "units": unit_count,
        "vouchers": voucher_count,
    }
    return counts
