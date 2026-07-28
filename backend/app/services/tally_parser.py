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


# Tally emits invalid numeric character references such as ``&#4;`` (a control
# character used as a "Not Applicable" placeholder). ElementTree rejects these,
# so strip any numeric/hex char reference whose code point is a control char.
_CTRL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _strip_invalid_char_refs(xml: str) -> str:
    def _repl(m: re.Match) -> str:
        ref = m.group(0)
        try:
            body = ref[2:-1]
            cp = int(body, 16) if body[:1] in "xX" else int(body)
        except ValueError:
            return ref
        if cp < 0x20 and cp not in (0x09, 0x0A, 0x0D):
            return ""
        return ref
    return re.sub(r"&#x?[0-9A-Fa-f]+;", _repl, xml)


def _sanitize_xml(xml: str) -> str:
    """Make a Tally XML string parseable: drop invalid char references and
    stray control characters that ElementTree would reject."""
    return _CTRL_CHARS.sub("", _strip_invalid_char_refs(xml))


def _decimal(el: ET.Element | None, tag: str, default: Decimal = Decimal("0")) -> Decimal:
    """Get decimal value from a child element."""
    txt = _text(el, tag, "")
    if not txt:
        return default
    try:
        return Decimal(txt.replace(",", ""))
    except InvalidOperation:
        return default


_MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], start=1)}


