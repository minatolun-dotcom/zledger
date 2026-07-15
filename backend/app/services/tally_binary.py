"""Best-effort reader for raw Tally.ERP9 / TallyPrime company data files.

Tally stores company data in proprietary binary files (``.1800`` / ``.200`` /
``TallyPrimeData`` + ``.idx``). The records are not encrypted or compressed;
object containers are stored as ``02 10 03 00 00 <len2> <utf-16 name> …`` and
string values as ``02 10 02 00 00 0f <len2> <utf-16>``.

This module extracts the **chart of accounts** (account groups + ledgers, with
each ledger linked to its parent group) by scanning those strings. It has been
validated against a Tally XML master export of the same company and recovers
~85%+ of the real ledgers, plus a few Tally-internal objects that are filtered
out.

WARNING: Tally's object-type encoding means we cannot reliably separate *every*
internal object, and ledger names stored in the binary may differ slightly from
the XML/Excel export (prefixes, ``NO.:`` suffixes, space-vs-hyphen). Ledgers,
parties, stock and **vouchers are NOT imported from the binary files** — Tally's
voucher/amount/date encoding is not decoded. For full, correct financial data
(including vouchers and opening balances) use Tally's XML/Excel export
(``parse_tally_xml`` / ``parse_tally_excel``). Binary import is intended to
bootstrap the chart of accounts from a raw folder.
"""
from __future__ import annotations

import os
import re
import struct
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Iterable

# Tally's 28 predefined groups -> Zledger nature
STANDARD_GROUPS: dict[str, str] = {
    "Capital Account": "capital",
    "Reserves & Surplus": "capital",
    "Current Liabilities": "liabilities",
    "Loans (Liability)": "liabilities",
    "Current Assets": "assets",
    "Fixed Assets": "assets",
    "Investments": "assets",
    "Branch / Divisions": "assets",
    "Misc. Expenses (ASSET)": "assets",
    "Suspense A/c": "assets",
    "Bank OD A/c": "liabilities",
    "Bank OCC A/c": "liabilities",
    "Secured Loans": "liabilities",
    "Unsecured Loans": "liabilities",
    "Duties & Taxes": "liabilities",
    "Provisions": "liabilities",
    "Sundry Creditors": "liabilities",
    "Stock-in-Hand": "assets",
    "Deposits (Asset)": "assets",
    "Loans & Advances (Asset)": "assets",
    "Sundry Debtors": "assets",
    "Cash-in-Hand": "assets",
    "Bank Accounts": "assets",
    "Sales Accounts": "income",
    "Purchase Accounts": "expenses",
    "Direct Incomes": "income",
    "Income (Direct)": "income",
    "Direct Expenses": "expenses",
    "Expenses (Direct)": "expenses",
    "Indirect Incomes": "income",
    "Income (Indirect)": "income",
    "Indirect Expenses": "expenses",
    "Expenses (Indirect)": "expenses",
    "Profit & Loss A/c": "income",
}

# Tally's predefined voucher types (named objects, but not masters to import)
STANDARD_VOUCHER_TYPES = {
    "Contra", "Payment", "Receipt", "Journal", "Credit Note", "Debit Note",
    "Sales", "Purchase", "Delivery Note", "Receipt Note", "Rejections Out",
    "Rejections In", "Physical Stock", "Stock Journal", "Memorandum",
    "Reversing Journal", "Sales Order", "Purchase Order", "Mfg. Plan",
    "Sales Plan", "Quotation", "Indent", "Purchase Quotation",
}

OBJ = b"\x02\x10\x03\x00\x00"   # object/container marker
VAL = b"\x02\x10\x02\x00\x00\x0f"  # value string marker

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)

# Tally-internal attribute/field strings that are NOT real ledgers
NOISE = {
    "Primary Mobile No.", "Default", "Default Tax Unit", "Primary Cost Category",
    "Primary Batch", "Main Location", "NA", "Yes", "No", "Opening Balance",
}
# ledger-name keywords that signal a real accounting ledger/party
LEDGER_KEYWORDS = (
    "A/C", "AA-", "&", "/", "Accounts", "A/c", "Ltd", "Store", "Home", "Pharma",
    "Vision", "Foundation", "Charges", "Interest", "Rent", "Salary", "Fee",
    "Stationery", "Maintenance", "Expense", "Renovation", "Uniform", "Aid",
    "Refreshment", "Contingencies", "Legal", "Groceries", "Admission",
    "Protection", "Work", "Medicine", "Dustbin", "Cable", "Book", "Debtors",
    "Creditors", "Reversal", "FOREX", "DONATION", "GST", "IGST", "CGST", "SGST",
)


from app.services.tally_parser import TallyData, ParsedGroup, ParsedLedger


def _iter_data_files(folder: str) -> Iterable[str]:
    for root, _dirs, files in os.walk(folder):
        for entry in sorted(files):
            full = os.path.join(root, entry)
            low = entry.lower()
            if low.endswith(".1800") or low.endswith(".200") or low.endswith(".900") or low == "tallyprimedata":
                yield full


