#!/usr/bin/env python3
"""Seed comprehensive demo data for ZLedger: one company with full feature coverage.

Usage:
    docker-compose exec api python scripts/seed_demo_data.py
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.db import SessionLocal, engine, Base
from app.models import *
from app.models.user import User, Company, CompanyMember
from app.models.accounting import (
    AccountGroup, FinancialYear, Ledger, Party, GstRegistration, HsnSac,
)
from app.models.stock import StockGroup, StockItem, StockEntry, StockBalance
from app.models.voucher import Voucher, VoucherLine, PaymentAllocation
from app.models.masters import Unit, CostCentre, CostCategory
from app.models.einvoice import EInvoice
from app.services.coa import seed_groups, seed_default_ledgers, seed_system_ledgers
from app.services.gst import seed_gst_ledgers
from app.services.stock_valuation import update_stock_balance_weighted_avg


def rnd(amount: Decimal) -> float:
    return float(amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def find_ledger(db: Session, company_id: str, name: str) -> Ledger | None:
    return db.query(Ledger).filter(
        Ledger.company_id == company_id, Ledger.name == name
    ).first()


def find_group(db: Session, company_id: str, name: str) -> AccountGroup | None:
    return db.query(AccountGroup).filter(
        AccountGroup.company_id == company_id, AccountGroup.name == name
    ).first()


# ─── Phase 1: Wipe (keep admin) ───────────────────────────────────────────

def truncate_all(db: Session) -> None:
    print("Wiping all data (keeping admin user)...")
    admin = db.query(User).filter(User.email == "admin@zledger.com").first()
    admin_id = admin.id if admin else None

    tables = [
        "audit_logs",
        "tds_tcs_returns", "tds_tcs_entries", "tds_tcs_sections",
        "eway_bills", "e_invoices",
        "bank_statement_lines", "bank_reconciliations",
        "stock_balances", "stock_entries", "stock_items", "stock_groups",
        "voucher_lines", "vouchers",
        "gst_returns", "gst_registrations", "hsn_sac",
        "parties", "units", "cost_centres", "cost_categories",
        "financial_years", "ledgers", "account_groups",
        "company_members", "companies",
    ]
    for t in tables:
        db.execute(text(f"DELETE FROM {t}"))

    if admin_id:
        db.execute(text("DELETE FROM users WHERE id != :admin_id"), {"admin_id": admin_id})
    else:
        db.execute(text("DELETE FROM users"))
    db.commit()
    print("  Done.")


# ─── Company Factory ──────────────────────────────────────────────────────

def create_company(db: Session, admin_user_id: str, **kwargs) -> Company:
    c = Company(**kwargs)
    db.add(c)
    db.flush()
    db.add(CompanyMember(company_id=c.id, user_id=admin_user_id, role="owner"))
    db.flush()
    seed_groups(db, c.id)
    seed_default_ledgers(db, c.id)
    seed_gst_ledgers(db, c.id)
    seed_system_ledgers(db, c.id)
    return c


def create_fy(db: Session, company_id: str, name: str, start: str, end: str) -> FinancialYear:
    fy = FinancialYear(company_id=company_id, name=name, start_date=start, end_date=end)
    db.add(fy)
    db.flush()
    return fy


def create_ledger(db: Session, company_id: str, name: str, group_name: str,
                  opening: float = 0, opening_type: str = "Dr",
                  system_code: str | None = None, gstin: str | None = None,
                  is_protected: bool = False) -> Ledger:
    grp = find_group(db, company_id, group_name)
    if not grp:
        raise ValueError(f"Group '{group_name}' not found")
    l = Ledger(
        company_id=company_id, name=name, group_id=grp.id,
        opening_balance=opening, opening_balance_type=opening_type,
        system_code=system_code, gstin=gstin, is_protected=is_protected,
    )
    db.add(l)
    db.flush()
    return l


def create_party(db: Session, company_id: str, name: str, party_type: str,
                 ledger_id: str, gstin: str | None = None,
                 state_code: str | None = None, pan: str | None = None,
                 address: str | None = None, contact: str | None = None,
                 phone: str | None = None, email: str | None = None) -> Party:
    p = Party(
        company_id=company_id, name=name, party_type=party_type,
        ledger_id=ledger_id, gstin=gstin, state_code=state_code, pan=pan,
        address=address, contact_person=contact, phone=phone, email=email,
    )
    db.add(p)
    db.flush()
    return p


def create_stock_group(db: Session, company_id: str, name: str,
                       description: str | None = None) -> StockGroup:
    sg = StockGroup(company_id=company_id, name=name, description=description)
    db.add(sg)
    db.flush()
    return sg


def create_stock_item(db: Session, company_id: str, name: str,
                      group_id: str | None, hsn: str, gst_rate: float,
                      uom: str = "Nos", opening_qty: float = 0,
                      opening_rate: float = 0, sku: str | None = None,
                      valuation: str = "weighted_avg") -> StockItem:
    si = StockItem(
        company_id=company_id, name=name, stock_group_id=group_id,
        hsn_sac_code=hsn, gst_rate=gst_rate, unit_of_measure=uom,
        opening_qty=opening_qty, opening_rate=opening_rate, sku=sku,
        valuation_method=valuation,
    )
    db.add(si)
    db.flush()
    return si


def create_gst_reg(db: Session, company_id: str, gstin: str, legal_name: str,
                   state_code: str, pan: str | None = None,
                   trade_name: str | None = None) -> GstRegistration:
    gr = GstRegistration(
        company_id=company_id, gstin=gstin, legal_name=legal_name,
        trade_name=trade_name, state_code=state_code, pan=pan,
    )
    db.add(gr)
    db.flush()
    return gr


# ─── Voucher Factory ──────────────────────────────────────────────────────

def create_voucher(
    db: Session, company_id: str, user_id: str,
    voucher_type: str, voucher_number: str, voucher_date: str,
    narration: str | None = None, reference: str | None = None,
    party_id: str | None = None, place_of_supply: str | None = None,
    document_type: str = "regular", counterparty_gstin: str | None = None,
    counterparty_state_code: str | None = None,
    due_date: str | None = None,
    grand_total: float | None = None,
) -> Voucher:
    v = Voucher(
        company_id=company_id, voucher_type=voucher_type,
        voucher_number=voucher_number, voucher_date=voucher_date,
        narration=narration, reference=reference, party_id=party_id,
        place_of_supply=place_of_supply, document_type=document_type,
        counterparty_gstin=counterparty_gstin,
        counterparty_state_code=counterparty_state_code,
        created_by=user_id,
        due_date=due_date,
        grand_total=grand_total,
    )
    db.add(v)
    db.flush()
    return v


def add_line(
    db: Session, voucher_id: str, ledger_id: str,
    debit: float = 0, credit: float = 0,
    stock_item_id: str | None = None,
    quantity: float | None = None, rate: float | None = None,
    discount_pct: float = 0, discount_amount: float = 0,
    line_total: float | None = None, taxable_value: float | None = None,
    cgst_amount: float | None = None, sgst_amount: float | None = None,
    igst_amount: float | None = None, is_inter_state: bool = False,
    is_rate_inclusive: bool = False,
    cost_centre_id: str | None = None,
) -> VoucherLine:
    vl = VoucherLine(
        voucher_id=voucher_id, ledger_id=ledger_id,
        stock_item_id=stock_item_id, quantity=quantity, rate=rate,
        discount_pct=discount_pct, discount_amount=discount_amount,
        line_total=line_total, debit=debit, credit=credit,
        taxable_value=taxable_value, cgst_amount=cgst_amount,
        sgst_amount=sgst_amount, igst_amount=igst_amount,
        is_inter_state=is_inter_state, is_rate_inclusive=is_rate_inclusive,
        cost_centre_id=cost_centre_id,
    )
    db.add(vl)
    db.flush()
    return vl


def create_stock_entry(db: Session, company_id: str, voucher: Voucher,
                       vl: VoucherLine) -> None:
    if not vl.stock_item_id or not vl.quantity:
        return
    if voucher.voucher_type in ("sales", "credit_note"):
        entry_type = "outward"
    elif voucher.voucher_type in ("purchase", "debit_note"):
        entry_type = "inward"
    else:
        return
    se = StockEntry(
        company_id=company_id, stock_item_id=vl.stock_item_id,
        entry_type=entry_type, quantity=float(vl.quantity),
        rate=float(vl.rate or 0), total_amount=float(vl.line_total or 0),
        entry_date=voucher.voucher_date, reference=voucher.reference,
        narration=voucher.narration, voucher_id=voucher.id,
    )
    db.add(se)
    update_stock_balance_weighted_avg(
        db, company_id, vl.stock_item_id, entry_type,
        float(vl.quantity), float(vl.rate or 0), voucher.voucher_date,
    )


# ─── Voucher Builders ─────────────────────────────────────────────────────

def build_opening_journal(
    db: Session, company_id: str, user_id: str,
    fy_name: str, lines: list[dict],
) -> Voucher:
    """Opening balance journal entry for the start of a financial year."""
    v = create_voucher(
        db, company_id, user_id, "journal",
        f"OPEN-{fy_name}", f"{fy_name[:4]}-04-01",
        narration=f"Opening balance for FY {fy_name}",
    )
    total = Decimal("0")
    for ld in lines:
        add_line(db, v.id, ld["ledger_id"],
                 debit=ld.get("debit", 0), credit=ld.get("credit", 0))
        total += Decimal(str(ld.get("debit", 0))) + Decimal(str(ld.get("credit", 0)))
    v.subtotal = rnd(total / Decimal("2"))
    v.grand_total = rnd(total / Decimal("2"))
    return v


def build_sales_voucher(
    db: Session, company_id: str, user_id: str,
    voucher_number: str, voucher_date: str,
    items: list[dict], party_id: str,
    cash_bank_ledger_id: str | None,
    company_state: str, party_state: str,
    narration: str | None = None, reference: str | None = None,
    is_rate_inclusive: bool = False,
    cost_centre_id: str | None = None,
    due_date: str | None = None,
) -> Voucher:
    sales_ledger = find_ledger(db, company_id, "Sales")
    is_inter = party_state != company_state
    v = create_voucher(
        db, company_id, user_id, "sales", voucher_number, voucher_date,
        narration=narration, reference=reference, party_id=party_id,
        place_of_supply=party_state,
        counterparty_gstin=None, counterparty_state_code=party_state,
        due_date=due_date,
    )

    total_taxable = Decimal("0")
    total_cgst = Decimal("0")
    total_sgst = Decimal("0")
    total_igst = Decimal("0")

    for item in items:
        si = db.get(StockItem, item["stock_item_id"])
        qty = Decimal(str(item["qty"]))
        rate = Decimal(str(item["rate"]))
        disc_pct = Decimal(str(item.get("discount_pct", 0)))
        gst_rate = Decimal(str(item.get("gst_rate_override") or si.gst_rate))
        gross = qty * rate
        disc_amt = (gross * disc_pct / Decimal("100")) if disc_pct > 0 else Decimal("0")
        incl_total = gross - disc_amt

        if is_rate_inclusive and gst_rate > 0:
            taxable = Decimal(rnd(incl_total / (Decimal("1") + gst_rate / Decimal("100"))))
        else:
            taxable = incl_total

        if is_inter:
            igst = Decimal(rnd(taxable * gst_rate / Decimal("100")))
            cgst = Decimal("0")
            sgst = Decimal("0")
        else:
            half = gst_rate / Decimal("2")
            cgst = Decimal(rnd(taxable * half / Decimal("100")))
            sgst = Decimal(rnd(taxable * half / Decimal("100")))
            igst = Decimal("0")

        total_taxable += taxable
        total_cgst += cgst
        total_sgst += sgst
        total_igst += igst

        add_line(db, v.id, sales_ledger.id, credit=rnd(taxable),
                 stock_item_id=si.id, quantity=float(qty), rate=float(rate),
                 discount_pct=float(disc_pct), discount_amount=rnd(disc_amt),
                 line_total=rnd(taxable), taxable_value=rnd(taxable),
                 cgst_amount=rnd(cgst), sgst_amount=rnd(sgst), igst_amount=rnd(igst),
                 is_inter_state=is_inter, is_rate_inclusive=is_rate_inclusive,
                 cost_centre_id=cost_centre_id)

    grand_total = total_taxable + total_cgst + total_sgst + total_igst

    if cash_bank_ledger_id:
        add_line(db, v.id, cash_bank_ledger_id, debit=rnd(grand_total))
    else:
        party_ledger_fallback(db, company_id, v, party_id, None, debit=rnd(grand_total))

    gst_ids = _gst_sys_ids(db, company_id)
    if not is_inter:
        if total_cgst > 0 and "SYS_GST_OUTPUT_CGST" in gst_ids:
            add_line(db, v.id, gst_ids["SYS_GST_OUTPUT_CGST"], credit=rnd(total_cgst))
        if total_sgst > 0 and "SYS_GST_OUTPUT_SGST" in gst_ids:
            add_line(db, v.id, gst_ids["SYS_GST_OUTPUT_SGST"], credit=rnd(total_sgst))
    else:
        if total_igst > 0 and "SYS_GST_OUTPUT_IGST" in gst_ids:
            add_line(db, v.id, gst_ids["SYS_GST_OUTPUT_IGST"], credit=rnd(total_igst))

    v.subtotal = rnd(total_taxable)
    v.tax_total = rnd(total_cgst + total_sgst + total_igst)
    v.grand_total = rnd(grand_total)

    for item in items:
        si = db.get(StockItem, item["stock_item_id"])
        qty = Decimal(str(item["qty"]))
        rate = Decimal(str(item["rate"]))
        disc_pct = Decimal(str(item.get("discount_pct", 0)))
        gst_rate = Decimal(str(item.get("gst_rate_override") or si.gst_rate))
        gross = qty * rate
        disc_amt = (gross * disc_pct / Decimal("100")) if disc_pct > 0 else Decimal("0")
        incl_total = gross - disc_amt
        if is_rate_inclusive and gst_rate > 0:
            taxable = Decimal(rnd(incl_total / (Decimal("1") + gst_rate / Decimal("100"))))
        else:
            taxable = incl_total
        vl = VoucherLine(
            voucher_id=v.id, ledger_id=sales_ledger.id,
            stock_item_id=si.id, quantity=float(qty), rate=float(rate),
            line_total=rnd(taxable), debit=0, credit=rnd(taxable),
        )
        create_stock_entry(db, company_id, v, vl)

    return v


def party_ledger_fallback(db: Session, company_id: str, v: Voucher, party_id: str | None,
                          gst_return: str | None = None, debit: float = 0,
                          credit: float = 0) -> None:
    """For non-cash vouchers, debit/credit the party's receivable/payable ledger."""
    party = db.get(Party, party_id) if party_id else None
    if party:
        add_line(db, v.id, party.ledger_id, debit=debit, credit=credit)


