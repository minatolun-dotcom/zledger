"""Export service: PDF and Excel generation for reports.

Uses reportlab for PDF and openpyxl for Excel (.xlsx).
Both are pure Python — no system dependencies required.
"""
from __future__ import annotations

from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

from app.core.config import settings
from app.models.accounting import FinancialYear
from app.services.reports import (
    get_balance_sheet,
    get_ledger_balances,
    get_profit_and_loss,
    get_trial_balance,
)
from sqlalchemy.orm import Session


# ─── Logo Helper ─────────────────────────────────────────────────────────────

def _logo_flowable(company_id: str, db: Session) -> list:
    """Return a ReportLab Image flowable for the company logo, or empty list."""
    from reportlab.lib.utils import ImageReader

    from app.models.user import Company
    company = db.get(Company, company_id)
    if not company or not company.logo_filename:
        return []
    logo_path = Path(settings.upload_dir) / company_id / company.logo_filename
    if not logo_path.exists():
        return []
    try:
        reader = ImageReader(str(logo_path))
        iw, ih = reader.getSize()
        max_w, max_h = 40 * mm, 15 * mm
        scale = min(max_w / iw, max_h / ih)
        img = Image(str(logo_path), width=iw * scale, height=ih * scale)
        img.hAlign = "LEFT"
        return [img, Spacer(1, 2 * mm)]
    except Exception:
        return []


def _company_header_flowables(company_id: str, db: Session) -> list:
    """Return logo + company name for PDF headers."""
    from app.models.user import Company
    flowables = _logo_flowable(company_id, db)
    company = db.get(Company, company_id)
    if company:
        flowables.append(Paragraph(company.name, getSampleStyleSheet()["Normal"]))
    return flowables


# ─── PDF Styles ──────────────────────────────────────────────────────────────

def _get_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="ReportTitle",
        parent=styles["Heading1"],
        fontSize=16,
        spaceAfter=6 * mm,
        alignment=1,  # center
    ))
    styles.add(ParagraphStyle(
        name="ReportSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        spaceAfter=4 * mm,
        alignment=1,
        textColor=colors.grey,
    ))
    styles.add(ParagraphStyle(
        name="GroupHeader",
        parent=styles["Heading2"],
        fontSize=11,
        spaceBefore=4 * mm,
        spaceAfter=2 * mm,
    ))
    styles.add(ParagraphStyle(
        name="CellText",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
    ))
    return styles


def _fmt(n: float) -> str:
    """Format number as Indian currency string."""
    return f"{n:,.2f}"


def _make_table(headers: list[str], rows: list[list[str]], col_widths: list[float] | None = None) -> Table:
    """Create a styled Platypus Table."""
    data = [headers] + rows
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
        ("TOPPADDING", (0, 1), (-1, -1), 4),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#334155")),
        ("LINEBELOW", (0, -1), (-1, -1), 1, colors.HexColor("#334155")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
    ]))
    return t


# ─── Trial Balance PDF ───────────────────────────────────────────────────────


def export_trial_balance_pdf(db: Session, company_id: str, fy_id: str) -> bytes:
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    ledgers = get_trial_balance(db, company_id, fy_id)
    styles = _get_styles()
    buf = BytesIO()

    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=15 * mm)
    elements = []

    elements.extend(_logo_flowable(company_id, db))
    elements.append(Paragraph("Trial Balance", styles["ReportTitle"]))
    elements.append(Paragraph(f"{fy.name} ({fy.start_date} to {fy.end_date})", styles["ReportSubtitle"]))
    elements.append(Spacer(1, 4 * mm))

    headers = ["Ledger", "Group", "Opening Bal.", "Debit", "Credit", "Closing Bal."]
    rows = []
    total_dr = 0.0
    total_cr = 0.0
    for lb in ledgers:
        ob = f"{_fmt(lb.opening_balance)} {lb.opening_balance_type}"
        cb = f"{_fmt(lb.closing_balance)} {lb.closing_balance_type}"
        rows.append([lb.ledger_name, lb.group_name, ob, _fmt(lb.total_debit), _fmt(lb.total_credit), cb])
        total_dr += float(lb.total_debit)
        total_cr += float(lb.total_credit)

    rows.append(["", "TOTAL", "", _fmt(total_dr), _fmt(total_cr), ""])

    page_w = A4[0] - 40 * mm
    col_w = [page_w * 0.25, page_w * 0.20, page_w * 0.15, page_w * 0.13, page_w * 0.13, page_w * 0.14]
    elements.append(_make_table(headers, rows, col_w))

    doc.build(elements)
    return buf.getvalue()


# ─── Trial Balance Excel ─────────────────────────────────────────────────────


def export_trial_balance_xlsx(db: Session, company_id: str, fy_id: str) -> bytes:
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    ledgers = get_trial_balance(db, company_id, fy_id)
    wb = Workbook()
    ws = wb.active
    ws.title = "Trial Balance"

    header_font = Font(bold=True, color="FFFFFF", size=10)
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    border = Border(
        bottom=Side(style="thin", color="334155"),
        right=Side(style="thin", color="E2E8F0"),
    )

    ws.merge_cells("A1:F1")
    ws["A1"] = f"Trial Balance — {fy.name} ({fy.start_date} to {fy.end_date})"
    ws["A1"].font = Font(bold=True, size=14)

    headers = ["Ledger", "Group", "Opening Bal.", "Debit", "Credit", "Closing Bal."]
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=3, column=col, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
        cell.border = border

    total_dr = 0.0
    total_cr = 0.0
    for i, lb in enumerate(ledgers, 4):
        ws.cell(row=i, column=1, value=lb.ledger_name)
        ws.cell(row=i, column=2, value=lb.group_name)
        ws.cell(row=i, column=3, value=f"{lb.opening_balance:.2f} {lb.opening_balance_type}")
        ws.cell(row=i, column=4, value=float(lb.total_debit))
        ws.cell(row=i, column=5, value=float(lb.total_credit))
        ws.cell(row=i, column=6, value=f"{lb.closing_balance:.2f} {lb.closing_balance_type}")
        total_dr += float(lb.total_debit)
        total_cr += float(lb.total_credit)

    total_row = len(ledgers) + 4
    ws.cell(row=total_row, column=2, value="TOTAL").font = Font(bold=True)
    ws.cell(row=total_row, column=4, value=total_dr).font = Font(bold=True)
    ws.cell(row=total_row, column=5, value=total_cr).font = Font(bold=True)

    for col in range(1, 7):
        ws.column_dimensions[get_column_letter(col)].width = 20

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ─── Profit & Loss PDF ───────────────────────────────────────────────────────


