"""Archive-level tests: Tally XML is UTF-16 and uses invalid ``&#4;`` char
references. The reader must decode UTF-16 and the parser must strip those refs
or EVERY voucher is silently dropped.
"""
from __future__ import annotations

import io
import zipfile

from app.services.tally_archive import _read_text, parse_tally_archive
from app.services.tally_parser import parse_tally_xml


VCH_XML = (
    '<?xml version="1.0" encoding="utf-16"?>\r\n'
    "<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>"
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">'
    '<VOUCHER VCHTYPE="Payment" ACTION="Create">'
    "<DATE>20250401</DATE>"
    "<VOUCHERNUMBER>P1</VOUCHERNUMBER>"
    "<NARRATION>Test&#4; Not Applicable</NARRATION>"
    "<PARTYLEDGERNAME>Party X</PARTYLEDGERNAME>"
    "<ALLLEDGERENTRIES.LIST><LEDGERNAME>Bank A/c</LEDGERNAME>"
    "<DEBIT>100.00</DEBIT><CREDIT>0.00</CREDIT></ALLLEDGERENTRIES.LIST>"
    "<ALLLEDGERENTRIES.LIST><LEDGERNAME>Cash A/c</LEDGERNAME>"
    "<DEBIT>0.00</DEBIT><CREDIT>100.00</CREDIT></ALLLEDGERENTRIES.LIST>"
    "</VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>"
)


def test_read_text_decodes_utf16(tmp_path):
    p = tmp_path / "x.xml"
    p.write_bytes(VCH_XML.encode("utf-16"))  # writes a BOM
    txt = _read_text(str(p))
    assert "<ENVELOPE>" in txt          # decoded, not mangled
    assert "\ufffd" not in txt          # no replacement chars from wrong encoding


def test_parse_tally_xml_strips_invalid_char_refs():
    d = parse_tally_xml(VCH_XML)  # parsed as str (utf-16 decoded by caller)
    assert len(d.vouchers) == 1
    v = d.vouchers[0]
    assert v.voucher_type == "payment"
    assert v.voucher_date == "2025-04-01"
    # &#4; removed, leaving the surrounding text
    assert v.narration == "Test Not Applicable"
    assert len(v.lines) == 2


def test_parse_tally_archive_handles_utf16_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("daybook.xml", VCH_XML.encode("utf-16"))
    result = parse_tally_archive(buf.getvalue())
    assert len(result.vouchers) == 1
    assert result.vouchers[0].voucher_type == "payment"
    assert result.vouchers[0].voucher_date == "2025-04-01"