def build_purchase_voucher(
    db: Session, company_id: str, user_id: str,
    voucher_number: str, voucher_date: str,
    items: list[dict], party_id: str,
    cash_bank_ledger_id: str | None,
    company_state: str, party_state: str,
    narration: str | None = None, reference: str | None = None,
    cost_centre_id: str | None = None,
    due_date: str | None = None,
) -> Voucher:
    purchase_ledger = find_ledger(db, company_id, "Purchases")
    is_inter = party_state != company_state
    v = create_voucher(
        db, company_id, user_id, "purchase", voucher_number, voucher_date,
        narration=narration, reference=reference, party_id=party_id,
        place_of_supply=party_state,
        counterparty_state_code=party_state,
        due_date=due_date,
    )

    total_taxable = Decimal("0")
    total_cgst = Decimal("0")
    total_sgst = Decimal("0")
    total_igst = Decimal("0")

    for item in items:
        si = db.get(StockItem, item["stock_item_id"])
        qty = Decimal(str(item["qty"]))
        rate = Decimal(str(item["rate"]))
        disc_pct = Decimal(str(item.get("discount_pct", 0)))
        gst_rate = Decimal(str(item.get("gst_rate_override") or si.gst_rate))
        gross = qty * rate
        disc_amt = (gross * disc_pct / Decimal("100")) if disc_pct > 0 else Decimal("0")
        taxable = gross - disc_amt

        if is_inter:
            igst = Decimal(rnd(taxable * gst_rate / Decimal("100")))
            cgst = Decimal("0")
            sgst = Decimal("0")
        else:
            half = gst_rate / Decimal("2")
            cgst = Decimal(rnd(taxable * half / Decimal("100")))
            sgst = Decimal(rnd(taxable * half / Decimal("100")))
            igst = Decimal("0")

        total_taxable += taxable
        total_cgst += cgst
        total_sgst += sgst
        total_igst += igst

        add_line(db, v.id, purchase_ledger.id, debit=rnd(taxable),
                 stock_item_id=si.id, quantity=float(qty), rate=float(rate),
                 discount_pct=float(disc_pct), discount_amount=rnd(disc_amt),
                 line_total=rnd(taxable), taxable_value=rnd(taxable),
                 cgst_amount=rnd(cgst), sgst_amount=rnd(sgst), igst_amount=rnd(igst),
                 is_inter_state=is_inter, cost_centre_id=cost_centre_id)

    grand_total = total_taxable + total_cgst + total_sgst + total_igst

    if cash_bank_ledger_id:
        add_line(db, v.id, cash_bank_ledger_id, credit=rnd(grand_total))
    else:
        party_ledger_fallback(db, company_id, v, party_id, None, credit=rnd(grand_total))

    gst_ids = _gst_sys_ids(db, company_id)
    if not is_inter:
        if total_cgst > 0 and "SYS_GST_INPUT_CGST" in gst_ids:
            add_line(db, v.id, gst_ids["SYS_GST_INPUT_CGST"], debit=rnd(total_cgst))
        if total_sgst > 0 and "SYS_GST_INPUT_SGST" in gst_ids:
            add_line(db, v.id, gst_ids["SYS_GST_INPUT_SGST"], debit=rnd(total_sgst))
    else:
        if total_igst > 0 and "SYS_GST_INPUT_IGST" in gst_ids:
            add_line(db, v.id, gst_ids["SYS_GST_INPUT_IGST"], debit=rnd(total_igst))

    v.subtotal = rnd(total_taxable)
    v.tax_total = rnd(total_cgst + total_sgst + total_igst)
    v.grand_total = rnd(grand_total)

    for item in items:
        si = db.get(StockItem, item["stock_item_id"])
        qty = Decimal(str(item["qty"]))
        rate = Decimal(str(item["rate"]))
        gst_rate = Decimal(str(item.get("gst_rate_override") or si.gst_rate))
        taxable = qty * rate
        vl = VoucherLine(
            voucher_id=v.id, ledger_id=purchase_ledger.id,
            stock_item_id=si.id, quantity=float(qty), rate=float(rate),
            line_total=rnd(taxable), debit=rnd(taxable), credit=0,
        )
        create_stock_entry(db, company_id, v, vl)

    return v