def _build_grouped_pdf(
    title: str,
    fy: FinancialYear,
    groups_a: list,
    groups_b: list,
    label_a: str,
    label_b: str,
    total_a: float,
    total_b: float,
    footer_line: str,
    is_two_col: bool = True,
    company_id: str | None = None,
    db: Session | None = None,
) -> bytes:
    styles = _get_styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=15 * mm)
    elements = []

    if company_id and db:
        elements.extend(_logo_flowable(company_id, db))

    elements.append(Paragraph(title, styles["ReportTitle"]))
    elements.append(Paragraph(f"{fy.name} ({fy.start_date} to {fy.end_date})", styles["ReportSubtitle"]))
    elements.append(Spacer(1, 4 * mm))

    def _render_groups(groups, label, total, total_label):
        elements.append(Paragraph(label, styles["GroupHeader"]))
        headers = ["Ledger", "Opening", "Debit", "Credit", "Closing"]
        rows = []
        for g in groups:
            for lb in g.ledgers:
                ob = f"{_fmt(lb.opening_balance)} {lb.opening_balance_type}"
                cb = f"{_fmt(lb.closing_balance)} {lb.closing_balance_type}"
                rows.append([lb.ledger_name, ob, _fmt(lb.total_debit), _fmt(lb.total_credit), cb])
            rows.append([f"  {g.group_name} Total", "", "", "", _fmt(g.total)])
        rows.append([total_label, "", "", "", _fmt(total)])

        page_w = A4[0] - 40 * mm
        col_w = [page_w * 0.30, page_w * 0.175, page_w * 0.175, page_w * 0.175, page_w * 0.175]
        elements.append(_make_table(headers, rows, col_w))
        elements.append(Spacer(1, 6 * mm))

    if is_two_col:
        # For P&L: income on left, expenses on right (rendered sequentially for PDF)
        _render_groups(groups_a, label_a, total_a, f"Total {label_a}")
        _render_groups(groups_b, label_b, total_b, f"Total {label_b}")
    else:
        # For Balance Sheet: assets, then liabilities, then capital
        _render_groups(groups_a, label_a, total_a, f"Total {label_a}")
        for li, cap in groups_b:
            _render_groups(li, "Liabilities", 0, "Total Liabilities")
            _render_groups(cap, "Capital", 0, "Total Capital")

    elements.append(Paragraph(f"<b>{footer_line}</b>", styles["Normal"]))

    doc.build(elements)
    return buf.getvalue()


def export_profit_loss_pdf(db: Session, company_id: str, fy_id: str) -> bytes:
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    result = get_profit_and_loss(db, company_id, fy_id)
    net = float(result["net_profit"])
    label = "Net Profit" if result["is_profit"] else "Net Loss"

    return _build_grouped_pdf(
        title="Profit & Loss Account",
        fy=fy,
        groups_a=result["income_groups"],
        groups_b=result["expense_groups"],
        label_a="Income",
        label_b="Expenses",
        total_a=float(result["total_income"]),
        total_b=float(result["total_expenses"]),
        footer_line=f"{label}: ₹{_fmt(abs(net))}",
        company_id=company_id,
        db=db,
    )


# ─── Profit & Loss Excel ─────────────────────────────────────────────────────


def _export_grouped_xlsx(
    title: str,
    fy_name: str,
    start_date: str,
    end_date: str,
    groups_a: list,
    groups_b: list,
    label_a: str,
    label_b: str,
    total_a: float,
    total_b: float,
    footer_line: str,
) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = title[:31]  # Excel sheet name max 31 chars

    header_font = Font(bold=True, color="FFFFFF", size=10)
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")

    ws.merge_cells("A1:E1")
    ws["A1"] = f"{title} — {fy_name} ({start_date} to {end_date})"
    ws["A1"].font = Font(bold=True, size=14)

    headers = ["Ledger", "Opening", "Debit", "Credit", "Closing"]
    row = 3

    def write_groups(groups, label, total, total_label):
        nonlocal row
        ws.cell(row=row, column=1, value=label).font = Font(bold=True, size=12)
        row += 1

        for col, h in enumerate(headers, 1):
            cell = ws.cell(row=row, column=col, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")
        row += 1

        for g in groups:
            for lb in g.ledgers:
                ws.cell(row=row, column=1, value=lb.ledger_name)
                ws.cell(row=row, column=2, value=f"{lb.opening_balance:.2f} {lb.opening_balance_type}")
                ws.cell(row=row, column=3, value=float(lb.total_debit))
                ws.cell(row=row, column=4, value=float(lb.total_credit))
                ws.cell(row=row, column=5, value=f"{lb.closing_balance:.2f} {lb.closing_balance_type}")
                row += 1
            ws.cell(row=row, column=1, value=f"  {g.group_name} Total").font = Font(bold=True)
            ws.cell(row=row, column=5, value=float(g.total)).font = Font(bold=True)
            row += 1

        ws.cell(row=row, column=1, value=total_label).font = Font(bold=True, size=11)
        ws.cell(row=row, column=5, value=total).font = Font(bold=True, size=11)
        row += 2

    write_groups(groups_a, label_a, total_a, f"Total {label_a}")
    write_groups(groups_b, label_b, total_b, f"Total {label_b}")

    ws.cell(row=row, column=1, value=footer_line).font = Font(bold=True, size=12, color="006400")

    for col in range(1, 6):
        ws.column_dimensions[get_column_letter(col)].width = 22

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_profit_loss_xlsx(db: Session, company_id: str, fy_id: str) -> bytes:
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    result = get_profit_and_loss(db, company_id, fy_id)
    net = float(result["net_profit"])
    label = "Net Profit" if result["is_profit"] else "Net Loss"

    return _export_grouped_xlsx(
        title="Profit & Loss Account",
        fy_name=fy.name,
        start_date=fy.start_date,
        end_date=fy.end_date,
        groups_a=result["income_groups"],
        groups_b=result["expense_groups"],
        label_a="Income",
        label_b="Expenses",
        total_a=float(result["total_income"]),
        total_b=float(result["total_expenses"]),
        footer_line=f"{label}: ₹{_fmt(abs(net))}",
    )


# ─── Balance Sheet PDF ───────────────────────────────────────────────────────


def export_balance_sheet_pdf(db: Session, company_id: str, fy_id: str) -> bytes:
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    result = get_balance_sheet(db, company_id, fy_id)
    styles = _get_styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=15 * mm)
    elements = []

    elements.extend(_logo_flowable(company_id, db))
    elements.append(Paragraph("Balance Sheet", styles["ReportTitle"]))
    elements.append(Paragraph(f"{fy.name} ({fy.start_date} to {fy.end_date})", styles["ReportSubtitle"]))
    elements.append(Spacer(1, 4 * mm))

    def render_side(groups, label, total):
        elements.append(Paragraph(label, styles["GroupHeader"]))
        headers = ["Ledger", "Opening", "Debit", "Credit", "Closing"]
        rows = []
        for g in groups:
            for lb in g.ledgers:
                ob = f"{_fmt(lb.opening_balance)} {lb.opening_balance_type}"
                cb = f"{_fmt(lb.closing_balance)} {lb.closing_balance_type}"
                rows.append([lb.ledger_name, ob, _fmt(lb.total_debit), _fmt(lb.total_credit), cb])
            rows.append([f"  {g.group_name} Total", "", "", "", _fmt(g.total)])
        rows.append([f"Total {label}", "", "", "", _fmt(total)])

        page_w = A4[0] - 40 * mm
        col_w = [page_w * 0.30, page_w * 0.175, page_w * 0.175, page_w * 0.175, page_w * 0.175]
        elements.append(_make_table(headers, rows, col_w))
        elements.append(Spacer(1, 6 * mm))

    render_side(result["asset_groups"], "Assets", float(result["total_assets"]))
    render_side(result["liability_groups"], "Liabilities", float(result["total_liabilities"]))
    render_side(result["capital_groups"], "Capital", float(result["total_capital"]))

    total_a = float(result["total_assets"])
    total_lc = float(result["total_liabilities_and_capital"])
    balanced = abs(total_a - total_lc) < 0.01
    footer = "Balance Sheet is balanced" if balanced else f"Difference: ₹{_fmt(abs(total_a - total_lc))}"
    elements.append(Paragraph(f"<b>{footer}</b>", styles["Normal"]))

    doc.build(elements)
    return buf.getvalue()


