"""Parse Tally XML export files into structured Python dicts.

Tally exports data in XML with tags like:
  <ENVELOPE><BODY><IMPORTDATA><RESULT>
    <LIST.GROUPS><GROUP>...</GROUP></LIST.GROUPS>
    <LIST.LEDGERS><LEDGER>...</LEDGER></LIST.LEDGERS>
    <LIST.VOUCHERS><VOUCHER>...</VOUCHER></LIST.VOUCHERS>
"""
from __future__ import annotations

import io
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation


def _text(el: ET.Element | None, tag: str, default: str = "") -> str:
    """Get text content of a child element."""
    child = el.find(tag) if el is not None else None
    return (child.text or "").strip() if child is not None else default


def _decimal(el: ET.Element | None, tag: str, default: Decimal = Decimal("0")) -> Decimal:
    """Get decimal value from a child element."""
    txt = _text(el, tag, "")
    if not txt:
        return default
    try:
        return Decimal(txt.replace(",", ""))
    except InvalidOperation:
        return default


def _date_to_iso(tally_date: str) -> str:
    """Convert Tally date format (DD-MM-YYYY or DDMonYYYY) to ISO (YYYY-MM-DD)."""
    if not tally_date:
        return ""
    tally_date = tally_date.strip()
    # Try DD-MM-YYYY
    m = re.match(r"(\d{1,2})-(\d{1,2})-(\d{4})", tally_date)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    # Try DD/MM/YYYY
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", tally_date)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    # Try DDMMYYYY
    m = re.match(r"(\d{2})(\d{2})(\d{4})", tally_date)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    # Already ISO?
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", tally_date)
    if m:
        return tally_date
    return tally_date


@dataclass
class ParsedGroup:
    name: str
    parent_name: str = ""
    nature: str = "assets"
    group_type: str = "sub"
    is_system: bool = False


@dataclass
class ParsedLedger:
    name: str
    group_name: str = ""
    opening_balance: Decimal = Decimal("0")
    opening_balance_type: str = "Dr"
    gstin: str = ""
    alias: str = ""
    currency: str = ""


@dataclass
class ParsedParty:
    name: str
    party_type: str = "both"
    ledger_name: str = ""
    gstin: str = ""
    state_code: str = ""
    pan: str = ""
    address: str = ""


@dataclass
class ParsedVoucherLine:
    ledger_name: str = ""
    debit: Decimal = Decimal("0")
    credit: Decimal = Decimal("0")
    quantity: Decimal | None = None
    rate: Decimal | None = None
    amount: Decimal = Decimal("0")
    gst_rate: Decimal | None = None
    hsn_sac: str = ""


@dataclass
class ParsedVoucher:
    voucher_type: str = "journal"
    voucher_number: str = ""
    voucher_date: str = ""
    narration: str = ""
    reference: str = ""
    party_name: str = ""
    place_of_supply: str = ""
    document_type: str = "regular"
    lines: list[ParsedVoucherLine] = field(default_factory=list)


@dataclass
class ParsedStockGroup:
    name: str


@dataclass
class ParsedStockItem:
    name: str
    group_name: str = ""
    unit: str = ""
    hsn_sac: str = ""
    gst_rate: Decimal = Decimal("0")
    opening_qty: Decimal = Decimal("0")
    opening_rate: Decimal = Decimal("0")


@dataclass
class TallyData:
    groups: list[ParsedGroup] = field(default_factory=list)
    ledgers: list[ParsedLedger] = field(default_factory=list)
    parties: list[ParsedParty] = field(default_factory=list)
    vouchers: list[ParsedVoucher] = field(default_factory=list)
    stock_groups: list[ParsedStockGroup] = field(default_factory=list)
    stock_items: list[ParsedStockItem] = field(default_factory=list)


# ── Tally nature mapping ─────────────────────────────────────────────────
TALLY_NATURE_MAP = {
    "Assets": "assets",
    "Liabilities": "liabilities",
    "Income": "income",
    "Expenses": "expenses",
    "Capital": "capital",
}

TALLY_VOUCHER_TYPE_MAP = {
    "Sales": "sales",
    "Purchase": "purchase",
    "Receipt": "receipt",
    "Payment": "payment",
    "Journal": "journal",
    "Contra": "contra",
    "Credit Note": "credit_note",
    "Debit Note": "debit_note",
    "Sales Order": "sales",
    "Purchase Order": "purchase",
}