def build_contra_voucher(
    db: Session, company_id: str, user_id: str,
    voucher_number: str, voucher_date: str,
    from_ledger_id: str, to_ledger_id: str, amount: float,
    narration: str | None = None, reference: str | None = None,
) -> Voucher:
    v = create_voucher(
        db, company_id, user_id, "contra", voucher_number, voucher_date,
        narration=narration, reference=reference,
    )
    add_line(db, v.id, from_ledger_id, credit=amount)
    add_line(db, v.id, to_ledger_id, debit=amount)
    v.subtotal = amount
    v.grand_total = amount
    return v


def build_payment_receipt_voucher(
    db: Session, company_id: str, user_id: str,
    voucher_type: str, voucher_number: str, voucher_date: str,
    amount: float, party_ledger_id: str, cash_bank_ledger_id: str,
    party_id: str | None = None, narration: str | None = None,
    reference: str | None = None,
) -> Voucher:
    v = create_voucher(
        db, company_id, user_id, voucher_type, voucher_number, voucher_date,
        narration=narration, reference=reference, party_id=party_id,
    )
    if voucher_type == "payment":
        add_line(db, v.id, party_ledger_id, debit=amount)
        add_line(db, v.id, cash_bank_ledger_id, credit=amount)
    else:
        add_line(db, v.id, cash_bank_ledger_id, debit=amount)
        add_line(db, v.id, party_ledger_id, credit=amount)
    v.subtotal = amount
    v.grand_total = amount
    return v