# ─── Balance Sheet Excel ─────────────────────────────────────────────────────


def export_balance_sheet_xlsx(db: Session, company_id: str, fy_id: str) -> bytes:
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    result = get_balance_sheet(db, company_id, fy_id)
    wb = Workbook()
    ws = wb.active
    ws.title = "Balance Sheet"

    header_font = Font(bold=True, color="FFFFFF", size=10)
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")

    ws.merge_cells("A1:E1")
    ws["A1"] = f"Balance Sheet — {fy.name} ({fy.start_date} to {fy.end_date})"
    ws["A1"].font = Font(bold=True, size=14)

    headers = ["Ledger", "Opening", "Debit", "Credit", "Closing"]
    row = 3

    def write_side(groups, label, total):
        nonlocal row
        ws.cell(row=row, column=1, value=label).font = Font(bold=True, size=12)
        row += 1
        for col, h in enumerate(headers, 1):
            cell = ws.cell(row=row, column=col, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")
        row += 1

        for g in groups:
            for lb in g.ledgers:
                ws.cell(row=row, column=1, value=lb.ledger_name)
                ws.cell(row=row, column=2, value=f"{lb.opening_balance:.2f} {lb.opening_balance_type}")
                ws.cell(row=row, column=3, value=float(lb.total_debit))
                ws.cell(row=row, column=4, value=float(lb.total_credit))
                ws.cell(row=row, column=5, value=f"{lb.closing_balance:.2f} {lb.closing_balance_type}")
                row += 1
            ws.cell(row=row, column=1, value=f"  {g.group_name} Total").font = Font(bold=True)
            ws.cell(row=row, column=5, value=float(g.total)).font = Font(bold=True)
            row += 1

        ws.cell(row=row, column=1, value=f"Total {label}").font = Font(bold=True, size=11)
        ws.cell(row=row, column=5, value=total).font = Font(bold=True, size=11)
        row += 2

    write_side(result["asset_groups"], "Assets", float(result["total_assets"]))
    write_side(result["liability_groups"], "Liabilities", float(result["total_liabilities"]))
    write_side(result["capital_groups"], "Capital", float(result["total_capital"]))

    total_a = float(result["total_assets"])
    total_lc = float(result["total_liabilities_and_capital"])
    balanced = abs(total_a - total_lc) < 0.01
    footer = "Balance Sheet is balanced ✓" if balanced else f"Difference: ₹{_fmt(abs(total_a - total_lc))}"
    ws.cell(row=row, column=1, value=footer).font = Font(bold=True, size=12, color="006400")

    for col in range(1, 6):
        ws.column_dimensions[get_column_letter(col)].width = 22

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ─── Generic Flat Table Helpers ──────────────────────────────────────────────


def _export_flat_pdf(
    title: str,
    subtitle: str,
    headers: list[str],
    rows: list[list[str]],
    col_widths: list[float] | None = None,
    footer: str | None = None,
    company_id: str | None = None,
    db: Session | None = None,
) -> bytes:
    """Build a simple single-table PDF report."""
    styles = _get_styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=15 * mm)
    elements = []

    if company_id and db:
        elements.extend(_logo_flowable(company_id, db))

    elements.append(Paragraph(title, styles["ReportTitle"]))
    elements.append(Paragraph(subtitle, styles["ReportSubtitle"]))
    elements.append(Spacer(1, 4 * mm))

    if not col_widths:
        page_w = A4[0] - 40 * mm
        col_count = len(headers)
        col_widths = [page_w / col_count] * col_count

    elements.append(_make_table(headers, rows, col_widths))

    if footer:
        elements.append(Spacer(1, 4 * mm))
        elements.append(Paragraph(f"<b>{footer}</b>", styles["Normal"]))

    doc.build(elements)
    return buf.getvalue()


def _export_flat_xlsx(
    title: str,
    subtitle: str,
    headers: list[str],
    rows: list[list[str | float]],
    sheet_name: str | None = None,
    footer: str | None = None,
) -> bytes:
    """Build a simple single-sheet Excel report."""
    wb = Workbook()
    ws = wb.active
    ws.title = (sheet_name or title)[:31]

    header_font = Font(bold=True, color="FFFFFF", size=10)
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")

    ws.merge_cells(f"A1:{get_column_letter(len(headers))}1")
    ws["A1"] = f"{title} — {subtitle}"
    ws["A1"].font = Font(bold=True, size=14)

    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=3, column=col, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    for i, row_data in enumerate(rows, 4):
        for j, val in enumerate(row_data, 1):
            ws.cell(row=i, column=j, value=val)

    if footer:
        r = len(rows) + 5
        ws.cell(row=r, column=1, value=footer).font = Font(bold=True, size=11, color="006400")

    for col in range(1, len(headers) + 1):
        ws.column_dimensions[get_column_letter(col)].width = 20

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ─── Cash Flow Export ────────────────────────────────────────────────────────