def _parse_group(el: ET.Element) -> ParsedGroup:
    name = _text(el, "NAME") or _text(el, "LedgerName") or ""
    parent = _text(el, "PARENT") or _text(el, "GROUP") or ""
    nature_raw = _text(el, "NATUREOFGROUP") or _text(el, "Nature") or ""

    # Determine group_type
    is_primary = parent == "" or nature_raw != ""
    group_type = "primary" if is_primary else "sub"

    # Map nature
    nature = TALLY_NATURE_MAP.get(nature_raw, "assets")

    return ParsedGroup(
        name=name,
        parent_name=parent,
        nature=nature,
        group_type=group_type,
    )


def _parse_ledger(el: ET.Element) -> ParsedLedger:
    name = _text(el, "NAME") or _text(el, "LedgerName") or ""
    group = _text(el, "PARENT") or _text(el, "GROUP") or _text(el, "Under") or ""
    ob = _decimal(el, "OPENINGBALANCE")
    ob_type_text = _text(el, "OPENINGBALANCETYPE") or _text(el, "DrCr") or "Dr"
    gstin = _text(el, "GSTIN") or _text(el, "GSTRegistrationNumber") or ""
    alias = _text(el, "ALIAS") or _text(el, "MailingName") or ""
    currency = _text(el, "CURRENCYNAME") or _text(el, "CURRENCY") or ""

    # Opening balance sign convention
    ob_type = "Dr" if ob >= 0 else "Cr"
    ob_amount = abs(ob)

    return ParsedLedger(
        name=name,
        group_name=group,
        opening_balance=ob_amount,
        opening_balance_type=ob_type,
        gstin=gstin,
        alias=alias,
        currency=currency if currency and currency != "INR" else "",
    )


def _parse_party(el: ET.Element) -> ParsedParty:
    name = _text(el, "NAME") or _text(el, "LedgerName") or ""
    party_type_raw = _text(el, "LEDGERENTRIES") or _text(el, "PartyType") or "both"
    party_type = "both"
    if "customer" in party_type_raw.lower() or "debtor" in party_type_raw.lower():
        party_type = "customer"
    elif "supplier" in party_type_raw.lower() or "creditor" in party_type_raw.lower():
        party_type = "supplier"

    gstin = _text(el, "GSTIN") or _text(el, "GSTRegistrationNumber") or ""
    state = _text(el, "STATE") or _text(el, "STATENAME") or ""
    pan = _text(el, "PAN") or _text(el, "PANNUMBER") or ""
    address = _text(el, "ADDRESS") or ""

    return ParsedParty(
        name=name,
        party_type=party_type,
        ledger_name=name,
        gstin=gstin,
        state_code=state[:2] if state else "",
        pan=pan,
        address=address,
    )


def _extract_voucher_line(
    lines: list[ParsedVoucherLine],
    entry: ET.Element,
    vtype: str,
) -> None:
    lname = _text(entry, "LEDGERNAME") or entry.tag or ""
    if not lname or lname.startswith("LEDGER"):
        return
    debit = _decimal(entry, "DEBIT")
    credit = _decimal(entry, "CREDIT")
    amount = _decimal(entry, "AMOUNT")
    qty = _decimal(entry, "ACTUALQTY") or None
    rate = _decimal(entry, "RATE") or None

    if qty and qty == Decimal("0"):
        qty = None
    if rate and rate == Decimal("0"):
        rate = None

    if debit == 0 and credit == 0 and amount != 0:
        if vtype in ("sales", "receipt", "credit_note"):
            credit = abs(amount)
        else:
            debit = abs(amount)

    lines.append(ParsedVoucherLine(
        ledger_name=lname,
        debit=abs(debit),
        credit=abs(credit),
        quantity=qty,
        rate=rate,
        amount=amount,
    ))


def _parse_ledger_entries(
    container: ET.Element,
    lines: list[ParsedVoucherLine],
    vtype: str,
) -> None:
    for entry in container:
        # Skip XML text nodes
        if entry.tag is None:
            continue
        # Recursively enter grouping containers (LEDGERENTRIES that have children)
        children = list(entry)
        if children:
            first_child_tags = {c.tag for c in children if c.tag is not None}
            # If first level children contain container-like tags, recurse
            if first_child_tags & {"LEDGERENTRIES", "LEDGERENTRY"}:
                _parse_ledger_entries(entry, lines, vtype)
                continue
        _extract_voucher_line(lines, entry, vtype)