def build_journal_voucher(
    db: Session, company_id: str, user_id: str,
    voucher_number: str, voucher_date: str,
    lines_data: list[dict], narration: str | None = None,
    reference: str | None = None,
) -> Voucher:
    v = create_voucher(
        db, company_id, user_id, "journal", voucher_number, voucher_date,
        narration=narration, reference=reference,
    )
    total = Decimal("0")
    for ld in lines_data:
        add_line(db, v.id, ld["ledger_id"],
                 debit=ld.get("debit", 0), credit=ld.get("credit", 0),
                 cost_centre_id=ld.get("cost_centre_id"))
        total += Decimal(str(ld.get("debit", 0))) + Decimal(str(ld.get("credit", 0)))
    v.subtotal = rnd(total / Decimal("2"))
    v.grand_total = rnd(total / Decimal("2"))
    return v


def build_credit_note_voucher(
    db: Session, company_id: str, user_id: str,
    voucher_number: str, voucher_date: str,
    items: list[dict], party_id: str,
    cash_bank_ledger_id: str | None,
    company_state: str, party_state: str,
    narration: str | None = None, reference: str | None = None,
) -> Voucher:
    sales_ledger = find_ledger(db, company_id, "Sales")
    is_inter = party_state != company_state
    v = create_voucher(
        db, company_id, user_id, "credit_note", voucher_number, voucher_date,
        narration=narration, reference=reference, party_id=party_id,
        place_of_supply=party_state,
    )

    total_taxable = Decimal("0")
    total_cgst = Decimal("0")
    total_sgst = Decimal("0")
    total_igst = Decimal("0")

    for item in items:
        si = db.get(StockItem, item["stock_item_id"])
        qty = Decimal(str(item["qty"]))
        rate = Decimal(str(item["rate"]))
        gst_rate = Decimal(str(si.gst_rate))
        taxable = qty * rate

        if is_inter:
            igst = Decimal(rnd(taxable * gst_rate / Decimal("100")))
            cgst = Decimal("0")
            sgst = Decimal("0")
        else:
            half = gst_rate / Decimal("2")
            cgst = Decimal(rnd(taxable * half / Decimal("100")))
            sgst = Decimal(rnd(taxable * half / Decimal("100")))
            igst = Decimal("0")

        total_taxable += taxable
        total_cgst += cgst
        total_sgst += sgst
        total_igst += igst

        add_line(db, v.id, sales_ledger.id, debit=rnd(taxable),
                 stock_item_id=si.id, quantity=float(qty), rate=float(rate),
                 line_total=rnd(taxable), taxable_value=rnd(taxable),
                 cgst_amount=rnd(cgst), sgst_amount=rnd(sgst), igst_amount=rnd(igst),
                 is_inter_state=is_inter)

    grand_total = total_taxable + total_cgst + total_sgst + total_igst

    if cash_bank_ledger_id:
        add_line(db, v.id, cash_bank_ledger_id, credit=rnd(grand_total))
    else:
        party_ledger_fallback(db, company_id, v, party_id, None, credit=rnd(grand_total))

    gst_ids = _gst_sys_ids(db, company_id)
    if not is_inter:
        if total_cgst > 0 and "SYS_GST_OUTPUT_CGST" in gst_ids:
            add_line(db, v.id, gst_ids["SYS_GST_OUTPUT_CGST"], debit=rnd(total_cgst))
        if total_sgst > 0 and "SYS_GST_OUTPUT_SGST" in gst_ids:
            add_line(db, v.id, gst_ids["SYS_GST_OUTPUT_SGST"], debit=rnd(total_sgst))
    else:
        if total_igst > 0 and "SYS_GST_OUTPUT_IGST" in gst_ids:
            add_line(db, v.id, gst_ids["SYS_GST_OUTPUT_IGST"], debit=rnd(total_igst))

    v.subtotal = rnd(total_taxable)
    v.tax_total = rnd(total_cgst + total_sgst + total_igst)
    v.grand_total = rnd(grand_total)

    for item in items:
        si = db.get(StockItem, item["stock_item_id"])
        qty = Decimal(str(item["qty"]))
        rate = Decimal(str(item["rate"]))
        taxable = qty * rate
        vl = VoucherLine(
            voucher_id=v.id, ledger_id=sales_ledger.id,
            stock_item_id=si.id, quantity=float(qty), rate=float(rate),
            line_total=rnd(taxable), debit=rnd(taxable), credit=0,
        )
        create_stock_entry(db, company_id, v, vl)

    return v