def export_cash_flow_pdf(db: Session, company_id: str, fy_id: str) -> bytes:
    from app.services.reports import get_cash_flow
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    result = get_cash_flow(db, company_id, fy.start_date, fy.end_date)
    styles = _get_styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=15 * mm)
    elements = []

    elements.extend(_logo_flowable(company_id, db))
    elements.append(Paragraph("Cash Flow Statement", styles["ReportTitle"]))
    elements.append(Paragraph(f"{fy.name} ({fy.start_date} to {fy.end_date})", styles["ReportSubtitle"]))
    elements.append(Spacer(1, 4 * mm))

    headers = ["Particulars", "Inflow", "Outflow", "Net"]

    for cat_key, cat_label in [("operating", "Operating Activities"), ("investing", "Investing Activities"), ("financing", "Financing Activities")]:
        cat = result[cat_key]
        elements.append(Paragraph(cat_label, styles["GroupHeader"]))
        rows = []
        for line in cat["lines"]:
            rows.append([line["label"], _fmt(line["inflow"]), _fmt(line["outflow"]), _fmt(line["net"])])
        rows.append([f"Total {cat_label}", _fmt(cat["total_inflow"]), _fmt(cat["total_outflow"]), _fmt(cat["net"])])

        page_w = A4[0] - 40 * mm
        col_w = [page_w * 0.40, page_w * 0.20, page_w * 0.20, page_w * 0.20]
        elements.append(_make_table(headers, rows, col_w))
        elements.append(Spacer(1, 4 * mm))

    elements.append(Paragraph(
        f"Opening Balance: ₹{_fmt(result['opening_balance'])} | "
        f"Closing Balance: ₹{_fmt(result['closing_balance'])} | "
        f"Net Increase: ₹{_fmt(result['net_increase'])}",
        styles["Normal"],
    ))

    doc.build(elements)
    return buf.getvalue()


def export_cash_flow_xlsx(db: Session, company_id: str, fy_id: str) -> bytes:
    from app.services.reports import get_cash_flow
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    result = get_cash_flow(db, company_id, fy.start_date, fy.end_date)
    wb = Workbook()
    ws = wb.active
    ws.title = "Cash Flow"

    header_font = Font(bold=True, color="FFFFFF", size=10)
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")

    ws.merge_cells("A1:D1")
    ws["A1"] = f"Cash Flow Statement — {fy.name} ({fy.start_date} to {fy.end_date})"
    ws["A1"].font = Font(bold=True, size=14)

    headers = ["Particulars", "Inflow", "Outflow", "Net"]
    row = 3

    for cat_key, cat_label in [("operating", "Operating Activities"), ("investing", "Investing Activities"), ("financing", "Financing Activities")]:
        cat = result[cat_key]
        ws.cell(row=row, column=1, value=cat_label).font = Font(bold=True, size=12)
        row += 1
        for col, h in enumerate(headers, 1):
            cell = ws.cell(row=row, column=col, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")
        row += 1
        for line in cat["lines"]:
            ws.cell(row=row, column=1, value=line["label"])
            ws.cell(row=row, column=2, value=float(line["inflow"]))
            ws.cell(row=row, column=3, value=float(line["outflow"]))
            ws.cell(row=row, column=4, value=float(line["net"]))
            row += 1
        ws.cell(row=row, column=1, value=f"Total {cat_label}").font = Font(bold=True)
        ws.cell(row=row, column=2, value=float(cat["total_inflow"])).font = Font(bold=True)
        ws.cell(row=row, column=3, value=float(cat["total_outflow"])).font = Font(bold=True)
        ws.cell(row=row, column=4, value=float(cat["net"])).font = Font(bold=True)
        row += 2

    ws.cell(row=row, column=1, value=f"Opening: ₹{_fmt(result['opening_balance'])} | Closing: ₹{_fmt(result['closing_balance'])} | Net: ₹{_fmt(result['net_increase'])}").font = Font(bold=True, size=11)

    for col in range(1, 5):
        ws.column_dimensions[get_column_letter(col)].width = 25

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ─── Aging Export ────────────────────────────────────────────────────────────


def export_aging_pdf(db: Session, company_id: str, fy_id: str, aging_type: str = "receivable") -> bytes:
    from app.services.reports import get_aging
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    result = get_aging(db, company_id, fy.start_date, fy.end_date, aging_type=aging_type)
    title = "Aging Analysis — Receivables" if aging_type == "receivable" else "Aging Analysis — Payables"

    headers = ["Party", "Total"] + [b["label"] for b in (result["lines"][0]["buckets"] if result["lines"] else [])]
    rows = []
    for line in result["lines"]:
        row = [line["party_name"], _fmt(line["total_amount"])]
        for b in line["buckets"]:
            row.append(_fmt(b["amount"]))
        rows.append(row)
    rows.append(["TOTAL", _fmt(result["total"])] + [""] * (len(headers) - 2))

    page_w = A4[0] - 40 * mm
    col_w = [page_w * 0.30] + [page_w * 0.14] * (len(headers) - 1)

    return _export_flat_pdf(title, f"{fy.name} ({fy.start_date} to {fy.end_date})", headers, rows, col_w, company_id=company_id, db=db)


def export_aging_xlsx(db: Session, company_id: str, fy_id: str, aging_type: str = "receivable") -> bytes:
    from app.services.reports import get_aging
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    result = get_aging(db, company_id, fy.start_date, fy.end_date, aging_type=aging_type)
    title = "Aging — Receivables" if aging_type == "receivable" else "Aging — Payables"

    headers = ["Party", "Total"] + [b["label"] for b in (result["lines"][0]["buckets"] if result["lines"] else [])]
    rows = []
    for line in result["lines"]:
        row: list[str | float] = [line["party_name"], float(line["total_amount"])]
        for b in line["buckets"]:
            row.append(float(b["amount"]))
        rows.append(row)

    return _export_flat_xlsx(title, f"{fy.name} ({fy.start_date} to {fy.end_date})", headers, rows, "Aging")


# ─── Outstanding Export ──────────────────────────────────────────────────────


def export_outstanding_pdf(db: Session, company_id: str, fy_id: str) -> bytes:
    from app.services.reports import get_outstanding
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    result = get_outstanding(db, company_id, fy.start_date, fy.end_date)
    styles = _get_styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=15 * mm)
    elements = []

    elements.extend(_logo_flowable(company_id, db))
    elements.append(Paragraph("Outstanding Report", styles["ReportTitle"]))
    elements.append(Paragraph(f"{fy.name} ({fy.start_date} to {fy.end_date})", styles["ReportSubtitle"]))
    elements.append(Spacer(1, 4 * mm))

    headers = ["Party", "Type", "Balance"]
    page_w = A4[0] - 40 * mm
    col_w = [page_w * 0.40, page_w * 0.20, page_w * 0.20]

    if result["debtors"]:
        elements.append(Paragraph("Debtors", styles["GroupHeader"]))
        rows = [[d["party_name"], d["party_type"], f"₹{_fmt(d['balance'])} {d['balance_type']}"] for d in result["debtors"]]
        rows.append(["Total Debtors", "", f"₹{_fmt(result['total_debtors'])}"])
        elements.append(_make_table(headers, rows, col_w))
        elements.append(Spacer(1, 4 * mm))

    if result["creditors"]:
        elements.append(Paragraph("Creditors", styles["GroupHeader"]))
        rows = [[c["party_name"], c["party_type"], f"₹{_fmt(c['balance'])} {c['balance_type']}"] for c in result["creditors"]]
        rows.append(["Total Creditors", "", f"₹{_fmt(result['total_creditors'])}"])
        elements.append(_make_table(headers, rows, col_w))

    doc.build(elements)
    return buf.getvalue()