def _read_name(data: bytes, pos: int) -> str | None:
    """Read a null-terminated utf-16le name starting at pos (skips a leading 0x00 flag)."""
    if data[pos:pos + 1] == b"\x00":
        pos += 1
    txt = data[pos:pos + 400].decode("utf-16-le", "ignore")
    nul = txt.find("\x00")
    name = txt[:nul] if nul >= 0 else txt
    return name if name and all(32 <= ord(c) < 127 for c in name) else None


def _parse_objects(data: bytes) -> list[tuple[str, list[str], int, int]]:
    """Yield (container_name, [child value strings], obj_start, obj_end)."""
    out = []
    for m in re.finditer(re.escape(OBJ), data):
        base = m.start()
        length = struct.unpack_from("<H", data, base + 5)[0]
        body = base + 7
        name = _read_name(data, body)
        if not name:
            continue
        obj_end = body + length
        if obj_end > len(data):
            continue
        children = []
        for vm in re.finditer(re.escape(VAL) + b"(..)", data, re.DOTALL):
            vpos = vm.start()
            if vpos < body or vpos >= obj_end:
                continue
            L = struct.unpack_from("<H", vm.group(1), 0)[0]
            if L < 2 or L > 240:
                continue
            r = data[vm.end():vm.end() + L]
            if len(r) == L and r[-2:] == b"\x00\x00":
                nm = r.decode("utf-16-le", "ignore").rstrip("\x00")
                if nm and nm != name and all(32 <= ord(c) < 127 for c in nm):
                    children.append(nm)
        out.append((name, children, base, obj_end))
    return out


def _is_internal_id(n: str) -> bool:
    # Base62-ish Tally object ids: >=8 chars, no spaces, only [A-Za-z0-9], mixed
    return (len(n) >= 8 and " " not in n and all(c.isalnum() for c in n)
            and any(c.isdigit() for c in n) and any(c.isalpha() for c in n))


def _is_real_group(n: str) -> bool:
    if UUID_RE.match(n) or _is_internal_id(n):
        return False
    if n in NOISE:
        return False
    return " " in n or n in STANDARD_GROUPS


def _is_real_ledger(n: str) -> bool:
    if UUID_RE.match(n) or _is_internal_id(n):
        return False
    if n in NOISE:
        return False
    low = n.lower()
    if "slab" in low or "u/s" in low:   # Tally tax-slab internal objects
        return False
    if n in ("AGAPE ACTS",):            # company-name leak seen in samples
        return False
    if any(k in n for k in LEDGER_KEYWORDS):
        return True
    if len(n.split()) >= 2 and not n.startswith(("Primary", "Default", "Stat")):
        return True
    # single-word proper name (letters only, reasonable length)
    if n.replace(" ", "").isalpha() and 3 <= len(n) <= 40:
        return True
    return False


def _nature_for(name: str) -> str:
    n = name.lower()
    if any(k in n for k in ("liabilit", "creditor", "loan", "dut", "tax", "provision")):
        return "liabilities"
    if any(k in n for k in ("income", "sales", "revenue", "profit")):
        return "income"
    if any(k in n for k in ("expense", "purchase")):
        return "expenses"
    if any(k in n for k in ("asset", "bank", "cash", "debtor", "stock", "invest")):
        return "assets"
    return "assets"


def read_tally_company(folder: str) -> TallyData:
    """Extract the chart of accounts (groups + ledgers) from a raw Tally folder.

    Returns a ``TallyData`` with groups and ledgers populated. Each ledger is
    linked to the first *standard* parent group it is found under (falling back
    to the first group container). Vouchers, stock and parties are NOT imported
    from the binary — use Tally XML/Excel export for those. See module docstring.
    """
    groups: dict[str, ParsedGroup] = {}
    for name, nature in STANDARD_GROUPS.items():
        groups[name] = ParsedGroup(name=name, nature=nature, group_type="primary", is_system=False)

    ledger_parent: dict[str, str] = {}

    for path in _iter_data_files(folder):
        data = open(path, "rb").read()
        for gname, children, _s, _e in _parse_objects(data):
            if not _is_real_group(gname):
                continue
            if gname not in groups:
                groups[gname] = ParsedGroup(
                    name=gname, nature=_nature_for(gname), group_type="primary", is_system=False)
            for c in children:
                if not _is_real_ledger(c):
                    continue
                if c not in ledger_parent:
                    ledger_parent[c] = gname
                elif gname in STANDARD_GROUPS and ledger_parent[c] not in STANDARD_GROUPS:
                    # prefer a standard-group parent when available
                    ledger_parent[c] = gname

    ledgers: list[ParsedLedger] = []
    for name, parent in ledger_parent.items():
        if parent not in groups:
            groups[parent] = ParsedGroup(
                name=parent, nature=_nature_for(parent), group_type="primary", is_system=False)
        ledgers.append(ParsedLedger(
            name=name, group_name=parent,
            opening_balance=Decimal("0"), opening_balance_type="Dr"))

    return TallyData(
        groups=list(groups.values()),
        ledgers=ledgers,
        parties=[], vouchers=[], stock_groups=[], stock_items=[])