def build_debit_note_voucher(
    db: Session, company_id: str, user_id: str,
    voucher_number: str, voucher_date: str,
    items: list[dict], party_id: str,
    cash_bank_ledger_id: str | None,
    company_state: str, party_state: str,
    narration: str | None = None, reference: str | None = None,
) -> Voucher:
    purchase_ledger = find_ledger(db, company_id, "Purchases")
    is_inter = party_state != company_state
    v = create_voucher(
        db, company_id, user_id, "debit_note", voucher_number, voucher_date,
        narration=narration, reference=reference, party_id=party_id,
        place_of_supply=party_state,
    )

    total_taxable = Decimal("0")
    total_cgst = Decimal("0")
    total_sgst = Decimal("0")
    total_igst = Decimal("0")

    for item in items:
        si = db.get(StockItem, item["stock_item_id"])
        qty = Decimal(str(item["qty"]))
        rate = Decimal(str(item["rate"]))
        gst_rate = Decimal(str(si.gst_rate))
        taxable = qty * rate

        if is_inter:
            igst = Decimal(rnd(taxable * gst_rate / Decimal("100")))
            cgst = Decimal("0")
            sgst = Decimal("0")
        else:
            half = gst_rate / Decimal("2")
            cgst = Decimal(rnd(taxable * half / Decimal("100")))
            sgst = Decimal(rnd(taxable * half / Decimal("100")))
            igst = Decimal("0")

        total_taxable += taxable
        total_cgst += cgst
        total_sgst += sgst
        total_igst += igst

        add_line(db, v.id, purchase_ledger.id, credit=rnd(taxable),
                 stock_item_id=si.id, quantity=float(qty), rate=float(rate),
                 line_total=rnd(taxable), taxable_value=rnd(taxable),
                 cgst_amount=rnd(cgst), sgst_amount=rnd(sgst), igst_amount=rnd(igst),
                 is_inter_state=is_inter)

    grand_total = total_taxable + total_cgst + total_sgst + total_igst

    if cash_bank_ledger_id:
        add_line(db, v.id, cash_bank_ledger_id, debit=rnd(grand_total))
    else:
        party_ledger_fallback(db, company_id, v, party_id, None, debit=rnd(grand_total))

    gst_ids = _gst_sys_ids(db, company_id)
    if not is_inter:
        if total_cgst > 0 and "SYS_GST_INPUT_CGST" in gst_ids:
            add_line(db, v.id, gst_ids["SYS_GST_INPUT_CGST"], credit=rnd(total_cgst))
        if total_sgst > 0 and "SYS_GST_INPUT_SGST" in gst_ids:
            add_line(db, v.id, gst_ids["SYS_GST_INPUT_SGST"], credit=rnd(total_sgst))
    else:
        if total_igst > 0 and "SYS_GST_INPUT_IGST" in gst_ids:
            add_line(db, v.id, gst_ids["SYS_GST_INPUT_IGST"], credit=rnd(total_igst))

    v.subtotal = rnd(total_taxable)
    v.tax_total = rnd(total_cgst + total_sgst + total_igst)
    v.grand_total = rnd(grand_total)

    for item in items:
        si = db.get(StockItem, item["stock_item_id"])
        qty = Decimal(str(item["qty"]))
        rate = Decimal(str(item["rate"]))
        taxable = qty * rate
        vl = VoucherLine(
            voucher_id=v.id, ledger_id=purchase_ledger.id,
            stock_item_id=si.id, quantity=float(qty), rate=float(rate),
            line_total=rnd(taxable), debit=0, credit=rnd(taxable),
        )
        create_stock_entry(db, company_id, v, vl)

    return v


def _gst_sys_ids(db: Session, company_id: str) -> dict[str, str]:
    return {ls.system_code: ls.id for ls in db.query(Ledger).filter(
        Ledger.company_id == company_id, Ledger.system_code.isnot(None)
    ).all()}


# ─── Company: Apex Enterprises ────────────────────────────────────────────

COMPANY = dict(
    name="Apex Enterprises",
    legal_name="Apex Enterprises Private Limited",
    gstin="27AABCP1234A1Z5",
    state_code="27",
    pan="AABCP1234A",
    address="701, Business Hub, Andheri West, Mumbai 400053",
    phone="022-62345678",
    email="accounts@apexenterprises.in",
    website="www.apexenterprises.in",
    bank_name="HDFC Bank",
    bank_account_number="50100098765432",
    bank_ifsc="HDFC0005678",
    bank_branch="Andheri West, Mumbai",
    books_begin_from="2024-04-01",
)