def export_outstanding_xlsx(db: Session, company_id: str, fy_id: str) -> bytes:
    from app.services.reports import get_outstanding
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    result = get_outstanding(db, company_id, fy.start_date, fy.end_date)
    headers = ["Party", "Type", "Balance", "Balance Type"]
    rows: list[list[str | float]] = []
    for d in result["debtors"]:
        rows.append([d["party_name"], d["party_type"], float(d["balance"]), d["balance_type"]])
    for c in result["creditors"]:
        rows.append([c["party_name"], c["party_type"], float(c["balance"]), c["balance_type"]])

    return _export_flat_xlsx("Outstanding Report", f"{fy.name} ({fy.start_date} to {fy.end_date})", headers, rows, "Outstanding")


# ─── Register Export ─────────────────────────────────────────────────────────


def export_register_pdf(db: Session, company_id: str, fy_id: str, voucher_type: str) -> bytes:
    from app.services.reports import get_register
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    result = get_register(db, company_id, fy.start_date, fy.end_date, voucher_type=voucher_type)
    title = f"Register — {voucher_type.replace('_', ' ').title()}"

    headers = ["Date", "Voucher #", "Party", "Narration", "Debit", "Credit"]
    rows = []
    for e in result["entries"]:
        rows.append([e["voucher_date"], e["voucher_number"], e.get("party_name") or "—", (e.get("narration") or "—")[:40], _fmt(e["debit"]), _fmt(e["credit"])])
    rows.append(["", "TOTAL", "", "", _fmt(result["total_debit"]), _fmt(result["total_credit"])])

    page_w = A4[0] - 40 * mm
    col_w = [page_w * 0.12, page_w * 0.15, page_w * 0.18, page_w * 0.28, page_w * 0.13, page_w * 0.13]

    return _export_flat_pdf(title, f"{fy.name} ({fy.start_date} to {fy.end_date})", headers, rows, col_w, company_id=company_id, db=db)


def export_register_xlsx(db: Session, company_id: str, fy_id: str, voucher_type: str) -> bytes:
    from app.services.reports import get_register
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    result = get_register(db, company_id, fy.start_date, fy.end_date, voucher_type=voucher_type)
    title = f"Register — {voucher_type.replace('_', ' ').title()}"

    headers = ["Date", "Voucher #", "Party", "Narration", "Debit", "Credit"]
    rows: list[list[str | float]] = []
    for e in result["entries"]:
        rows.append([e["voucher_date"], e["voucher_number"], e.get("party_name") or "—", e.get("narration") or "—", float(e["debit"]), float(e["credit"])])

    return _export_flat_xlsx(title, f"{fy.name} ({fy.start_date} to {fy.end_date})", headers, rows, "Register")


# ─── TDS/TCS Summary Export ─────────────────────────────────────────────────


def export_tds_tcs_summary_pdf(db: Session, company_id: str, fy_id: str, tds_tcs_type: str = "tds") -> bytes:
    from app.services.tds_tcs import get_tds_tcs_party_summary
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    result = get_tds_tcs_party_summary(db, company_id=company_id, start_date=fy.start_date, end_date=fy.end_date, tds_tcs_type=tds_tcs_type)
    label = "TDS" if tds_tcs_type == "tds" else "TCS"
    title = f"{label} Summary"

    headers = ["Party", "Section", "Entries", "Base Amount", "Tax Amount"]
    rows = []
    for l in result["party_lines"]:
        rows.append([l.party_name, l.section_code, str(l.entry_count), _fmt(l.total_base_amount), _fmt(l.total_tax_amount)])
    rows.append(["TOTAL", "", str(result["total_entries"]), _fmt(result["total_base_amount"]), _fmt(result["total_tax_amount"])])

    page_w = A4[0] - 40 * mm
    col_w = [page_w * 0.28, page_w * 0.18, page_w * 0.12, page_w * 0.20, page_w * 0.20]

    return _export_flat_pdf(title, f"{fy.name} ({fy.start_date} to {fy.end_date})", headers, rows, col_w, company_id=company_id, db=db)


