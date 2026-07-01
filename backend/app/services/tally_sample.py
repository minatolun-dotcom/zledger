"""Generate sample import files (XML and Excel) for Tally import demo."""
from __future__ import annotations

import io

SAMPLE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <DESC><TALLYREQUEST>Import Masters</TALLYREQUEST></DESC>
    <DATA>
      <TALLYCOMPANY><NAME>Sample Company</NAME></TALLYCOMPANY>

      <!-- Groups -->
      <GROUPS>
        <LIST.GROUPS>
          <GROUP><NAME>Current Assets</NAME><PARENT>Primary</PARENT></GROUP>
          <GROUP><NAME>Bank Accounts</NAME><PARENT>Current Assets</PARENT></GROUP>
          <GROUP><NAME>Direct Incomes</NAME><PARENT>Primary</PARENT></GROUP>
          <GROUP><NAME>Direct Expenses</NAME><PARENT>Primary</PARENT></GROUP>
          <GROUP><NAME>Sundry Debtors</NAME><PARENT>Current Assets</PARENT></GROUP>
        </LIST.GROUPS>
      </GROUPS>

      <!-- Ledgers -->
      <LEDGERS>
        <LIST.LEDGERS>
          <LEDGER><NAME>HDFC Bank</NAME><PARENT>Bank Accounts</PARENT><OPENINGBALANCE>100000.00</OPENINGBALANCE></LEDGER>
          <LEDGER><NAME>Sales Account</NAME><PARENT>Direct Incomes</PARENT></LEDGER>
          <LEDGER><NAME>Purchase Account</NAME><PARENT>Direct Expenses</PARENT></LEDGER>
          <LEDGER><NAME>ABC Corp</NAME><PARENT>Sundry Debtors</PARENT><OPENINGBALANCE>50000.00</OPENINGBALANCE></LEDGER>
        </LIST.LEDGERS>
      </LEDGERS>

      <!-- Stock Groups -->
      <STOCKGROUPS>
        <LIST.STOCKGROUPS>
          <STOCKGROUP><NAME>Electronics</NAME></STOCKGROUP>
        </LIST.STOCKGROUPS>
      </STOCKGROUPS>

      <!-- Stock Items -->
      <STOCKITEMS>
        <LIST.STOCKITEMS>
          <STOCKITEM><NAME>Laptop</NAME><PARENT>Electronics</PARENT><OPENINGQTY>10</OPENINGQTY><OPENINGRATE>50000</OPENINGRATE></STOCKITEM>
          <STOCKITEM><NAME>Mouse</NAME><PARENT>Electronics</PARENT><OPENINGQTY>50</OPENINGQTY><OPENINGRATE>500</OPENINGRATE></STOCKITEM>
        </LIST.STOCKITEMS>
      </STOCKITEMS>

      <!-- Vouchers -->
      <VOUCHERS>
        <LIST.VOUCHERS>
          <VOUCHER>
            <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
            <VOUCHERNUMBER>PMT-001</VOUCHERNUMBER>
            <DATE>01-04-2025</DATE>
            <NARRATION>Payment to ABC Corp</NARRATION>
            <REFERENCE>CHQ-001234</REFERENCE>
            <PARTYLEDGERNAME>ABC Corp</PARTYLEDGERNAME>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERENTRIES.LIST>
                <LEDGERENTRY><LEDGERNAME>HDFC Bank</LEDGERNAME><AMOUNT>-30000.00</AMOUNT></LEDGERENTRY>
                <LEDGERENTRY><LEDGERNAME>ABC Corp</LEDGERNAME><AMOUNT>30000.00</AMOUNT></LEDGERENTRY>
              </LEDGERENTRIES.LIST>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>

          <VOUCHER>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>SALE-001</VOUCHERNUMBER>
            <DATE>01-04-2025</DATE>
            <NARRATION>Sale of Laptop</NARRATION>
            <REFERENCE>INV-2025-001</REFERENCE>
            <PARTYLEDGERNAME>ABC Corp</PARTYLEDGERNAME>
            <PLACEOFSUPPLY>27-Maharashtra</PLACEOFSUPPLY>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERENTRIES.LIST>
                <LEDGERENTRY><LEDGERNAME>ABC Corp</LEDGERNAME><AMOUNT>59000.00</AMOUNT></LEDGERENTRY>
                <LEDGERENTRY><LEDGERNAME>Sales Account</LEDGERNAME><AMOUNT>-50000.00</AMOUNT></LEDGERENTRY>
                <LEDGERENTRY><LEDGERNAME>CGST Output</LEDGERNAME><AMOUNT>-4500.00</AMOUNT></LEDGERENTRY>
                <LEDGERENTRY><LEDGERNAME>SGST Output</LEDGERNAME><AMOUNT>-4500.00</AMOUNT></LEDGERENTRY>
              </LEDGERENTRIES.LIST>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </LIST.VOUCHERS>
      </VOUCHERS>
    </DATA>
  </BODY>
