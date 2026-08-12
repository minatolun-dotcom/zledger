"""Voucher PDF generation service.

Renders a printable voucher (sales/purchase/payment/receipt/journal/…)
to a PDF byte stream. Reuses the reportlab setup from `export.py`
(DejaVu fonts for ₹, company logo, table styles).
"""
from __future__ import annotations

from io import BytesIO
from typing import TYPE_CHECKING

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.services.export import FONT_BOLD, FONT_REGULAR, _company_header_flowables, _make_table, _fmt

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
    from app.models.user import Company
    from app.models.voucher import Voucher

_VOUCHER_TYPE_LABELS = {
    "sales": "Sales Voucher",
    "purchase": "Purchase Voucher",
    "payment": "Payment Voucher",
    "receipt": "Receipt Voucher",
    "contra": "Contra Voucher",
    "journal": "Journal Voucher",
    "credit_note": "Credit Note",
    "debit_note": "Debit Note",
}


def generate_voucher_pdf(db: "Session", voucher: "Voucher", company: "Company") -> bytes:
    """Build a printable voucher PDF."""
    from app.models.accounting import Ledger

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=15 * mm,
    )
    styles = getSampleStyleSheet()
    elements = []

    # Resolve ledger names (not stored on the line model).
    ledger_ids = {ln.ledger_id for ln in voucher.lines if ln.ledger_id}
    ledger_names = {}
    if ledger_ids:
        ledger_names = {
            l.id: l.name
            for l in db.query(Ledger).filter(Ledger.id.in_(ledger_ids)).all()
        }

    # Company header (logo + name) + document title
    elements.extend(_company_header_flowables(company.id, db))
    title = _VOUCHER_TYPE_LABELS.get(voucher.voucher_type, voucher.voucher_type.replace("_", " ").title())
    elements.append(Paragraph(f"<b>{title}</b>", styles["Title"]))
    elements.append(Spacer(1, 4 * mm))

    # ── Header block: voucher metadata ────────────────────────────────────
    status = voucher.status.title()
    if voucher.cancelled_at:
        status = "Cancelled"
    header_rows = [
        ["Voucher No.", voucher.voucher_number, "Date", voucher.voucher_date],
        ["Status", status, "Doc Type", voucher.document_type or "regular"],
        ["Narration", voucher.narration or "—", "Reference", voucher.reference or "—"],
    ]
    if voucher.party_id and voucher.party:
        header_rows.append(["Party", voucher.party.name, "Party GSTIN", voucher.party.gstin or "—"])
    if voucher.place_of_supply:
        header_rows.append(["Place of Supply", voucher.place_of_supply, "", ""])
    if voucher.counterparty_gstin:
        header_rows.append(["Counterparty GSTIN", voucher.counterparty_gstin, "", ""])

    header_table = Table(header_rows, colWidths=[30 * mm, 70 * mm, 30 * mm, 70 * mm])
    header_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), FONT_REGULAR),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.grey),
        ("TEXTCOLOR", (2, 0), (2, -1), colors.grey),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 5 * mm))

    # ── Lines table ────────────────────────────────────────────────────────
    headers = ["Ledger", "Item", "Qty", "Rate", "Taxable", "CGST", "SGST", "IGST", "Debit", "Credit"]
    rows = []
    for ln in voucher.lines:
        item = getattr(ln, "stock_item", None)
        item_name = item.name if item is not None else ""
        rows.append([
            ledger_names.get(ln.ledger_id, ln.ledger_id),
            item_name,
            _fmt(ln.quantity) if ln.quantity else "",
            _fmt(ln.rate) if ln.rate else "",
            _fmt(ln.taxable_value) if ln.taxable_value else "",
            _fmt(ln.cgst_amount) if ln.cgst_amount else "",
            _fmt(ln.sgst_amount) if ln.sgst_amount else "",
            _fmt(ln.igst_amount) if ln.igst_amount else "",
            _fmt(ln.debit) if ln.debit else "",
            _fmt(ln.credit) if ln.credit else "",
        ])

    page_w = A4[0] - 36 * mm
    col_w = [
        page_w * 0.20, page_w * 0.14, page_w * 0.07, page_w * 0.08,
        page_w * 0.09, page_w * 0.08, page_w * 0.08, page_w * 0.08,
        page_w * 0.09, page_w * 0.09,
    ]
    elements.append(_make_table(headers, rows, col_w))
    elements.append(Spacer(1, 5 * mm))

    # ── Totals ─────────────────────────────────────────────────────────────
    total_rows = [
        ["Subtotal", _fmt(voucher.subtotal)],
        ["Discount", _fmt(voucher.discount_total)],
        ["Tax", _fmt(voucher.tax_total)],
        ["Grand Total", _fmt(voucher.grand_total)],
    ]
    if voucher.round_off_to is not None:
        # round_off_to is the mode (0 Auto / 1 Up / 2 Down), not the amount —
        # show the actual adjustment: grand_total − (subtotal + tax).
        round_off_amt = (voucher.grand_total or 0) - (voucher.subtotal or 0) - (voucher.tax_total or 0)
        if abs(round_off_amt) > 0.0005:
            total_rows.append(["Round Off", _fmt(round_off_amt)])
    totals_table = Table(
        [[r[0], r[1]] for r in total_rows],
        colWidths=[60 * mm, 60 * mm],
        hAlign="RIGHT",
    )
    totals_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), FONT_REGULAR),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, -1), (-1, -1), FONT_BOLD),
        ("FONTSIZE", (0, -1), (-1, -1), 10),
        ("LINEABOVE", (0, -1), (-1, -1), 0.6, colors.black),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 6 * mm))

    # Footer: balance line
    if voucher.cancelled_at:
        elements.append(Paragraph(
            f"<font color='red'><b>Cancelled</b></font> — {voucher.cancel_reason or 'No reason given'}",
            styles["Normal"],
        ))

    doc.build(elements)
    return buf.getvalue()
