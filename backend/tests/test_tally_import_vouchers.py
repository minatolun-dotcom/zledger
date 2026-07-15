"""End-to-end check of the recommended Tally voucher path: parse a Day Book
XML export and import the resulting vouchers into a real company.
"""
from __future__ import annotations

from app.models.accounting import AccountGroup, Ledger
from app.models.user import Company
from app.models.voucher import Voucher, VoucherLine
from app.services.tally_importer import _import_vouchers
from app.services.tally_parser import parse_tally_xml


DAYBOOK = """<ENVELOPE>
 <BODY><IMPORTDATA><REQUESTDATA>
  <TALLYMESSAGE xmlns:UDF="TallyUDF">
   <VOUCHER VCHTYPE="Sales" ACTION="Create">
    <DATE>1-Apr-2026</DATE>
    <VOUCHERNUMBER>SALE-001</VOUCHERNUMBER>
    <PARTYLEDGERNAME>M/s Grace Nursing Home</PARTYLEDGERNAME>
    <NARRATION>Sale of services</NARRATION>
    <ALLLEDGERENTRIES.LIST>
     <LEDGERNAME>Sales Accounts</LEDGERNAME>
     <DEBIT>0.00</DEBIT><CREDIT>11800.00</CREDIT><AMOUNT>-11800.00</AMOUNT>
    </ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST>
     <LEDGERNAME>HDFC A/C</LEDGERNAME>
     <DEBIT>11800.00</DEBIT><CREDIT>0.00</CREDIT><AMOUNT>11800.00</AMOUNT>
    </ALLLEDGERENTRIES.LIST>
   </VOUCHER>
   <VOUCHER VCHTYPE="Payment" ACTION="Create">
    <DATE>20260402</DATE>
    <VOUCHERNUMBER>PMT-001</VOUCHERNUMBER>
    <PARTYLEDGERNAME>Reliance Store</PARTYLEDGERNAME>
    <ALLLEDGERENTRIES.LIST>
     <LEDGERNAME>Rent</LEDGERNAME>
     <DEBIT>5000.00</DEBIT><CREDIT>0.00</CREDIT><AMOUNT>5000.00</AMOUNT>
    </ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST>
     <LEDGERNAME>HDFC A/C</LEDGERNAME>
     <DEBIT>0.00</DEBIT><CREDIT>5000.00</CREDIT><AMOUNT>-5000.00</AMOUNT>
    </ALLLEDGERENTRIES.LIST>
   </VOUCHER>
  </TALLYMESSAGE>
 </REQUESTDATA></IMPORTDATA></BODY>
</ENVELOPE>"""


def test_import_daybook_vouchers(db):
    co = Company(name="Svc Vch Co", is_active=True)
    db.add(co)
    db.flush()
    grp = AccountGroup(company_id=co.id, name="Bank Accounts", nature="assets", is_system=False)
    db.add(grp)
    db.flush()
    l_hdfc = Ledger(company_id=co.id, name="HDFC A/C", group_id=grp.id)
    l_sales = Ledger(company_id=co.id, name="Sales Accounts", group_id=grp.id)
    l_rent = Ledger(company_id=co.id, name="Rent", group_id=grp.id)
    db.add_all([l_hdfc, l_sales, l_rent])
    db.flush()
    ledger_map = {"HDFC A/C": l_hdfc.id, "Sales Accounts": l_sales.id, "Rent": l_rent.id}

    data = parse_tally_xml(DAYBOOK)
    assert len(data.vouchers) == 2

    details = _import_vouchers(db, co.id, data.vouchers, None, ledger_map, [], [])
    assert len(details) == 2  # both created (balanced)

    vouchers = db.query(Voucher).filter(Voucher.company_id == co.id).all()
    assert {v.voucher_type for v in vouchers} == {"sales", "payment"}
    sales = next(v for v in vouchers if v.voucher_type == "sales")
    assert sales.voucher_date == "2026-04-01"
    assert sales.narration == "Sale of services"

    lines = db.query(VoucherLine).filter(VoucherLine.voucher_id == sales.id).all()
    assert len(lines) == 2
    by_ledger = {ln.ledger_id: ln for ln in lines}
    assert by_ledger[l_hdfc.id].debit == 11800.0
    assert by_ledger[l_sales.id].credit == 11800.0
