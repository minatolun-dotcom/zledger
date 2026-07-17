"""Day Book endpoints: chronological voucher listing with filters, search, export."""
from __future__ import annotations

import csv
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.dependencies import get_active_company, require_role
from app.models.accounting import Party, Ledger
from app.models.user import Company, User
from app.schemas.daybook import DayBookResponse, DayBookSummary as DayBookSummarySchema
from app.services.daybook import query_daybook, DayBookFilters, DayBookEntry
from app.schemas.member import CompanyRole

router = APIRouter()

VOUCHER_TYPE_LABELS = {
    "sales": "Sales",
    "purchase": "Purchase",
    "payment": "Payment",
    "receipt": "Receipt",
    "contra": "Contra",
    "journal": "Journal",
    "credit_note": "Credit Note",
    "debit_note": "Debit Note",
}


def _entry_to_dict(e: DayBookEntry) -> dict:
    return {
        "id": e.id,
        "voucher_date": e.voucher_date,
        "voucher_number": e.voucher_number,
        "voucher_type": VOUCHER_TYPE_LABELS.get(e.voucher_type, e.voucher_type),
        "party_name": e.party_name or "",
        "narration": e.narration or "",
        "debit": float(e.debit),
        "credit": float(e.credit),
        "status": e.status,
        "created_by_name": e.created_by_name or "",
    }


def _fmt(n: float) -> str:
    return f"{n:,.2f}"


# ─── Main Day Book endpoint ───────────────────────────────────────────────


