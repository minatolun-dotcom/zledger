#!/usr/bin/env python3
"""Seed comprehensive demo data for ZLedger: 3 companies with full feature coverage.

Company 1: Apex Enterprises (Maharashtra, regular GST, IT/general trading)
Company 2: GreenLeaf Organics (Karnataka, composition scheme, organic foods)
Company 3: BuildRight Construction (Gujarat, regular GST, TDS heavy, construction)

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
    AccountGroup, FinancialYear, Ledger, Party, GstRegistration, GstReturn, HsnSac,
)
from app.models.stock import StockGroup, StockItem, StockEntry, StockBalance
from app.models.voucher import Voucher, VoucherLine, PaymentAllocation, RecurringTemplate
from app.models.masters import Unit, CostCentre, CostCategory
from app.models.einvoice import EInvoice
from app.models.eway_bill import EwayBill
from app.models.tds_tcs import TdsTcsSection, TdsTcsEntry, TdsTcsReturn
from app.models.bank_reconciliation import BankStatementLine, BankReconciliation
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


# ─── Wipe ───────────────────────────────────────────────────────────────────

def truncate_all(db: Session) -> None:
    print("Wiping all data (keeping admin user)...")
    admin = db.query(User).filter(User.email == "admin@zledger.com").first()
    admin_id = admin.id if admin else None

    tables = [
        "audit_logs", "document_attachments",
        "payment_allocations", "recurring_templates",
        "tds_tcs_returns", "tds_tcs_entries", "tds_tcs_sections",
        "eway_bills", "e_invoices",
        "bank_statement_lines", "bank_reconciliations",
        "stock_balances", "stock_entries", "stock_items", "stock_groups",
        "voucher_lines", "vouchers",
        "gst_challans", "gst_returns", "gst_registrations", "hsn_sac",
        "parties", "units", "cost_centres", "cost_categories",
        "financial_years", "ledgers", "account_groups",
        "import_jobs",
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


# ─── Factories ──────────────────────────────────────────────────────────────

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


def create_fy(db: Session, company_id: str, name: str, start: str, end: str,
              is_closed: bool = False) -> FinancialYear:
    fy = FinancialYear(company_id=company_id, name=name, start_date=start,
                       end_date=end, is_closed=is_closed)
    db.add(fy)
    db.flush()
    return fy


def create_ledger(db: Session, company_id: str, name: str, group_name: str,
                  opening: float = 0, opening_type: str = "Dr",
                  system_code: str | None = None, gstin: str | None = None,
                  is_protected: bool = False) -> Ledger:
    grp = find_group(db, company_id, group_name)
    if not grp:
        raise ValueError(f"Group '{group_name}' not found for company {company_id}")
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
    p = Party(company_id=company_id, name=name, party_type=party_type,
              ledger_id=ledger_id, gstin=gstin, state_code=state_code, pan=pan,
              address=address, contact_person=contact, phone=phone, email=email)
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
    si = StockItem(company_id=company_id, name=name, stock_group_id=group_id,
                   hsn_sac_code=hsn, gst_rate=gst_rate, unit_of_measure=uom,
                   opening_qty=opening_qty, opening_rate=opening_rate, sku=sku,
                   valuation_method=valuation)
    db.add(si)
    db.flush()
    return si


def create_gst_reg(db: Session, company_id: str, gstin: str, legal_name: str,
                   state_code: str, pan: str | None = None,
                   trade_name: str | None = None,
                   registration_type: str = "regular",
                   composition_rate: float | None = None) -> GstRegistration:
    gr = GstRegistration(
        company_id=company_id, gstin=gstin, legal_name=legal_name,
        trade_name=trade_name, state_code=state_code, pan=pan,
        registration_type=registration_type,
        composition_rate=composition_rate,
    )
    db.add(gr)
    db.flush()
    return gr


def create_tds_section(db: Session, company_id: str, section_code: str,
                       section_name: str, tds_tcs_type: str, rate: float,
                       threshold_limit: float = 0) -> TdsTcsSection:
    sec = TdsTcsSection(
        company_id=company_id, section_code=section_code,
        section_name=section_name, tds_tcs_type=tds_tcs_type,
        rate=rate, threshold_limit=threshold_limit,
    )
    db.add(sec)
    db.flush()
    return sec


def create_bank_statement_line(db: Session, company_id: str, ledger_id: str,
                               transaction_date: str, description: str,
                               debit: float = 0, credit: float = 0,
                               reference: str | None = None) -> BankStatementLine:
    bl = BankStatementLine(
        company_id=company_id, ledger_id=ledger_id,
        transaction_date=transaction_date, description=description,
        debit=debit, credit=credit, reference=reference,
    )
    db.add(bl)
    db.flush()
    return bl


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
        created_by=user_id, due_date=due_date,
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
        party_ledger_fallback(db, company_id, v, party_id, debit=rnd(grand_total))

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
        gst_rate = Decimal(str(item.get("gst_rate_override") or si.gst_rate))
        taxable = qty * rate
        if is_rate_inclusive and gst_rate > 0:
            taxable = Decimal(rnd(Decimal(str(qty * rate)) / (Decimal("1") + gst_rate / Decimal("100"))))
        vl = VoucherLine(
            voucher_id=v.id, ledger_id=sales_ledger.id,
            stock_item_id=si.id, quantity=float(qty), rate=float(rate),
            line_total=rnd(taxable), debit=0, credit=rnd(taxable),
        )
        create_stock_entry(db, company_id, v, vl)

    return v


def party_ledger_fallback(db: Session, company_id: str, v: Voucher, party_id: str | None,
                          debit: float = 0, credit: float = 0) -> None:
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
        party_ledger_fallback(db, company_id, v, party_id, credit=rnd(grand_total))

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
        party_ledger_fallback(db, company_id, v, party_id, credit=rnd(grand_total))

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
        party_ledger_fallback(db, company_id, v, party_id, debit=rnd(grand_total))

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


# ═══════════════════════════════════════════════════════════════════════════
# COMPANY 1: Apex Enterprises (Maharashtra, Regular GST)
# ═══════════════════════════════════════════════════════════════════════════

COMPANY_APEX = dict(
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


def seed_apex(db: Session, admin_user: User) -> Company:
    print("\n=== Creating Company 1: Apex Enterprises ===")
    c = create_company(db, admin_user.id, **COMPANY_APEX)

    # ── Financial Years ──
    fy2425 = create_fy(db, c.id, "2024-25", "2024-04-01", "2025-03-31", is_closed=True)
    fy2526 = create_fy(db, c.id, "2025-26", "2025-04-01", "2026-03-31")
    fy2627 = create_fy(db, c.id, "2026-27", "2026-04-01", "2027-03-31")

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
    debtors_control = create_ledger(db, c.id, "Sundry Debtors", "Sundry Debtors")
    creditors_control = create_ledger(db, c.id, "Sundry Creditors", "Sundry Creditors")

    # ── Cost Categories & Centres ──
    cc_admin = CostCategory(company_id=c.id, name="Administrative",
                            description="Administrative & overhead expenses")
    cc_sales = CostCategory(company_id=c.id, name="Sales & Marketing",
                            description="Sales and marketing expenses")
    db.add(cc_admin); db.add(cc_sales)
    db.flush()

    cen_admin = CostCentre(company_id=c.id, name="General Administration",
                           description="Office admin and management costs")
    cen_warehouse = CostCentre(company_id=c.id, name="Warehouse Operations",
                               description="Warehouse and logistics costs")
    cen_marketing = CostCentre(company_id=c.id, name="Sales & Distribution",
                               description="Sales team and distribution expenses")
    db.add(cen_admin); db.add(cen_warehouse); db.add(cen_marketing)
    db.flush()

    # ── Units ──
    for u in [("Pcs", "Pieces"), ("Box", "Boxes"), ("Kg", "Kilograms"),
              ("Mtr", "Meters"), ("Ltr", "Litres"), ("Pkt", "Packets")]:
        db.add(Unit(company_id=c.id, name=u[0], description=u[1]))
    db.flush()

    # ── Stock Groups ──
    sg_stn = create_stock_group(db, c.id, "Stationery & Office Supplies",
                                "Paper, pens, and office consumables")
    sg_elc = create_stock_group(db, c.id, "Electronics & Accessories",
                                "Computer peripherals and electronic items")
    sg_fnb = create_stock_group(db, c.id, "Packaged Foods & Beverages",
                                "Food and beverage products")

    # ── Stock Items ──
    si_paper = create_stock_item(db, c.id, "A4 Copy Paper 500-sheet", sg_stn.id,
                                 "4802", 5.0, "Box", 200, 220.00, "STN-PAP-A4")
    si_pen = create_stock_item(db, c.id, "Ball Pen Box 10-pcs", sg_stn.id,
                               "9608", 12.0, "Box", 150, 65.00, "STN-PEN-BP10")
    si_stapler = create_stock_item(db, c.id, "Stapler Medium", sg_stn.id,
                                   "8472", 12.0, "Pcs", 80, 95.00, "STN-STP-MED")
    si_usb = create_stock_item(db, c.id, "USB Flash Drive 32GB", sg_elc.id,
                               "8471", 18.0, "Pcs", 100, 350.00, "ELC-USB-32G")
    si_mouse = create_stock_item(db, c.id, "Wireless Mouse", sg_elc.id,
                                 "8471", 18.0, "Pcs", 60, 420.00, "ELC-MOU-WL")
    si_choco = create_stock_item(db, c.id, "Dark Chocolate Box 500g", sg_fnb.id,
                                 "1806", 18.0, "Box", 80, 280.00, "FNB-CHO-D500")
    si_tea = create_stock_item(db, c.id, "Green Tea Packet 200g", sg_fnb.id,
                               "0902", 5.0, "Pkt", 200, 85.00, "FNB-TEA-G200")

    # ── Parties ──
    p1_ledger = create_ledger(db, c.id, "Royal Emporium - Receivable",
                              "Sundry Debtors", opening=125000.00, opening_type="Dr")
    p2_ledger = create_ledger(db, c.id, "City Mart - Receivable",
                              "Sundry Debtors", opening=87500.00, opening_type="Dr")
    p3_ledger = create_ledger(db, c.id, "Global Distributors - Payable",
                              "Sundry Creditors", opening=210000.00, opening_type="Cr")
    p4_ledger = create_ledger(db, c.id, "Prime Imports - Payable",
                              "Sundry Creditors", opening=64000.00, opening_type="Cr")
    p5_ledger = create_ledger(db, c.id, "Metro Retail - Receivable",
                              "Sundry Debtors", opening=43000.00, opening_type="Dr")

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

    # ═══════════════════════════════════════════════════════
    # FY 2024-25 (Closed)
    # ═══════════════════════════════════════════════════════
    fy24_prefix = "2024"
    print("  FY 2024-25 vouchers...")

    # Opening Balance
    build_opening_journal(db, c.id, admin_user.id, "2024-25", [
        {"ledger_id": cash_ledger.id, "debit": 30000, "credit": 0},
        {"ledger_id": bank_ledger.id, "debit": 300000, "credit": 0},
        {"ledger_id": capital.id, "debit": 0, "credit": 330000},
    ])

    # PUR-001: Purchase from Global (A4 Paper: 50 @ ₹230, 5%)
    build_purchase_voucher(db, c.id, admin_user.id, f"PUR-{fy24_prefix}-0001",
        "2024-05-10",
        items=[{"stock_item_id": si_paper.id, "qty": 50, "rate": 230}],
        party_id=p_global.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Purchase of A4 paper from Global Distributors",
        due_date="2024-06-10")

    # INV-001: Sale to Royal (inter-state, A4 Paper: 20 @ ₹320)
    build_sales_voucher(db, c.id, admin_user.id, f"INV-{fy24_prefix}-0001",
        "2024-05-15",
        items=[{"stock_item_id": si_paper.id, "qty": 20, "rate": 320}],
        party_id=p_royal.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="24",
        narration="Sale of A4 paper to Royal Emporium (inter-state)",
        due_date="2024-06-15")

    # INV-002: Sale to City Mart (intra-state, Staplers: 25 @ ₹110, Pens: 30 @ ₹95)
    build_sales_voucher(db, c.id, admin_user.id, f"INV-{fy24_prefix}-0002",
        "2024-06-01",
        items=[{"stock_item_id": si_stapler.id, "qty": 25, "rate": 110},
               {"stock_item_id": si_pen.id, "qty": 30, "rate": 95}],
        party_id=p_citymart.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Sale of stationery to City Mart",
        due_date="2024-07-01")

    # PUR-002: Purchase from Prime (inter-state, USB: 30 @ ₹300, Mouse: 20 @ ₹250)
    build_purchase_voucher(db, c.id, admin_user.id, f"PUR-{fy24_prefix}-0002",
        "2024-06-10",
        items=[{"stock_item_id": si_usb.id, "qty": 30, "rate": 300},
               {"stock_item_id": si_mouse.id, "qty": 20, "rate": 250}],
        party_id=p_prime.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="29",
        narration="Purchase of electronics from Prime Imports",
        due_date="2024-07-10")

    # PAY-001: Payment to Global ₹25,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        f"PAY-{fy24_prefix}-0001", "2024-06-20",
        amount=25000, party_ledger_id=p3_ledger.id,
        cash_bank_ledger_id=bank_ledger.id, party_id=p_global.id,
        narration="Payment to Global Distributors")

    # RECP-001: Receipt from Royal ₹30,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        f"RECP-{fy24_prefix}-0001", "2024-07-05",
        amount=30000, party_ledger_id=p1_ledger.id,
        cash_bank_ledger_id=bank_ledger.id, party_id=p_royal.id,
        narration="Payment received from Royal Emporium")

    # CONTRA-001: Bank to Cash ₹15,000
    build_contra_voucher(db, c.id, admin_user.id, f"CONTRA-{fy24_prefix}-0001",
        "2024-07-10", from_ledger_id=bank_ledger.id, to_ledger_id=cash_ledger.id,
        amount=15000, narration="Cash withdrawal for office expenses")

    # JRN-001: Salary expenses
    build_journal_voucher(db, c.id, admin_user.id, f"JRN-{fy24_prefix}-0001",
        "2024-07-15",
        lines_data=[{"ledger_id": cash_ledger.id, "debit": 55000, "credit": 0,
                     "cost_centre_id": cen_admin.id},
                    {"ledger_id": cash_ledger.id, "debit": 25000, "credit": 0,
                     "cost_centre_id": cen_warehouse.id},
                    {"ledger_id": bank_ledger.id, "debit": 0, "credit": 80000}],
        narration="Salary disbursement for July 2024")

    # ═══════════════════════════════════════════════════════
    # FY 2025-26 (Current) — All existing vouchers preserved
    # ═══════════════════════════════════════════════════════
    print("  FY 2025-26 vouchers...")

    # Opening Balance (carried forward from FY 2024-25)
    build_opening_journal(db, c.id, admin_user.id, "2025-26", [
        {"ledger_id": cash_ledger.id, "debit": 50000, "credit": 0},
        {"ledger_id": bank_ledger.id, "debit": 500000, "credit": 0},
        {"ledger_id": p1_ledger.id, "debit": 75000, "credit": 0},
        {"ledger_id": p2_ledger.id, "debit": 45000, "credit": 0},
        {"ledger_id": p3_ledger.id, "debit": 0, "credit": 65000},
        {"ledger_id": p4_ledger.id, "debit": 0, "credit": 85000},
        {"ledger_id": capital.id, "debit": 0, "credit": 520000},
    ])

    # 1. PUR-0001: Purchase from Global (intra-state)
    build_purchase_voucher(db, c.id, admin_user.id, "PUR-2025-0001", "2025-04-05",
        items=[{"stock_item_id": si_paper.id, "qty": 100, "rate": 250},
               {"stock_item_id": si_pen.id, "qty": 50, "rate": 80}],
        party_id=p_global.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Purchase of stationery from Global Distributors",
        reference="PO-GL-2025-001", due_date="2025-05-05")

    # 2. INV-0001: Sales to Royal Emporium (inter-state, IGST)
    build_sales_voucher(db, c.id, admin_user.id, "INV-2025-0001", "2025-04-10",
        items=[{"stock_item_id": si_paper.id, "qty": 30, "rate": 350},
               {"stock_item_id": si_mouse.id, "qty": 20, "rate": 450},
               {"stock_item_id": si_usb.id, "qty": 25, "rate": 600}],
        party_id=p_royal.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="24",
        narration="Sale of stationery and electronics to Royal Emporium (inter-state)",
        reference="INV-ROY-2025-001", due_date="2025-05-10")

    # 3. INV-0002: Sales to City Mart (intra-state, CGST+SGST)
    build_sales_voucher(db, c.id, admin_user.id, "INV-2025-0002", "2025-04-15",
        items=[{"stock_item_id": si_choco.id, "qty": 40, "rate": 300},
               {"stock_item_id": si_tea.id, "qty": 50, "rate": 180},
               {"stock_item_id": si_stapler.id, "qty": 30, "rate": 120}],
        party_id=p_citymart.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Sale of chocolates, tea, and staplers to City Mart",
        reference="INV-CITY-2025-001", due_date="2025-05-15")

    # 4. PUR-0002: Purchase from Prime Imports (inter-state, IGST)
    build_purchase_voucher(db, c.id, admin_user.id, "PUR-2025-0002", "2025-04-20",
        items=[{"stock_item_id": si_usb.id, "qty": 50, "rate": 350},
               {"stock_item_id": si_mouse.id, "qty": 30, "rate": 280}],
        party_id=p_prime.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="29",
        narration="Purchase of electronics from Prime Imports (inter-state)",
        reference="PO-PRI-2025-001", due_date="2025-05-20")

    # 5. RECP-0001: Receipt from Royal Emporium ₹50,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "RECP-2025-0001", "2025-04-25", amount=50000,
        party_ledger_id=p1_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_royal.id, narration="Payment received from Royal Emporium")

    # 6. PAY-0001: Payment to Global Distributors ₹40,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "PAY-2025-0001", "2025-04-28", amount=40000,
        party_ledger_id=p3_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_global.id, narration="Payment to Global Distributors")

    # 7. CONTRA-0001: Bank to Cash ₹20,000
    build_contra_voucher(db, c.id, admin_user.id, "CONTRA-2025-0001", "2025-05-01",
        from_ledger_id=bank_ledger.id, to_ledger_id=cash_ledger.id,
        amount=20000, narration="Withdrawal for office cash expenses")

    # 8. INV-0003: Sales to City Mart (tax-inclusive chocolates)
    build_sales_voucher(db, c.id, admin_user.id, "INV-2025-0003", "2025-05-05",
        items=[{"stock_item_id": si_choco.id, "qty": 20, "rate": 295,
                "gst_rate_override": 18}],
        party_id=p_citymart.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Sale of chocolates to City Mart (tax-inclusive)",
        reference="INV-CITY-2025-002", due_date="2025-06-05",
        is_rate_inclusive=True)

    # 9. JRN-0001: Salary & Rent (with cost centres)
    build_journal_voucher(db, c.id, admin_user.id, "JRN-2025-0001", "2025-05-10",
        lines_data=[
            {"ledger_id": cash_ledger.id, "debit": 15000, "credit": 0,
             "cost_centre_id": cen_admin.id},
            {"ledger_id": cash_ledger.id, "debit": 10000, "credit": 0,
             "cost_centre_id": cen_warehouse.id},
            {"ledger_id": bank_ledger.id, "debit": 0, "credit": 25000}],
        narration="Salary & rent allocation for May 2025")

    # 10. PUR-0003: Purchase from Global (tea + chocolates)
    build_purchase_voucher(db, c.id, admin_user.id, "PUR-2025-0003", "2025-05-15",
        items=[{"stock_item_id": si_tea.id, "qty": 100, "rate": 80},
               {"stock_item_id": si_choco.id, "qty": 30, "rate": 180}],
        party_id=p_global.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Purchase of tea and chocolates from Global Distributors",
        due_date="2025-06-15")

    # 11. CN-0001: Credit Note to City Mart
    build_credit_note_voucher(db, c.id, admin_user.id, "CN-2025-0001", "2025-05-20",
        items=[{"stock_item_id": si_choco.id, "qty": 5, "rate": 300}],
        party_id=p_citymart.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Credit note - damaged chocolates returned by City Mart",
        reference="CN-CITY-2025-001")

    # 12. DN-0001: Debit Note to Prime Imports
    build_debit_note_voucher(db, c.id, admin_user.id, "DN-2025-0001", "2025-05-25",
        items=[{"stock_item_id": si_usb.id, "qty": 5, "rate": 350}],
        party_id=p_prime.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="29",
        narration="Debit note - damaged USB drives returned to Prime Imports",
        reference="DN-PRI-2025-001")

    # 13. INV-0004: Cash sale to Metro Retail
    build_sales_voucher(db, c.id, admin_user.id, "INV-2025-0004", "2025-06-01",
        items=[{"stock_item_id": si_paper.id, "qty": 10, "rate": 350},
               {"stock_item_id": si_stapler.id, "qty": 15, "rate": 120}],
        party_id=p_metro.id, cash_bank_ledger_id=cash_ledger.id,
        company_state="27", party_state="27",
        narration="Cash sale of stationery to Metro Retail",
        reference="INV-METRO-2025-001", due_date="2025-07-01")

    # 14. RECP-0002: Receipt from City Mart ₹30,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "RECP-2025-0002", "2025-06-05", amount=30000,
        party_ledger_id=p2_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_citymart.id, narration="Payment received from City Mart")

    # 15. PAY-0002: Payment to Prime Imports ₹50,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "PAY-2025-0002", "2025-06-08", amount=50000,
        party_ledger_id=p4_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_prime.id, narration="Payment to Prime Imports")

    # 16. JRN-0002: Depreciation
    build_journal_voucher(db, c.id, admin_user.id, "JRN-2025-0002", "2025-06-12",
        lines_data=[
            {"ledger_id": cash_ledger.id, "debit": 12000, "credit": 0,
             "cost_centre_id": cen_admin.id},
            {"ledger_id": bank_ledger.id, "debit": 0, "credit": 12000}],
        narration="Depreciation on office equipment for Q1 FY 2025-26")

    # 17. INV-0005: Late FY sale
    build_sales_voucher(db, c.id, admin_user.id, "INV-2025-0005", "2025-06-15",
        items=[{"stock_item_id": si_pen.id, "qty": 20, "rate": 120}],
        party_id=p_citymart.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Sale of ball pens to City Mart",
        reference="INV-CITY-2025-003", due_date="2025-07-15")

    # 18. PUR-0004: Late FY purchase
    build_purchase_voucher(db, c.id, admin_user.id, "PUR-2025-0004", "2025-06-18",
        items=[{"stock_item_id": si_paper.id, "qty": 50, "rate": 250}],
        party_id=p_global.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Purchase of A4 paper from Global Distributors",
        reference="PO-GL-2025-003", due_date="2025-07-18")

    # ═══════════════════════════════════════════════════════
    # FY 2026-27 (Future — minimal entries)
    # ═══════════════════════════════════════════════════════
    print("  FY 2026-27 vouchers...")
    build_sales_voucher(db, c.id, admin_user.id, "INV-2026-0001", "2026-05-01",
        items=[{"stock_item_id": si_paper.id, "qty": 15, "rate": 360},
               {"stock_item_id": si_mouse.id, "qty": 10, "rate": 480}],
        party_id=p_metro.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Sale to Metro Retail (FY 2026-27)")

    build_purchase_voucher(db, c.id, admin_user.id, "PUR-2026-0001", "2026-05-10",
        items=[{"stock_item_id": si_paper.id, "qty": 60, "rate": 260},
               {"stock_item_id": si_pen.id, "qty": 40, "rate": 70}],
        party_id=p_global.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Purchase of stationery (FY 2026-27)")

    # ── E-Invoice records ──
    print("  Creating e-invoice records...")
    gst_reg = db.query(GstRegistration).filter(
        GstRegistration.company_id == c.id).first()
    sales_vouchers = db.query(Voucher).filter(
        Voucher.company_id == c.id, Voucher.voucher_type == "sales").all()
    for sv in sales_vouchers:
        db.add(EInvoice(company_id=c.id, voucher_id=sv.id, gstin_id=gst_reg.id,
                        status="draft"))

    # ── Payment Allocations ──
    _make_apex_allocations(db, c.id)

    # ── TDS/TCS Sections ──
    print("  Creating TDS/TCS sections...")
    create_tds_section(db, c.id, "194C", "Contractor Payments", "tds", 2.0, 30000)
    create_tds_section(db, c.id, "194J", "Professional Fees", "tds", 10.0, 30000)
    create_tds_section(db, c.id, "194I", "Rent", "tds", 10.0, 240000)
    create_tds_section(db, c.id, "206C(1)", "Sale of Scrap", "tcs", 1.0, 0)

    # ── Recurring Template ──
    print("  Creating recurring template...")
    db.add(RecurringTemplate(
        company_id=c.id, name="Monthly Rent Payment",
        voucher_type="payment", frequency="monthly",
        next_run_date="2026-08-01", is_active=True,
        template_payload={"narration": "Monthly office rent",
                          "lines": [{"ledger_name": "Cash", "debit": 45000, "credit": 0},
                                    {"ledger_name": "HDFC Bank - Current A/c", "debit": 0, "credit": 45000}]},
        created_by=admin_user.id))

    # ── Bank statement lines ──
    print("  Creating bank statement lines...")
    create_bank_statement_line(db, c.id, bank_ledger.id, "2025-04-02",
                               "Salary transfer", credit=80000, reference="SAL-APR")
    create_bank_statement_line(db, c.id, bank_ledger.id, "2025-04-06",
                               "Payment to Global Distributors", credit=40000,
                               reference="NEFT-20250428-001")
    create_bank_statement_line(db, c.id, bank_ledger.id, "2025-04-26",
                               "Receipt from Royal Emporium", debit=50000,
                               reference="NEFT-20250425-001")
    create_bank_statement_line(db, c.id, bank_ledger.id, "2025-05-02",
                               "Cash withdrawal", credit=20000)

    db.commit()
    _log_counts(db, c)
    return c


def _make_apex_allocations(db: Session, cid: str) -> None:
    """Create payment allocation records for Apex Enterprises."""
    inv_royal = db.query(Voucher).filter(
        Voucher.company_id == cid, Voucher.voucher_number == "INV-2025-0001").first()
    recp_royal = db.query(Voucher).filter(
        Voucher.company_id == cid, Voucher.voucher_number == "RECP-2025-0001").first()
    if inv_royal and recp_royal:
        db.add(PaymentAllocation(company_id=cid, invoice_voucher_id=inv_royal.id,
                payment_voucher_id=recp_royal.id, amount=50000,
                allocation_date="2025-04-25",
                remarks="Partial payment from Royal Emporium"))

    inv_city = db.query(Voucher).filter(
        Voucher.company_id == cid, Voucher.voucher_number == "INV-2025-0002").first()
    recp_city = db.query(Voucher).filter(
        Voucher.company_id == cid, Voucher.voucher_number == "RECP-2025-0002").first()
    if inv_city and recp_city:
        db.add(PaymentAllocation(company_id=cid, invoice_voucher_id=inv_city.id,
                payment_voucher_id=recp_city.id, amount=30000,
                allocation_date="2025-06-05",
                remarks="Partial payment from City Mart"))

    pur_global = db.query(Voucher).filter(
        Voucher.company_id == cid, Voucher.voucher_number == "PUR-2025-0001").first()
    pay_global = db.query(Voucher).filter(
        Voucher.company_id == cid, Voucher.voucher_number == "PAY-2025-0001").first()
    if pur_global and pay_global:
        db.add(PaymentAllocation(company_id=cid, invoice_voucher_id=pur_global.id,
                payment_voucher_id=pay_global.id, amount=40000,
                allocation_date="2025-04-28",
                remarks="Partial payment to Global Distributors"))

    pur_prime = db.query(Voucher).filter(
        Voucher.company_id == cid, Voucher.voucher_number == "PUR-2025-0002").first()
    pay_prime = db.query(Voucher).filter(
        Voucher.company_id == cid, Voucher.voucher_number == "PAY-2025-0002").first()
    if pur_prime and pay_prime:
        db.add(PaymentAllocation(company_id=cid, invoice_voucher_id=pur_prime.id,
                payment_voucher_id=pay_prime.id, amount=50000,
                allocation_date="2025-06-08",
                remarks="Partial payment to Prime Imports"))


# ═══════════════════════════════════════════════════════════════════════════
# COMPANY 2: GreenLeaf Organics (Karnataka, Composition Scheme)
# ═══════════════════════════════════════════════════════════════════════════

COMPANY_GREENLEAF = dict(
    name="GreenLeaf Organics Pvt Ltd",
    legal_name="GreenLeaf Organics Private Limited",
    gstin="29AABCG5678E1ZP",
    state_code="29",
    pan="AABCG5678E",
    address="42, Eco Park, JP Nagar, Bengaluru 560078",
    phone="080-43456789",
    email="accounts@greenleaforganics.in",
    website="www.greenleaforganics.in",
    bank_name="State Bank of India",
    bank_account_number="11223344556677",
    bank_ifsc="SBIN0001234",
    bank_branch="JP Nagar, Bengaluru",
    books_begin_from="2025-04-01",
    is_composition=True,
)


def seed_greenleaf(db: Session, admin_user: User) -> Company:
    print("\n=== Creating Company 2: GreenLeaf Organics (Composition) ===")
    c = create_company(db, admin_user.id, **COMPANY_GREENLEAF)

    # ── Financial Years ──
    fy2526 = create_fy(db, c.id, "2025-26", "2025-04-01", "2026-03-31")
    fy2627 = create_fy(db, c.id, "2026-27", "2026-04-01", "2027-03-31")

    # ── GST Registration (composition) ──
    create_gst_reg(db, c.id, "29AABCG5678E1ZP", "GreenLeaf Organics Private Limited",
                   "29", "AABCG5678E", "GreenLeaf Organics",
                   registration_type="composition", composition_rate=1.0)

    # ── Customize ledgers ──
    bank = find_ledger(db, c.id, "Bank Account")
    if bank:
        bank.name = "SBI Current Account"
        bank.opening_balance = 200000.00
        bank.opening_balance_type = "Dr"
    cash = find_ledger(db, c.id, "Cash")
    if cash:
        cash.opening_balance = 25000.00
        cash.opening_balance_type = "Dr"

    # ── Control Ledgers ──
    debtors_control = create_ledger(db, c.id, "Sundry Debtors", "Sundry Debtors")
    creditors_control = create_ledger(db, c.id, "Sundry Creditors", "Sundry Creditors")

    # ── Cost Centres ──
    cen_pack = CostCentre(company_id=c.id, name="Packaging & Labeling",
                          description="Packaging and labeling costs")
    cen_logistics = CostCentre(company_id=c.id, name="Logistics & Delivery",
                               description="Transport and delivery costs")
    db.add(cen_pack); db.add(cen_logistics); db.flush()

    # ── Units ──
    for u in [("Kg", "Kilograms"), ("Pkt", "Packets"), ("Ltr", "Litres"),
              ("Btl", "Bottles"), ("Jar", "Jars")]:
        db.add(Unit(company_id=c.id, name=u[0], description=u[1]))
    db.flush()

    # ── Stock Groups ──
    sg_grains = create_stock_group(db, c.id, "Organic Grains & Pulses",
                                   "Organic rice, dal, and grains")
    sg_spices = create_stock_group(db, c.id, "Organic Spices",
                                   "Organic spice powders")
    sg_beverages = create_stock_group(db, c.id, "Organic Beverages",
                                      "Organic teas, juices, and drinks")

    # ── Stock Items ──
    si_rice = create_stock_item(db, c.id, "Organic Basmati Rice 1kg", sg_grains.id,
                                "1006", 5.0, "Kg", 500, 120.00, "GRN-RIC-BAS")
    si_dal = create_stock_item(db, c.id, "Organic Moong Dal 500g", sg_grains.id,
                               "0713", 5.0, "Pkt", 300, 65.00, "GRN-DAL-MOO")
    si_turmeric = create_stock_item(db, c.id, "Organic Turmeric Powder 100g", sg_spices.id,
                                    "0910", 5.0, "Pkt", 400, 45.00, "GRN-SPC-TUR")
    si_tea = create_stock_item(db, c.id, "Organic Green Tea 50 bags", sg_beverages.id,
                               "0902", 5.0, "Pkt", 250, 95.00, "GRN-BEV-GTE")
    si_honey = create_stock_item(db, c.id, "Organic Forest Honey 500g", sg_beverages.id,
                                 "0409", 5.0, "Btl", 150, 280.00, "GRN-BEV-HON")
    si_almonds = create_stock_item(db, c.id, "Organic Almonds 200g", sg_grains.id,
                                   "0802", 5.0, "Pkt", 200, 180.00, "GRN-GRN-ALM")

    # ── Parties ──
    p1_ledger = create_ledger(db, c.id, "Nature's Basket - Receivable",
                              "Sundry Debtors", opening=85000.00, opening_type="Dr")
    p2_ledger = create_ledger(db, c.id, "HealthFirst Retail - Receivable",
                              "Sundry Debtors", opening=45000.00, opening_type="Dr")
    p3_ledger = create_ledger(db, c.id, "OrganicCollective - Payable",
                              "Sundry Creditors", opening=62000.00, opening_type="Cr")
    p4_ledger = create_ledger(db, c.id, "FarmFresh Karnataka - Payable",
                              "Sundry Creditors", opening=38000.00, opening_type="Cr")

    p_nature = create_party(db, c.id, "Nature's Basket", "customer",
                            ledger_id=p1_ledger.id, gstin="29AABCN1234A1Z2",
                            state_code="29", pan="AABCN1234A",
                            address="Nature's Basket, MG Road, Bengaluru",
                            contact="Anita Kumar", phone="080-25678901",
                            email="anita@naturesbasket.in")
    p_health = create_party(db, c.id, "HealthFirst Retail", "customer",
                            ledger_id=p2_ledger.id, gstin="29AABCH5678A1Z9",
                            state_code="29", pan="AABCH5678A",
                            address="HealthFirst, Mall of Mysore, Mysuru",
                            contact="Vikram Rao", phone="0821-2345678",
                            email="vikram@healthfirst.in")
    p_organic = create_party(db, c.id, "OrganicCollective", "supplier",
                             ledger_id=p3_ledger.id, gstin="29AABCO9012A1Z5",
                             state_code="29", pan="AABCO9012A",
                             address="Organic Collective, Whitefield, Bengaluru",
                             contact="Deepa Sharma", phone="080-29876543",
                             email="deepa@organiccollective.in")
    p_farm = create_party(db, c.id, "FarmFresh Karnataka", "supplier",
                          ledger_id=p4_ledger.id, gstin="29AABCF3456A1Z7",
                          state_code="29", pan="AABCF3456A",
                          address="FarmFresh, Bidadi, Ramanagara District",
                          contact="Gopal Reddy", phone="080-27890123",
                          email="gopal@farmfresh.in")
    db.flush()

    bank_ledger = find_ledger(db, c.id, "SBI Current Account")
    cash_ledger = find_ledger(db, c.id, "Cash")
    capital = find_ledger(db, c.id, "Capital Account")

    # ── Opening Balance ──
    build_opening_journal(db, c.id, admin_user.id, "2025-26", [
        {"ledger_id": cash_ledger.id, "debit": 25000, "credit": 0},
        {"ledger_id": bank_ledger.id, "debit": 200000, "credit": 0},
        {"ledger_id": p1_ledger.id, "debit": 85000, "credit": 0},
        {"ledger_id": p2_ledger.id, "debit": 45000, "credit": 0},
        {"ledger_id": p3_ledger.id, "debit": 0, "credit": 62000},
        {"ledger_id": p4_ledger.id, "debit": 0, "credit": 38000},
        {"ledger_id": capital.id, "debit": 0, "credit": 255000},
    ])

    # ── Vouchers (FY 2025-26) ──
    print("  Creating composition scheme vouchers...")

    # PUR-001: Purchase from OrganicCollective (intra-state, composition)
    build_purchase_voucher(db, c.id, admin_user.id, "GL-PUR-2025-0001", "2025-05-05",
        items=[{"stock_item_id": si_rice.id, "qty": 100, "rate": 100},
               {"stock_item_id": si_dal.id, "qty": 80, "rate": 50}],
        party_id=p_organic.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Purchase of rice and dal from OrganicCollective")

    # INV-001: Sale to Nature's Basket (composition tax applies)
    build_sales_voucher(db, c.id, admin_user.id, "GL-INV-2025-0001", "2025-05-10",
        items=[{"stock_item_id": si_rice.id, "qty": 30, "rate": 160},
               {"stock_item_id": si_turmeric.id, "qty": 50, "rate": 65},
               {"stock_item_id": si_tea.id, "qty": 40, "rate": 140}],
        party_id=p_nature.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Sale of rice, turmeric, and tea to Nature's Basket",
        due_date="2025-06-10")

    # INV-002: Sale to HealthFirst Retail
    build_sales_voucher(db, c.id, admin_user.id, "GL-INV-2025-0002", "2025-05-20",
        items=[{"stock_item_id": si_honey.id, "qty": 25, "rate": 350},
               {"stock_item_id": si_almonds.id, "qty": 40, "rate": 220}],
        party_id=p_health.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Sale of honey and almonds to HealthFirst Retail",
        due_date="2025-06-20")

    # PUR-002: Purchase from FarmFresh (intra-state)
    build_purchase_voucher(db, c.id, admin_user.id, "GL-PUR-2025-0002", "2025-05-25",
        items=[{"stock_item_id": si_honey.id, "qty": 60, "rate": 220},
               {"stock_item_id": si_almonds.id, "qty": 50, "rate": 140}],
        party_id=p_farm.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Purchase of honey and almonds from FarmFresh Karnataka")

    # RECP-001: Receipt from Nature's Basket ₹40,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "GL-RECP-2025-0001", "2025-06-01", amount=40000,
        party_ledger_id=p1_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_nature.id, narration="Payment from Nature's Basket")

    # PAY-001: Payment to OrganicCollective ₹30,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "GL-PAY-2025-0001", "2025-06-05", amount=30000,
        party_ledger_id=p3_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_organic.id, narration="Payment to OrganicCollective")

    # JRN-001: Packaging expenses
    build_journal_voucher(db, c.id, admin_user.id, "GL-JRN-2025-0001", "2025-06-10",
        lines_data=[
            {"ledger_id": cash_ledger.id, "debit": 8500, "credit": 0,
             "cost_centre_id": cen_pack.id},
            {"ledger_id": bank_ledger.id, "debit": 0, "credit": 8500}],
        narration="Packaging material expenses for June 2025")

    # INV-003: Sale to Nature's Basket (composition, multiple items)
    build_sales_voucher(db, c.id, admin_user.id, "GL-INV-2025-0003", "2025-06-15",
        items=[{"stock_item_id": si_dal.id, "qty": 30, "rate": 85},
               {"stock_item_id": si_honey.id, "qty": 15, "rate": 360}],
        party_id=p_nature.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Sale of dal and honey to Nature's Basket",
        due_date="2025-07-15")

    # CONTRA-001: Bank to Cash
    build_contra_voucher(db, c.id, admin_user.id, "GL-CONTRA-2025-0001", "2025-06-20",
        from_ledger_id=bank_ledger.id, to_ledger_id=cash_ledger.id,
        amount=10000, narration="Cash withdrawal for daily expenses")

    # ── FY 2026-27 minimal entries ──
    print("  FY 2026-27 vouchers...")
    build_sales_voucher(db, c.id, admin_user.id, "GL-INV-2026-0001", "2026-05-10",
        items=[{"stock_item_id": si_rice.id, "qty": 20, "rate": 170},
               {"stock_item_id": si_tea.id, "qty": 30, "rate": 150}],
        party_id=p_health.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Sale to HealthFirst (FY 2026-27)")

    # ── TDS sections ──
    print("  Creating TDS sections...")
    create_tds_section(db, c.id, "194Q", "Purchase of Goods", "tds", 0.1, 5000000)
    create_tds_section(db, c.id, "206C(1H)", "TCS on Sale of Goods", "tcs", 0.1, 5000000)

    db.commit()
    _log_counts(db, c)
    return c


# ═══════════════════════════════════════════════════════════════════════════
# COMPANY 3: BuildRight Construction Co (Gujarat, Regular GST, TDS Heavy)
# ═══════════════════════════════════════════════════════════════════════════

COMPANY_BUILDRIGHT = dict(
    name="BuildRight Construction Co",
    legal_name="BuildRight Construction Company Private Limited",
    gstin="24AABCB7890F1ZR",
    state_code="24",
    pan="AABCB7890F",
    address="15, Commerce House, SG Highway, Ahmedabad 380054",
    phone="079-39876543",
    email="accounts@buildright.in",
    website="www.buildright.in",
    bank_name="Axis Bank",
    bank_account_number="78901234567890",
    bank_ifsc="UTIB0009876",
    bank_branch="SG Highway, Ahmedabad",
    books_begin_from="2024-04-01",
)


def seed_buildright(db: Session, admin_user: User) -> Company:
    print("\n=== Creating Company 3: BuildRight Construction Co (TDS Heavy) ===")
    c = create_company(db, admin_user.id, **COMPANY_BUILDRIGHT)

    fy2425 = create_fy(db, c.id, "2024-25", "2024-04-01", "2025-03-31")
    fy2526 = create_fy(db, c.id, "2025-26", "2025-04-01", "2026-03-31")

    # ── GST Registration ──
    create_gst_reg(db, c.id, "24AABCB7890F1ZR", "BuildRight Construction Company Pvt Ltd",
                   "24", "AABCB7890F", "BuildRight Construction Co")

    # ── Customize ledgers ──
    bank = find_ledger(db, c.id, "Bank Account")
    if bank:
        bank.name = "Axis Bank Business A/c"
        bank.opening_balance = 1200000.00
        bank.opening_balance_type = "Dr"
    cash = find_ledger(db, c.id, "Cash")
    if cash:
        cash.opening_balance = 100000.00
        cash.opening_balance_type = "Dr"

    # ── Control Ledgers ──
    debtors_control = create_ledger(db, c.id, "Sundry Debtors", "Sundry Debtors")
    creditors_control = create_ledger(db, c.id, "Sundry Creditors", "Sundry Creditors")

    # ── Cost Centres ──
    cen_proj1 = CostCentre(company_id=c.id, name="Project Alpha - Residential",
                           description="Residential construction project")
    cen_proj2 = CostCentre(company_id=c.id, name="Project Beta - Commercial",
                           description="Commercial construction project")
    db.add(cen_proj1); db.add(cen_proj2); db.flush()

    # ── Units ──
    for u in [("Kg", "Kilograms"), ("Bag", "Bags"), ("Mtr", "Meters"),
              ("SqFt", "Square Feet"), ("Bucket", "Buckets"), ("Set", "Sets")]:
        db.add(Unit(company_id=c.id, name=u[0], description=u[1]))
    db.flush()

    # ── Stock Groups ──
    sg_cement = create_stock_group(db, c.id, "Cement & Bricks", "Cement, bricks, blocks")
    sg_steel = create_stock_group(db, c.id, "Steel & Metals", "Steel bars, rods, sheets")
    sg_finish = create_stock_group(db, c.id, "Finishing Materials",
                                   "Paint, tiles, plumbing, electrical")

    # ── Stock Items ──
    si_cement = create_stock_item(db, c.id, "Portland Cement 50kg", sg_cement.id,
                                  "2523", 5.0, "Bag", 1000, 350.00, "BLD-CEM-P50")
    si_bricks = create_stock_item(db, c.id, "Red Clay Bricks 1000-pack", sg_cement.id,
                                  "6901", 5.0, "Set", 500, 6500.00, "BLD-CEM-BRK")
    si_tmt = create_stock_item(db, c.id, "TMT Steel Bar 12mm 10m", sg_steel.id,
                               "7214", 18.0, "Mtr", 2000, 75.00, "BLD-STL-TMT")
    si_tiles = create_stock_item(db, c.id, "Ceramic Floor Tiles 60x60cm", sg_finish.id,
                                 "6907", 5.0, "SqFt", 5000, 55.00, "BLD-FIN-TIL")
    si_paint = create_stock_item(db, c.id, "Premium Emulsion Paint 20L", sg_finish.id,
                                 "3208", 18.0, "Bucket", 200, 3200.00, "BLD-FIN-PNT")
    si_wire = create_stock_item(db, c.id, "PVC Insulated Wire 1.5mm 100m", sg_finish.id,
                                "8544", 5.0, "Mtr", 3000, 18.00, "BLD-FIN-WIR")
    si_sand = create_stock_item(db, c.id, "River Sand Fine Grade", sg_cement.id,
                                "2505", 5.0, "Kg", 10000, 1.50, "BLD-CEM-SND")

    # ── Parties ──
    p1_ledger = create_ledger(db, c.id, "Skyline Developers - Receivable",
                              "Sundry Debtors", opening=450000.00, opening_type="Dr")
    p2_ledger = create_ledger(db, c.id, "Gujarat Metro - Receivable",
                              "Sundry Debtors", opening=1200000.00, opening_type="Dr")
    p3_ledger = create_ledger(db, c.id, "Gujarat Cement Ltd - Payable",
                              "Sundry Creditors", opening=280000.00, opening_type="Cr")
    p4_ledger = create_ledger(db, c.id, "SteelMasters India - Payable",
                              "Sundry Creditors", opening=175000.00, opening_type="Cr")
    p5_ledger = create_ledger(db, c.id, "Prime Contractors - Payable",
                              "Sundry Creditors", opening=95000.00, opening_type="Cr")

    p_skyline = create_party(db, c.id, "Skyline Developers", "customer",
                             ledger_id=p1_ledger.id, gstin="24AABCS1234A1Z8",
                             state_code="24", pan="AABCS1234A",
                             address="Skyline, Near Stadium, Ahmedabad",
                             contact="Rahul Mehta", phone="079-25678901",
                             email="rahul@skylinedev.in")
    p_metro = create_party(db, c.id, "Gujarat Metro", "customer",
                           ledger_id=p2_ledger.id, gstin="24AABCM5678A1Z2",
                           state_code="24", pan="AABCM5678A",
                           address="Metro Bhavan, SG Highway, Ahmedabad",
                           contact="Smita Patel", phone="079-23456789",
                           email="smita@gujaratmetro.in")
    p_gujcement = create_party(db, c.id, "Gujarat Cement Ltd", "supplier",
                               ledger_id=p3_ledger.id, gstin="24AABCG9012A1Z4",
                               state_code="24", pan="AABCG9012A",
                               address="Cement House, Bharuch, Gujarat",
                               contact="Dinesh Shah", phone="02642-234567",
                               email="dinesh@gujaratcement.in")
    p_steelmasters = create_party(db, c.id, "SteelMasters India", "supplier",
                                  ledger_id=p4_ledger.id, gstin="27AABCS3456A1Z6",
                                  state_code="27", pan="AABCS3456A",
                                  address="SteelMasters, MIDC, Nagpur",
                                  contact="Rajesh Khanna", phone="0712-2567890",
                                  email="rajesh@steelmasters.in")
    p_contractors = create_party(db, c.id, "Prime Contractors", "supplier",
                                 ledger_id=p5_ledger.id, gstin="24AABCP6789A1Z3",
                                 state_code="24", pan="AABCP6789A",
                                 address="Prime, Nikol, Ahmedabad",
                                 contact="Ketan Desai", phone="079-26789012",
                                 email="ketan@primecontractors.in")
    db.flush()

    bank_ledger = find_ledger(db, c.id, "Axis Bank Business A/c")
    cash_ledger = find_ledger(db, c.id, "Cash")
    capital = find_ledger(db, c.id, "Capital Account")
    disc_allowed = find_ledger(db, c.id, "Discount Allowed")
    disc_received = find_ledger(db, c.id, "Discount Received")

    # ═══════════════════════════════════════════════════════
    # FY 2024-25
    # ═══════════════════════════════════════════════════════
    print("  FY 2024-25 vouchers...")

    # Opening Balance
    build_opening_journal(db, c.id, admin_user.id, "2024-25", [
        {"ledger_id": cash_ledger.id, "debit": 100000, "credit": 0},
        {"ledger_id": bank_ledger.id, "debit": 1200000, "credit": 0},
        {"ledger_id": p1_ledger.id, "debit": 450000, "credit": 0},
        {"ledger_id": p2_ledger.id, "debit": 1200000, "credit": 0},
        {"ledger_id": p3_ledger.id, "debit": 0, "credit": 280000},
        {"ledger_id": p4_ledger.id, "debit": 0, "credit": 175000},
        {"ledger_id": p5_ledger.id, "debit": 0, "credit": 95000},
        {"ledger_id": capital.id, "debit": 0, "credit": 2400000},
    ])

    # PUR-001: Purchase from Gujarat Cement (intra-state)
    build_purchase_voucher(db, c.id, admin_user.id, "BR-PUR-2024-0001", "2024-05-10",
        items=[{"stock_item_id": si_cement.id, "qty": 200, "rate": 330},
               {"stock_item_id": si_sand.id, "qty": 5000, "rate": 1.20}],
        party_id=p_gujcement.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="24", party_state="24",
        narration="Purchase of cement and sand from Gujarat Cement Ltd",
        due_date="2024-06-10")

    # PUR-002: Purchase from SteelMasters (inter-state, Maharashtra → IGST)
    build_purchase_voucher(db, c.id, admin_user.id, "BR-PUR-2024-0002", "2024-05-15",
        items=[{"stock_item_id": si_tmt.id, "qty": 500, "rate": 70}],
        party_id=p_steelmasters.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="24", party_state="27",
        narration="Purchase of TMT steel from SteelMasters India (inter-state)",
        due_date="2024-06-15")

    # INV-001: Sale to Skyline Developers (intra-state)
    build_sales_voucher(db, c.id, admin_user.id, "BR-INV-2024-0001", "2024-05-20",
        items=[{"stock_item_id": si_cement.id, "qty": 100, "rate": 500},
               {"stock_item_id": si_tiles.id, "qty": 2000, "rate": 75},
               {"stock_item_id": si_paint.id, "qty": 30, "rate": 3800}],
        party_id=p_skyline.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="24", party_state="24",
        narration="Supply of materials to Skyline Developers - Project Alpha",
        reference="PO-SKY-001", due_date="2024-07-20")

    # INV-002: Sale to Gujarat Metro (intra-state)
    build_sales_voucher(db, c.id, admin_user.id, "BR-INV-2024-0002", "2024-06-01",
        items=[{"stock_item_id": si_tmt.id, "qty": 200, "rate": 120},
               {"stock_item_id": si_wire.id, "qty": 1000, "rate": 25},
               {"stock_item_id": si_cement.id, "qty": 50, "rate": 500}],
        party_id=p_metro.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="24", party_state="24",
        narration="Supply of construction materials to Gujarat Metro",
        reference="PO-METRO-001", due_date="2024-08-01")

    # PAY-001: Payment to Gujarat Cement ₹100,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "BR-PAY-2024-0001", "2024-06-10", amount=100000,
        party_ledger_id=p3_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_gujcement.id, narration="Payment to Gujarat Cement Ltd")

    # RECP-001: Receipt from Skyline Developers ₹200,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "BR-RECP-2024-0001", "2024-06-15", amount=200000,
        party_ledger_id=p1_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_skyline.id, narration="Advance payment from Skyline Developers")

    # JRN-001: Equipment depreciation
    build_journal_voucher(db, c.id, admin_user.id, "BR-JRN-2024-0001", "2024-06-30",
        lines_data=[
            {"ledger_id": cash_ledger.id, "debit": 45000, "credit": 0,
             "cost_centre_id": cen_proj1.id},
            {"ledger_id": cash_ledger.id, "debit": 35000, "credit": 0,
             "cost_centre_id": cen_proj2.id},
            {"ledger_id": bank_ledger.id, "debit": 0, "credit": 80000}],
        narration="Equipment depreciation for Q1 FY 2024-25")

    # ═══════════════════════════════════════════════════════
    # FY 2025-26
    # ═══════════════════════════════════════════════════════
    print("  FY 2025-26 vouchers...")

    # Opening Balance
    build_opening_journal(db, c.id, admin_user.id, "2025-26", [
        {"ledger_id": cash_ledger.id, "debit": 60000, "credit": 0},
        {"ledger_id": bank_ledger.id, "debit": 900000, "credit": 0},
        {"ledger_id": p1_ledger.id, "debit": 250000, "credit": 0},
        {"ledger_id": p2_ledger.id, "debit": 1200000, "credit": 0},
        {"ledger_id": p3_ledger.id, "debit": 0, "credit": 180000},
        {"ledger_id": p4_ledger.id, "debit": 0, "credit": 175000},
        {"ledger_id": p5_ledger.id, "debit": 0, "credit": 95000},
        {"ledger_id": capital.id, "debit": 0, "credit": 1960000},
    ])

    # INV-003: Sale to Skyline (intra-state)
    build_sales_voucher(db, c.id, admin_user.id, "BR-INV-2025-0001", "2025-05-01",
        items=[{"stock_item_id": si_cement.id, "qty": 80, "rate": 520},
               {"stock_item_id": si_tiles.id, "qty": 1500, "rate": 78},
               {"stock_item_id": si_paint.id, "qty": 20, "rate": 3900}],
        party_id=p_skyline.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="24", party_state="24",
        narration="Supply of materials to Skyline Developers - Phase 2",
        due_date="2025-07-01")

    # INV-004: Sale to Gujarat Metro (intra-state)
    build_sales_voucher(db, c.id, admin_user.id, "BR-INV-2025-0002", "2025-05-15",
        items=[{"stock_item_id": si_tmt.id, "qty": 300, "rate": 125},
               {"stock_item_id": si_bricks.id, "qty": 50, "rate": 7200}],
        party_id=p_metro.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="24", party_state="24",
        narration="Supply of steel and bricks to Gujarat Metro",
        due_date="2025-07-15")

    # PUR-003: Purchase from SteelMasters (inter-state)
    build_purchase_voucher(db, c.id, admin_user.id, "BR-PUR-2025-0001", "2025-05-20",
        items=[{"stock_item_id": si_tmt.id, "qty": 400, "rate": 72}],
        party_id=p_steelmasters.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="24", party_state="27",
        narration="Purchase of TMT steel from SteelMasters",
        due_date="2025-06-20")

    # PAY-002: Payment to SteelMasters ₹100,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "BR-PAY-2025-0001", "2025-06-01", amount=100000,
        party_ledger_id=p4_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_steelmasters.id, narration="Payment to SteelMasters India")

    # RECP-002: Receipt from Gujarat Metro ₹300,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "BR-RECP-2025-0001", "2025-06-10", amount=300000,
        party_ledger_id=p2_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_metro.id, narration="Progress payment from Gujarat Metro")

    # CN-001: Credit Note to Skyline (5 buckets paint returned)
    build_credit_note_voucher(db, c.id, admin_user.id, "BR-CN-2025-0001", "2025-06-15",
        items=[{"stock_item_id": si_paint.id, "qty": 5, "rate": 3800}],
        party_id=p_skyline.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="24", party_state="24",
        narration="Credit note - paint returned by Skyline Developers",
        reference="CN-SKY-001")

    # ── TDS/TCS Sections ──
    print("  Creating TDS/TCS sections...")
    create_tds_section(db, c.id, "194C", "Contractor Payments", "tds", 2.0, 30000)
    create_tds_section(db, c.id, "194I", "Rent Payments", "tds", 10.0, 240000)
    create_tds_section(db, c.id, "194J", "Professional Fees", "tds", 10.0, 30000)
    create_tds_section(db, c.id, "194Q", "Purchase of Goods", "tds", 0.1, 5000000)
    create_tds_section(db, c.id, "206C(1)", "Sale of Scrap", "tcs", 1.0, 0)

    # ── TDS Entries ──
    # Create payment vouchers to Prime Contractors and link TDS entries
    tds_194c = db.query(TdsTcsSection).filter(
        TdsTcsSection.company_id == c.id,
        TdsTcsSection.section_code == "194C").first()
    if tds_194c and p_contractors:
        pay1 = build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
            "BR-PAY-2025-0002", "2025-05-15", amount=500000,
            party_ledger_id=p5_ledger.id, cash_bank_ledger_id=bank_ledger.id,
            party_id=p_contractors.id, narration="TDS payment to Prime Contractors")
        db.add(TdsTcsEntry(
            company_id=c.id, voucher_id=pay1.id, party_id=p_contractors.id,
            section_id=tds_194c.id, tds_tcs_type="tds",
            base_amount=500000, rate=2.0, deducted_amount=10000,
            entry_date="2025-05-15", status="deducted",
        ))
        pay2 = build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
            "BR-PAY-2025-0003", "2025-06-15", amount=350000,
            party_ledger_id=p5_ledger.id, cash_bank_ledger_id=bank_ledger.id,
            party_id=p_contractors.id, narration="TDS payment to Prime Contractors")
        db.add(TdsTcsEntry(
            company_id=c.id, voucher_id=pay2.id, party_id=p_contractors.id,
            section_id=tds_194c.id, tds_tcs_type="tds",
            base_amount=350000, rate=2.0, deducted_amount=7000,
            entry_date="2025-06-15", status="deducted",
        ))

    # ── Bank statement lines ──
    print("  Creating bank statement lines...")
    create_bank_statement_line(db, c.id, bank_ledger.id, "2025-05-02",
                               "Payment to Gujarat Cement", credit=100000,
                               reference="NEFT-PAY-CEM")
    create_bank_statement_line(db, c.id, bank_ledger.id, "2025-05-16",
                               "Receipt from Skyline Developers", debit=200000,
                               reference="NEFT-REC-SKY")
    create_bank_statement_line(db, c.id, bank_ledger.id, "2025-05-22",
                               "Payment to SteelMasters India", credit=100000,
                               reference="NEFT-PAY-STL")
    create_bank_statement_line(db, c.id, bank_ledger.id, "2025-06-11",
                               "Receipt from Gujarat Metro", debit=300000,
                               reference="NEFT-REC-MET")
    create_bank_statement_line(db, c.id, bank_ledger.id, "2025-06-20",
                               "Electricity bill payment", credit=45000)

    # ── E-Invoice records ──
    print("  Creating e-invoice records...")
    gst_reg = db.query(GstRegistration).filter(
        GstRegistration.company_id == c.id).first()
    for sv in db.query(Voucher).filter(
            Voucher.company_id == c.id,
            Voucher.voucher_type == "sales").all():
        db.add(EInvoice(company_id=c.id, voucher_id=sv.id, gstin_id=gst_reg.id,
                        status="draft"))

    # ── E-Way Bill records ──
    print("  Creating e-way bill records...")
    for sv in db.query(Voucher).filter(
            Voucher.company_id == c.id,
            Voucher.voucher_type == "sales").all():
        db.add(EwayBill(
            company_id=c.id, voucher_id=sv.id, gstin_id=gst_reg.id,
            supply_type="O", sub_supply_type="0",
            document_type="INV", status="draft",
        ))

    db.commit()
    _log_counts(db, c)
    return c


# ─── Demo Users ────────────────────────────────────────────────────────────

def create_demo_users(db: Session) -> None:
    print("\n=== Creating demo users ===")
    from app.core.security import hash_password

    users_data = [
        ("Alice Gupta", "alice.gupta@example.com", "alice@12345"),
        ("Bob Patil", "bob.patil@example.com", "bob@12345"),
        ("Carol Singh", "carol.singh@example.com", "carol@12345"),
        ("David Verma", "david.verma@example.com", "david@12345"),
    ]
    user_ids = {}
    for name, email, pwd in users_data:
        if not db.query(User).filter(User.email == email).first():
            u = User(name=name, email=email, hashed_password=hash_password(pwd))
            db.add(u)
            db.flush()
            user_ids[email] = u.id
            print(f"  Created user: {email} ({name})")
        else:
            u = db.query(User).filter(User.email == email).first()
            user_ids[email] = u.id
            print(f"  User exists: {email}")

    # Assign memberships
    companies = db.query(Company).all()
    apex = next((c for c in companies if "Apex" in c.name), None)
    green = next((c for c in companies if "GreenLeaf" in c.name), None)
    build = next((c for c in companies if "BuildRight" in c.name), None)

    if apex and "alice.gupta@example.com" in user_ids:
        if not db.query(CompanyMember).filter(
                CompanyMember.company_id == apex.id,
                CompanyMember.user_id == user_ids["alice.gupta@example.com"]).first():
            db.add(CompanyMember(company_id=apex.id,
                    user_id=user_ids["alice.gupta@example.com"], role="accountant"))
            print("  Alice Gupta → Apex Enterprises (accountant)")

    if green and "bob.patil@example.com" in user_ids:
        if not db.query(CompanyMember).filter(
                CompanyMember.company_id == green.id,
                CompanyMember.user_id == user_ids["bob.patil@example.com"]).first():
            db.add(CompanyMember(company_id=green.id,
                    user_id=user_ids["bob.patil@example.com"], role="accountant"))
            print("  Bob Patil → GreenLeaf Organics (accountant)")

    if build and "carol.singh@example.com" in user_ids:
        if not db.query(CompanyMember).filter(
                CompanyMember.company_id == build.id,
                CompanyMember.user_id == user_ids["carol.singh@example.com"]).first():
            db.add(CompanyMember(company_id=build.id,
                    user_id=user_ids["carol.singh@example.com"], role="viewer"))
            print("  Carol Singh → BuildRight Construction (viewer)")

    if apex and "david.verma@example.com" in user_ids:
        if not db.query(CompanyMember).filter(
                CompanyMember.company_id == apex.id,
                CompanyMember.user_id == user_ids["david.verma@example.com"]).first():
            db.add(CompanyMember(company_id=apex.id,
                    user_id=user_ids["david.verma@example.com"], role="viewer"))
            print("  David Verma → Apex Enterprises (viewer)")

    db.commit()


def _log_counts(db: Session, c: Company) -> None:
    print(f"  Company '{c.name}' created.")
    print(f"    Vouchers: {db.query(Voucher).filter(Voucher.company_id == c.id).count()}")
    print(f"    Parties: {db.query(Party).filter(Party.company_id == c.id).count()}")
    print(f"    Stock Items: {db.query(StockItem).filter(StockItem.company_id == c.id).count()}")
    print(f"    Stock Groups: {db.query(StockGroup).filter(StockGroup.company_id == c.id).count()}")
    print(f"    Units: {db.query(Unit).filter(Unit.company_id == c.id).count()}")
    print(f"    Cost Centres: {db.query(CostCentre).filter(CostCentre.company_id == c.id).count()}")
    print(f"    TDS Sections: {db.query(TdsTcsSection).filter(TdsTcsSection.company_id == c.id).count()}")
    print(f"    Bank Lines: {db.query(BankStatementLine).filter(BankStatementLine.company_id == c.id).count()}")
    print(f"    E-Invoices: {db.query(EInvoice).filter(EInvoice.company_id == c.id).count()}")
    print(f"    E-Way Bills: {db.query(EwayBill).filter(EwayBill.company_id == c.id).count()}")


# ─── Main ─────────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 60)
    print("ZLedger Demo Data Seeder — 3 Companies")
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
        seed_apex(db, admin)
        seed_greenleaf(db, admin)
        seed_buildright(db, admin)
        create_demo_users(db)

        total_users = db.query(User).count()
        total_companies = db.query(Company).count()
        total_vouchers = db.query(Voucher).count()
        total_vl = db.query(VoucherLine).count()
        total_parties = db.query(Party).count()
        total_items = db.query(StockItem).count()
        total_groups = db.query(AccountGroup).count()
        total_ledgers = db.query(Ledger).count()

        print("\n" + "=" * 60)
        print("SEED COMPLETE")
        print("=" * 60)
        print(f"  Users:          {total_users}")
        print(f"  Companies:      {total_companies}")
        print(f"  Vouchers:       {total_vouchers}")
        print(f"  Voucher Lines:  {total_vl}")
        print(f"  Parties:        {total_parties}")
        print(f"  Stock Items:    {total_items}")
        print(f"  Account Groups: {total_groups}")
        print(f"  Ledgers:        {total_ledgers}")
        print("=" * 60)
        print("Demo users (password same as username part before @):")
        print("  admin@zledger.com / admin12345 (superadmin)")
        print("  alice.gupta@example.com / alice@12345 (accountant @ Apex)")
        print("  bob.patil@example.com / bob@12345 (accountant @ GreenLeaf)")
        print("  carol.singh@example.com / carol@12345 (viewer @ BuildRight)")
        print("  david.verma@example.com / david@12345 (viewer @ Apex)")
        print("=" * 60)

    finally:
        db.close()


if __name__ == "__main__":
    main()
