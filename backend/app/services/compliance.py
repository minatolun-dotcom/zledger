"""Indian compliance engine.

Provides computation + presentation for:

  1. Ind-AS / Companies Act Schedule III presentation of the Balance Sheet and
     Profit & Loss, driven by an AccountGroup -> schedule mapping.
  2. Income-tax computation under the OLD regime (exemptions/deductions) and the
     NEW regime (115BAC, no exemptions) for FY 2024-25 onwards, including
     presumptive (44AD / 44ADA / 44AE) paths.
  3. ICAI NCE-format statements, built on top of the schedule mapping.

All money values are ``Decimal``. Reporting balances come from
``app.services.reports`` (already FY-scoped by date).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal, getcontext

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.accounting import AccountGroup, FinancialYear, Ledger
from app.models.compliance import (
    ComplianceReport,
    IcaiNceTemplate,
    IncomeTaxRegimeConfig,
    IndASSchedule,
)
from app.models.user import Company
from app.services import reports as reports_svc
from app.utils.money import to_money

getcontext().rounding = ROUND_HALF_UP

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

# Default mapping of COA system_code -> Schedule III heading. Companies can
# override via the indas_schedules table; this is the seed default.
# schedule_part: "I" (Equity & Liabilities) or "II" (Assets).
DEFAULT_SCHEDULE_MAP: list[dict] = [
    # ── Part I — Equity & Liabilities ──
    {"system_code": "GRP_EQUITY", "schedule_part": "I", "schedule_heading": "Shareholders' Funds", "sub_heading": "Equity Share Capital / Reserves & Surplus"},
    {"system_code": "GRP_CAPITAL_ACCOUNT", "schedule_part": "I", "schedule_heading": "Shareholders' Funds", "sub_heading": "Capital Account"},
    {"system_code": "GRP_OPENING_BALANCE_EQUITY", "schedule_part": "I", "schedule_heading": "Shareholders' Funds", "sub_heading": "Reserves & Surplus"},
    {"system_code": "GRP_RESERVES_SURPLUS", "schedule_part": "I", "schedule_heading": "Shareholders' Funds", "sub_heading": "Reserves & Surplus"},
    {"system_code": "GRP_PROFIT_LOSS", "schedule_part": "I", "schedule_heading": "Shareholders' Funds", "sub_heading": "Profit & Loss (current year)"},
    {"system_code": "GRP_DRAWINGS", "schedule_part": "I", "schedule_heading": "Shareholders' Funds", "sub_heading": "Drawings (contra)"},
    {"system_code": "GRP_LOANS_ADVANCES_LIAB", "schedule_part": "I", "schedule_heading": "Non-Current Liabilities", "sub_heading": "Long-term Borrowings"},
    {"system_code": "GRP_CURRENT_LIABILITIES", "schedule_part": "I", "schedule_heading": "Current Liabilities", "sub_heading": "Current Liabilities"},
    {"system_code": "GRP_SUNDARY_CREDITORS", "schedule_part": "I", "schedule_heading": "Current Liabilities", "sub_heading": "Trade Payables"},
    {"system_code": "GRP_PROVISIONS", "schedule_part": "I", "schedule_heading": "Current Liabilities", "sub_heading": "Provisions"},
    {"system_code": "GRP_GST_OUTPUT", "schedule_part": "I", "schedule_heading": "Current Liabilities", "sub_heading": "Duties & Taxes (GST Output)"},
    {"system_code": "GRP_REVERSE_CHARGE", "schedule_part": "I", "schedule_heading": "Current Liabilities", "sub_heading": "Duties & Taxes (RCM)"},
    {"system_code": "GRP_DUTIES_TAXES", "schedule_part": "I", "schedule_heading": "Current Liabilities", "sub_heading": "Duties & Taxes"},
    # ── Part II — Assets ──
    {"system_code": "GRP_FIXED_ASSETS", "schedule_part": "II", "schedule_heading": "Non-Current Assets", "sub_heading": "Fixed Assets (Tangible/Intangible)"},
    {"system_code": "GRP_INVESTMENTS", "schedule_part": "II", "schedule_heading": "Non-Current Assets", "sub_heading": "Non-Current Investments"},
    {"system_code": "GRP_CURRENT_ASSETS", "schedule_part": "II", "schedule_heading": "Current Assets", "sub_heading": "Current Assets"},
    {"system_code": "GRP_BANK_ACCOUNTS", "schedule_part": "II", "schedule_heading": "Current Assets", "sub_heading": "Cash & Bank Balances"},
    {"system_code": "GRP_CASH_IN_HAND", "schedule_part": "II", "schedule_heading": "Current Assets", "sub_heading": "Cash & Bank Balances"},
    {"system_code": "GRP_SUNDARY_DEBTORS", "schedule_part": "II", "schedule_heading": "Current Assets", "sub_heading": "Trade Receivables"},
    {"system_code": "GRP_STOCK_IN_HAND", "schedule_part": "II", "schedule_heading": "Current Assets", "sub_heading": "Inventories"},
    {"system_code": "GRP_LOANS_ADVANCES_ASSET", "schedule_part": "II", "schedule_heading": "Current Assets", "sub_heading": "Loans & Advances"},
    {"system_code": "GRP_DEPOSITS_ASSET", "schedule_part": "II", "schedule_heading": "Current Assets", "sub_heading": "Other Current Assets"},
    {"system_code": "GRP_GST_INPUT", "schedule_part": "II", "schedule_heading": "Current Assets", "sub_heading": "Input Tax Credit (GST)"},
    {"system_code": "GRP_SUSPENSE", "schedule_part": "II", "schedule_heading": "Current Assets", "sub_heading": "Suspense (unclassified)"},
]

# Income-tax slabs (FY 2024-25+ -> AY 2025-26+). Income is total income.
# NEW regime (115BAC): no exemptions/deductions.
NEW_REGIME_SLABS = [
    (Decimal("0"), Decimal("400000"), Decimal("0")),
    (Decimal("400000"), Decimal("800000"), Decimal("5")),
    (Decimal("800000"), Decimal("1200000"), Decimal("10")),
    (Decimal("1200000"), Decimal("1600000"), Decimal("15")),
    (Decimal("1600000"), Decimal("2000000"), Decimal("20")),
    (Decimal("2000000"), Decimal("2400000"), Decimal("25")),
    (Decimal("2400000"), Decimal("999999999"), Decimal("30")),
]
# OLD regime: basic exemption 2,50,000; rebate u/s 87A up to 5,00,000 (tax 0).
OLD_REGIME_SLABS = [
    (Decimal("0"), Decimal("250000"), Decimal("0")),
    (Decimal("250000"), Decimal("500000"), Decimal("5")),
    (Decimal("500000"), Decimal("1000000"), Decimal("20")),
    (Decimal("1000000"), Decimal("999999999"), Decimal("30")),
]
# CESS 4% on income-tax + surcharge. Surcharge thresholds (old regime):
# >50L: 10%, >1Cr: 15%, >2Cr: 25%, >5Cr: 37%. New regime surcharge capped 25%.
SURCHARGE_OLD = [
    (Decimal("5000000"), Decimal("10000000"), Decimal("10")),
    (Decimal("10000000"), Decimal("20000000"), Decimal("15")),
    (Decimal("20000000"), Decimal("50000000"), Decimal("25")),
    (Decimal("50000000"), Decimal("999999999999"), Decimal("37")),
]
SURCHARGE_NEW = [
    (Decimal("5000000"), Decimal("10000000"), Decimal("10")),
    (Decimal("10000000"), Decimal("20000000"), Decimal("15")),
    (Decimal("20000000"), Decimal("999999999999"), Decimal("25")),
]
# Presumptive / deemed-profit sections.
PRESUMPTIVE = {
    "44AD": Decimal("8"),   # business (non-profession) -> 8% (6% digital)
    "44ADA": Decimal("50"),  # specified professions -> 50%
    "44AE": Decimal("8"),   # goods carriage
}
# Standard deduction for business (salaried analog not applicable for cos);
# under presumptive, 44ADA allows 50% as deemed, no separate std deduction.

DEFAULT_ICAI_NCE_TEMPLATES = [
    {
        "template_name": "ICAI NCE — Balance Sheet",
        "statement_type": "balance_sheet",
        "layout_json": json.dumps({
            "title": "Balance Sheet (ICAI NCE format)",
            "parts": ["I", "II"],
            "notes": True,
        }),
    },
    {
        "template_name": "ICAI NCE — Statement of Profit & Loss",
        "statement_type": "profit_loss",
        "layout_json": json.dumps({
            "title": "Statement of Profit and Loss (ICAI NCE format)",
            "sections": ["revenue", "other_income", "expenses"],
            "notes": True,
        }),
    },
]


# ─────────────────────────────────────────────────────────────────────────────
# Ind-AS / Schedule III
# ─────────────────────────────────────────────────────────────────────────────

def _schedule_map(db: Session, company_id: str) -> dict[str, dict]:
    """Return {system_code: schedule dict} for a company, using overrides from
    the indas_schedules table merged over DEFAULT_SCHEDULE_MAP."""
    overrides = {}
    for row in db.query(IndASSchedule).filter(
        IndASSchedule.company_id == company_id, IndASSchedule.is_active.is_(True)
    ).all():
        overrides[row.system_code] = {
            "system_code": row.system_code,
            "schedule_part": row.schedule_part,
            "schedule_heading": row.schedule_heading,
            "sub_heading": row.sub_heading,
        }
    merged = {m["system_code"]: dict(m) for m in DEFAULT_SCHEDULE_MAP}
    merged.update(overrides)
    return merged


@dataclass
class ScheduleLine:
    ledger_name: str
    amount: Decimal


@dataclass
class ScheduleHeading:
    heading: str
    sub_heading: str | None
    lines: list[ScheduleLine] = field(default_factory=list)
    total: Decimal = Decimal("0")


@dataclass
class SchedulePart:
    part: str  # "I" or "II"
    title: str  # "Equity & Liabilities" / "Assets"
    headings: list[ScheduleHeading] = field(default_factory=list)
    total: Decimal = Decimal("0")


def get_schedule_iii_balance_sheet(db: Session, company_id: str, financial_year_id: str) -> dict:
    """Balance Sheet presented per Companies Act Schedule III (Ind-AS style)."""
    fy = reports_svc._get_fy_or_raise(db, company_id, financial_year_id)
    ledgers = reports_svc.get_ledger_balances(db, company_id, fy.start_date, fy.end_date)
    smap = _schedule_map(db, company_id)
    # Map each ledger's group_id to its AccountGroup.system_code so the
    # schedule lookup keys off the stable system_code rather than the display name.
    grp_codes = dict(
        db.query(AccountGroup.id, AccountGroup.system_code).filter(
            AccountGroup.company_id == company_id
        ).all()
    )

    parts: dict[str, SchedulePart] = {
        "I": SchedulePart(part="I", title="Equity and Liabilities"),
        "II": SchedulePart(part="II", title="Assets"),
    }

    for lb in ledgers:
        # get_ledger_balances uses the universal convention: closing_balance is
        # a magnitude and closing_balance_type == "Dr" means a POSITIVE number,
        # "Cr" means negative — regardless of the account's normal balance.
        # So the balance-sheet (signed) value is +closing for Dr, -closing for Cr,
        # uniformly across assets, liabilities and capital.
        amt = lb.closing_balance if lb.closing_balance_type == "Dr" else -lb.closing_balance
        sch = smap.get(grp_codes.get(lb.group_id) or "") or smap.get(lb.group_name) or {
            "schedule_part": "II" if lb.group_nature == "assets" else "I",
            "schedule_heading": "Unclassified",
            "sub_heading": lb.group_name,
        }
        part = parts.get(sch["schedule_part"], parts["II"])
        heading = _find_or_add_heading(part, sch["schedule_heading"], sch.get("sub_heading"))
        heading.lines.append(ScheduleLine(ledger_name=lb.ledger_name, amount=to_money(amt)))
        heading.total += to_money(amt)
        part.total += to_money(amt)

    result = {
        "financial_year": fy.name,
        "part_i": _serialize_part(parts["I"]),
        "part_ii": _serialize_part(parts["II"]),
        "total_equity_liabilities": to_money(parts["I"].total),
        "total_assets": to_money(parts["II"].total),
        "balanced": abs(parts["I"].total - parts["II"].total) < Decimal("0.01"),
    }
    return result


def _find_or_add_heading(part: SchedulePart, heading: str, sub_heading: str | None) -> ScheduleHeading:
    for h in part.headings:
        if h.heading == heading and h.sub_heading == sub_heading:
            return h
    h = ScheduleHeading(heading=heading, sub_heading=sub_heading)
    part.headings.append(h)
    return h


def _serialize_part(part: SchedulePart) -> dict:
    return {
        "part": part.part,
        "title": part.title,
        "total": to_money(part.total),
        "headings": [
            {
                "heading": h.heading,
                "sub_heading": h.sub_heading,
                "total": to_money(h.total),
                "lines": [{"ledger_name": l.ledger_name, "amount": to_money(l.amount)} for l in h.lines],
            }
            for h in part.headings
        ],
    }


def get_indas_profit_loss(db: Session, company_id: str, financial_year_id: str) -> dict:
    """Profit & Loss per Ind-AS presentation (revenue from operations, other
    income, expenses by nature/function)."""
    pl = reports_svc.get_profit_and_loss(db, company_id, financial_year_id)
    income = pl["income_groups"]
    expense = pl["expense_groups"]
    return {
        "financial_year": _fy_name(db, company_id, financial_year_id),
        "revenue_from_operations": _sum_group_total(income, "Sales Accounts"),
        "other_income": _sum_group_total(income, "Direct Incomes") + _sum_group_total(income, "Indirect Incomes"),
        "total_income": pl["total_income"],
        "expenses": {g.group_name: g.total for g in expense},
        "total_expenses": pl["total_expenses"],
        "net_profit": pl["net_profit"],
        "is_profit": pl["is_profit"],
    }


def _sum_group_total(groups, name) -> Decimal:
    for g in groups:
        if getattr(g, "group_name", None) == name:
            return to_money(g.total)
    return Decimal("0")


def _fy_name(db: Session, company_id: str, fy_id: str) -> str:
    fy = db.get(FinancialYear, fy_id)
    return fy.name if fy else ""


# ─────────────────────────────────────────────────────────────────────────────
# Income Tax — old & new regime
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class IncomeTaxResult:
    regime: str
    financial_year: str
    gross_receipts: Decimal
    business_profit: Decimal
    presumptive_section: str | None
    taxable_income: Decimal
    tax: Decimal
    surcharge: Decimal
    cess: Decimal
    total_tax: Decimal
    rebate_87a: Decimal = Decimal("0")
    notes: list[str] = field(default_factory=list)


def _round2(x: Decimal) -> Decimal:
    return to_money(x)


def compute_income_tax(db: Session, company_id: str, financial_year_id: str, regime: str | None = None) -> IncomeTaxResult:
    """Compute income tax for a company's FY under old or new regime.

    business_profit is approximated from the P&L net profit (a real
    implementation would add back disallowed expenses / depreciation differences;
    here we use net profit as the profit before tax proxy). Presumptive sections
    override the base when elected.
    """
    company = db.get(Company, company_id)
    if company is None:
        from fastapi import HTTPException, status
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Company not found")

    fy = reports_svc._get_fy_or_raise(db, company_id, financial_year_id)
    pl = reports_svc.get_profit_and_loss(db, company_id, financial_year_id)
    net_profit = Decimal(str(pl["net_profit"]))
    total_income = Decimal(str(pl["total_income"]))

    # Resolve regime: param > company.income_tax_regime > "old"
    eff_regime = (regime or company.income_tax_regime or "old").lower()
    cfg = db.query(IncomeTaxRegimeConfig).filter(
        IncomeTaxRegimeConfig.company_id == company_id,
        IncomeTaxRegimeConfig.regime == eff_regime,
        IncomeTaxRegimeConfig.financial_year == fy.name,
        IncomeTaxRegimeConfig.is_active.is_(True),
    ).first()
    presumptive = cfg.presumptive_section if cfg else None

    notes: list[str] = []
    if presumptive and presumptive in PRESUMPTIVE:
        pct = PRESUMPTIVE[presumptive]
        # Presumptive income = pct% of gross receipts (turnover).
        base = total_income
        taxable = _round2(base * pct / Decimal("100"))
        notes.append(f"Presumptive taxation under section {presumptive}: {pct}% of gross receipts/turnover.")
        business_profit = taxable
    else:
        # Regular: profit before tax = net profit (post all expenses).
        business_profit = net_profit if net_profit > 0 else Decimal("0")
        taxable = business_profit

    result = IncomeTaxResult(
        regime=eff_regime,
        financial_year=fy.name,
        gross_receipts=_round2(total_income),
        business_profit=_round2(business_profit),
        presumptive_section=presumptive,
        taxable_income=_round2(taxable),
        tax=Decimal("0"),
        surcharge=Decimal("0"),
        cess=Decimal("0"),
        total_tax=Decimal("0"),
        notes=notes,
    )

    if taxable <= 0:
        result.notes.append("No taxable income; tax is nil.")
        return result

    if eff_regime == "new":
        result.tax = _slab_tax(taxable, NEW_REGIME_SLABS)
        result.surcharge = _surcharge(taxable, result.tax, SURCHARGE_NEW)
    else:
        result.tax = _slab_tax(taxable, OLD_REGIME_SLABS)
        # Section 87A rebate: tax becomes 0 if taxable <= 5,00,000.
        if taxable <= Decimal("500000"):
            result.rebate_87a = _round2(result.tax)
            result.tax = Decimal("0")
            result.notes.append("Section 87A rebate applied (taxable income <= 5,00,000).")
        result.surcharge = _surcharge(taxable, result.tax, SURCHARGE_OLD)

    result.cess = _round2((result.tax + result.surcharge) * Decimal("0.04"))
    result.total_tax = _round2(result.tax + result.surcharge + result.cess)
    return result


def _slab_tax(income: Decimal, slabs: list[tuple[Decimal, Decimal, Decimal]]) -> Decimal:
    tax = Decimal("0")
    for lo, hi, rate in slabs:
        if income <= lo:
            break
        bracket = min(income, hi) - lo
        if bracket > 0:
            tax += bracket * rate / Decimal("100")
    return _round2(tax)


def _surcharge(income: Decimal, tax: Decimal, table: list[tuple[Decimal, Decimal, Decimal]]) -> Decimal:
    if tax <= 0:
        return Decimal("0")
    for lo, hi, rate in table:
        if income > lo:
            return _round2(tax * rate / Decimal("100"))
    return Decimal("0")


def set_income_tax_regime(
    db: Session, company_id: str, regime: str, financial_year: str,
    presumptive_section: str | None = None,
) -> IncomeTaxRegimeConfig:
    """Upsert the company's regime election for a FY (deactivates the other)."""
    regime = regime.lower()
    if regime not in ("old", "new"):
        from fastapi import HTTPException, status
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="regime must be 'old' or 'new'")
    if presumptive_section and presumptive_section not in PRESUMPTIVE:
        from fastapi import HTTPException, status
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid presumptive_section")
    # deactivate other regime rows for same fy
    db.query(IncomeTaxRegimeConfig).filter(
        IncomeTaxRegimeConfig.company_id == company_id,
        IncomeTaxRegimeConfig.financial_year == financial_year,
    ).update({IncomeTaxRegimeConfig.is_active: False})
    existing = db.query(IncomeTaxRegimeConfig).filter(
        IncomeTaxRegimeConfig.company_id == company_id,
        IncomeTaxRegimeConfig.regime == regime,
        IncomeTaxRegimeConfig.financial_year == financial_year,
    ).first()
    if existing:
        existing.is_active = True
        existing.presumptive_section = presumptive_section
        obj = existing
    else:
        obj = IncomeTaxRegimeConfig(
            company_id=company_id, regime=regime,
            financial_year=financial_year, presumptive_section=presumptive_section,
        )
        db.add(obj)
    # reflect on the Company row
    company = db.get(Company, company_id)
    if company:
        company.income_tax_regime = regime
    db.commit()
    db.refresh(obj)
    return obj