@router.get("/daybook", response_model=DayBookResponse)
def get_daybook(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    voucher_type: str | None = Query(default=None),
    party_id: str | None = Query(default=None),
    ledger_id: str | None = Query(default=None),
    created_by: str | None = Query(default=None),
    voucher_number: str | None = Query(default=None),
    narration: str | None = Query(default=None),
    search: str | None = Query(default=None),
    sort_by: str = Query(default="voucher_date"),
    sort_order: str = Query(default="asc"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    group_by_date: bool = Query(default=False),
):
    """Day Book: chronological voucher listing with filters and pagination."""
    filters = DayBookFilters(
        company_id=company.id,
        start_date=start_date,
        end_date=end_date,
        voucher_type=voucher_type,
        party_id=party_id,
        ledger_id=ledger_id,
        created_by=created_by,
        voucher_number=voucher_number,
        narration=narration,
        search=search,
    )

    result = query_daybook(
        db=db,
        filters=filters,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size,
        group_by_date=group_by_date,
    )

    entries = [_entry_to_dict(e) for e in result.entries]

    groups = None
    if group_by_date:
        date_map: dict[str, dict] = {}
        for e in result.entries:
            d = e.voucher_date
            if d not in date_map:
                date_map[d] = {"date": d, "entries": [], "day_total_debit": 0.0, "day_total_credit": 0.0}
            entry_dict = _entry_to_dict(e)
            date_map[d]["entries"].append(entry_dict)
            date_map[d]["day_total_debit"] += float(e.debit)
            date_map[d]["day_total_credit"] += float(e.credit)

        # Sort dates
        sorted_dates = sorted(date_map.keys())
        groups = [date_map[d] for d in sorted_dates]

    summary = DayBookSummarySchema(
        total_vouchers=result.summary.total_vouchers,
        total_debit=float(result.summary.total_debit),
        total_credit=float(result.summary.total_credit),
        is_balanced=abs(float(result.summary.total_debit) - float(result.summary.total_credit)) < 0.01,
    )

    return DayBookResponse(
        entries=entries,
        groups=groups,
        summary=summary,
        total=result.total,
        page=page,
        page_size=page_size,
    )


# ─── Export: CSV ──────────────────────────────────────────────────────────


@router.get("/daybook/csv")
def daybook_csv(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    voucher_type: str | None = Query(default=None),
    party_id: str | None = Query(default=None),
    ledger_id: str | None = Query(default=None),
    created_by: str | None = Query(default=None),
    voucher_number: str | None = Query(default=None),
    narration: str | None = Query(default=None),
    search: str | None = Query(default=None),
    sort_by: str = Query(default="voucher_date"),
    sort_order: str = Query(default="asc"),
):
    """Export Day Book as CSV."""
    filters = DayBookFilters(
        company_id=company.id,
        start_date=start_date,
        end_date=end_date,
        voucher_type=voucher_type,
        party_id=party_id,
        ledger_id=ledger_id,
        created_by=created_by,
        voucher_number=voucher_number,
        narration=narration,
        search=search,
    )

    def generate_csv():
        """Stream CSV rows one at a time to minimize memory usage."""
        yield "\ufeff"  # BOM for Excel compatibility
        yield "Date,Voucher #,Type,Party,Narration,Debit,Credit,Status,Created By\r\n"

        page = 1
        batch_size = 1000
        total_yielded = 0

        while True:
            result = query_daybook(
                db=db,
                filters=filters,
                sort_by=sort_by,
                sort_order=sort_order,
                page=page,
                page_size=batch_size,
            )

            if not result.entries:
                break

            for e in result.entries:
                row = [
                    e.voucher_date,
                    e.voucher_number,
                    VOUCHER_TYPE_LABELS.get(e.voucher_type, e.voucher_type),
                    e.party_name or "",
                    e.narration or "",
                    _fmt(float(e.debit)),
                    _fmt(float(e.credit)),
                    e.status,
                    e.created_by_name or "",
                ]
                # Escape CSV fields
                yield ",".join(f'"{field}"' for field in row) + "\r\n"
                total_yielded += 1

            page += 1

            # Safety limit to prevent extremely large exports
            if total_yielded >= 50000:
                break

    return StreamingResponse(
        generate_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="daybook.csv"'},
    )


# ─── Export: Excel ────────────────────────────────────────────────────────


@router.get("/daybook/xlsx")
def daybook_xlsx(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    voucher_type: str | None = Query(default=None),
    party_id: str | None = Query(default=None),
    ledger_id: str | None = Query(default=None),
    created_by: str | None = Query(default=None),
    voucher_number: str | None = Query(default=None),
    narration: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=50000, ge=1, le=100000),
):
    """Export Day Book as Excel. Limited to `limit` rows to prevent memory issues."""
    filters = DayBookFilters(
        company_id=company.id,
        start_date=start_date,
        end_date=end_date,
        voucher_type=voucher_type,
        party_id=party_id,
        ledger_id=ledger_id,
        created_by=created_by,
        voucher_number=voucher_number,
        narration=narration,
        search=search,
    )

    result = query_daybook(db=db, filters=filters, page=1, page_size=min(limit, 100000))

    wb = Workbook()
    ws = wb.active
    ws.title = "Day Book"

    header_font = Font(bold=True, color="FFFFFF", size=10)
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    border = Border(
        bottom=Side(style="thin", color="334155"),
        right=Side(style="thin", color="E2E8F0"),
    )

    ws.merge_cells("A1:I1")
    ws["A1"] = "Day Book"
    ws["A1"].font = Font(bold=True, size=14)

    headers = ["Date", "Voucher #", "Type", "Party", "Narration", "Debit", "Credit", "Status", "Created By"]
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=3, column=col, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
        cell.border = border

    total_debit = 0.0
    total_credit = 0.0
    for i, e in enumerate(result.entries, 4):
        ws.cell(row=i, column=1, value=e.voucher_date)
        ws.cell(row=i, column=2, value=e.voucher_number)
        ws.cell(row=i, column=3, value=VOUCHER_TYPE_LABELS.get(e.voucher_type, e.voucher_type))
        ws.cell(row=i, column=4, value=e.party_name or "")
        ws.cell(row=i, column=5, value=e.narration or "")
        ws.cell(row=i, column=6, value=float(e.debit))
        ws.cell(row=i, column=7, value=float(e.credit))
        ws.cell(row=i, column=8, value=e.status)
        ws.cell(row=i, column=9, value=e.created_by_name or "")
        total_debit += float(e.debit)
        total_credit += float(e.credit)

    total_row = len(result.entries) + 4
    ws.cell(row=total_row, column=1, value="TOTAL").font = Font(bold=True)
    ws.cell(row=total_row, column=6, value=total_debit).font = Font(bold=True)
    ws.cell(row=total_row, column=7, value=total_credit).font = Font(bold=True)

    for col in range(1, 10):
        ws.column_dimensions[get_column_letter(col)].width = 20

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="daybook.xlsx"'},
    )


# ─── Export: PDF ──────────────────────────────────────────────────────────


def _get_pdf_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="ReportTitle", parent=styles["Heading1"], fontSize=16,
        spaceAfter=6 * mm, alignment=1,
    ))
    styles.add(ParagraphStyle(
        name="ReportSubtitle", parent=styles["Normal"], fontSize=10,
        spaceAfter=4 * mm, alignment=1, textColor=colors.grey,
    ))
    styles.add(ParagraphStyle(
        name="CellText", parent=styles["Normal"], fontSize=7, leading=9,
    ))
    return styles