def export_tds_tcs_summary_xlsx(db: Session, company_id: str, fy_id: str, tds_tcs_type: str = "tds") -> bytes:
    from app.services.tds_tcs import get_tds_tcs_party_summary
    fy = db.get(FinancialYear, fy_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")

    result = get_tds_tcs_party_summary(db, company_id=company_id, start_date=fy.start_date, end_date=fy.end_date, tds_tcs_type=tds_tcs_type)
    label = "TDS" if tds_tcs_type == "tds" else "TCS"

    headers = ["Party", "Section", "Entries", "Base Amount", "Tax Amount"]
    rows: list[list[str | float]] = []
    for l in result["party_lines"]:
        rows.append([l.party_name, l.section_code, l.entry_count, float(l.total_base_amount), float(l.total_tax_amount)])

    return _export_flat_xlsx(f"{label} Summary", f"{fy.name} ({fy.start_date} to {fy.end_date})", headers, rows, f"{label} Summary")


# ─── Stock Summary Export ────────────────────────────────────────────────────


def export_stock_summary_pdf(db: Session, company_id: str) -> bytes:
    from app.services.stock_valuation import get_stock_valuation_report
    results = get_stock_valuation_report(db, company_id)

    headers = ["Item", "Quantity", "Avg Rate", "Total Value", "Method"]
    rows = []
    total_qty = 0.0
    total_val = 0.0
    for r in results:
        rows.append([r.stock_item_name, f"{r.quantity:.2f}", _fmt(r.avg_rate), _fmt(r.total_value), r.valuation_method])
        total_qty += r.quantity
        total_val += r.total_value
    rows.append(["TOTAL", f"{total_qty:.2f}", "", _fmt(total_val), ""])

    return _export_flat_pdf("Stock Summary", "Current Valuation", headers, rows, company_id=company_id, db=db)


def export_stock_summary_xlsx(db: Session, company_id: str) -> bytes:
    from app.services.stock_valuation import get_stock_valuation_report
    results = get_stock_valuation_report(db, company_id)

    headers = ["Item", "Quantity", "Avg Rate", "Total Value", "Method"]
    rows: list[list[str | float]] = []
    for r in results:
        rows.append([r.stock_item_name, float(r.quantity), float(r.avg_rate), float(r.total_value), r.valuation_method])

    return _export_flat_xlsx("Stock Summary", "Current Valuation", headers, rows, "Stock Summary")


# ─── Stock Movement Export ───────────────────────────────────────────────────


def export_stock_movement_pdf(db: Session, company_id: str) -> bytes:
    from app.services.stock_valuation import get_stock_movement_summary
    results = get_stock_movement_summary(db, company_id)

    headers = ["Item", "Open Qty", "Open Val", "In Qty", "In Val", "Out Qty", "Out Val", "Close Qty", "Close Val"]
    rows = []
    for r in results:
        rows.append([
            r["stock_item_name"],
            f"{r['opening_qty']:.2f}", _fmt(r["opening_value"]),
            f"{r['inward_qty']:.2f}", _fmt(r["inward_value"]),
            f"{r['outward_qty']:.2f}", _fmt(r["outward_value"]),
            f"{r['closing_qty']:.2f}", _fmt(r["closing_value"]),
        ])

    page_w = A4[0] - 40 * mm
    col_w = [page_w * 0.18] + [page_w * 0.09] * 8

    return _export_flat_pdf("Stock Movement", "Opening / Inward / Outward / Closing", headers, rows, col_w, company_id=company_id, db=db)


def export_stock_movement_xlsx(db: Session, company_id: str) -> bytes:
    from app.services.stock_valuation import get_stock_movement_summary
    results = get_stock_movement_summary(db, company_id)

    headers = ["Item", "Open Qty", "Open Value", "In Qty", "In Value", "Out Qty", "Out Value", "Close Qty", "Close Value"]
    rows: list[list[str | float]] = []
    for r in results:
        rows.append([
            r["stock_item_name"],
            float(r["opening_qty"]), float(r["opening_value"]),
            float(r["inward_qty"]), float(r["inward_value"]),
            float(r["outward_qty"]), float(r["outward_value"]),
            float(r["closing_qty"]), float(r["closing_value"]),
        ])

    return _export_flat_xlsx("Stock Movement", "Opening / Inward / Outward / Closing", headers, rows, "Stock Movement")


# ─── Stock Ageing Export ─────────────────────────────────────────────────────


def export_stock_ageing_pdf(db: Session, company_id: str) -> bytes:
    from app.services.stock_valuation import get_stock_ageing_report
    results = get_stock_ageing_report(db, company_id)

    headers = ["Item", "Qty", "Avg Rate", "Value", "Last Entry", "Days", "Ageing"]
    rows = []
    total_qty = 0.0
    total_val = 0.0
    for r in results:
        rows.append([
            r["stock_item_name"],
            f"{r['quantity']:.2f}",
            _fmt(r["avg_rate"]),
            _fmt(r["total_value"]),
            r["last_entry_date"] or "—",
            str(r["days_since_entry"]) if r["days_since_entry"] is not None else "—",
            r["ageing_bucket"],
        ])
        total_qty += r["quantity"]
        total_val += r["total_value"]
    rows.append(["TOTAL", f"{total_qty:.2f}", "", _fmt(total_val), "", "", ""])

    return _export_flat_pdf("Stock Ageing", "Ageing Analysis", headers, rows, company_id=company_id, db=db)


def export_stock_ageing_xlsx(db: Session, company_id: str) -> bytes:
    from app.services.stock_valuation import get_stock_ageing_report
    results = get_stock_ageing_report(db, company_id)

    headers = ["Item", "Qty", "Avg Rate", "Value", "Last Entry", "Days", "Ageing"]
    rows: list[list[str | float]] = []
    for r in results:
        rows.append([
            r["stock_item_name"],
            float(r["quantity"]),
            float(r["avg_rate"]),
            float(r["total_value"]),
            r["last_entry_date"] or "—",
            r["days_since_entry"] if r["days_since_entry"] is not None else "—",
            r["ageing_bucket"],
        ])

    return _export_flat_xlsx("Stock Ageing", "Ageing Analysis", headers, rows, "Stock Ageing")


# ─── Ledger Transactions Export ──────────────────────────────────────────────


def export_ledger_transactions_pdf(db: Session, company_id: str, ledger_id: str, fy_id: str) -> bytes:
    from app.services.reports import get_ledger_transactions
    from app.models.accounting import Ledger
    fy = db.get(FinancialYear, fy_id)
    ledger = db.get(Ledger, ledger_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")
    if not ledger:
        raise ValueError("Ledger not found")

    result = get_ledger_transactions(db, company_id, ledger_id, fy.start_date, fy.end_date)
    styles = _get_styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20 * mm, bottomMargin=15 * mm)
    elements = []

    elements.extend(_logo_flowable(company_id, db))
    elements.append(Paragraph(f"Ledger: {ledger.name}", styles["ReportTitle"]))
    elements.append(Paragraph(f"{fy.name} ({fy.start_date} to {fy.end_date})", styles["ReportSubtitle"]))
    elements.append(Paragraph(
        f"Opening: ₹{_fmt(result['opening_balance'])} {result['opening_balance_type']} | "
        f"Closing: ₹{_fmt(result['closing_balance'])} {result['closing_balance_type']}",
        styles["Normal"],
    ))
    elements.append(Spacer(1, 4 * mm))

    headers = ["Date", "Voucher #", "Type", "Party", "Narration", "Debit", "Credit", "Balance"]
    rows = []
    for t in result["transactions"]:
        rows.append([
            t["voucher_date"], t["voucher_number"], t["voucher_type"],
            t.get("party_name") or "—", (t.get("narration") or "—")[:30],
            _fmt(t["debit"]), _fmt(t["credit"]), _fmt(t["running_balance"]),
        ])
    rows.append(["", "TOTAL", "", "", "", _fmt(result["total_debit"]), _fmt(result["total_credit"]), ""])

    page_w = A4[0] - 40 * mm
    col_w = [page_w * 0.10, page_w * 0.12, page_w * 0.10, page_w * 0.14, page_w * 0.20, page_w * 0.11, page_w * 0.11, page_w * 0.12]
    elements.append(_make_table(headers, rows, col_w))

    doc.build(elements)
    return buf.getvalue()


def export_ledger_transactions_xlsx(db: Session, company_id: str, ledger_id: str, fy_id: str) -> bytes:
    from app.services.reports import get_ledger_transactions
    from app.models.accounting import Ledger
    fy = db.get(FinancialYear, fy_id)
    ledger = db.get(Ledger, ledger_id)
    if not fy or fy.company_id != company_id:
        raise ValueError("Financial year not found")
    if not ledger:
        raise ValueError("Ledger not found")

    result = get_ledger_transactions(db, company_id, ledger_id, fy.start_date, fy.end_date)

    headers = ["Date", "Voucher #", "Type", "Party", "Narration", "Debit", "Credit", "Balance"]
    rows: list[list[str | float]] = []
    for t in result["transactions"]:
        rows.append([
            t["voucher_date"], t["voucher_number"], t["voucher_type"],
            t.get("party_name") or "—", t.get("narration") or "—",
            float(t["debit"]), float(t["credit"]), float(t["running_balance"]),
        ])

    return _export_flat_xlsx(f"Ledger: {ledger.name}", f"{fy.name} ({fy.start_date} to {fy.end_date})", headers, rows, "Ledger Transactions")


# ─── Single Voucher PDF ─────────────────────────────────────────────────────


ITEM_VOUCHER_TYPES = {"sales", "purchase", "credit_note", "debit_note"}


def export_voucher_pdf(db: Session, company_id: str, voucher_id: str) -> bytes:
    from sqlalchemy.orm import joinedload

    from app.models.voucher import Voucher, VoucherLine
    from app.models.accounting import Ledger, Party
    from app.models.user import Company as CompanyModel

    voucher = (
        db.query(Voucher)
        .options(joinedload(Voucher.lines).joinedload(VoucherLine.stock_item))
        .get(voucher_id)
    )
    if not voucher or voucher.company_id != company_id:
        raise ValueError("Voucher not found")

    company = db.get(CompanyModel, company_id)
    styles = _get_styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm)
    elements = []

    # Logo + company name header
    elements.extend(_company_header_flowables(company_id, db))

    vt_label = voucher.voucher_type.replace("_", " ").title()
    elements.append(Paragraph(f"{vt_label} Voucher", styles["ReportTitle"]))
    elements.append(Paragraph(f"{voucher.voucher_number} — {voucher.voucher_date}", styles["ReportSubtitle"]))
    elements.append(Spacer(1, 3 * mm))

    party_name = "—"
    if voucher.party_id:
        party = db.get(Party, voucher.party_id)
        if party:
            party_name = party.name

    info_data = [
        ["Company:", company.name, "Party:", party_name],
        ["GSTIN:", company.gstin or "—", "Date:", voucher.voucher_date],
    ]
    if voucher.narration:
        info_data.append(["Narration:", voucher.narration, "", ""])

    info_table = Table(info_data, colWidths=[70, 180, 70, 180])
    info_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 6 * mm))

    is_item_type = voucher.voucher_type in ITEM_VOUCHER_TYPES
    item_lines = [l for l in voucher.lines if l.stock_item_id] if is_item_type else []

    # ─── Items table (sales / purchase / credit_note / debit_note) ───────
    if item_lines:
        has_gst = any(
            (float(l.cgst_amount or 0) + float(l.sgst_amount or 0) + float(l.igst_amount or 0)) > 0
            for l in item_lines
        )
        item_headers = ["Item", "Qty", "Rate", "Disc%", "Amount"]
        if has_gst:
            item_headers += ["CGST", "SGST", "IGST"]

        item_rows = []
        subtotal = 0.0
        discount_total = 0.0
        cgst_total = 0.0
        sgst_total = 0.0
        igst_total = 0.0

        for line in item_lines:
            name = line.stock_item.name if line.stock_item else str(line.stock_item_id)
            qty = float(line.quantity or 0)
            rate = float(line.rate or 0)
            disc = float(line.discount_pct or 0)
            amt = float(line.line_total or 0)
            cgst = float(line.cgst_amount or 0)
            sgst = float(line.sgst_amount or 0)
            igst = float(line.igst_amount or 0)

            row = [name, f"{qty:.2f}", _fmt(rate), f"{disc:.1f}%", _fmt(amt)]
            if has_gst:
                row += [_fmt(cgst), _fmt(sgst), _fmt(igst)]
            item_rows.append(row)

            subtotal += amt
            discount_total += float(line.discount_amount or 0)
            cgst_total += cgst
            sgst_total += sgst
            igst_total += igst

        page_w = A4[0] - 40 * mm
        if has_gst:
            item_col_w = [page_w * 0.30, page_w * 0.10, page_w * 0.14, page_w * 0.10, page_w * 0.14, page_w * 0.10, page_w * 0.10, page_w * 0.10]
        else:
            item_col_w = [page_w * 0.40, page_w * 0.12, page_w * 0.18, page_w * 0.12, page_w * 0.18]

        elements.append(Paragraph("<b>Items</b>", styles["GroupHeader"]))
        elements.append(_make_table(item_headers, item_rows, item_col_w))
        elements.append(Spacer(1, 4 * mm))

        # ─── Totals breakdown ───────────────────────────────────────────
        grand = float(voucher.grand_total or 0)
        totals_rows = [
            ["Subtotal:", _fmt(subtotal)],
        ]
        if discount_total > 0:
            totals_rows.append(["Discount:", f"-{_fmt(discount_total)}"])
        if cgst_total > 0:
            totals_rows.append(["CGST:", _fmt(cgst_total)])
        if sgst_total > 0:
            totals_rows.append(["SGST:", _fmt(sgst_total)])
        if igst_total > 0:
            totals_rows.append(["IGST:", _fmt(igst_total)])
        totals_rows.append(["Grand Total:", _fmt(grand)])

        totals_table = Table(totals_rows, colWidths=[page_w * 0.80, page_w * 0.20])
        totals_table.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (-1, -1), (-1, -1), "Helvetica-Bold"),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("LINEABOVE", (0, -1), (-1, -1), 0.5, colors.black),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        elements.append(totals_table)
        elements.append(Spacer(1, 6 * mm))

    # ─── Accounting entries ──────────────────────────────────────────────
    ledger_headers = ["Ledger", "Debit", "Credit"]
    ledger_rows = []
    total_dr = 0.0
    total_cr = 0.0
    for line in voucher.lines:
        ledger = db.get(Ledger, line.ledger_id)
        ledger_name = ledger.name if ledger else str(line.ledger_id)
        ledger_rows.append([ledger_name, _fmt(float(line.debit)), _fmt(float(line.credit))])
        total_dr += float(line.debit)
        total_cr += float(line.credit)

    ledger_rows.append(["TOTAL", _fmt(total_dr), _fmt(total_cr)])

    page_w = A4[0] - 40 * mm
    ledger_col_w = [page_w * 0.50, page_w * 0.25, page_w * 0.25]
    elements.append(_make_table(ledger_headers, ledger_rows, ledger_col_w))

    if voucher.grand_total and not is_item_type:
        elements.append(Spacer(1, 4 * mm))
        elements.append(Paragraph(f"<b>Grand Total: ₹{_fmt(float(voucher.grand_total))}</b>", styles["Normal"]))

    doc.build(elements)
    return buf.getvalue()