# ─────────────────────────────────────────────────────────────────────────────
# ICAI NCE
# ─────────────────────────────────────────────────────────────────────────────

def get_icais_nce_statements(db: Session, company_id: str, financial_year_id: str) -> dict:
    """Build ICAI NCE-format statements from the schedule mapping + P&L."""
    bs = get_schedule_iii_balance_sheet(db, company_id, financial_year_id)
    pl = get_indas_profit_loss(db, company_id, financial_year_id)
    return {
        "balance_sheet": bs,
        "profit_and_loss": pl,
        "notes": {
            "schedule_iii_ref": "Prepared in accordance with the Companies Act 2013 (Schedule III) / Ind-AS presentation.",
            "total_assets": bs["total_assets"],
            "total_equity_liabilities": bs["total_equity_liabilities"],
            "net_profit": pl["net_profit"],
        },
    }


def ensure_default_templates(db: Session, company_id: str) -> None:
    """Seed default ICAI NCE templates for a new company (idempotent)."""
    existing = db.query(IcaiNceTemplate).filter(IcaiNceTemplate.company_id == company_id).count()
    if existing:
        return
    for t in DEFAULT_ICAI_NCE_TEMPLATES:
        db.add(IcaiNceTemplate(company_id=company_id, **t))
    db.commit()


