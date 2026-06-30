"""Export service: PDF and Excel generation for reports.

Uses reportlab for PDF and openpyxl for Excel (.xlsx).
Both are pure Python — no system dependencies required.
"""
from __future__ import annotations

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

from app.models.accounting import FinancialYear
from app.services.reports import (
    get_balance_sheet,
    get_ledger_balances,
    get_profit_and_loss,
    get_trial_balance,
)
from sqlalchemy.orm import Session


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

    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=20 * mm, bottomMargin=15 * mm)
    elements = []

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

    page_w = landscape(A4)[0] - 40 * mm
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
) -> bytes:
    styles = _get_styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=20 * mm, bottomMargin=15 * mm)
    elements = []

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

        page_w = landscape(A4)[0] - 40 * mm
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
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), topMargin=20 * mm, bottomMargin=15 * mm)
    elements = []

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

        page_w = landscape(A4)[0] - 40 * mm
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