def seed_all_data(db: Session, admin_user: User) -> Company:
    print("\n=== Creating Company: Apex Enterprises ===")
    c = create_company(db, admin_user_id=admin_user.id, **COMPANY)

    # ── Financial Years ──
    fy2425 = create_fy(db, c.id, "2024-25", "2024-04-01", "2025-03-31")
    fy2526 = create_fy(db, c.id, "2025-26", "2025-04-01", "2026-03-31")

    # ── GST Registration ──
    create_gst_reg(db, c.id, "27AABCP1234A1Z5", "Apex Enterprises Private Limited",
                   "27", "AABCP1234A", "Apex Enterprises")

    # ── Rename default bank ledger ──
    bank = find_ledger(db, c.id, "Bank Account")
    if bank:
        bank.name = "HDFC Bank - Current A/c"
        bank.opening_balance = 580000.00
        bank.opening_balance_type = "Dr"
    cash = find_ledger(db, c.id, "Cash")
    if cash:
        cash.opening_balance = 35000.00
        cash.opening_balance_type = "Dr"

    # ── Control Ledgers ──
    debtors = create_ledger(db, c.id, "Sundry Debtors", "Sundry Debtors")
    creditors = create_ledger(db, c.id, "Sundry Creditors", "Sundry Creditors")

    # ── Cost Categories & Centres ──
    cc_admin = CostCategory(company_id=c.id, name="Administrative",
                            description="Administrative & overhead expenses")
    cc_sales = CostCategory(company_id=c.id, name="Sales & Marketing",
                            description="Sales and marketing expenses")
    db.add(cc_admin)
    db.add(cc_sales)
    db.flush()

    cen_admin = CostCentre(company_id=c.id, name="General Administration",
                           description="Office admin and management costs")
    cen_warehouse = CostCentre(company_id=c.id, name="Warehouse Operations",
                               description="Warehouse and logistics costs")
    cen_marketing = CostCentre(company_id=c.id, name="Sales & Distribution",
                               description="Sales team and distribution expenses")
    db.add(cen_admin)
    db.add(cen_warehouse)
    db.add(cen_marketing)
    db.flush()

    # ── Units ──
    for u in [("Pcs", "Pieces"), ("Box", "Boxes"), ("Kg", "Kilograms"),
              ("Mtr", "Meters"), ("Ltr", "Litres"), ("Pkt", "Packets")]:
        db.add(Unit(company_id=c.id, name=u[0], description=u[1]))
    db.flush()

    # ── Stock Groups ──
    sg_stationery = create_stock_group(db, c.id, "Stationery & Office Supplies",
                                       "Paper, pens, and office consumables")
    sg_electronics = create_stock_group(db, c.id, "Electronics & Accessories",
                                        "Computer peripherals and electronic items")
    sg_foods = create_stock_group(db, c.id, "Packaged Foods & Beverages",
                                  "Food and beverage products")

    # ── Stock Items ──
    si_paper = create_stock_item(db, c.id, "A4 Copy Paper 500-sheet", sg_stationery.id,
                                 "4802", 5.0, "Box", 200, 220.00, "STN-PAP-A4")
    si_pen = create_stock_item(db, c.id, "Ball Pen Box 10-pcs", sg_stationery.id,
                               "9608", 12.0, "Box", 150, 65.00, "STN-PEN-BP10")
    si_stapler = create_stock_item(db, c.id, "Stapler Medium", sg_stationery.id,
                                   "8472", 12.0, "Pcs", 80, 95.00, "STN-STP-MED")
    si_usb = create_stock_item(db, c.id, "USB Flash Drive 32GB", sg_electronics.id,
                               "8471", 18.0, "Pcs", 100, 350.00, "ELC-USB-32G")
    si_mouse = create_stock_item(db, c.id, "Wireless Mouse", sg_electronics.id,
                                 "8471", 18.0, "Pcs", 60, 420.00, "ELC-MOU-WL")
    si_choco = create_stock_item(db, c.id, "Dark Chocolate Box 500g", sg_foods.id,
                                 "1806", 18.0, "Box", 80, 280.00, "FNB-CHO-D500")
    si_tea = create_stock_item(db, c.id, "Green Tea Packet 200g", sg_foods.id,
                               "0902", 5.0, "Pkt", 200, 85.00, "FNB-TEA-G200")

    # ── Parties ──
    p1_ledger = create_ledger(db, c.id, "Royal Emporium - Receivable", "Sundry Debtors", opening=125000.00, opening_type="Dr")
    p2_ledger = create_ledger(db, c.id, "City Mart - Receivable", "Sundry Debtors", opening=87500.00, opening_type="Dr")
    p3_ledger = create_ledger(db, c.id, "Global Distributors - Payable", "Sundry Creditors", opening=210000.00, opening_type="Cr")
    p4_ledger = create_ledger(db, c.id, "Prime Imports - Payable", "Sundry Creditors", opening=64000.00, opening_type="Cr")
    p5_ledger = create_ledger(db, c.id, "Metro Retail - Receivable", "Sundry Debtors", opening=43000.00, opening_type="Dr")

    p_royal = create_party(db, c.id, "Royal Emporium", "customer",
                           ledger_id=p1_ledger.id, gstin="24AABCR5678A1Z3",
                           state_code="24", pan="AABCR5678A",
                           address="Royal Emporium, CG Road, Ahmedabad, Gujarat",
                           contact="Rajesh Shah", phone="079-25678901",
                           email="rajesh@royalemporium.in")

    p_citymart = create_party(db, c.id, "City Mart", "customer",
                              ledger_id=p2_ledger.id, gstin="27AABCC9012A1Z7",
                              state_code="27", pan="AABCC9012A",
                              address="City Mart, Linking Road, Bandra, Mumbai",
                              contact="Priya Mehta", phone="022-26789012",
                              email="priya@citymart.in")

    p_global = create_party(db, c.id, "Global Distributors", "supplier",
                            ledger_id=p3_ledger.id, gstin="27AABCG3456A1Z9",
                            state_code="27", pan="AABCG3456A",
                            address="Global Distributors, MIDC, Pune",
                            contact="Sunil Deshmukh", phone="020-27890123",
                            email="sunil@globaldist.in")

    p_prime = create_party(db, c.id, "Prime Imports", "supplier",
                           ledger_id=p4_ledger.id, gstin="29AABCP2345B1Z8",
                           state_code="29", pan="AABCP2345B",
                           address="Prime Imports, Indiranagar, Bangalore",
                           contact="Arun Kumar", phone="080-28901234",
                           email="arun@primeimports.in")

    p_metro = create_party(db, c.id, "Metro Retail", "customer",
                           ledger_id=p5_ledger.id, gstin="27AABCM6789A1Z4",
                           state_code="27", pan="AABCM6789A",
                           address="Metro Retail, Powai, Mumbai",
                           contact="Karan Joshi", phone="022-29012345",
                           email="karan@metroretail.in")

    db.flush()

    # ── Ledger refs ──
    bank_ledger = find_ledger(db, c.id, "HDFC Bank - Current A/c")
    cash_ledger = find_ledger(db, c.id, "Cash")
    capital = find_ledger(db, c.id, "Capital Account")
    round_off = find_ledger(db, c.id, "Round Off")
    discount_allowed = find_ledger(db, c.id, "Discount Allowed")
    discount_received = find_ledger(db, c.id, "Discount Received")

    # ── Opening Balance Journal (FY 2024-25) ──
    print("  Creating opening balance journal...")
    build_opening_journal(db, c.id, admin_user.id, "2025-26", [
        {"ledger_id": cash_ledger.id, "debit": 50000, "credit": 0},
        {"ledger_id": bank_ledger.id, "debit": 500000, "credit": 0},
        {"ledger_id": p1_ledger.id, "debit": 75000, "credit": 0},
        {"ledger_id": p2_ledger.id, "debit": 45000, "credit": 0},
        {"ledger_id": p3_ledger.id, "debit": 0, "credit": 65000},
        {"ledger_id": p4_ledger.id, "debit": 0, "credit": 85000},
        {"ledger_id": capital.id, "debit": 0, "credit": 520000},
    ])

    # ── Vouchers ──
    print("  Creating vouchers...")

    # 1. PUR-001: Purchase from Global Distributors (intra-state, Maharashtra)
    #    A4 Paper: 100 Box @ ₹250 (5% GST)
    #    Ball Pens: 50 Box @ ₹80 (12% GST)
    build_purchase_voucher(
        db, c.id, admin_user.id, "PUR-2025-0001", "2025-04-05",
        items=[{"stock_item_id": si_paper.id, "qty": 100, "rate": 250},
               {"stock_item_id": si_pen.id, "qty": 50, "rate": 80}],
        party_id=p_global.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Purchase of stationery from Global Distributors",
        reference="PO-GL-2025-001",
        due_date="2025-05-05",
    )

    # 2. INV-001: Sales to Royal Emporium (inter-state, Gujarat → IGST)
    #    A4 Paper: 30 Box @ ₹350
    #    Wireless Mouse: 20 Pcs @ ₹450
    #    USB Drives: 25 Pcs @ ₹600
    build_sales_voucher(
        db, c.id, admin_user.id, "INV-2025-0001", "2025-04-10",
        items=[{"stock_item_id": si_paper.id, "qty": 30, "rate": 350},
               {"stock_item_id": si_mouse.id, "qty": 20, "rate": 450},
               {"stock_item_id": si_usb.id, "qty": 25, "rate": 600}],
        party_id=p_royal.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="24",
        narration="Sale of stationery and electronics to Royal Emporium (inter-state)",
        reference="INV-ROY-2025-001",
        due_date="2025-05-10",
    )

    # 3. INV-002: Sales to City Mart (intra-state, CGST+SGST)
    #    Dark Chocolate: 40 Box @ ₹300 (18% GST)
    #    Green Tea: 50 Pkt @ ₹180 (5% GST)
    #    Staplers: 30 Pcs @ ₹120 (12% GST)
    build_sales_voucher(
        db, c.id, admin_user.id, "INV-2025-0002", "2025-04-15",
        items=[{"stock_item_id": si_choco.id, "qty": 40, "rate": 300},
               {"stock_item_id": si_tea.id, "qty": 50, "rate": 180},
               {"stock_item_id": si_stapler.id, "qty": 30, "rate": 120}],
        party_id=p_citymart.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Sale of chocolates, tea, and staplers to City Mart",
        reference="INV-CITY-2025-001",
        due_date="2025-05-15",
    )

    # 4. PUR-002: Purchase from Prime Imports (inter-state, Karnataka → IGST)
    #    USB Drives: 50 Pcs @ ₹350
    #    Wireless Mouse: 30 Pcs @ ₹280
    build_purchase_voucher(
        db, c.id, admin_user.id, "PUR-2025-0002", "2025-04-20",
        items=[{"stock_item_id": si_usb.id, "qty": 50, "rate": 350},
               {"stock_item_id": si_mouse.id, "qty": 30, "rate": 280}],
        party_id=p_prime.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="29",
        narration="Purchase of electronics from Prime Imports (inter-state)",
        reference="PO-PRI-2025-001",
        due_date="2025-05-20",
    )

    # 5. RECP-001: Receipt from Royal Emporium ₹50,000
    build_payment_receipt_voucher(
        db, c.id, admin_user.id, "receipt", "RECP-2025-0001", "2025-04-25",
        amount=50000, party_ledger_id=p1_ledger.id,
        cash_bank_ledger_id=bank_ledger.id, party_id=p_royal.id,
        narration="Payment received from Royal Emporium",
        reference="NEFT-20250425-001",
    )

    # 6. PAY-001: Payment to Global Distributors ₹40,000
    build_payment_receipt_voucher(
        db, c.id, admin_user.id, "payment", "PAY-2025-0001", "2025-04-28",
        amount=40000, party_ledger_id=p3_ledger.id,
        cash_bank_ledger_id=bank_ledger.id, party_id=p_global.id,
        narration="Payment to Global Distributors",
        reference="NEFT-20250428-001",
    )

    # 7. CONTRA-001: Bank to Cash ₹20,000
    build_contra_voucher(
        db, c.id, admin_user.id, "CONTRA-2025-0001", "2025-05-01",
        from_ledger_id=bank_ledger.id, to_ledger_id=cash_ledger.id,
        amount=20000, narration="Withdrawal for office cash expenses",
    )

    # 8. INV-003: Sales to City Mart (intra-state, tax-inclusive)
    #    Dark Chocolate: 20 Box @ ₹295 (inclusive, 18% GST)
    build_sales_voucher(
        db, c.id, admin_user.id, "INV-2025-0003", "2025-05-05",
        items=[{"stock_item_id": si_choco.id, "qty": 20, "rate": 295,
                "gst_rate_override": 18}],
        party_id=p_citymart.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Sale of chocolates to City Mart (tax-inclusive)",
        reference="INV-CITY-2025-002",
        is_rate_inclusive=True,
        due_date="2025-06-05",
    )

    # 9. JRN-001: Salary & Rent (with cost centres)
    #    Debit: General Admin ₹15,000
    #    Debit: Warehouse Operations ₹10,000
    #    Credit: Bank ₹25,000
    build_journal_voucher(
        db, c.id, admin_user.id, "JRN-2025-0001", "2025-05-10",
        lines_data=[
            {"ledger_id": cash_ledger.id, "debit": 15000, "credit": 0,
             "cost_centre_id": cen_admin.id},
            {"ledger_id": cash_ledger.id, "debit": 10000, "credit": 0,
             "cost_centre_id": cen_warehouse.id},
            {"ledger_id": bank_ledger.id, "debit": 0, "credit": 25000},
        ],
        narration="Salary & rent allocation for May 2025",
    )

    # 10. PUR-003: Purchase from Global Distributors (intra-state)
    #     Green Tea: 100 Pkt @ ₹80
    #     Dark Chocolate: 30 Box @ ₹180
    build_purchase_voucher(
        db, c.id, admin_user.id, "PUR-2025-0003", "2025-05-15",
        items=[{"stock_item_id": si_tea.id, "qty": 100, "rate": 80},
               {"stock_item_id": si_choco.id, "qty": 30, "rate": 180}],
        party_id=p_global.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Purchase of tea and chocolates from Global Distributors",
        due_date="2025-06-15",
    )

    # 11. CN-001: Credit Note to City Mart (return: 5 boxes Dark Chocolate @ ₹300)
    build_credit_note_voucher(
        db, c.id, admin_user.id, "CN-2025-0001", "2025-05-20",
        items=[{"stock_item_id": si_choco.id, "qty": 5, "rate": 300}],
        party_id=p_citymart.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Credit note - damaged chocolates returned by City Mart",
        reference="CN-CITY-2025-001",
    )

    # 12. DN-001: Debit Note to Prime Imports (return: 5 USB drives damaged)
    build_debit_note_voucher(
        db, c.id, admin_user.id, "DN-2025-0001", "2025-05-25",
        items=[{"stock_item_id": si_usb.id, "qty": 5, "rate": 350}],
        party_id=p_prime.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="29",
        narration="Debit note - damaged USB drives returned to Prime Imports",
        reference="DN-PRI-2025-001",
    )

    # 13. INV-004: Sales to Metro Retail (cash sale, intra-state)
    #     A4 Paper: 10 Box @ ₹350
    #     Staplers: 15 Pcs @ ₹120
    build_sales_voucher(
        db, c.id, admin_user.id, "INV-2025-0004", "2025-06-01",
        items=[{"stock_item_id": si_paper.id, "qty": 10, "rate": 350},
               {"stock_item_id": si_stapler.id, "qty": 15, "rate": 120}],
        party_id=p_metro.id, cash_bank_ledger_id=cash_ledger.id,
        company_state="27", party_state="27",
        narration="Cash sale of stationery to Metro Retail",
        reference="INV-METRO-2025-001",
        due_date="2025-07-01",
    )

    # 14. RECP-002: Receipt from City Mart ₹30,000
    build_payment_receipt_voucher(
        db, c.id, admin_user.id, "receipt", "RECP-2025-0002", "2025-06-05",
        amount=30000, party_ledger_id=p2_ledger.id,
        cash_bank_ledger_id=bank_ledger.id, party_id=p_citymart.id,
        narration="Payment received from City Mart",
        reference="NEFT-20250605-001",
    )

    # 15. PAY-002: Payment to Prime Imports ₹50,000
    build_payment_receipt_voucher(
        db, c.id, admin_user.id, "payment", "PAY-2025-0002", "2025-06-08",
        amount=50000, party_ledger_id=p4_ledger.id,
        cash_bank_ledger_id=bank_ledger.id, party_id=p_prime.id,
        narration="Payment to Prime Imports",
        reference="NEFT-20250608-001",
    )

    # 16. JRN-002: Depreciation (cost centre: General Admin)
    build_journal_voucher(
        db, c.id, admin_user.id, "JRN-2025-0002", "2025-06-12",
        lines_data=[
            {"ledger_id": cash_ledger.id, "debit": 12000, "credit": 0,
             "cost_centre_id": cen_admin.id},
            {"ledger_id": bank_ledger.id, "debit": 0, "credit": 12000},
        ],
        narration="Depreciation on office equipment for Q1 FY 2025-26",
    )

    # 17. INV-0005: Sales (late FY entry)
    #     Ball Pens: 20 Box @ ₹120
    build_sales_voucher(
        db, c.id, admin_user.id, "INV-2025-0005", "2025-06-15",
        items=[{"stock_item_id": si_pen.id, "qty": 20, "rate": 120}],
        party_id=p_citymart.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Sale of ball pens to City Mart",
        reference="INV-CITY-2025-003",
        due_date="2025-07-15",
    )

    # 18. PUR-004: Purchase (late FY entry)
    #     A4 Paper: 50 Box @ ₹250
    build_purchase_voucher(
        db, c.id, admin_user.id, "PUR-2025-0004", "2025-06-18",
        items=[{"stock_item_id": si_paper.id, "qty": 50, "rate": 250}],
        party_id=p_global.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Purchase of A4 paper from Global Distributors",
        reference="PO-GL-2025-003",
        due_date="2025-07-18",
    )

    # ── E-Invoice records (for posted sales with stock items) ──
    print("  Creating e-invoice records...")
    sales_vouchers = db.query(Voucher).filter(
        Voucher.company_id == c.id,
        Voucher.voucher_type == "sales",
    ).all()
    gst_reg = db.query(GstRegistration).filter(
        GstRegistration.company_id == c.id
    ).first()
    for sv in sales_vouchers:
        db.add(EInvoice(
            company_id=c.id, voucher_id=sv.id, gstin_id=gst_reg.id,
            status="draft",
        ))

    # ── Payment allocations (link receipts/payments to invoices) ──
    print("  Creating payment allocations...")
    # RECP-2025-0001: ₹50,000 from Royal Emporium → allocated to INV-2025-0001
    inv_royal = db.query(Voucher).filter(
        Voucher.company_id == c.id, Voucher.voucher_number == "INV-2025-0001"
    ).first()
    recp_royal = db.query(Voucher).filter(
        Voucher.company_id == c.id, Voucher.voucher_number == "RECP-2025-0001"
    ).first()
    if inv_royal and recp_royal:
        alloc = PaymentAllocation(
            company_id=c.id,
            invoice_voucher_id=inv_royal.id,
            payment_voucher_id=recp_royal.id,
            amount=50000,
            allocation_date="2025-04-25",
            remarks="Partial payment from Royal Emporium",
        )
        db.add(alloc)

    # RECP-2025-0002: ₹30,000 from City Mart → allocated to INV-2025-0002
    inv_city = db.query(Voucher).filter(
        Voucher.company_id == c.id, Voucher.voucher_number == "INV-2025-0002"
    ).first()
    recp_city = db.query(Voucher).filter(
        Voucher.company_id == c.id, Voucher.voucher_number == "RECP-2025-0002"
    ).first()
    if inv_city and recp_city:
        alloc = PaymentAllocation(
            company_id=c.id,
            invoice_voucher_id=inv_city.id,
            payment_voucher_id=recp_city.id,
            amount=30000,
            allocation_date="2025-06-05",
            remarks="Partial payment from City Mart",
        )
        db.add(alloc)

    # PAY-2025-0001: ₹40,000 to Global Distributors → allocated to PUR-2025-0001
    pur_global = db.query(Voucher).filter(
        Voucher.company_id == c.id, Voucher.voucher_number == "PUR-2025-0001"
    ).first()
    pay_global = db.query(Voucher).filter(
        Voucher.company_id == c.id, Voucher.voucher_number == "PAY-2025-0001"
    ).first()
    if pur_global and pay_global:
        alloc = PaymentAllocation(
            company_id=c.id,
            invoice_voucher_id=pur_global.id,
            payment_voucher_id=pay_global.id,
            amount=40000,
            allocation_date="2025-04-28",
            remarks="Partial payment to Global Distributors",
        )
        db.add(alloc)

    # PAY-2025-0002: ₹50,000 to Prime Imports → allocated to PUR-2025-0002
    pur_prime = db.query(Voucher).filter(
        Voucher.company_id == c.id, Voucher.voucher_number == "PUR-2025-0002"
    ).first()
    pay_prime = db.query(Voucher).filter(
        Voucher.company_id == c.id, Voucher.voucher_number == "PAY-2025-0002"
    ).first()
    if pur_prime and pay_prime:
        alloc = PaymentAllocation(
            company_id=c.id,
            invoice_voucher_id=pur_prime.id,
            payment_voucher_id=pay_prime.id,
            amount=50000,
            allocation_date="2025-06-08",
            remarks="Partial payment to Prime Imports",
        )
        db.add(alloc)

    db.commit()
    print(f"  Company '{c.name}' created.")
    print(f"    Vouchers: {db.query(Voucher).filter(Voucher.company_id == c.id).count()}")
    print(f"    Parties: {db.query(Party).filter(Party.company_id == c.id).count()}")
    print(f"    Stock Items: {db.query(StockItem).filter(StockItem.company_id == c.id).count()}")
    print(f"    Cost Centres: {db.query(CostCentre).filter(CostCentre.company_id == c.id).count()}")
    print(f"    Units: {db.query(Unit).filter(Unit.company_id == c.id).count()}")
    print(f"    E-Invoices: {db.query(EInvoice).filter(EInvoice.company_id == c.id).count()}")
    return c


# ─── Main ─────────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 60)
    print("ZLedger Demo Data Seeder")
    print("=" * 60)

    db = SessionLocal()
    try:
        Base.metadata.create_all(bind=engine)

        admin = db.query(User).filter(User.email == "admin@zledger.com").first()
        if not admin:
            print("ERROR: admin@zledger.com not found. Bootstrap the app first.")
            sys.exit(1)
        print(f"Admin: {admin.email} (id={admin.id[:8]}...)")

        truncate_all(db)
        c = seed_all_data(db, admin)

        tv = db.query(Voucher).count()
        tl = db.query(VoucherLine).count()
        tp = db.query(Party).count()
        ti = db.query(StockItem).count()
        tg = db.query(Ledger).count()

        print("\n" + "=" * 60)
        print("SEED COMPLETE")
        print("=" * 60)
        print(f"  Company:      {c.name}")
        print(f"  GSTIN:        {c.gstin}")
        print(f"  Vouchers:     {tv}")
        print(f"  Lines:        {tl}")
        print(f"  Parties:      {tp}")
        print(f"  Stock Items:  {ti}")
        print(f"  Ledgers:      {tg}")
        print(f"\nLogin: admin@zledger.com / admin12345")

    except Exception as e:
        db.rollback()
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
