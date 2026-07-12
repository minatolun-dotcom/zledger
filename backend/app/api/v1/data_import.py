"""Data import endpoints: CSV/Excel import for ledgers, parties, stock items."""
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
from app.models.stock import StockGroup, StockItem
from app.models.user import Company, User
from app.schemas.member import CompanyRole
from app.services.notification import notify

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
    "party_type": ["party_type", "type", "party type", "customer/supplier"],
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
    if entity_type not in ("ledgers", "parties", "stock_items"):
        raise HTTPException(422, detail="entity_type must be 'ledgers', 'parties', or 'stock_items'")

    content = await file.read()
    filename = (file.filename or "").lower()
    is_excel = filename.endswith(".xlsx") or filename.endswith(".xls")

    headers, rows = _parse_excel(content) if is_excel else _parse_csv(content)

    alias_map = {
        "ledgers": LEDGER_ALIASES,
        "parties": PARTY_ALIASES,
        "stock_items": STOCK_ITEM_ALIASES,
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
    if entity_type not in ("ledgers", "parties", "stock_items"):
        raise HTTPException(422, detail="entity_type must be 'ledgers', 'parties', or 'stock_items'")

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
        if party_type not in ("customer", "supplier", "both"):
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
            ["Accounts Receivable", "Sundry Debtors", "0", "Dr", "", "Debtors"],
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
}


@router.get("/sample")
async def download_sample(entity_type: str = Query(..., description="ledgers, parties, or stock_items"), format: str = Query("csv", description="csv or xlsx")):
    """Download a sample CSV or Excel file for data import."""
    if entity_type not in SAMPLE_DATA:
        raise HTTPException(422, detail="entity_type must be 'ledgers', 'parties', or 'stock_items'")

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