def _date_to_iso(tally_date: str) -> str:
    """Convert common Tally date formats to ISO (YYYY-MM-DD).

    Handles: ``YYYYMMDD``, ``DD-MM-YYYY``, ``DD/MM/YYYY``, ``D-Mon-YYYY``
    (e.g. ``1-Apr-2026``), and already-ISO dates.
    """
    if not tally_date:
        return ""
    s = tally_date.strip()
    # YYYYMMDD (8-digit, year first) — Tally data-export format
    if re.fullmatch(r"\d{8}", s):
        y, m, d = s[:4], s[4:6], s[6:8]
        try:
            return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
        except ValueError:
            return s
    # DD-MM-YYYY or DD/MM/YYYY
    m = re.match(r"(\d{1,2})[-/](\d{1,2})[-/](\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    # D-Mon-YYYY or DD-Mon-YYYY (e.g. 1-Apr-2026) — Tally report-export format
    m = re.match(r"(\d{1,2})-([A-Za-z]{3})-(\d{4})", s)
    if m:
        mm = _MONTHS.get(m.group(2).title())
        if mm:
            return f"{m.group(3)}-{mm:02d}-{int(m.group(1)):02d}"
    # Already ISO?
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s
    return s


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
    # Tally's import-style XML uses <NAME> child; the "All Masters" export uses
    # a NAME attribute. Support both.
    name = el.get("NAME") or _text(el, "NAME") or _text(el, "LedgerName") or ""
    parent = el.get("PARENT") or _text(el, "PARENT") or _text(el, "GROUP") or ""
    nature_raw = el.get("NATUREOFGROUP") or _text(el, "NATUREOFGROUP") or _text(el, "Nature") or ""

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
    name = el.get("NAME") or _text(el, "NAME") or _text(el, "LedgerName") or ""
    group = el.get("PARENT") or _text(el, "PARENT") or _text(el, "GROUP") or _text(el, "Under") or ""
    ob = _decimal(el, "OPENINGBALANCE")
    ob_type_text = el.get("OPENINGBALANCETYPE") or _text(el, "OPENINGBALANCETYPE") or _text(el, "DrCr") or "Dr"
    gstin = el.get("GSTIN") or _text(el, "GSTIN") or _text(el, "GSTRegistrationNumber") or ""
    alias = el.get("ALIAS") or _text(el, "ALIAS") or _text(el, "MailingName") or ""
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
        if amount > 0:
            debit = amount
        else:
            credit = abs(amount)

    lines.append(ParsedVoucherLine(
        ledger_name=lname,
        debit=abs(debit),
        credit=abs(credit),
        quantity=qty,
        rate=rate,
        amount=amount,
    ))


def _parse_voucher(el: ET.Element) -> ParsedVoucher:
    # Tally Day Book export uses the VCHTYPE attribute; the import-style XML
    # uses a <VOUCHERTYPENAME> child. Support both.
    vtype_raw = (el.get("VCHTYPE")
                 or _text(el, "VOUCHERTYPENAME")
                 or _text(el, "VoucherType")
                 or "Journal")
    vtype = TALLY_VOUCHER_TYPE_MAP.get(vtype_raw, "journal")

    vnum = _text(el, "VOUCHERNUMBER") or _text(el, "Number") or ""
    vdate = _date_to_iso(_text(el, "DATE") or _text(el, "VoucherDate") or "")
    narration = _text(el, "NARRATION") or ""
    reference = _text(el, "REFERENCE") or _text(el, "Ref") or ""
    party = (_text(el, "PARTYNAME")
             or _text(el, "PARTYLEDGERNAME")
             or _text(el, "PartyLedgerName")
             or "")
    pos = _text(el, "PLACEOF SUPPLY") or _text(el, "PlaceOfSupply") or ""

    lines: list[ParsedVoucherLine] = []
    # Tally nests ledger lines under <ALLLEDGERENTRIES.LIST> (and sometimes
    # directly under <LEDGERENTRIES.LIST>). Feed each such element to the
    # extractor, which reads LEDGERNAME/DEBIT/CREDIT/AMOUNT from it.
    for tag in ("ALLLEDGERENTRIES.LIST", "LEDGERENTRIES.LIST"):
        for le in el.iter(tag):
            _extract_voucher_line(lines, le, vtype)

    # Also process inventory entries — the "All Voucher" export nests the
    # income/expense ledger line inside <ALLINVENTORYENTRIES.LIST> under
    # <ACCOUNTINGALLOCATIONS.LIST> (with <LEDGERNAME> and <AMOUNT>) rather
    # than listing it as a top-level ledger entry. Without this the voucher
    # debits != credits for invoice-type vouchers.
    for ie in el.iter("ALLINVENTORYENTRIES.LIST"):
        for aa in ie.iter("ACCOUNTINGALLOCATIONS.LIST"):
            _extract_voucher_line(lines, aa, vtype)

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
        root = ET.fromstring(_sanitize_xml(xml_content))
    except ET.ParseError:
        return data

    # Find all group elements. Tally's import-style XML nests <GROUP> inside
    # <LIST.GROUPS>; the "All Masters" export puts <GROUP> directly under
    # <TALLYMESSAGE> (name in a NAME attribute). Scan for <GROUP> either way.
    for g in root.iter("GROUP"):
        data.groups.append(_parse_group(g))

    # Find all ledger elements (same dual-format situation as groups).
    for l in root.iter("LEDGER"):
        data.ledgers.append(_parse_ledger(l))

    # Find all voucher elements. Tally's data-import XML nests <VOUCHER> inside
    # <LIST.VOUCHERS>, while a Day Book / report XML export nests it directly
    # under <TALLYMESSAGE>. Scan the whole tree for <VOUCHER> either way.
    for v in root.iter("VOUCHER"):
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
                reference=str(row.get("reference", "") or "").strip(),
                place_of_supply=str(row.get("place_of_supply", "") or "").strip(),
                document_type=str(row.get("document_type", "") or "").strip() or "regular",
            )

        line = ParsedVoucherLine(
            ledger_name=ledger,
            debit=abs(Decimal(str(debit))),
            credit=abs(Decimal(str(credit))),
            amount=abs(Decimal(str(debit))) if Decimal(str(debit)) > 0 else abs(Decimal(str(credit))),
        )

        gst_rate = row.get("gst_rate")
        if gst_rate is not None:
            line.gst_rate = Decimal(str(gst_rate))

        hsn = row.get("hsn_sac") or row.get("hsn")
        if hsn:
            line.hsn_sac = str(hsn).strip()

        qty = row.get("quantity")
        if qty is not None:
            line.quantity = Decimal(str(qty))

        rate_val = row.get("rate")
        if rate_val is not None:
            line.rate = Decimal(str(rate_val))

        voucher_map[key].lines.append(line)

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

# ── TallyData JSON round-trip ───────────────────────────────────────────
# These let us persist parsed TallyData into an ImportJob's content field
# for later confirmation, without re-parsing every time.