# ─── Manufacturing Exports ───────────────────────────────────────────────

def export_bom_analysis_pdf(company_name: str, data: list[dict]) -> bytes:
    """Export BOM cost analysis as PDF."""
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(f"<b>BOM Cost Analysis — {company_name}</b>", styles["Title"]))
    elements.append(Spacer(1, 6 * mm))

    for bom in data:
        elements.append(Paragraph(f"<b>{bom['bom_name']}</b> (Output: {bom['output_qty']})", styles["Heading2"]))
        elements.append(Paragraph(f"Finished Product: {bom['finished_item_name']} | Cost/Unit: ₹{_fmt(bom['cost_per_unit'])}", styles["Normal"]))
        elements.append(Spacer(1, 3 * mm))

        headers = ["Component", "Qty", "Rate", "Wastage %", "Line Cost"]
        rows = []
        for c in bom["components"]:
            rows.append([c["stock_item_name"], str(c["quantity"]), _fmt(c["rate"]), f"{c['wastage_pct']}%", _fmt(c["line_cost"])])
        rows.append(["TOTAL", "", "", "", _fmt(bom["total_material_cost"])])

        page_w = A4[0] - 40 * mm
        col_w = [page_w * 0.35, page_w * 0.12, page_w * 0.15, page_w * 0.13, page_w * 0.25]
        elements.append(_make_table(headers, rows, col_w))
        elements.append(Spacer(1, 6 * mm))

    doc.build(elements)
    return buf.getvalue()