def _parse_voucher(el: ET.Element) -> ParsedVoucher:
    vtype_raw = _text(el, "VOUCHERTYPENAME") or _text(el, "VoucherType") or "Journal"
    vtype = TALLY_VOUCHER_TYPE_MAP.get(vtype_raw, "journal")

    vnum = _text(el, "VOUCHERNUMBER") or _text(el, "Number") or ""
    vdate = _date_to_iso(_text(el, "DATE") or _text(el, "VoucherDate") or "")
    narration = _text(el, "NARRATION") or ""
    reference = _text(el, "REFERENCE") or _text(el, "Ref") or ""
    party = _text(el, "PARTYNAME") or _text(el, "PartyLedgerName") or ""
    pos = _text(el, "PLACEOF SUPPLY") or _text(el, "PlaceOfSupply") or ""

    lines: list[ParsedVoucherLine] = []
    for le in el.iter():
        if le.tag not in ("ALLLEDGERENTRIES.LIST", "LEDGERENTRIES.LIST"):
            continue
        _parse_ledger_entries(le, lines, vtype)

    return ParsedVoucher(
        voucher_type=vtype,
        voucher_number=vnum,
        voucher_date=vdate,
        narration=narration,
        reference=reference,
        party_name=party,
        place_of_supply=pos,
        lines=lines,
    )


def parse_tally_xml(xml_content: str) -> TallyData:
    """Parse Tally XML export content into structured data."""
    data = TallyData()

    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError:
        return data

    # Find all group elements
    for group_list in root.iter():
        if group_list.tag in ("LIST.GROUPS", "GROUPS"):
            for g in group_list.findall("GROUP"):
                data.groups.append(_parse_group(g))

    # Find all ledger elements
    for ledger_list in root.iter():
        if ledger_list.tag in ("LIST.LEDGERS", "LEDGERS"):
            for l in ledger_list.findall("LEDGER"):
                data.ledgers.append(_parse_ledger(l))

    # Find all voucher elements
    for voucher_list in root.iter():
        if voucher_list.tag in ("LIST.VOUCHERS", "VOUCHERS"):
            for v in voucher_list.findall("VOUCHER"):
                data.vouchers.append(_parse_voucher(v))

    # Find stock groups and items
    for stock_list in root.iter():
        if stock_list.tag in ("LIST.STOCKGROUPS", "STOCKGROUPS"):
            for sg in stock_list.findall("STOCKGROUP"):
                name = _text(sg, "NAME") or ""
                if name:
                    data.stock_groups.append(ParsedStockGroup(name=name))

        if stock_list.tag in ("LIST.STOCKITEMS", "STOCKITEMS"):
            for si in stock_list.findall("STOCKITEM"):
                name = _text(si, "NAME") or ""
                group = _text(si, "PARENT") or ""
                unit = _text(si, "BASEUNITS") or ""
                hsn = _text(si, "HSNSACCODE") or ""
                gst = _decimal(si, "GSTRATE")
                oq = _decimal(si, "OPENINGQTY")
                orr = _decimal(si, "OPENINGRATE")
                data.stock_items.append(ParsedStockItem(
                    name=name, group_name=group, unit=unit,
                    hsn_sac=hsn, gst_rate=gst,
                    opening_qty=oq, opening_rate=orr,
                ))

    return data


