"""Data import/export endpoints: CSV/Excel import for ledgers, parties, stock items;
data export for ledgers, parties, stock items, vouchers."""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.accounting import AccountGroup, Ledger, Party
from app.models.import_job import ImportJob
from app.models.stock import StockGroup, StockItem
from app.models.user import Company, User
from app.models.voucher import Voucher
from app.schemas.member import CompanyRole
from app.services.notification import notify
from app.services.reports import voucher_round_off

router = APIRouter()

# ── Canonical column aliases ───────────────────────────────────────────────

LEDGER_ALIASES = {
    "name": ["name", "ledger", "ledger_name", "account", "account_name", "a/c name", "ac name"],
    "group": ["group", "group_name", "under", "parent", "parent_group", "a/c group", "account group"],
    "opening_balance": ["opening", "opening_balance", "op_bal", "op balance", "balance"],
    "opening_balance_type": ["type", "balance_type", "dr_cr", "dr/cr", "drcr"],
    "gstin": ["gstin", "gst", "gstin no"],
    "alias": ["alias", "mailing_name", "display name"],
}

PARTY_ALIASES = {
    "name": ["name", "party", "party_name", "customer", "supplier", "vendor"],
    "party_type": ["party_type", "type", "party type", "customer/supplier/both"],
    "gstin": ["gstin", "gst", "gstin no"],
    "state_code": ["state_code", "state", "state code", "state no"],
    "pan": ["pan", "pan no", "pan_number"],
    "address": ["address", "addr", "full address"],
    "contact_person": ["contact_person", "contact", "contact person", "person"],
    "phone": ["phone", "mobile", "phone_no", "mobile_no"],
    "email": ["email", "email_id", "mail"],
}

STOCK_ITEM_ALIASES = {
    "name": ["name", "item", "item_name", "stock item", "product"],
    "sku": ["sku", "code", "item_code", "product_code"],
    "hsn_sac_code": ["hsn", "hsn_sac_code", "hsn code", "sac", "sac_code"],
    "unit_of_measure": ["unit", "uom", "unit_of_measure", "unit name", "measurement"],
    "opening_qty": ["opening_qty", "qty", "opening quantity", "op_qty"],
    "opening_rate": ["opening_rate", "rate", "price", "op_rate", "unit_price"],
    "gst_rate": ["gst_rate", "gst %", "gst rate", "tax_rate"],
    "reorder_level": ["reorder_level", "reorder", "re-order level", "min_stock"],
    "stock_group": ["stock_group", "group", "stock_group_name", "category", "item group"],
    "valuation_method": ["valuation", "valuation_method", "val_method"],
}

VOUCHER_ALIASES = {
    "voucher_number": ["voucher_number", "number", "voucher no", "vno", "vch_no"],
    "voucher_date": ["voucher_date", "date", "voucher date", "vch_date", "trans_date"],
    "voucher_type": ["voucher_type", "type", "vch_type", "voucher type"],
    "narration": ["narration", "description", "notes", "memo", "particulars"],
    "party_name": ["party_name", "party", "customer", "supplier", "vendor", "name"],
    "ledger_name": ["ledger_name", "ledger", "account", "account_name"],
    "debit": ["debit", "dr", "debit_amount", "dr_amount"],
    "credit": ["credit", "cr", "credit_amount", "cr_amount"],
    "reference": ["reference", "ref", "ref_no", "invoice_no"],
    "place_of_supply": ["place_of_supply", "pos", "place of supply", "state"],
}


def _detect_columns(headers: list[str], aliases: dict) -> dict[str, str | None]:
    """Map canonical fields to actual column headers using aliases."""
    mapping: dict[str, str | None] = {}
    used: set[str] = set()
    for field, alias_list in aliases.items():
        mapping[field] = None
        for alias in alias_list:
            for h in headers:
                if h.strip().lower() == alias and h not in used:
                    mapping[field] = h
                    used.add(h)
                    break
            if mapping[field]:
                break
    return mapping