</ENVELOPE>
"""


def generate_sample_xml() -> str:
    """Return a sample Tally XML string with all entity types."""
    return SAMPLE_XML


def generate_sample_excel() -> bytes:
    """Generate a sample Excel workbook (.xlsx) with all entity types."""
    import openpyxl
    from openpyxl.styles import Font, Alignment

    wb = openpyxl.Workbook()

    header_font = Font(bold=True)
    header_align = Alignment(horizontal="center")

    def _write_sheet(ws, title: str, headers: list[str], rows: list[list]):
        ws.title = title
        for c, h in enumerate(headers, 1):
            cell = ws.cell(row=1, column=c, value=h)
            cell.font = header_font
            cell.alignment = header_align
        for r, row in enumerate(rows, 2):
            for c, val in enumerate(row, 1):
                ws.cell(row=r, column=c, value=val)
        ws.freeze_panes = "A2"

    # ── Readme sheet ──
    readme = wb.active
    readme.title = "Readme"
    readme["A1"] = "ZLedger — Tally Import Sample"
    readme["A1"].font = Font(bold=True, size=14)
    readme["A3"] = "This workbook contains sample data for all supported import entity types."
    readme["A4"] = "Each sheet corresponds to one entity type. Populate them with your data and upload."
    readme["A6"] = "Sheets:"
    readme["A7"] = "  Groups      — Chart of account groups (name, parent, nature)"
    readme["A8"] = "  Ledgers     — Ledger accounts (name, group, opening_balance, gstin)"
    readme["A9"] = "  Parties     — Customers/suppliers (name, type, gstin, state_code)"
    readme["A10"] = "  Stock Groups — Inventory groups (name)"
    readme["A11"] = "  Stock Items  — Inventory items (name, group, unit, hsn, gst_rate, opening_qty, opening_rate)"
    readme["A12"] = "  Vouchers   — Transactions (one row per ledger line; rows with same number+type form one voucher)"
    readme["A14"] = "Voucher columns:"
    readme["A15"] = "  Required: voucher_type, voucher_number, date, narration, ledger_name, debit, credit"
    readme["A16"] = "  Optional: reference, place_of_supply, document_type, gst_rate, hsn_sac, quantity, rate"
    readme["A18"] = "Nature options for Groups: assets, liabilities, income, expenses, capital"
    readme["A19"] = "Party type options: customer, supplier, both"
    readme["A21"] = "Supported voucher types: Sales, Purchase, Payment, Receipt, Journal, Contra, Credit Note, Debit Note"

    # ── Groups ──
    ws = wb.create_sheet()
    _write_sheet(ws, "Groups", ["name", "parent", "nature"], [
        ["Current Assets", "Primary", "assets"],
        ["Bank Accounts", "Current Assets", "assets"],
        ["Direct Incomes", "Primary", "income"],
        ["Direct Expenses", "Primary", "expenses"],
        ["Sundry Debtors", "Current Assets", "assets"],
    ])

    # ── Ledgers ──
    ws = wb.create_sheet()
    _write_sheet(ws, "Ledgers", ["name", "group", "opening_balance", "gstin"], [
        ["HDFC Bank", "Bank Accounts", 100000, ""],
        ["Sales Account", "Direct Incomes", 0, ""],
        ["Purchase Account", "Direct Expenses", 0, ""],
        ["ABC Corp", "Sundry Debtors", 50000, "27AABCP1234A1Z5"],
    ])

    # ── Parties ──
    ws = wb.create_sheet()
    _write_sheet(ws, "Parties", ["name", "type", "gstin", "state_code"], [
        ["ABC Corp", "customer", "27AABCP1234A1Z5", "27"],
        ["XYZ Suppliers", "supplier", "29AAACS1234B1Z8", "29"],
    ])

    # ── Stock Groups ──
    ws = wb.create_sheet()
    _write_sheet(ws, "Stock Groups", ["name"], [
        ["Electronics"],
    ])

    # ── Stock Items ──
    ws = wb.create_sheet()
    _write_sheet(ws, "Stock Items", ["name", "group", "unit", "hsn", "gst_rate", "opening_qty", "opening_rate"], [
        ["Laptop", "Electronics", "Nos", "84713000", 18, 10, 50000],
        ["Mouse", "Electronics", "Nos", "84716000", 12, 50, 500],
    ])

    # ── Vouchers ──
    ws = wb.create_sheet()
    _write_sheet(ws, "Vouchers", [
        "voucher_type", "voucher_number", "date", "narration", "ledger_name",
        "debit", "credit", "reference", "place_of_supply", "document_type",
        "gst_rate", "hsn_sac", "quantity", "rate",
    ], [
        ["Payment", "PMT-001", "01-04-2025", "Payment to ABC Corp", "HDFC Bank", 0, 30000, "CHQ-001234", "", "regular", None, None, None, None],
        ["Payment", "PMT-001", "01-04-2025", "Payment to ABC Corp", "ABC Corp", 30000, 0, "CHQ-001234", "", "regular", None, None, None, None],
        ["Sales", "SALE-001", "01-04-2025", "Sale of Laptop", "ABC Corp", 59000, 0, "INV-2025-001", "27-Maharashtra", "regular", None, None, None, None],
        ["Sales", "SALE-001", "01-04-2025", "Sale of Laptop", "Sales Account", 0, 50000, "INV-2025-001", "27-Maharashtra", "regular", None, None, None, None],
        ["Sales", "SALE-001", "01-04-2025", "Sale of Laptop", "CGST Output", 0, 4500, "INV-2025-001", "27-Maharashtra", "regular", None, None, None, None],
        ["Sales", "SALE-001", "01-04-2025", "Sale of Laptop", "SGST Output", 0, 4500, "INV-2025-001", "27-Maharashtra", "regular", None, None, None, None],
    ])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()