def export_bom_analysis_xlsx(company_name: str, data: list[dict]) -> bytes:
    """Export BOM cost analysis as Excel."""
    wb = Workbook()
    ws = wb.active
    ws.title = "BOM Analysis"

    thin_border = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )

    ws.append([f"BOM Cost Analysis — {company_name}"])
    ws.append([])

    for bom in data:
        ws.append([bom["bom_name"], f"Output: {bom['output_qty']}", f"Cost/Unit: ₹{_fmt(bom['cost_per_unit'])}"])
        ws.append(["Component", "Qty", "Rate", "Wastage %", "Line Cost"])
        for c in bom["components"]:
            ws.append([c["stock_item_name"], c["quantity"], c["rate"], c["wastage_pct"], c["line_cost"]])
        ws.append(["TOTAL", "", "", "", bom["total_material_cost"]])
        ws.append([])

    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, max_col=5):
        for cell in row:
            cell.border = thin_border

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_production_cost_pdf(company_name: str, data: list[dict]) -> bytes:
    """Export production cost report as PDF."""
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(f"<b>Production Cost Report — {company_name}</b>", styles["Title"]))
    elements.append(Spacer(1, 6 * mm))

    headers = ["Order #", "Date", "BOM", "Planned", "Produced", "Material Cost", "Cost/Unit"]
    rows = []
    for o in data:
        rows.append([
            o["order_number"], o["order_date"], o["bom_name"],
            str(o["planned_qty"]), str(o["produced_qty"]),
            _fmt(o["material_cost"]), _fmt(o["cost_per_unit"]),
        ])

    page_w = A4[0] - 40 * mm
    col_w = [page_w * 0.14, page_w * 0.12, page_w * 0.20, page_w * 0.10, page_w * 0.10, page_w * 0.17, page_w * 0.17]
    elements.append(_make_table(headers, rows, col_w))

    doc.build(elements)
    return buf.getvalue()


def export_production_cost_xlsx(company_name: str, data: list[dict]) -> bytes:
    """Export production cost report as Excel."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Production Cost"

    thin_border = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )

    ws.append([f"Production Cost Report — {company_name}"])
    ws.append([])
    ws.append(["Order #", "Date", "BOM", "Planned", "Produced", "Status", "Material Cost", "Cost/Unit"])
    for o in data:
        ws.append([o["order_number"], o["order_date"], o["bom_name"], o["planned_qty"], o["produced_qty"], o["status"], o["material_cost"], o["cost_per_unit"]])

    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, max_col=8):
        for cell in row:
            cell.border = thin_border

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_production_order_pdf(company_name: str, order: dict, components: list[dict]) -> bytes:
    """Export a single production order detail as PDF."""
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(f"<b>Production Order — {company_name}</b>", styles["Title"]))
    elements.append(Spacer(1, 4 * mm))

    # Order summary
    summary_data = [
        ["Order Number", order["order_number"]],
        ["Date", order["order_date"]],
        ["BOM", order["bom_name"]],
        ["Status", order["status"].upper()],
        ["Planned Qty", str(order["planned_qty"])],
        ["Produced Qty", str(order["produced_qty"])],
        ["Narration", order.get("narration") or "—"],
    ]
    page_w = A4[0] - 40 * mm
    t = Table(summary_data, colWidths=[page_w * 0.3, page_w * 0.7])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 6 * mm))

    # Components table
    elements.append(Paragraph("<b>Components</b>", styles["Heading2"]))
    elements.append(Spacer(1, 2 * mm))
    headers = ["Component", "Required", "Available", "Rate", "Cost", "Status"]
    rows = []
    for c in components:
        rows.append([
            c["item_name"],
            str(c["required_qty"]),
            str(c["available_qty"]),
            _fmt(c.get("rate", 0)),
            _fmt(c.get("line_cost", 0)),
            "✓" if c["sufficient"] else "✗",
        ])
    col_w = [page_w * 0.28, page_w * 0.12, page_w * 0.12, page_w * 0.14, page_w * 0.14, page_w * 0.10]
    elements.append(_make_table(headers, rows, col_w))

    doc.build(elements)
    return buf.getvalue()


def export_bom_detail_pdf(company_name: str, bom: dict, stock_levels: list[dict]) -> bytes:
    """Export a single BOM detail as PDF."""
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(f"<b>Bill of Materials — {company_name}</b>", styles["Title"]))
    elements.append(Spacer(1, 4 * mm))

    # BOM summary
    summary_data = [
        ["Name", bom["name"]],
        ["Finished Product", bom.get("finished_item_name", "—")],
        ["Output Quantity", str(bom["output_qty"])],
        ["Status", "Active" if bom["is_active"] else "Inactive"],
        ["Components", str(len(bom["lines"]))],
    ]
    page_w = A4[0] - 40 * mm
    t = Table(summary_data, colWidths=[page_w * 0.3, page_w * 0.7])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 6 * mm))

    # Components table
    elements.append(Paragraph("<b>Components</b>", styles["Heading2"]))
    elements.append(Spacer(1, 2 * mm))
    headers = ["Component", "Qty/Unit", "Rate", "Wastage", "In Stock"]
    rows = []
    for line in bom["lines"]:
        stock = next((s for s in stock_levels if s["stock_item_id"] == line["stock_item_id"]), None)
        current_stock = stock["current_stock"] if stock else 0
        rows.append([
            line.get("item_name", "—"),
            str(line["quantity"]),
            _fmt(line.get("rate") or 0),
            f"{line['wastage_pct']}%" if line["wastage_pct"] > 0 else "—",
            str(int(current_stock)),
        ])
    col_w = [page_w * 0.30, page_w * 0.15, page_w * 0.15, page_w * 0.15, page_w * 0.15]
    elements.append(_make_table(headers, rows, col_w))

    doc.build(elements)
    return buf.getvalue()