def ensure_default_schedules(db: Session, company_id: str) -> None:
    """Seed default Ind-AS schedule mapping for a new company (idempotent)."""
    existing = db.query(IndASSchedule).filter(IndASSchedule.company_id == company_id).count()
    if existing:
        return
    for m in DEFAULT_SCHEDULE_MAP:
        db.add(IndASSchedule(company_id=company_id, **m))
    db.commit()


# ─────────────────────────────────────────────────────────────────────────────
# GST status summary (reuses existing GSTR engine)
# ─────────────────────────────────────────────────────────────────────────────

def get_gst_compliance_status(db: Session, company_id: str, financial_year_id: str) -> dict:
    """Summarize GST return filing status for a FY (delegates to gstr engine)."""
    from app.services import gstr
    fy = reports_svc._get_fy_or_raise(db, company_id, financial_year_id)
    # gstr1/gstr3b are monthly (period "YYYY-MM"); sample the FY's first month.
    first_month = fy.start_date[:7]  # e.g. "2025-04"
    out: dict = {"financial_year": fy.name, "returns": {}}
    samples = {
        "gstr1": (gstr.generate_gstr1, first_month),
        "gstr3b": (gstr.generate_gstr3b, first_month),
        "gstr9": (gstr.generate_gstr9, fy.name),
    }
    for rtype, (fn, period) in samples.items():
        try:
            data = fn(db, company_id, period)
            out["returns"][rtype] = {"generated": True, "summary": _gstr_summary(rtype, data)}
        except Exception as e:  # pragma: no cover - engine may need data
            out["returns"][rtype] = {"generated": False, "error": str(e)}
    return out


def _gstr_summary(rtype: str, data: dict) -> dict:
    if rtype == "gstr3b":
        return {
            "total_tax_payable": data.get("total_tax_payable"),
            "igst": data.get("igst"), "cgst": data.get("cgst"), "sgst": data.get("sgst"),
        }
    if rtype == "gstr1":
        return {"total_invoice_value": data.get("total_invoice_value"), "b2b_count": len(data.get("b2b", []))}
    return {"total_tax": data.get("total_tax")}


# ─────────────────────────────────────────────────────────────────────────────
# Report persistence
# ─────────────────────────────────────────────────────────────────────────────

def save_compliance_report(
    db: Session, company_id: str, report_type: str, data: dict,
    regime: str | None = None, financial_year: str | None = None, fmt: str = "json",
) -> ComplianceReport:
    rep = ComplianceReport(
        company_id=company_id, report_type=report_type, regime=regime,
        financial_year=financial_year, format=fmt, data_json=json.dumps(data, default=str),
    )
    db.add(rep)
    db.commit()
    db.refresh(rep)
    return rep
