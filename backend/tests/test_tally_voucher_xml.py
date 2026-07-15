"""Validate that Tally voucher XML (Day Book export + import style) is parsed.

A real Tally *Day Book* XML export nests <VOUCHER> directly under <TALLYMESSAGE>
(uses a VCHTYPE attribute, a PARTYLEDGERNAME child, and dates like
``1-Apr-2026`` or ``20260401``). The older "Import Data" XML nests vouchers in
<LIST.VOUCHERS> with a <VOUCHERTYPENAME> child. Both must be parsed.
"""
from __future__ import annotations

from app.services.tally_parser import parse_tally_xml


def _daybook_xml() -> str:
    return """<ENVELOPE>
 <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
 <BODY>
  <EXPORTDATA>
   <REQUESTDESC><REPORTNAME>Day Book</REPORTNAME></REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Sales" ACTION="Create">
      <DATE>1-Apr-2026</DATE>
      <VOUCHERNUMBER>SALE-001</VOUCHERNUMBER>
      <PARTYLEDGERNAME>M/s Grace Nursing Home</PARTYLEDGERNAME>
      <NARRATION>Sale of services</NARRATION>
      <ALLLEDGERENTRIES.LIST>
       <LEDGERNAME>Sales Accounts</LEDGERNAME>
       <DEBIT>0.00</DEBIT>
       <CREDIT>11800.00</CREDIT>
       <AMOUNT>-11800.00</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
      <ALLLEDGERENTRIES.LIST>
       <LEDGERNAME>HDFC A/C</LEDGERNAME>
       <DEBIT>11800.00</DEBIT>
       <CREDIT>0.00</CREDIT>
       <AMOUNT>11800.00</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
     </VOUCHER>
     <VOUCHER VCHTYPE="Payment" ACTION="Create">
      <DATE>20260402</DATE>
      <VOUCHERNUMBER>PMT-001</VOUCHERNUMBER>
      <PARTYLEDGERNAME>Reliance Store</PARTYLEDGERNAME>
      <NARRATION>Rent paid</NARRATION>
      <ALLLEDGERENTRIES.LIST>
       <LEDGERNAME>Rent</LEDGERNAME>
       <DEBIT>5000.00</DEBIT>
       <CREDIT>0.00</CREDIT>
       <AMOUNT>5000.00</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
      <ALLLEDGERENTRIES.LIST>
       <LEDGERNAME>HDFC A/C</LEDGERNAME>
       <DEBIT>0.00</DEBIT>
       <CREDIT>5000.00</CREDIT>
       <AMOUNT>-5000.00</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
     </VOUCHER>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </EXPORTDATA>
 </BODY>
</ENVELOPE>"""


def _import_style_xml() -> str:
    return """<ENVELOPE>
 <BODY><IMPORTDATA><REQUESTDATA>
  <TALLYMESSAGE xmlns:UDF="TallyUDF">
   <LIST.VOUCHERS>
    <VOUCHER ACTION="Create">
     <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
     <VOUCHERNUMBER>JV-001</VOUCHERNUMBER>
     <DATE>03-04-2026</DATE>
     <NARRATION>Transfer</NARRATION>
     <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>Capital Account</LEDGERNAME>
      <DEBIT>1000.00</DEBIT>
      <CREDIT>0.00</CREDIT>
     </ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>Bank Accounts</LEDGERNAME>
      <DEBIT>0.00</DEBIT>
      <CREDIT>1000.00</CREDIT>
     </ALLLEDGERENTRIES.LIST>
    </VOUCHER>
   </LIST.VOUCHERS>
  </TALLYMESSAGE>
 </REQUESTDATA></IMPORTDATA></BODY>
</ENVELOPE>"""


def test_daybook_export_vouchers_parsed():
    data = parse_tally_xml(_daybook_xml())
    assert len(data.vouchers) == 2

    v1 = data.vouchers[0]
    assert v1.voucher_type == "sales"
    assert v1.voucher_number == "SALE-001"
    assert v1.voucher_date == "2026-04-01"          # D-Mon-YYYY
    assert v1.party_name == "M/s Grace Nursing Home"
    assert len(v1.lines) == 2
    by_ledger = {ln.ledger_name: ln for ln in v1.lines}
    assert by_ledger["HDFC A/C"].debit == 11800
    assert by_ledger["Sales Accounts"].credit == 11800

    v2 = data.vouchers[1]
    assert v2.voucher_type == "payment"
    assert v2.voucher_date == "2026-04-02"          # YYYYMMDD


def test_import_style_vouchers_still_parsed():
    data = parse_tally_xml(_import_style_xml())
    assert len(data.vouchers) == 1
    v = data.vouchers[0]
    assert v.voucher_type == "journal"              # from <VOUCHERTYPENAME>
    assert v.voucher_number == "JV-001"
    assert v.voucher_date == "2026-04-03"           # DD-MM-YYYY
    assert len(v.lines) == 2