def tally_data_to_json(data: TallyData) -> dict:
    """Serialize TallyData to a JSON-compatible dict (Decimals → str)."""
    def _d(d: Decimal) -> str:
        return str(d)
    return {
        "groups": [
            {"name": g.name, "parent_name": g.parent_name, "nature": g.nature,
             "group_type": g.group_type, "is_system": g.is_system}
            for g in data.groups
        ],
        "ledgers": [
            {"name": l.name, "group_name": l.group_name,
             "opening_balance": _d(l.opening_balance),
             "opening_balance_type": l.opening_balance_type,
             "gstin": l.gstin, "alias": l.alias}
            for l in data.ledgers
        ],
        "parties": [
            {"name": p.name, "party_type": p.party_type, "ledger_name": p.ledger_name,
             "gstin": p.gstin, "state_code": p.state_code, "pan": p.pan, "address": p.address}
            for p in data.parties
        ],
        "vouchers": [
            {"voucher_type": v.voucher_type, "voucher_number": v.voucher_number,
             "voucher_date": v.voucher_date, "narration": v.narration, "reference": v.reference,
             "party_name": v.party_name, "place_of_supply": v.place_of_supply,
             "document_type": v.document_type,
             "lines": [
                 {"ledger_name": l.ledger_name, "debit": _d(l.debit), "credit": _d(l.credit),
                  "quantity": _d(l.quantity) if l.quantity is not None else None,
                  "rate": _d(l.rate) if l.rate is not None else None,
                  "amount": _d(l.amount),
                  "gst_rate": _d(l.gst_rate) if l.gst_rate is not None else None,
                  "hsn_sac": l.hsn_sac}
                 for l in v.lines
             ]}
            for v in data.vouchers
        ],
        "stock_groups": [{"name": sg.name} for sg in data.stock_groups],
        "stock_items": [
            {"name": si.name, "group_name": si.group_name, "unit": si.unit,
             "hsn_sac": si.hsn_sac, "gst_rate": _d(si.gst_rate),
             "opening_qty": _d(si.opening_qty), "opening_rate": _d(si.opening_rate)}
            for si in data.stock_items
        ],
    }


def tally_data_from_json(d: dict) -> TallyData:
    """Restore TallyData from a dict produced by tally_data_to_json."""
    def _d(v) -> Decimal:
        if v is None:
            return Decimal("0")
        return Decimal(str(v))
    return TallyData(
        groups=[ParsedGroup(**g) for g in d.get("groups", [])],
        ledgers=[
            ParsedLedger(name=l["name"], group_name=l.get("group_name", ""),
                         opening_balance=_d(l.get("opening_balance", 0)),
                         opening_balance_type=l.get("opening_balance_type", "Dr"),
                         gstin=l.get("gstin", ""), alias=l.get("alias", ""))
            for l in d.get("ledgers", [])
        ],
        parties=[ParsedParty(**p) for p in d.get("parties", [])],
        vouchers=[
            ParsedVoucher(
                voucher_type=v["voucher_type"], voucher_number=v.get("voucher_number", ""),
                voucher_date=v.get("voucher_date", ""), narration=v.get("narration", ""),
                reference=v.get("reference", ""), party_name=v.get("party_name", ""),
                place_of_supply=v.get("place_of_supply", ""),
                document_type=v.get("document_type", "regular"),
                lines=[ParsedVoucherLine(
                    ledger_name=ll.get("ledger_name", ""),
                    debit=_d(ll.get("debit")),
                    credit=_d(ll.get("credit")),
                    quantity=_d(ll.get("quantity")),
                    rate=_d(ll.get("rate")),
                    amount=_d(ll.get("amount")),
                    gst_rate=_d(ll.get("gst_rate")),
                    hsn_sac=ll.get("hsn_sac", ""),
                ) for ll in v.get("lines", [])]
            )
            for v in d.get("vouchers", [])
        ],
        stock_groups=[ParsedStockGroup(**sg) for sg in d.get("stock_groups", [])],
        stock_items=[
            ParsedStockItem(name=si["name"], group_name=si.get("group_name", ""),
                            unit=si.get("unit", ""), hsn_sac=si.get("hsn_sac", ""),
                            gst_rate=_d(si.get("gst_rate", 0)),
                            opening_qty=_d(si.get("opening_qty", 0)),
                            opening_rate=_d(si.get("opening_rate", 0)))
            for si in d.get("stock_items", [])
        ],
    )