def _make_pdf_table(headers: list[str], rows: list[list[str]]) -> Table:
    data = [headers] + rows
    t = Table(data, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 1), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
        ("TOPPADDING", (0, 0), (-1, 0), 4),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 3),
        ("TOPPADDING", (0, 1), (-1, -1), 3),
        ("ALIGN", (5, 0), (6, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#334155")),
        ("LINEBELOW", (0, -1), (-1, -1), 1, colors.HexColor("#334155")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
    ]))
    return t


@router.get("/daybook/pdf")
def daybook_pdf(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    voucher_type: str | None = Query(default=None),
    party_id: str | None = Query(default=None),
    ledger_id: str | None = Query(default=None),
    created_by: str | None = Query(default=None),
    voucher_number: str | None = Query(default=None),
    narration: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=50000, ge=1, le=100000),
):
    """Export Day Book as PDF. Limited to `limit` rows to prevent memory issues."""
    filters = DayBookFilters(
        company_id=company.id,
        start_date=start_date,
        end_date=end_date,
        voucher_type=voucher_type,
        party_id=party_id,
        ledger_id=ledger_id,
        created_by=created_by,
        voucher_number=voucher_number,
        narration=narration,
        search=search,
    )

    result = query_daybook(db=db, filters=filters, page=1, page_size=min(limit, 100000))
    styles = _get_pdf_styles()
    buf = BytesIO()

    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=15 * mm, bottomMargin=12 * mm)
    elements = []

    from app.services.export import _company_header_flowables
    elements.extend(_company_header_flowables(company.id, db))

    elements.append(Paragraph("Day Book", styles["ReportTitle"]))
    subtitle_parts = []
    if start_date:
        subtitle_parts.append(f"from {start_date}")
    if end_date:
        subtitle_parts.append(f"to {end_date}")
    if subtitle_parts:
        elements.append(Paragraph(" ".join(subtitle_parts), styles["ReportSubtitle"]))
    elements.append(Spacer(1, 3 * mm))

    headers = ["Date", "Voucher #", "Type", "Party", "Narration", "Debit", "Credit", "Status"]
    rows = []
    total_debit = 0.0
    total_credit = 0.0
    for e in result.entries:
        rows.append([
            e.voucher_date,
            e.voucher_number,
            VOUCHER_TYPE_LABELS.get(e.voucher_type, e.voucher_type),
            (e.party_name or "")[:30],
            (e.narration or "")[:50],
            _fmt(float(e.debit)),
            _fmt(float(e.credit)),
            e.status,
        ])
        total_debit += float(e.debit)
        total_credit += float(e.credit)

    rows.append(["", "", "", "", "TOTAL", _fmt(total_debit), _fmt(total_credit), ""])
    elements.append(_make_pdf_table(headers, rows))

    # Summary line
    balanced = abs(total_debit - total_credit) < 0.01
    summary_text = f"Total Vouchers: {result.summary.total_vouchers} | Total Debit: ₹{_fmt(total_debit)} | Total Credit: ₹{_fmt(total_credit)}"
    if balanced:
        summary_text += " | ✓ Balanced"
    else:
        summary_text += f" | ⚠ Difference: ₹{_fmt(abs(total_debit - total_credit))}"
    elements.append(Spacer(1, 3 * mm))
    elements.append(Paragraph(summary_text, styles["Normal"]))

    doc.build(elements)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="daybook.pdf"'},
    )


# ─── Filter options endpoint ──────────────────────────────────────────────


@router.get("/daybook/filters")
def daybook_filters(
    company: Company = Depends(require_role(CompanyRole.viewer)),
    db: Session = Depends(get_db),
):
    """Return available filter options for the Day Book UI."""
    parties = db.query(Party.id, Party.name).filter(
        Party.company_id == company.id, Party.is_active.is_(True)
    ).order_by(Party.name).all()

    ledgers = db.query(Ledger.id, Ledger.name).filter(
        Ledger.company_id == company.id, Ledger.is_active.is_(True)
    ).order_by(Ledger.name).all()

    users = db.query(User.id, User.name).join(
        User.memberships
    ).filter(
        User.is_active.is_(True),
    ).distinct().order_by(User.name).all()

    return {
        "parties": [{"id": p.id, "name": p.name} for p in parties],
        "ledgers": [{"id": l.id, "name": l.name} for l in ledgers],
        "users": [{"id": u.id, "name": u.name} for u in users],
        "voucher_types": [
            {"id": k, "label": v} for k, v in VOUCHER_TYPE_LABELS.items()
        ],
        "statuses": [
            {"id": "posted", "label": "Posted"},
        ],
    }