def _parse_csv(content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except UnicodeDecodeError:
            raise HTTPException(400, detail="Unable to decode file. Use UTF-8 or Latin-1.")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(422, detail="CSV has no header row")
    headers = list(reader.fieldnames)
    rows = [{k: (v or "").strip() for k, v in row.items()} for row in reader]
    return headers, rows


def _parse_excel(content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    import openpyxl
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(400, detail="Unable to read Excel file.")
    ws = wb.active
    if ws is None:
        raise HTTPException(422, detail="Excel file has no worksheets")
    rows_iter = ws.iter_rows(values_only=True)
    header_row = next(rows_iter, None)
    if not header_row:
        raise HTTPException(422, detail="Excel file has no header row")
    headers = [str(c).strip() if c else f"col_{i}" for i, c in enumerate(header_row)]
    rows = []
    for row in rows_iter:
        if row and any(c is not None for c in row):
            rows.append({headers[j]: str(row[j]).strip() if row[j] is not None else "" for j in range(min(len(headers), len(row)))})
    wb.close()
    return headers, rows


# ── Preview ────────────────────────────────────────────────────────────────


@router.post("/preview")
async def preview_import(
    entity_type: str = Query(..., description="ledgers, parties, or stock_items"),
    file: UploadFile = File(...),
    company: Company = Depends(require_role(CompanyRole.accountant)),
):
    """Upload a CSV or Excel file and return detected column mapping + first 5 rows."""
    if entity_type not in ("ledgers", "parties", "stock_items", "vouchers"):
        raise HTTPException(422, detail="entity_type must be 'ledgers', 'parties', 'stock_items', or 'vouchers'")

    content = await file.read()
    filename = (file.filename or "").lower()
    is_excel = filename.endswith(".xlsx") or filename.endswith(".xls")

    headers, rows = _parse_excel(content) if is_excel else _parse_csv(content)

    alias_map = {
        "ledgers": LEDGER_ALIASES,
        "parties": PARTY_ALIASES,
        "stock_items": STOCK_ITEM_ALIASES,
        "vouchers": VOUCHER_ALIASES,
    }
    detected = _detect_columns(headers, alias_map[entity_type])

    return {
        "entity_type": entity_type,
        "raw_columns": headers,
        "detected_mapping": detected,
        "preview_rows": rows[:5],
        "total_rows": len(rows),
    }


# ── Import ─────────────────────────────────────────────────────────────────


@router.post("/import")
async def import_data(
    entity_type: str = Query(..., description="ledgers, parties, or stock_items"),
    column_map_json: str | None = Query(None, alias="column_map"),
    skip_duplicates: bool = Query(True),
    file: UploadFile = File(...),
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import ledgers, parties, or stock items from CSV/Excel.

    Args:
        entity_type: ledgers, parties, or stock_items
        column_map_json: Optional JSON string of column mapping
        skip_duplicates: Skip rows with duplicate names (default: true)
        file: The CSV or Excel file
    """
    if entity_type not in ("ledgers", "parties", "stock_items", "vouchers"):
        raise HTTPException(422, detail="entity_type must be 'ledgers', 'parties', 'stock_items', or 'vouchers'")

    content = await file.read()
    filename = (file.filename or "").lower()
    is_excel = filename.endswith(".xlsx") or filename.endswith(".xls")

    headers, rows = _parse_excel(content) if is_excel else _parse_csv(content)

    if not rows:
        raise HTTPException(422, detail="No data rows found in file")

    # Parse column map
    alias_map = {
        "ledgers": LEDGER_ALIASES,
        "parties": PARTY_ALIASES,
        "stock_items": STOCK_ITEM_ALIASES,
        "vouchers": VOUCHER_ALIASES,
    }
    col_map = _detect_columns(headers, alias_map[entity_type])
    if column_map_json:
        try:
            raw = json.loads(column_map_json)
            for field, col in raw.items():
                if col:
                    col_map[field] = col
                elif field in col_map:
                    col_map[field] = None
        except (json.JSONDecodeError, TypeError):
            raise HTTPException(422, detail="Invalid column_map JSON")

    if entity_type == "ledgers":
        result = _import_ledgers(db, company.id, rows, col_map, skip_duplicates)
    elif entity_type == "parties":
        result = _import_parties(db, company.id, rows, col_map, skip_duplicates)
    else:
        result = _import_stock_items(db, company.id, rows, col_map, skip_duplicates)

    db.commit()

    notify(
        db, company.id,
        title=f"Data Imported: {entity_type.replace('_', ' ').title()}",
        message=f"{result['imported']} records imported" + (f", {result['skipped']} duplicates skipped" if result["skipped"] else ""),
        category="success",
        link="/data-import",
        user_id=user.id,
        entity_type=entity_type,
    )
    db.commit()
    from app.services.audit import log_action
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="CREATE", entity_type="data_import", entity_id=None,
        new_value={"entity_type": entity_type, "imported": result["imported"], "skipped": result["skipped"]},
        description=f"Imported {result['imported']} {entity_type} from CSV/Excel",
    )
    db.commit()

    return result


def _import_ledgers(db: Session, company_id: str, rows: list[dict], col_map: dict, skip_dup: bool) -> dict:
    imported = 0
    skipped = 0
    errors = []

    for i, row in enumerate(rows):
        name = row.get(col_map.get("name") or "", "").strip()
        if not name:
            errors.append(f"Row {i + 2}: missing name")
            continue

        existing = db.query(Ledger).filter(Ledger.company_id == company_id, Ledger.name == name).first()
        if existing:
            if skip_dup:
                skipped += 1
                continue
            errors.append(f"Row {i + 2}: '{name}' already exists")
            continue

        # Resolve group_id from name
        group_name = row.get(col_map.get("group") or "", "").strip()
        group_id = None
        if group_name:
            ag = db.query(AccountGroup).filter(
                AccountGroup.company_id == company_id, AccountGroup.name == group_name
            ).first()
            if ag:
                group_id = ag.id
        if not group_id:
            # Default to "Current Assets" or first group
            default = db.query(AccountGroup).filter(AccountGroup.company_id == company_id).first()
            group_id = default.id if default else None
        if not group_id:
            errors.append(f"Row {i + 2}: no account groups found. Create groups first.")
            continue

        ob_str = row.get(col_map.get("opening_balance") or "", "0").strip() or "0"
        ob_type = row.get(col_map.get("opening_balance_type") or "", "Dr").strip() or "Dr"
        if ob_type.upper().startswith("C"):
            ob_type = "Cr"
        else:
            ob_type = "Dr"

        try:
            ob = float(ob_str.replace(",", "").replace("₹", "").strip() or "0")
        except ValueError:
            ob = 0.0

        ledger = Ledger(
            company_id=company_id,
            name=name,
            group_id=group_id,
            opening_balance=ob,
            opening_balance_type=ob_type,
            gstin=row.get(col_map.get("gstin") or "", "").strip() or None,
            alias=row.get(col_map.get("alias") or "", "").strip() or None,
        )
        db.add(ledger)
        imported += 1

    return {"imported": imported, "skipped": skipped, "errors": errors}


def _import_parties(db: Session, company_id: str, rows: list[dict], col_map: dict, skip_dup: bool) -> dict:
    imported = 0
    skipped = 0
    errors = []

    for i, row in enumerate(rows):
        name = row.get(col_map.get("name") or "", "").strip()
        if not name:
            errors.append(f"Row {i + 2}: missing name")
            continue

        existing = db.query(Party).filter(Party.company_id == company_id, Party.name == name).first()
        if existing:
            if skip_dup:
                skipped += 1
                continue
            errors.append(f"Row {i + 2}: '{name}' already exists")
            continue

        party_type = row.get(col_map.get("party_type") or "", "customer").strip().lower() or "customer"
        if party_type not in ("customer", "supplier", "both", "employee", "transporter",
                              "agent_broker", "contractor", "consultant", "lender"):
            party_type = "customer"

        state_code = row.get(col_map.get("state_code") or "", "").strip() or None

        party = Party(
            company_id=company_id,
            name=name,
            party_type=party_type,
            gstin=row.get(col_map.get("gstin") or "", "").strip() or None,
            state_code=state_code,
            pan=row.get(col_map.get("pan") or "", "").strip() or None,
            address=row.get(col_map.get("address") or "", "").strip() or None,
            contact_person=row.get(col_map.get("contact_person") or "", "").strip() or None,
            phone=row.get(col_map.get("phone") or "", "").strip() or None,
            email=row.get(col_map.get("email") or "", "").strip() or None,
        )
        db.add(party)
        imported += 1

    return {"imported": imported, "skipped": skipped, "errors": errors}


def _import_stock_items(db: Session, company_id: str, rows: list[dict], col_map: dict, skip_dup: bool) -> dict:
    imported = 0
    skipped = 0
    errors = []

    for i, row in enumerate(rows):
        name = row.get(col_map.get("name") or "", "").strip()
        if not name:
            errors.append(f"Row {i + 2}: missing name")
            continue

        existing = db.query(StockItem).filter(StockItem.company_id == company_id, StockItem.name == name).first()
        if existing:
            if skip_dup:
                skipped += 1
                continue
            errors.append(f"Row {i + 2}: '{name}' already exists")
            continue

        # Resolve stock_group_id from name
        stock_group_name = row.get(col_map.get("stock_group") or "", "").strip()
        stock_group_id = None
        if stock_group_name:
            sg = db.query(StockGroup).filter(
                StockGroup.company_id == company_id, StockGroup.name == stock_group_name
            ).first()
            if sg:
                stock_group_id = sg.id

        def _float(field: str, default: float = 0) -> float:
            val = row.get(col_map.get(field) or "", str(default)).strip() or str(default)
            val = val.replace(",", "").replace("₹", "").replace("%", "").strip()
            try:
                return float(val)
            except ValueError:
                return default

        hsn = row.get(col_map.get("hsn_sac_code") or "", "").strip() or None
        if hsn:
            hsn = "".join(c for c in hsn if c.isdigit())
            if len(hsn) < 4 or len(hsn) > 8:
                hsn = None

        item = StockItem(
            company_id=company_id,
            name=name,
            stock_group_id=stock_group_id,
            sku=row.get(col_map.get("sku") or "", "").strip() or None,
            hsn_sac_code=hsn,
            unit_of_measure=row.get(col_map.get("unit_of_measure") or "", "Nos").strip() or "Nos",
            opening_qty=_float("opening_qty"),
            opening_rate=_float("opening_rate"),
            gst_rate=_float("gst_rate"),
            reorder_level=_float("reorder_level"),
        )
        db.add(item)
        imported += 1

    return {"imported": imported, "skipped": skipped, "errors": errors}


# ── Sample File Downloads ──────────────────────────────────────────────────

SAMPLE_DATA = {
    "ledgers": {
        "headers": ["name", "group", "opening_balance", "opening_balance_type", "gstin", "alias"],
        "rows": [
            ["Cash in Hand", "Cash-in-Hand", "50000", "Dr", "", "Cash"],
            ["HDFC Bank", "Bank Accounts", "250000", "Dr", "", "HDFC"],
            ["SBI Bank", "Bank Accounts", "180000", "Dr", "", "SBI"],
            ["Sales - Domestic", "Sales Accounts", "0", "Dr", "", ""],
            ["Purchases - Local", "Purchase Accounts", "0", "Dr", "", ""],
            ["Rent Expense", "Indirect Expenses", "12000", "Dr", "", ""],
            ["Salary Expense", "Indirect Expenses", "0", "Dr", "", ""],
            ["Capital Account", "Capital Account", "500000", "Cr", "", ""],
            ["GST Payable", "Duties & Taxes", "0", "Cr", "", ""],
            ["Accounts Receivable", "Trade Receivables", "0", "Dr", "", "Debtors"],
        ],
    },
    "parties": {
        "headers": ["name", "party_type", "gstin", "state_code", "pan", "address", "contact_person", "phone", "email"],
        "rows": [
            ["Acme Corp Pvt Ltd", "customer", "27AABCA1234F1Z5", "27", "AABCA1234F", "123 Business Park, Mumbai", "Rahul Sharma", "9876543210", "rahul@acme.in"],
            ["Global Traders", "customer", "06BBBDB5678G1Z8", "06", "BBBDB5678G", "45 Market Road, Delhi", "Priya Gupta", "9812345678", "priya@globaltraders.com"],
            ["Star Suppliers", "supplier", "29CCCCC9012H1Z1", "29", "CCCCC9012H", "78 Industrial Area, Bangalore", "Amit Kumar", "9900112233", "amit@starsuppliers.in"],
            ["Fresh Materials Co", "supplier", "24DDDDD3456J1Z4", "24", "DDDDD3456J", "32 GIDC, Ahmedabad", "Neha Patel", "9765432109", "neha@freshmaterials.com"],
            ["Tech Solutions Ltd", "both", "27EEEEE7890K1Z7", "27", "EEEEE7890K", "56 IT Hub, Pune", "Vikram Singh", "9654321098", "vikram@techsolutions.in"],
        ],
    },
    "stock_items": {
        "headers": ["name", "sku", "hsn_sac_code", "unit_of_measure", "opening_qty", "opening_rate", "gst_rate", "reorder_level", "stock_group"],
        "rows": [
            ["Laptop Dell Inspiron", "LAP-DELL-001", "8471", "Nos", "50", "45000", "18", "10", "Electronics"],
            ["Printer HP LaserJet", "PRN-HP-002", "8443", "Nos", "25", "18000", "18", "5", "Electronics"],
            ["A4 Paper Pack", "PAP-A4-003", "4819", "Pack", "200", "250", "12", "50", "Stationery"],
            ["Ballpoint Pen Box", "PEN-BP-004", "9608", "Box", "100", "120", "18", "20", "Stationery"],
            ["Office Chair Ergonomic", "CHR-ERG-005", "9401", "Nos", "30", "8500", "18", "5", "Furniture"],
        ],
    },
    "vouchers": {
        "headers": ["voucher_number", "voucher_date", "voucher_type", "ledger_name", "debit", "credit", "narration", "party_name"],
        "rows": [
            ["PV-001", "2026-04-01", "payment", "Cash", "", "50000", "Paid rent", ""],
            ["PV-001", "2026-04-01", "payment", "Rent Expense", "50000", "", "Paid rent", ""],
            ["SV-001", "2026-04-05", "sales", "Cash", "", "118000", "Sold goods to Royal Emporium", "Royal Emporium"],
            ["SV-001", "2026-04-05", "sales", "Sales - Domestic", "100000", "", "Sold goods to Royal Emporium", "Royal Emporium"],
            ["SV-001", "2026-04-05", "sales", "Output CGST", "9000", "", "", ""],
            ["SV-001", "2026-04-05", "sales", "Output SGST", "9000", "", "", ""],
            ["CN-001", "2026-04-10", "contra", "Cash", "", "20000", "Transfer to bank", ""],
            ["CN-001", "2026-04-10", "contra", "HDFC Bank", "20000", "", "Transfer to bank", ""],
            ["JV-001", "2026-04-15", "journal", "Depreciation Expense", "5000", "", "Monthly depreciation", ""],
            ["JV-001", "2026-04-15", "journal", "Accumulated Depreciation", "", "5000", "Monthly depreciation", ""],
        ],
    },
}


@router.get("/sample")
async def download_sample(entity_type: str = Query(..., description="ledgers, parties, or stock_items"), format: str = Query("csv", description="csv or xlsx")):
    """Download a sample CSV or Excel file for data import."""
    if entity_type not in SAMPLE_DATA:
        raise HTTPException(422, detail="entity_type must be 'ledgers', 'parties', 'stock_items', or 'vouchers'")

    data = SAMPLE_DATA[entity_type]

    if format == "xlsx":
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = entity_type.replace("_", " ").title()
        ws.append(data["headers"])
        for row in data["rows"]:
            ws.append(row)
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        filename = f"sample_{entity_type}.xlsx"
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # CSV
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(data["headers"])
    writer.writerows(data["rows"])
    buf.seek(0)
    filename = f"sample_{entity_type}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Data Export ─────────────────────────────────────────────────────────────


EXPORT_ENTITIES = {
    "ledgers": {
        "headers": ["name", "group", "opening_balance", "opening_balance_type", "gstin", "alias"],
        "model": Ledger,
    },
    "parties": {
        "headers": ["name", "party_type", "gstin", "state_code", "pan", "address", "contact_person", "phone", "email"],
        "model": Party,
    },
    "stock_items": {
        "headers": ["name", "sku", "hsn_sac_code", "unit_of_measure", "opening_qty", "opening_rate", "gst_rate", "reorder_level", "stock_group"],
        "model": StockItem,
    },
    "vouchers": {
        "headers": ["voucher_date", "voucher_number", "voucher_type", "party", "narration", "subtotal", "tax_total", "grand_total", "round_off", "status"],
        "model": Voucher,
    },
}


def _export_ledger_row(ledger: Ledger, db: Session) -> dict:
    group = db.get(AccountGroup, ledger.group_id) if ledger.group_id else None
    return {
        "name": ledger.name,
        "group": group.name if group else "",
        "opening_balance": str(ledger.opening_balance or 0),
        "opening_balance_type": ledger.opening_balance_type or "Dr",
        "gstin": ledger.gstin or "",
        "alias": ledger.alias or "",
    }


def _export_voucher_row(voucher: Voucher, db: Session) -> dict:
    """One row per voucher with a Round Off column (grand_total − subtotal − tax_total)."""
    party_name = ""
    if voucher.party_id:
        party = db.get(Party, voucher.party_id)
        if party:
            party_name = party.name
    round_off = float(voucher_round_off(voucher))
    return {
        "voucher_date": voucher.voucher_date or "",
        "voucher_number": voucher.voucher_number or "",
        "voucher_type": voucher.voucher_type or "",
        "party": party_name,
        "narration": voucher.narration or "",
        "subtotal": str(voucher.subtotal or 0),
        "tax_total": str(voucher.tax_total or 0),
        "grand_total": str(voucher.grand_total or 0),
        "round_off": str(round_off) if abs(round_off) >= 0.005 else "",
        "status": voucher.status or "",
    }


def _export_party_row(party: Party) -> dict:
    return {
        "name": party.name,
        "party_type": party.party_type or "",
        "gstin": party.gstin or "",
        "state_code": party.state_code or "",
        "pan": party.pan or "",
        "address": party.address or "",
        "contact_person": party.contact_person or "",
        "phone": party.phone or "",
        "email": party.email or "",
    }


def _export_stock_item_row(item: StockItem, db: Session) -> dict:
    group = db.get(StockGroup, item.stock_group_id) if item.stock_group_id else None
    return {
        "name": item.name,
        "sku": item.sku or "",
        "hsn_sac_code": item.hsn_sac_code or "",
        "unit_of_measure": item.unit_of_measure or "",
        "opening_qty": str(item.opening_qty or 0),
        "opening_rate": str(item.opening_rate or 0),
        "gst_rate": str(item.gst_rate or 0),
        "reorder_level": str(item.reorder_level or 0),
        "stock_group": group.name if group else "",
    }


@router.get("/export")
async def export_data(
    entity_type: str = Query(..., description="ledgers, parties, or stock_items"),
    format: str = Query("csv", description="csv or xlsx"),
    company: Company = Depends(require_role(CompanyRole.accountant)),
    db: Session = Depends(get_db),
):
    """Export ledgers, parties, or stock items as CSV or Excel."""
    if entity_type not in EXPORT_ENTITIES:
        raise HTTPException(422, detail="entity_type must be 'ledgers', 'parties', 'stock_items', or 'vouchers'")

    spec = EXPORT_ENTITIES[entity_type]
    model = spec["model"]
    headers = spec["headers"]

    if entity_type == "vouchers":
        rows = db.query(model).filter(model.company_id == company.id).order_by(model.voucher_date, model.created_at).all()
    else:
        rows = db.query(model).filter(model.company_id == company.id).order_by(model.name).all()

    if entity_type == "ledgers":
        data_rows = [_export_ledger_row(r, db) for r in rows]
    elif entity_type == "parties":
        data_rows = [_export_party_row(r) for r in rows]
    elif entity_type == "vouchers":
        data_rows = [_export_voucher_row(r, db) for r in rows]
    else:
        data_rows = [_export_stock_item_row(r, db) for r in rows]

    if format == "xlsx":
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = entity_type.replace("_", " ").title()
        ws.append(headers)
        for row in data_rows:
            ws.append([row[h] for h in headers])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        filename = f"{entity_type}_export.xlsx"
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # CSV
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers)
    writer.writeheader()
    writer.writerows(data_rows)
    buf.seek(0)
    filename = f"{entity_type}_export.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── CSV Import with Job Tracking ───────────────────────────────────────────


@router.post("/import-tracked")
async def import_data_tracked(
    entity_type: str = Query(..., description="ledgers, parties, or stock_items"),
    column_map_json: str | None = Query(None, alias="column_map"),
    skip_duplicates: bool = Query(True),
    file: UploadFile = File(...),
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import from CSV/Excel with job tracking (enables undo)."""
    if entity_type not in ("ledgers", "parties", "stock_items", "vouchers"):
        raise HTTPException(422, detail="entity_type must be 'ledgers', 'parties', 'stock_items', or 'vouchers'")

    content = await file.read()
    filename = (file.filename or "").lower()
    is_excel = filename.endswith(".xlsx") or filename.endswith(".xls")

    headers, rows = _parse_excel(content) if is_excel else _parse_csv(content)

    if not rows:
        raise HTTPException(422, detail="No data rows found in file")

    # Parse column map
    alias_map = {
        "ledgers": LEDGER_ALIASES,
        "parties": PARTY_ALIASES,
        "stock_items": STOCK_ITEM_ALIASES,
        "vouchers": VOUCHER_ALIASES,
    }
    col_map = _detect_columns(headers, alias_map[entity_type])
    if column_map_json:
        try:
            raw = json.loads(column_map_json)
            for field, col in raw.items():
                if col:
                    col_map[field] = col
                elif field in col_map:
                    col_map[field] = None
        except (json.JSONDecodeError, TypeError):
            raise HTTPException(422, detail="Invalid column_map JSON")

    # Create import job
    job = ImportJob(
        company_id=company.id,
        user_id=user.id,
        import_type="csv",
        filename=file.filename,
        content=content,
        status="parsed",
        summary={"entity_type": entity_type, "total_rows": len(rows), "columns": headers},
    )
    db.add(job)
    db.flush()

    # Execute import
    if entity_type == "ledgers":
        result = _import_ledgers_tracked(db, company.id, rows, col_map, skip_duplicates, job)
    elif entity_type == "parties":
        result = _import_parties_tracked(db, company.id, rows, col_map, skip_duplicates, job)
    elif entity_type == "stock_items":
        result = _import_stock_items_tracked(db, company.id, rows, col_map, skip_duplicates, job)
    elif entity_type == "vouchers":
        result = _import_vouchers_tracked(db, company.id, user.id, rows, col_map, skip_duplicates, job)

    job.status = "completed"
    job.created_counts = {
        entity_type: result["imported"],
    }
    # Store as {entity_type: [items]} — undo iterates ``.items()`` expecting
    # this shape. (Round 14: the tracked importers returned a flat list, so
    # undo of any tracked import crashed with ``'list' object has no
    # attribute 'items'``.)
    job.created_details = {
        entity_type: result.get("created_details", []),
    }
    if result["errors"]:
        job.errors = {"errors": result["errors"]}

    db.commit()
    db.refresh(job)

    notify(
        db, company.id,
        title=f"Data Imported: {entity_type.replace('_', ' ').title()}",
        message=f"{result['imported']} records imported" + (f", {result['skipped']} duplicates skipped" if result["skipped"] else ""),
        category="success",
        link="/data-import",
        user_id=user.id,
        entity_type=entity_type,
    )
    db.commit()
    from app.services.audit import log_action
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="CREATE", entity_type="data_import", entity_id=job.id,
        new_value={"entity_type": entity_type, "imported": result["imported"], "skipped": result["skipped"]},
        description=f"Imported {result['imported']} {entity_type} (job {job.id})",
    )
    db.commit()

    return {
        "job_id": job.id,
        "imported": result["imported"],
        "skipped": result["skipped"],
        "errors": result["errors"],
    }


def _import_ledgers_tracked(db: Session, company_id: str, rows: list[dict], col_map: dict, skip_dup: bool, job: ImportJob) -> dict:
    imported = 0
    skipped = 0
    errors = []
    created_details = []

    for i, row in enumerate(rows):
        name = row.get(col_map.get("name") or "", "").strip()
        if not name:
            errors.append(f"Row {i + 2}: missing name")
            continue

        existing = db.query(Ledger).filter(Ledger.company_id == company_id, Ledger.name == name).first()
        if existing:
            if skip_dup:
                skipped += 1
                continue
            errors.append(f"Row {i + 2}: '{name}' already exists")
            continue

        group_name = row.get(col_map.get("group") or "", "").strip()
        group_id = None
        if group_name:
            ag = db.query(AccountGroup).filter(
                AccountGroup.company_id == company_id, AccountGroup.name == group_name
            ).first()
            if ag:
                group_id = ag.id
        if not group_id:
            default = db.query(AccountGroup).filter(AccountGroup.company_id == company_id).first()
            group_id = default.id if default else None
        if not group_id:
            errors.append(f"Row {i + 2}: no account groups found. Create groups first.")
            continue

        ob_str = row.get(col_map.get("opening_balance") or "", "0").strip() or "0"
        ob_type = row.get(col_map.get("opening_balance_type") or "", "Dr").strip() or "Dr"
        if ob_type.upper().startswith("C"):
            ob_type = "Cr"
        else:
            ob_type = "Dr"

        try:
            ob = float(ob_str.replace(",", "").replace("₹", "").strip() or "0")
        except ValueError:
            ob = 0.0

        ledger = Ledger(
            company_id=company_id,
            name=name,
            group_id=group_id,
            opening_balance=ob,
            opening_balance_type=ob_type,
            gstin=row.get(col_map.get("gstin") or "", "").strip() or None,
            alias=row.get(col_map.get("alias") or "", "").strip() or None,
        )
        db.add(ledger)
        db.flush()
        imported += 1
        created_details.append({"id": ledger.id, "name": ledger.name})

    return {"imported": imported, "skipped": skipped, "errors": errors, "created_details": created_details}


def _import_parties_tracked(db: Session, company_id: str, rows: list[dict], col_map: dict, skip_dup: bool, job: ImportJob) -> dict:
    imported = 0
    skipped = 0
    errors = []
    created_details = []

    for i, row in enumerate(rows):
        name = row.get(col_map.get("name") or "", "").strip()
        if not name:
            errors.append(f"Row {i + 2}: missing name")
            continue

        existing = db.query(Party).filter(Party.company_id == company_id, Party.name == name).first()
        if existing:
            if skip_dup:
                skipped += 1
                continue
            errors.append(f"Row {i + 2}: '{name}' already exists")
            continue

        party_type = row.get(col_map.get("party_type") or "", "customer").strip().lower() or "customer"
        if party_type not in ("customer", "supplier", "both", "employee", "transporter",
                              "agent_broker", "contractor", "consultant", "lender"):
            party_type = "customer"

        state_code = row.get(col_map.get("state_code") or "", "").strip() or None

        party = Party(
            company_id=company_id,
            name=name,
            party_type=party_type,
            gstin=row.get(col_map.get("gstin") or "", "").strip() or None,
            state_code=state_code,
            pan=row.get(col_map.get("pan") or "", "").strip() or None,
            address=row.get(col_map.get("address") or "", "").strip() or None,
            contact_person=row.get(col_map.get("contact_person") or "", "").strip() or None,
            phone=row.get(col_map.get("phone") or "", "").strip() or None,
            email=row.get(col_map.get("email") or "", "").strip() or None,
        )
        db.add(party)
        db.flush()
        imported += 1
        created_details.append({"id": party.id, "name": party.name})

    return {"imported": imported, "skipped": skipped, "errors": errors, "created_details": created_details}


def _import_stock_items_tracked(db: Session, company_id: str, rows: list[dict], col_map: dict, skip_dup: bool, job: ImportJob) -> dict:
    imported = 0
    skipped = 0
    errors = []
    created_details = []

    for i, row in enumerate(rows):
        name = row.get(col_map.get("name") or "", "").strip()
        if not name:
            errors.append(f"Row {i + 2}: missing name")
            continue

        existing = db.query(StockItem).filter(StockItem.company_id == company_id, StockItem.name == name).first()
        if existing:
            if skip_dup:
                skipped += 1
                continue
            errors.append(f"Row {i + 2}: '{name}' already exists")
            continue

        stock_group_name = row.get(col_map.get("stock_group") or "", "").strip()
        stock_group_id = None
        if stock_group_name:
            sg = db.query(StockGroup).filter(
                StockGroup.company_id == company_id, StockGroup.name == stock_group_name
            ).first()
            if sg:
                stock_group_id = sg.id

        def _float(field: str, default: float = 0) -> float:
            val = row.get(col_map.get(field) or "", str(default)).strip() or str(default)
            val = val.replace(",", "").replace("₹", "").replace("%", "").strip()
            try:
                return float(val)
            except ValueError:
                return default

        hsn = row.get(col_map.get("hsn_sac_code") or "", "").strip() or None
        if hsn:
            hsn = "".join(c for c in hsn if c.isdigit())
            if len(hsn) < 4 or len(hsn) > 8:
                hsn = None

        item = StockItem(
            company_id=company_id,
            name=name,
            stock_group_id=stock_group_id,
            sku=row.get(col_map.get("sku") or "", "").strip() or None,
            hsn_sac_code=hsn,
            unit_of_measure=row.get(col_map.get("unit_of_measure") or "", "Nos").strip() or "Nos",
            opening_qty=_float("opening_qty"),
            opening_rate=_float("opening_rate"),
            gst_rate=_float("gst_rate"),
            reorder_level=_float("reorder_level"),
        )
        db.add(item)
        db.flush()
        imported += 1
        created_details.append({"id": item.id, "name": item.name})

    return {"imported": imported, "skipped": skipped, "errors": errors, "created_details": created_details}




def _import_vouchers_tracked(db: Session, company_id: str, user_id: str, rows: list[dict], col_map: dict, skip_dup: bool, job: ImportJob) -> dict:
    """Import vouchers from CSV/Excel rows with job tracking."""
    from decimal import Decimal
    from app.models.accounting import Ledger
    from app.models.voucher import Voucher, VoucherLine

    imported = 0
    skipped = 0
    errors = []
    created_details = []

    # Build ledger map for this company
    ledgers_map: dict[str, str] = {}
    for lgr in db.query(Ledger).filter(Ledger.company_id == company_id).all():
        ledgers_map[lgr.name] = lgr.id

    # Group rows by voucher number
    grouped: dict[str, dict] = {}
    for i, row in enumerate(rows):
        vno = row.get(col_map.get("voucher_number") or "", "").strip()
        if not vno:
            errors.append(f"Row {i + 2}: missing voucher_number")
            continue
        if vno not in grouped:
            grouped[vno] = {
                "voucher_number": vno,
                "voucher_date": row.get(col_map.get("voucher_date") or "", "").strip(),
                "voucher_type": row.get(col_map.get("voucher_type") or "", "journal").strip().lower(),
                "narration": row.get(col_map.get("narration") or "", "").strip(),
                "party_name": row.get(col_map.get("party_name") or "", "").strip(),
                "reference": row.get(col_map.get("reference") or "", "").strip(),
                "place_of_supply": row.get(col_map.get("place_of_supply") or "", "").strip(),
                "lines": [],
            }
        g = grouped[vno]
        if row.get(col_map.get("voucher_date") or ""):
            g["voucher_date"] = row.get(col_map.get("voucher_date") or "")
        if row.get(col_map.get("voucher_type") or ""):
            g["voucher_type"] = row.get(col_map.get("voucher_type") or "").strip().lower()
        if row.get(col_map.get("narration") or ""):
            g["narration"] = row.get(col_map.get("narration") or "")

        ledger = row.get(col_map.get("ledger_name") or "", "").strip()
        debit_str = row.get(col_map.get("debit") or "", "0").strip() or "0"
        credit_str = row.get(col_map.get("credit") or "", "0").strip() or "0"
        try:
            debit = Decimal(debit_str.replace(",", "").replace("\u20b9", ""))
            credit = Decimal(credit_str.replace(",", "").replace("\u20b9", ""))
        except Exception:
            errors.append(f"Row {i + 2}: invalid debit/credit value")
            continue
        if not ledger and debit == 0 and credit == 0:
            continue
        g["lines"].append({"ledger_name": ledger, "debit": debit, "credit": credit})

    for vno, g in grouped.items():
        # Check for duplicate
        existing = db.query(Voucher).filter(
            Voucher.company_id == company_id,
            Voucher.voucher_number == vno,
            Voucher.voucher_type == g["voucher_type"],
        ).first()
        if existing:
            if skip_dup:
                skipped += 1
                continue
            else:
                errors.append(f"Voucher {vno} already exists")
                continue

        lines_data = g["lines"]
        if not lines_data:
            errors.append(f"Voucher {vno}: no valid lines")
            continue

        # Build ledger entries and check balance
        entry_list: list[dict] = []
        for li in lines_data:
            lid = ledgers_map.get(li["ledger_name"])
            if not lid:
                errors.append(f"Voucher {vno}: ledger '{li['ledger_name']}' not found")
                continue
            entry_list.append({"ledger_id": lid, "debit": float(li["debit"]), "credit": float(li["credit"])})

        total_dr = sum(e["debit"] for e in entry_list)
        total_cr = sum(e["credit"] for e in entry_list)
        if abs(total_dr - total_cr) > 0.001:
            errors.append(f"Voucher {vno}: unbalanced (Dr={total_dr}, Cr={total_cr})")
            continue

        total = Decimal(str(max(total_dr, total_cr)))

        voucher = Voucher(
            company_id=company_id,
            voucher_type=g["voucher_type"],
            voucher_number=vno,
            voucher_date=g["voucher_date"],
            narration=g.get("narration") or None,
            reference=g.get("reference") or None,
            place_of_supply=g.get("place_of_supply") or None,
            subtotal=total,
            grand_total=total,
            created_by=user_id,
        )
        db.add(voucher)
        db.flush()

        for e in entry_list:
            line = VoucherLine(
                voucher_id=voucher.id,
                ledger_id=e["ledger_id"],
                debit=e["debit"],
                credit=e["credit"],
            )
            db.add(line)

        db.flush()
        imported += 1
        created_details.append({"voucher_number": vno, "voucher_type": g["voucher_type"], "id": str(voucher.id)})

    # Update job summary
    if job.logs is None:
        job.logs = []
    from app.services.tally_importer import log_detail
    log_detail(job.logs, "complete", f"Voucher import: {imported} created, {skipped} skipped, {len(errors)} errors")

    return {"imported": imported, "skipped": skipped, "errors": errors, "created_details": created_details}

# ── CSV Undo ────────────────────────────────────────────────────────────────


@router.post("/undo/{job_id}")
async def undo_csv_import(
    job_id: str,
    company: Company = Depends(require_role(CompanyRole.accountant)),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Undo a CSV import job by deleting created records."""
    job = db.get(ImportJob, job_id)
    if not job or job.company_id != company.id:
        raise HTTPException(404, detail="Import job not found")
    if job.status != "completed":
        raise HTTPException(400, detail=f"Job is in '{job.status}' state, expected 'completed'")
    if job.import_type != "csv":
        raise HTTPException(400, detail="Can only undo CSV import jobs")

    removed = 0
    skipped = 0
    if job.created_details:
        for entity_type_key, items in job.created_details.items():
            for item in items:
                item_id = item.get("id")
                if not item_id:
                    continue
                if entity_type_key == "ledgers":
                    ledger = db.get(Ledger, item_id)
                    if ledger and ledger.company_id == company.id:
                        # Check if ledger is referenced by vouchers
                        ref = db.query(Voucher).filter(
                            Voucher.company_id == company.id,
                        ).first()
                        if ref:
                            skipped += 1
                        else:
                            db.delete(ledger)
                            removed += 1
                elif entity_type_key == "parties":
                    party = db.get(Party, item_id)
                    if party and party.company_id == company.id:
                        db.delete(party)
                        removed += 1
                elif entity_type_key == "stock_items":
                    stock_item = db.get(StockItem, item_id)
                    if stock_item and stock_item.company_id == company.id:
                        db.delete(stock_item)
                        removed += 1

    job.status = "undone"
    job.errors = {"removed": removed, "skipped": skipped}
    db.commit()
    db.refresh(job)
    from app.services.audit import log_action
    log_action(
        db, company_id=company.id, user_id=user.id,
        action="DELETE", entity_type="data_import", entity_id=job.id,
        new_value={"removed": removed, "skipped": skipped},
        description=f"Undid import job (removed {removed} records)",
    )
    db.commit()

    return {
        "job_id": job.id,
        "removed": removed,
        "skipped": skipped,
    }