def parse_tally_excel(content: bytes) -> TallyData:
    """Parse an Excel workbook (.xlsx) into structured Tally data.

    Expected sheets: Groups, Ledgers, Parties, Stock Groups, Stock Items, Vouchers.
    Vouchers use one-row-per-line format — rows with the same
    voucher_number+voucher_type are grouped into a single voucher.
    """
    import openpyxl

    data = TallyData()

    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception:
        return data

    def _sheet_rows(name: str):
        """Yield dicts for each row (header → value) in a sheet, skipping empty rows."""
        if name not in wb.sheetnames:
            return
        ws = wb[name]
        headers: list[str] = []
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if not any(c is not None for c in row):
                continue
            if i == 0:
                headers = [str(c).lower().strip().replace(" ", "_") if c else f"col_{j}" for j, c in enumerate(row)]
                continue
            yield dict(zip(headers, row))

    # ── Groups ──
    for row in _sheet_rows("Groups"):
        name = str(row.get("name", row.get("group_name", "")) or "")
        parent = str(row.get("parent", "") or "")
        nature = str(row.get("nature", "assets") or "")
        if name:
            data.groups.append(ParsedGroup(name=name, parent_name=parent, nature=nature))

    # ── Ledgers ──
    for row in _sheet_rows("Ledgers"):
        name = str(row.get("name", "") or "")
        group = str(row.get("group", row.get("under", "")) or "")
        ob = row.get("opening_balance", 0) or 0
        gstin = str(row.get("gstin", "") or "")
        if name:
            data.ledgers.append(ParsedLedger(
                name=name, group_name=group,
                opening_balance=Decimal(str(ob)),
                gstin=gstin,
            ))

    # ── Parties ──
    for row in _sheet_rows("Parties"):
        name = str(row.get("name", "") or "")
        party_type = str(row.get("type", "both") or "both")
        gstin = str(row.get("gstin", "") or "")
        state = str(row.get("state_code", "") or "")
        if name:
            data.parties.append(ParsedParty(
                name=name, party_type=party_type,
                gstin=gstin, state_code=state,
            ))

    # ── Stock Groups ──
    for row in _sheet_rows("Stock Groups"):
        name = str(row.get("name", "") or "")
        if name:
            data.stock_groups.append(ParsedStockGroup(name=name))

    # ── Stock Items ──
    for row in _sheet_rows("Stock Items"):
        name = str(row.get("name", "") or "")
        group = str(row.get("group", "") or "")
        unit = str(row.get("unit", "") or "")
        hsn = str(row.get("hsn", row.get("hsn_sac", "")) or "")
        gst_rate = row.get("gst_rate", 0) or 0
        oq = row.get("opening_qty", 0) or 0
        oqr = row.get("opening_rate", 0) or 0
        if name:
            data.stock_items.append(ParsedStockItem(
                name=name, group_name=group, unit=unit,
                hsn_sac=hsn, gst_rate=Decimal(str(gst_rate)),
                opening_qty=Decimal(str(oq)), opening_rate=Decimal(str(oqr)),
            ))

    # ── Vouchers (one row per line, grouped by number+type) ──
    voucher_map: dict[tuple[str, str], ParsedVoucher] = {}
    for row in _sheet_rows("Vouchers"):
        vtype_raw = str(row.get("voucher_type", "") or "").strip()
        vnum = str(row.get("voucher_number", "") or "").strip()
        vdate = str(row.get("date", "") or "").strip()
        narration = str(row.get("narration", "") or "").strip()
        ledger = str(row.get("ledger_name", "") or "").strip()
        debit = row.get("debit", 0) or 0
        credit = row.get("credit", 0) or 0

        if not vnum or not ledger:
            continue

        key = (vtype_raw, vnum)
        if key not in voucher_map:
            vtype = TALLY_VOUCHER_TYPE_MAP.get(vtype_raw, "journal")
            voucher_map[key] = ParsedVoucher(
                voucher_type=vtype,
                voucher_number=vnum,
                voucher_date=_date_to_iso(vdate),
                narration=narration,
            )

        voucher_map[key].lines.append(ParsedVoucherLine(
            ledger_name=ledger,
            debit=abs(Decimal(str(debit))),
            credit=abs(Decimal(str(credit))),
            amount=abs(Decimal(str(debit))) if Decimal(str(debit)) > 0 else abs(Decimal(str(credit))),
        ))

    data.vouchers = list(voucher_map.values())

    wb.close()
    return data


def parse_tally_csv(csv_content: str) -> TallyData:
    """Parse a simple CSV export from Tally (ledger list or voucher list)."""
    import csv
    import io

    data = TallyData()
    reader = csv.DictReader(io.StringIO(csv_content))

    if not reader.fieldnames:
        return data

    # Detect what kind of CSV this is based on column names
    cols_lower = {c.lower().strip(): c for c in reader.fieldnames}

    if "under" in cols_lower or "group" in cols_lower:
        # Ledger CSV
        for row in reader:
            data.ledgers.append(ParsedLedger(
                name=row.get("name", row.get("ledger name", "")) or "",
                group_name=row.get("under", row.get("group", "")) or "",
                opening_balance=Decimal(row.get("opening balance", "0").replace(",", "") or "0"),
                gstin=row.get("gstin", "") or "",
            ))
    elif "vouchertype" in cols_lower or "voucher type" in cols_lower:
        # Voucher CSV
        for row in reader:
            data.vouchers.append(ParsedVoucher(
                voucher_type=TALLY_VOUCHER_TYPE_MAP.get(
                    row.get("vouchertype", row.get("voucher type", "")) or "", "journal"
                ),
                voucher_number=row.get("vouchernumber", row.get("voucher number", "")) or "",
                voucher_date=_date_to_iso(row.get("date", "")),
                narration=row.get("narration", "") or "",
            ))

    return data
