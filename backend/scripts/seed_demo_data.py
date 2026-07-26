#!/usr/bin/env python3
"""Seed comprehensive demo data for ZLedger: 5 companies with full feature coverage.

Company 1: Apex Enterprises (Maharashtra, regular GST, IT/general trading)
Company 2: GreenLeaf Organics (Karnataka, composition scheme, organic foods)
Company 3: BuildRight Construction (Gujarat, regular GST, TDS heavy, construction)
Company 4: Medix Pharma Distributors (Maharashtra, regular GST, e-invoice heavy, pharma)
Company 5: TechVista Solutions (Karnataka, regular GST, TDS heavy, IT consulting)

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
from app.models.voucher import Voucher, VoucherLine
from app.models.payment_allocation import PaymentAllocation
from app.models.recurring_template import RecurringTemplate
from app.models.manufacturing import BillOfMaterials, BomLine, ProductionOrder
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
        "notifications",
        "payment_allocations", "recurring_templates",
        "tds_tcs_returns", "tds_tcs_entries", "tds_tcs_sections",
        "eway_bills", "e_invoices",
        "bank_statement_lines", "bank_reconciliations",
        "batch_ledger",
        "production_order_lines", "production_orders",
        "bom_versions", "bom_lines", "bill_of_materials",
        "routing_operations", "routings", "work_centers",
        "batches",
        "stock_balances", "stock_entries", "stock_items", "stock_groups",
        "voucher_lines", "vouchers",
        "gst_challans", "gst_returns", "gst_registrations", "hsn_sac",
        "parties", "units", "cost_centres", "cost_categories",
        "financial_years", "ledgers", "account_groups",
        "import_jobs",
        "asset_register", "asset_categories",
        "company_members", "companies",
    ]
    for t in tables:
        try:
            db.execute(text(f"DELETE FROM {t}"))
        except Exception:
            pass

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
    # Seed default Indian compliance mapping/templates.
    try:
        from app.services.compliance import ensure_default_schedules, ensure_default_templates
        ensure_default_schedules(db, c.id)
        ensure_default_templates(db, c.id)
    except Exception:
        pass
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
    existing = db.query(Ledger).filter(Ledger.company_id == company_id,
                                      Ledger.name == name).first()
    if existing:
        return existing
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
                      valuation: str = "weighted_avg",
                      item_type: str = "goods") -> StockItem:
    si = StockItem(company_id=company_id, name=name, stock_group_id=group_id,
                   hsn_sac_code=hsn, gst_rate=gst_rate, unit_of_measure=uom,
                   opening_qty=opening_qty, opening_rate=opening_rate, sku=sku,
                   valuation_method=valuation, item_type=item_type)
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
        grand_total=grand_total, status="posted",
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


# ─── Compliance Helpers ─────────────────────────────────────────────────────

def create_einvoice(
    db: Session, company_id: str, voucher_id: str, gstin_id: str,
    status: str = "draft", irn: str | None = None,
    ack_no: str | None = None, ack_dt: str | None = None,
) -> EInvoice:
    ei = EInvoice(
        company_id=company_id, voucher_id=voucher_id, gstin_id=gstin_id,
        status=status, irn=irn, ack_no=ack_no, ack_dt=ack_dt,
    )
    db.add(ei)
    db.flush()
    return ei


def create_eway_bill(
    db: Session, company_id: str, voucher_id: str, gstin_id: str,
    status: str = "draft", eway_bill_number: str | None = None,
    vehicle_number: str | None = None, transport_mode: str | None = None,
    distance_km: int = 0, from_state: str | None = None,
    to_state: str | None = None,
) -> EwayBill:
    ew = EwayBill(
        company_id=company_id, voucher_id=voucher_id, gstin_id=gstin_id,
        status=status, eway_bill_number=eway_bill_number,
        vehicle_number=vehicle_number, transport_mode=transport_mode,
        distance_km=distance_km, from_state=from_state, to_state=to_state,
        supply_type="O", sub_supply_type="0", document_type="INV",
    )
    db.add(ew)
    db.flush()
    return ew


def create_gst_return(
    db: Session, company_id: str, gstin_id: str | None,
    return_type: str, period: str, status: str = "draft",
    filed_date: str | None = None, ack_number: str | None = None,
    data_json: dict | None = None,
) -> GstReturn:
    gr = GstReturn(
        company_id=company_id, gstin_id=gstin_id, return_type=return_type,
        period=period, status=status, filed_date=filed_date,
        ack_number=ack_number, data_json=data_json,
    )
    db.add(gr)
    db.flush()
    return gr


def create_gst_challan(
    db: Session, company_id: str, gstin_id: str | None,
    challan_number: str, challan_date: str,
    amount: float = 0, cgst: float = 0, sgst: float = 0, igst: float = 0,
    bank_name: str | None = None, status: str = "unapplied",
    gst_return_id: str | None = None,
) -> "GstChallan":
    from app.models.accounting import GstChallan
    gc = GstChallan(
        company_id=company_id, gstin_id=gstin_id,
        gst_return_id=gst_return_id,
        challan_number=challan_number, challan_date=challan_date,
        amount=amount, cgst_amount=cgst, sgst_amount=sgst, igst_amount=igst,
        bank_name=bank_name, status=status,
    )
    db.add(gc)
    db.flush()
    return gc


def create_tds_return(
    db: Session, company_id: str, return_type: str, quarter: str,
    financial_year: str, total_entries: int = 0,
    total_amount: float = 0, total_tax: float = 0,
    status: str = "draft", filing_date: str | None = None,
    ack_number: str | None = None,
) -> "TdsTcsReturn":
    tr = TdsTcsReturn(
        company_id=company_id, return_type=return_type,
        quarter=quarter, financial_year=financial_year,
        total_entries=total_entries, total_amount=total_amount,
        total_tax=total_tax, status=status, filing_date=filing_date,
        ack_number=ack_number,
    )
    db.add(tr)
    db.flush()
    return tr


def create_payment_allocation(
    db: Session, company_id: str, invoice_voucher_id: str,
    payment_voucher_id: str, amount: float,
    allocation_date: str, remarks: str | None = None,
) -> "PaymentAllocation":
    pa = PaymentAllocation(
        company_id=company_id, invoice_voucher_id=invoice_voucher_id,
        payment_voucher_id=payment_voucher_id, amount=amount,
        allocation_date=allocation_date, remarks=remarks,
    )
    db.add(pa)
    db.flush()
    return pa


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
    debtors_control = create_ledger(db, c.id, GRP_RECEIVABLES, GRP_RECEIVABLES)
    creditors_control = create_ledger(db, c.id, GRP_PAYABLES, GRP_PAYABLES)

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

    # ── Stock Groups: Raw Materials ──
    sg_rm_elc = create_stock_group(db, c.id, "Raw Materials - Electronics",
                                   "PCBs, sensors, cables, and electronic components")
    sg_rm_pkg = create_stock_group(db, c.id, "Raw Materials - Packaging",
                                   "Boxes, inserts, and packaging materials")

    # ── Stock Items: Raw Materials ──
    si_pcb_mouse = create_stock_item(db, c.id, "Mouse PCB Board", sg_rm_elc.id,
                                     "8534", 18.0, "Pcs", 200, 85.00, "RM-PCB-MOU")
    si_sensor = create_stock_item(db, c.id, "Mouse Optical Sensor", sg_rm_elc.id,
                                  "9031", 18.0, "Pcs", 200, 120.00, "RM-SEN-OPT")
    si_battery = create_stock_item(db, c.id, "AA Battery Pair", sg_rm_elc.id,
                                   "8506", 18.0, "Pcs", 300, 25.00, "RM-BAT-AA2")
    si_housing = create_stock_item(db, c.id, "Plastic Mouse Housing", sg_rm_elc.id,
                                   "3926", 18.0, "Pcs", 200, 45.00, "RM-HSG-MOU")
    si_usb_cable = create_stock_item(db, c.id, "USB Cable 1m", sg_rm_elc.id,
                                     "8544", 18.0, "Pcs", 200, 35.00, "RM-CBL-USB")
    si_pcb_usb = create_stock_item(db, c.id, "USB Flash Drive PCB", sg_rm_elc.id,
                                   "8542", 18.0, "Pcs", 150, 180.00, "RM-PCB-USB")
    si_casing = create_stock_item(db, c.id, "Metal Drive Casing", sg_rm_elc.id,
                                  "8304", 18.0, "Pcs", 150, 60.00, "RM-CSG-USB")

    # ── Parties ──
    p1_ledger = create_ledger(db, c.id, "Royal Emporium - Receivable",
                              GRP_RECEIVABLES, opening=125000.00, opening_type="Dr")
    p2_ledger = create_ledger(db, c.id, "City Mart - Receivable",
                              GRP_RECEIVABLES, opening=87500.00, opening_type="Dr")
    p3_ledger = create_ledger(db, c.id, "Global Distributors - Payable",
                              GRP_PAYABLES, opening=210000.00, opening_type="Cr")
    p4_ledger = create_ledger(db, c.id, "Prime Imports - Payable",
                              GRP_PAYABLES, opening=64000.00, opening_type="Cr")
    p5_ledger = create_ledger(db, c.id, "Metro Retail - Receivable",
                              GRP_RECEIVABLES, opening=43000.00, opening_type="Dr")

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
    debtors_control = create_ledger(db, c.id, GRP_RECEIVABLES, GRP_RECEIVABLES)
    creditors_control = create_ledger(db, c.id, GRP_PAYABLES, GRP_PAYABLES)

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

    # ── Stock Groups: Raw Materials ──
    sg_bulk = create_stock_group(db, c.id, "Raw Materials - Bulk Goods",
                                 "Bulk raw ingredients for repacking")
    sg_pkg = create_stock_group(db, c.id, "Raw Materials - Packaging",
                                "Pouches, labels, and packing materials")

    # ── Stock Items: Raw Materials ──
    si_bulk_rice = create_stock_item(db, c.id, "Organic Basmati Rice 25kg", sg_bulk.id,
                                     "1006", 5.0, "Kg", 50, 2000.00, "GRN-RM-RIC")
    si_pouches = create_stock_item(db, c.id, "Eco-Friendly Pouches 1kg", sg_pkg.id,
                                   "3923", 18.0, "Pcs", 2000, 2.50, "GRN-RM-PCH")
    si_label_roll = create_stock_item(db, c.id, "Product Labels Roll 1000", sg_pkg.id,
                                      "4821", 12.0, "Pcs", 500, 1.50, "GRN-RM-LBL")
    si_bulk_honey = create_stock_item(db, c.id, "Bulk Forest Honey 5kg", sg_bulk.id,
                                      "0409", 5.0, "Btl", 20, 1400.00, "GRN-RM-HON")

    # ── Parties ──
    p1_ledger = create_ledger(db, c.id, "Nature's Basket - Receivable",
                              GRP_RECEIVABLES, opening=85000.00, opening_type="Dr")
    p2_ledger = create_ledger(db, c.id, "HealthFirst Retail - Receivable",
                              GRP_RECEIVABLES, opening=45000.00, opening_type="Dr")
    p3_ledger = create_ledger(db, c.id, "OrganicCollective - Payable",
                              GRP_PAYABLES, opening=62000.00, opening_type="Cr")
    p4_ledger = create_ledger(db, c.id, "FarmFresh Karnataka - Payable",
                              GRP_PAYABLES, opening=38000.00, opening_type="Cr")

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
    debtors_control = create_ledger(db, c.id, GRP_RECEIVABLES, GRP_RECEIVABLES)
    creditors_control = create_ledger(db, c.id, GRP_PAYABLES, GRP_PAYABLES)

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
    si_aggregate = create_stock_item(db, c.id, "Coarse Aggregate 20mm", sg_cement.id,
                                     "2517", 5.0, "Kg", 8000, 2.00, "BLD-CEM-AGG")

    # ── Stock Group & Item: Finished Goods ──
    sg_precast = create_stock_group(db, c.id, "Precast Products",
                                    "Precast concrete blocks and products")
    si_precast = create_stock_item(db, c.id, "Precast Concrete Block 40x20x20cm",
                                   sg_precast.id, "6810", 5.0, "Nos", 200, 180.00, "BLD-PRE-BLK")

    # ── Parties ──
    p1_ledger = create_ledger(db, c.id, "Skyline Developers - Receivable",
                              GRP_RECEIVABLES, opening=450000.00, opening_type="Dr")
    p2_ledger = create_ledger(db, c.id, "Gujarat Metro - Receivable",
                              GRP_RECEIVABLES, opening=1200000.00, opening_type="Dr")
    p3_ledger = create_ledger(db, c.id, "Gujarat Cement Ltd - Payable",
                              GRP_PAYABLES, opening=280000.00, opening_type="Cr")
    p4_ledger = create_ledger(db, c.id, "SteelMasters India - Payable",
                              GRP_PAYABLES, opening=175000.00, opening_type="Cr")
    p5_ledger = create_ledger(db, c.id, "Prime Contractors - Payable",
                              GRP_PAYABLES, opening=95000.00, opening_type="Cr")

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

    admin = db.query(User).filter(User.email == "admin@zledger.com").first()

    users_data = [
        ("Alice Gupta", "alice.gupta@example.com", "alice@12345"),
        ("Bob Patil", "bob.patil@example.com", "bob@12345"),
        ("Carol Singh", "carol.singh@example.com", "carol@12345"),
        ("David Verma", "david.verma@example.com", "david@12345"),
        ("Eva Mehta", "eva.mehta@example.com", "eva@12345"),
        ("Farhan Khan", "farhan.khan@example.com", "farhan@12345"),
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
    medix = next((c for c in companies if "Medix" in c.name), None)
    techvista = next((c for c in companies if "TechVista" in c.name), None)

    # ── Apex Enterprises: Alice Gupta as owner, David Verma as viewer ──
    if apex:
        if "alice.gupta@example.com" in user_ids:
            db.add(CompanyMember(company_id=apex.id,
                    user_id=user_ids["alice.gupta@example.com"], role="owner"))
            print("  Alice Gupta → Apex Enterprises (owner)")
        if "david.verma@example.com" in user_ids:
            db.add(CompanyMember(company_id=apex.id,
                    user_id=user_ids["david.verma@example.com"], role="viewer"))
            print("  David Verma → Apex Enterprises (viewer)")
        # Downgrade admin from owner to accountant
        if admin:
            admin_member = db.query(CompanyMember).filter(
                CompanyMember.company_id == apex.id,
                CompanyMember.user_id == admin.id).first()
            if admin_member:
                admin_member.role = "accountant"
                print("  admin@zledger.com → Apex Enterprises (accountant)")

    # ── GreenLeaf Organics: Bob Patil as owner ──
    if green and "bob.patil@example.com" in user_ids:
        db.add(CompanyMember(company_id=green.id,
                user_id=user_ids["bob.patil@example.com"], role="owner"))
        print("  Bob Patil → GreenLeaf Organics (owner)")
        if admin:
            admin_member = db.query(CompanyMember).filter(
                CompanyMember.company_id == green.id,
                CompanyMember.user_id == admin.id).first()
            if admin_member:
                admin_member.role = "accountant"
                print("  admin@zledger.com → GreenLeaf Organics (accountant)")

    # ── BuildRight Construction: Carol Singh as viewer, admin stays owner ──
    if build and "carol.singh@example.com" in user_ids:
        db.add(CompanyMember(company_id=build.id,
                user_id=user_ids["carol.singh@example.com"], role="viewer"))
        print("  Carol Singh → BuildRight Construction (viewer)")

    # ── Medix Pharma Distributors: Eva Mehta as owner ──
    if medix and "eva.mehta@example.com" in user_ids:
        db.add(CompanyMember(company_id=medix.id,
                user_id=user_ids["eva.mehta@example.com"], role="owner"))
        print("  Eva Mehta → Medix Pharma Distributors (owner)")

    # ── TechVista Solutions: Farhan Khan as owner ──
    if techvista and "farhan.khan@example.com" in user_ids:
        db.add(CompanyMember(company_id=techvista.id,
                user_id=user_ids["farhan.khan@example.com"], role="owner"))
        print("  Farhan Khan → TechVista Solutions (owner)")

    db.commit()




# ═══════════════════════════════════════════════════════════════════════════
# COMPANY 4: Medix Pharma Distributors (Maharashtra, E-Invoice Heavy)
# ═══════════════════════════════════════════════════════════════════════════

COMPANY_MEDIX = dict(
    name="Medix Pharma Distributors",
    legal_name="Medix Pharma Distributors Pvt Ltd",
    gstin="27AABCM4567A1Z8",
    state_code="27",
    pan="AABCM4567A",
    address="402, Pharma Tower, MIDC, Pune 411018",
    phone="020-67890123",
    email="accounts@medixpharma.in",
    website="www.medixpharma.in",
    bank_name="ICICI Bank",
    bank_account_number="60200012345678",
    bank_ifsc="ICIC0001234",
    bank_branch="Pune MIDC",
    books_begin_from="2024-04-01",
)


def seed_medix(db: Session, admin_user: User) -> Company:
    print("\n=== Creating Company 4: Medix Pharma Distributors (E-Invoice Heavy) ===")
    c = create_company(db, admin_user.id, **COMPANY_MEDIX)

    fy2425 = create_fy(db, c.id, "2024-25", "2024-04-01", "2025-03-31", is_closed=True)
    fy2526 = create_fy(db, c.id, "2025-26", "2025-04-01", "2026-03-31")

    # ── GST Registration ──
    gst_reg = create_gst_reg(db, c.id, "27AABCM4567A1Z8",
                              "Medix Pharma Distributors Pvt Ltd", "27",
                              "AABCM4567A", "Medix Pharma")

    # ── Customize ledgers ──
    bank = find_ledger(db, c.id, "Bank Account")
    if bank:
        bank.name = "ICICI Bank - Pune MIDC"
        bank.opening_balance = 2500000.00
        bank.opening_balance_type = "Dr"
    cash = find_ledger(db, c.id, "Cash")
    if cash:
        cash.opening_balance = 200000.00
        cash.opening_balance_type = "Dr"

    debtors_ctrl = create_ledger(db, c.id, GRP_RECEIVABLES, GRP_RECEIVABLES)
    creditors_ctrl = create_ledger(db, c.id, GRP_PAYABLES, GRP_PAYABLES)

    # ── Cost Centres ──
    cen_pune = CostCentre(company_id=c.id, name="Pune Distribution Centre",
                          description="Pune warehouse and distribution")
    cen_mumbai = CostCentre(company_id=c.id, name="Mumbai Branch",
                            description="Mumbai sales office")
    db.add(cen_pune); db.add(cen_mumbai); db.flush()

    # ── Units ──
    for u in [("Box", "Boxes"), ("Strip", "Strips"), ("Btl", "Bottles"),
              ("Vial", "Vials"), ("Kg", "Kilograms"), ("Ltr", "Litres"),
              ("Nos", "Numbers")]:
        db.add(Unit(company_id=c.id, name=u[0], description=u[1]))
    db.flush()

    # ── Stock Groups ──
    sg_tablets = create_stock_group(db, c.id, "Tablets & Capsules", "Oral solid dosage forms")
    sg_inject = create_stock_group(db, c.id, "Injectables", "Injections and IV fluids")
    sg_ayurveda = create_stock_group(db, c.id, "Ayurvedic & Herbal", "Herbal and ayurvedic products")
    sg_surg = create_stock_group(db, c.id, "Surgical Supplies", "Surgical instruments and disposables")
    sg_cosm = create_stock_group(db, c.id, "Cosmetics & Derma", "Dermatology and cosmetic products")
    sg_bulk = create_stock_group(db, c.id, "Bulk Drugs", "Active pharmaceutical ingredients")

    # ── HSN Codes ──
    hsn_data = [
        ("3004", "Medicaments in measured doses", 12.0),
        ("3003", "Medicaments not in measured doses", 12.0),
        ("3002", "Vaccines and blood products", 12.0),
        ("3006", "Pharmaceutical preparations n.e.s.", 12.0),
        ("1302", "Vegetable saps and extracts", 12.0),
        ("3304", "Beauty preparations", 18.0),
        ("9018", "Instruments for medical/surgical", 12.0),
    ]
    for hsn, desc, rate in hsn_data:
        db.add(HsnSac(company_id=c.id, code=hsn, description=desc, gst_rate=rate))
    db.flush()

    # ── Stock Items ──
    si_paracetamol = create_stock_item(db, c.id, "Paracetamol 500mg Tabs x100",
                                        sg_tablets.id, "3004", 12.0, "Box", 500, 45.00, "MED-TAB-PAR")
    si_amoxicillin = create_stock_item(db, c.id, "Amoxicillin 500mg Caps x30",
                                        sg_tablets.id, "3004", 12.0, "Strip", 300, 120.00, "MED-TAB-AMX")
    si_atorvastatin = create_stock_item(db, c.id, "Atorvastatin 10mg Tabs x30",
                                         sg_tablets.id, "3004", 12.0, "Strip", 200, 85.00, "MED-TAB-ATV")
    si_metformin = create_stock_item(db, c.id, "Metformin 500mg Tabs x60",
                                      sg_tablets.id, "3004", 12.0, "Box", 250, 65.00, "MED-TAB-MET")
    si_pantoprazole = create_stock_item(db, c.id, "Pantoprazole 40mg Tabs x14",
                                         sg_tablets.id, "3004", 12.0, "Strip", 400, 95.00, "MED-TAB-PAN")
    si_cetirizine = create_stock_item(db, c.id, "Cetirizine 10mg Tabs x10",
                                       sg_tablets.id, "3004", 12.0, "Strip", 600, 35.00, "MED-TAB-CET")
    si_azithromycin = create_stock_item(db, c.id, "Azithromycin 500mg Tabs x3",
                                         sg_tablets.id, "3004", 12.0, "Strip", 150, 55.00, "MED-TAB-AZT")
    si_ceftriaxone = create_stock_item(db, c.id, "Ceftriaxone 1g Inj",
                                        sg_inject.id, "3004", 12.0, "Vial", 100, 65.00, "MED-INJ-CFX")
    si_meropenem = create_stock_item(db, c.id, "Meropenem 500mg Inj",
                                      sg_inject.id, "3004", 12.0, "Vial", 80, 180.00, "MED-INJ-MRP")
    si_ashwagandha = create_stock_item(db, c.id, "Ashwagandha Tabs x60",
                                        sg_ayurveda.id, "1302", 12.0, "Btl", 200, 150.00, "MED-AYU-ASH")
    si_chyawanprash = create_stock_item(db, c.id, "Chyawanprash 500g",
                                         sg_ayurveda.id, "1302", 12.0, "Btl", 150, 180.00, "MED-AYU-CHY")
    si_gloves = create_stock_item(db, c.id, "Disposable Gloves (100 nos)",
                                   sg_surg.id, "9018", 12.0, "Box", 300, 250.00, "MED-SUR-GLV")
    si_syringe = create_stock_item(db, c.id, "Syringe 5ml Disposable (100 nos)",
                                    sg_surg.id, "9018", 12.0, "Box", 250, 180.00, "MED-SUR-SYN")
    si_suncscreen = create_stock_item(db, c.id, "Sunscreen SPF50 100ml",
                                       sg_cosm.id, "3304", 18.0, "Btl", 400, 120.00, "MED-COS-SUN")
    si_facewash = create_stock_item(db, c.id, "Face Wash Neem 150ml",
                                     sg_cosm.id, "3304", 18.0, "Btl", 350, 85.00, "MED-COS-FW")
    si_amlodipine = create_stock_item(db, c.id, "Amlodipine 5mg Tabs x30",
                                       sg_tablets.id, "3004", 12.0, "Strip", 200, 45.00, "MED-TAB-AML")
    si_ibuprofen = create_stock_item(db, c.id, "Ibuprofen 400mg Tabs x10",
                                      sg_tablets.id, "3004", 12.0, "Strip", 500, 25.00, "MED-TAB-IBU")
    si_diclofenac = create_stock_item(db, c.id, "Diclofenac Gel 30g",
                                       sg_tablets.id, "3006", 12.0, "Nos", 300, 45.00, "MED-TAB-DIC")

    # ── Stock Groups: Raw Materials for Kitting ──
    sg_raw_surg = create_stock_group(db, c.id, "Raw Materials - Surgical",
                                     "Raw surgical supplies for kitting")
    sg_raw_pharma = create_stock_group(db, c.id, "Raw Materials - Pharma",
                                       "Bulk pharmaceutical items for kitting")

    # ── Stock Items: Raw Materials (for First Aid Kits) ──
    si_bandage = create_stock_item(db, c.id, "Bandage Roll 10cm x 2m", sg_raw_surg.id,
                                   "3005", 12.0, "Pcs", 500, 15.00, "MED-RM-BND")
    si_antiseptic = create_stock_item(db, c.id, "Antiseptic Solution 100ml", sg_raw_pharma.id,
                                      "3003", 12.0, "Btl", 300, 35.00, "MED-RM-ANT")
    si_gauze = create_stock_item(db, c.id, "Sterile Gauze Pad 10x10cm (5-pk)", sg_raw_surg.id,
                                 "3005", 12.0, "Pcs", 600, 12.00, "MED-RM-GAU")
    si_tape = create_stock_item(db, c.id, "Adhesive Tape Roll 2.5cm x 5m", sg_raw_surg.id,
                                "3005", 12.0, "Pcs", 400, 8.00, "MED-RM-TAP")
    si_fakit = create_stock_item(db, c.id, "Comprehensive First Aid Kit", sg_raw_surg.id,
                                 "3006", 12.0, "Nos", 50, 450.00, "MED-FAK-001")
    db.flush()

    # ── Parties ──
    # Customers (hospitals and pharmacies)
    p1_ledger = create_ledger(db, c.id, "City Hospital - Receivable", GRP_RECEIVABLES, opening=1800000, opening_type="Dr")
    p2_ledger = create_ledger(db, c.id, "HealthFirst Pharmacy - Receivable", GRP_RECEIVABLES, opening=950000, opening_type="Dr")
    p3_ledger = create_ledger(db, c.id, "MedPlus Chemist - Receivable", GRP_RECEIVABLES, opening=620000, opening_type="Dr")
    p4_ledger = create_ledger(db, c.id, "Lifeline Medical Store - Receivable", GRP_RECEIVABLES, opening=340000, opening_type="Dr")
    p5_ledger = create_ledger(db, c.id, "Wellness Pharmacy - Receivable", GRP_RECEIVABLES, opening=280000, opening_type="Dr")

    # Suppliers (pharma manufacturers)
    p6_ledger = create_ledger(db, c.id, "Cipla Ltd - Payable", GRP_PAYABLES, opening=1200000, opening_type="Cr")
    p7_ledger = create_ledger(db, c.id, "Sun Pharma - Payable", GRP_PAYABLES, opening=850000, opening_type="Cr")
    p8_ledger = create_ledger(db, c.id, "Dr Reddy's Labs - Payable", GRP_PAYABLES, opening=650000, opening_type="Cr")
    p9_ledger = create_ledger(db, c.id, "Himalaya Wellness - Payable", GRP_PAYABLES, opening=320000, opening_type="Cr")
    p10_ledger = create_ledger(db, c.id, "Becton Dickinson - Payable", GRP_PAYABLES, opening=180000, opening_type="Cr")

    p_city = create_party(db, c.id, "City Hospital", "customer", ledger_id=p1_ledger.id,
                           gstin="27AAACC1234A1Z1", state_code="27", pan="AAACC1234A",
                           address="MG Road, Pune 411001", contact="Dr. Suresh Jain",
                           phone="020-25678901", email="procurement@cityhospital.in")
    p_healthfirst = create_party(db, c.id, "HealthFirst Pharmacy", "customer", ledger_id=p2_ledger.id,
                                  gstin="27AABCH5678A1Z5", state_code="27", pan="AABCH5678A",
                                  address="FC Road, Pune 411004", contact="Prakash Sharma",
                                  phone="020-26789012", email="prakash@healthfirst.in")
    p_medplus = create_party(db, c.id, "MedPlus Chemist", "customer", ledger_id=p3_ledger.id,
                              gstin="24AABCM9012A1Z3", state_code="24", pan="AABCM9012A",
                              address="SG Highway, Ahmedabad 380015", contact="Neha Patel",
                              phone="079-23456789", email="neha@medplus.in")
    p_lifeline = create_party(db, c.id, "Lifeline Medical Store", "customer", ledger_id=p4_ledger.id,
                               gstin="29AABCL3456A1Z7", state_code="29", pan="AABCL3456A",
                               address="HSR Layout, Bengaluru 560102", contact="Arun Kumar",
                               phone="080-25678901", email="arun@lifeline.in")
    p_wellness = create_party(db, c.id, "Wellness Pharmacy", "customer", ledger_id=p5_ledger.id,
                               gstin="27AABCW7890A1Z4", state_code="27", pan="AABCW7890A",
                               address="Deccan Gymkhana, Pune 411004", contact="Meena Kulkarni",
                               phone="020-27890123", email="meena@wellness.in")

    p_cipla = create_party(db, c.id, "Cipla Ltd", "supplier", ledger_id=p6_ledger.id,
                            gstin="27AABCC1234A1Z9", state_code="27", pan="AABCC1234A",
                            address="Cipla House, Mumbai 400013", contact="Rajesh Nair",
                            phone="022-23456789", email="rajesh@cipla.com")
    p_sun = create_party(db, c.id, "Sun Pharma", "supplier", ledger_id=p7_ledger.id,
                          gstin="24AABCS5678A1Z2", state_code="24", pan="AABCS5678A",
                          address="Sun Pharma, Vadodara 390012", contact="Vikram Desai",
                          phone="0265-2345678", email="vikram@sunpharma.com")
    p_drreddy = create_party(db, c.id, "Dr Reddy's Labs", "supplier", ledger_id=p8_ledger.id,
                              gstin="36AABCD9012A1Z6", state_code="36", pan="AABCD9012A",
                              address="Dr Reddy's, Hyderabad 500034", contact="Sunita Rao",
                              phone="040-23456789", email="sunita@drreddys.com")
    p_himalaya = create_party(db, c.id, "Himalaya Wellness", "supplier", ledger_id=p9_ledger.id,
                               gstin="29AABCH3456A1Z8", state_code="29", pan="AABCH3456A",
                               address="Himalaya House, Bengaluru 560001", contact="Deepak Menon",
                               phone="080-24567890", email="deepak@himalaya.in")
    p_bd = create_party(db, c.id, "Becton Dickinson", "supplier", ledger_id=p10_ledger.id,
                         gstin="27AABCB7890A1Z5", state_code="27", pan="AABCB7890A",
                         address="BD India, Mumbai 400051", contact="Sanjay Kulkarni",
                         phone="022-25678901", email="sanjay@bd.com")
    db.flush()

    bank_ledger = find_ledger(db, c.id, "ICICI Bank - Pune MIDC")
    cash_ledger = find_ledger(db, c.id, "Cash")
    capital = find_ledger(db, c.id, "Capital Account")

    # ═══════════════════════════════════════════════════════
    # FY 2024-25 (CLOSED)
    # ═══════════════════════════════════════════════════════
    print("  FY 2024-25 vouchers...")

    build_opening_journal(db, c.id, admin_user.id, "2024-25", [
        {"ledger_id": cash_ledger.id, "debit": 200000, "credit": 0},
        {"ledger_id": bank_ledger.id, "debit": 2500000, "credit": 0},
        {"ledger_id": p1_ledger.id, "debit": 1800000, "credit": 0},
        {"ledger_id": p2_ledger.id, "debit": 950000, "credit": 0},
        {"ledger_id": p3_ledger.id, "debit": 620000, "credit": 0},
        {"ledger_id": p4_ledger.id, "debit": 340000, "credit": 0},
        {"ledger_id": p5_ledger.id, "debit": 280000, "credit": 0},
        {"ledger_id": p6_ledger.id, "debit": 0, "credit": 1200000},
        {"ledger_id": p7_ledger.id, "debit": 0, "credit": 850000},
        {"ledger_id": p8_ledger.id, "debit": 0, "credit": 650000},
        {"ledger_id": p9_ledger.id, "debit": 0, "credit": 320000},
        {"ledger_id": p10_ledger.id, "debit": 0, "credit": 180000},
        {"ledger_id": capital.id, "debit": 0, "credit": 3590000},
    ])

    # PUR-001: Purchase from Cipla (intra-state, Maharashtra)
    build_purchase_voucher(db, c.id, admin_user.id, "MDX-PUR-2024-0001", "2024-04-15",
        items=[{"stock_item_id": si_paracetamol.id, "qty": 200, "rate": 40},
               {"stock_item_id": si_amoxicillin.id, "qty": 150, "rate": 105},
               {"stock_item_id": si_atorvastatin.id, "qty": 100, "rate": 75}],
        party_id=p_cipla.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Purchase from Cipla - paracetamol, amoxicillin, atorvastatin",
        due_date="2024-05-15")

    # PUR-002: Purchase from Sun Pharma (intra-state)
    build_purchase_voucher(db, c.id, admin_user.id, "MDX-PUR-2024-0002", "2024-04-20",
        items=[{"stock_item_id": si_metformin.id, "qty": 150, "rate": 55},
               {"stock_item_id": si_pantoprazole.id, "qty": 200, "rate": 80},
               {"stock_item_id": si_cetirizine.id, "qty": 300, "rate": 30}],
        party_id=p_sun.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="24",
        narration="Purchase from Sun Pharma (inter-state Gujarat)",
        due_date="2024-05-20")

    # PUR-003: Purchase from Dr Reddy's (inter-state, Telangana → IGST)
    build_purchase_voucher(db, c.id, admin_user.id, "MDX-PUR-2024-0003", "2024-05-05",
        items=[{"stock_item_id": si_azithromycin.id, "qty": 100, "rate": 48},
               {"stock_item_id": si_ceftriaxone.id, "qty": 80, "rate": 55}],
        party_id=p_drreddy.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="36",
        narration="Purchase from Dr Reddy's (inter-state Telangana)",
        due_date="2024-06-05")

    # INV-001: Sale to City Hospital (intra-state) — E-Invoice required (>₹5L)
    v1 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2024-0001", "2024-05-10",
        items=[{"stock_item_id": si_paracetamol.id, "qty": 100, "rate": 55},
               {"stock_item_id": si_amoxicillin.id, "qty": 80, "rate": 135},
               {"stock_item_id": si_ceftriaxone.id, "qty": 50, "rate": 85},
               {"stock_item_id": si_meropenem.id, "qty": 30, "rate": 220}],
        party_id=p_city.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Supply to City Hospital - critical care medicines",
        reference="PO-CH-001", due_date="2024-06-10")
    create_einvoice(db, c.id, v1.id, gst_reg.id, "generated",
                     irn="MEDIX20240510001", ack_no="EI-2024-5001", ack_dt="2024-05-10 14:30:00")

    # INV-002: Sale to HealthFirst Pharmacy (intra-state)
    v2 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2024-0002", "2024-05-15",
        items=[{"stock_item_id": si_atorvastatin.id, "qty": 60, "rate": 100},
               {"stock_item_id": si_metformin.id, "qty": 50, "rate": 80},
               {"stock_item_id": si_pantoprazole.id, "qty": 80, "rate": 110},
               {"stock_item_id": si_cetirizine.id, "qty": 100, "rate": 45}],
        party_id=p_healthfirst.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Supply to HealthFirst Pharmacy - regular medicines",
        reference="PO-HF-001", due_date="2024-06-15")
    create_einvoice(db, c.id, v2.id, gst_reg.id, "generated",
                     irn="MEDIX20240515001", ack_no="EI-2024-5002", ack_dt="2024-05-15 11:00:00")

    # INV-003: Sale to MedPlus Chemist (inter-state, Gujarat → IGST)
    v3 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2024-0003", "2024-05-25",
        items=[{"stock_item_id": si_paracetamol.id, "qty": 150, "rate": 55},
               {"stock_item_id": si_azithromycin.id, "qty": 60, "rate": 70},
               {"stock_item_id": si_ashwagandha.id, "qty": 40, "rate": 180}],
        party_id=p_medplus.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="24",
        narration="Supply to MedPlus Chemist - inter-state Gujarat",
        reference="PO-MP-001", due_date="2024-06-25")
    create_einvoice(db, c.id, v3.id, gst_reg.id, "generated",
                     irn="MEDIX20240525001", ack_no="EI-2024-5003", ack_dt="2024-05-25 16:15:00")
    create_eway_bill(db, c.id, v3.id, gst_reg.id, "generated",
                      eway_bill_number="EW240525001", vehicle_number="MH12AB1234",
                      transport_mode="Road", distance_km=420,
                      from_state="27", to_state="24")

    # INV-004: Sale to Lifeline Medical (inter-state, Karnataka → IGST)
    v4 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2024-0004", "2024-06-05",
        items=[{"stock_item_id": si_gloves.id, "qty": 50, "rate": 300},
               {"stock_item_id": si_syringe.id, "qty": 40, "rate": 220},
               {"stock_item_id": si_ceftriaxone.id, "qty": 30, "rate": 85}],
        party_id=p_lifeline.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="29",
        narration="Supply to Lifeline Medical - surgical and injectable",
        reference="PO-LL-001", due_date="2024-07-05")
    create_einvoice(db, c.id, v4.id, gst_reg.id, "generated",
                     irn="MEDIX20240605001", ack_no="EI-2024-5004", ack_dt="2024-06-05 10:00:00")
    create_eway_bill(db, c.id, v4.id, gst_reg.id, "generated",
                      eway_bill_number="EW240605001", vehicle_number="MH12CD5678",
                      transport_mode="Road", distance_km=850,
                      from_state="27", to_state="29")

    # INV-005: Sale to Wellness Pharmacy (intra-state, small)
    v5 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2024-0005", "2024-06-12",
        items=[{"stock_item_id": si_suncscreen.id, "qty": 30, "rate": 150},
               {"stock_item_id": si_facewash.id, "qty": 25, "rate": 105},
               {"stock_item_id": si_chyawanprash.id, "qty": 20, "rate": 220}],
        party_id=p_wellness.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Supply to Wellness Pharmacy - cosmetics and ayurvedic",
        reference="PO-WL-001", due_date="2024-07-12")
    create_einvoice(db, c.id, v5.id, gst_reg.id, "generated",
                     irn="MEDIX20240612001", ack_no="EI-2024-5005", ack_dt="2024-06-12 09:45:00")

    # INV-006: Sale to City Hospital (intra-state) — repeat
    v6 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2024-0006", "2024-06-20",
        items=[{"stock_item_id": si_paracetamol.id, "qty": 200, "rate": 55},
               {"stock_item_id": si_meropenem.id, "qty": 40, "rate": 220},
               {"stock_item_id": si_ibuprofen.id, "qty": 100, "rate": 32}],
        party_id=p_city.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Repeat supply to City Hospital - monthly order",
        reference="PO-CH-002", due_date="2024-07-20")
    create_einvoice(db, c.id, v6.id, gst_reg.id, "generated",
                     irn="MEDIX20240620001", ack_no="EI-2024-5006", ack_dt="2024-06-20 13:00:00")

    # PAY-001: Payment to Cipla ₹500,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "MDX-PAY-2024-0001", "2024-06-05", amount=500000,
        party_ledger_id=p6_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_cipla.id, narration="Payment to Cipla Ltd for April purchases")

    # PAY-002: Payment to Sun Pharma ₹350,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "MDX-PAY-2024-0002", "2024-06-10", amount=350000,
        party_ledger_id=p7_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_sun.id, narration="Payment to Sun Pharma for April purchases")

    # RECP-001: Receipt from City Hospital ₹800,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "MDX-RECP-2024-0001", "2024-06-15", amount=800000,
        party_ledger_id=p1_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_city.id, narration="Receipt from City Hospital for May invoices")

    # PAY-003: Payment to Dr Reddy's ₹200,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "MDX-PAY-2024-0003", "2024-06-20", amount=200000,
        party_ledger_id=p8_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_drreddy.id, narration="Payment to Dr Reddy's for May purchase")

    # JRN-001: Depreciation on cold storage equipment
    build_journal_voucher(db, c.id, admin_user.id, "MDX-JRN-2024-0001", "2024-06-30",
        lines_data=[
            {"ledger_id": cash_ledger.id, "debit": 25000, "credit": 0,
             "cost_centre_id": cen_pune.id},
            {"ledger_id": cash_ledger.id, "debit": 15000, "credit": 0,
             "cost_centre_id": cen_mumbai.id},
            {"ledger_id": bank_ledger.id, "debit": 0, "credit": 40000}],
        narration="Depreciation on cold storage and transport equipment Q1")

    # PUR-004: Purchase from Himalaya (ayurvedic)
    build_purchase_voucher(db, c.id, admin_user.id, "MDX-PUR-2024-0004", "2024-07-01",
        items=[{"stock_item_id": si_ashwagandha.id, "qty": 100, "rate": 130},
               {"stock_item_id": si_chyawanprash.id, "qty": 80, "rate": 155}],
        party_id=p_himalaya.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="29",
        narration="Purchase from Himalaya Wellness (inter-state Karnataka)",
        due_date="2024-08-01")

    # INV-007: Sale to HealthFirst (repeat)
    v7 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2024-0007", "2024-07-10",
        items=[{"stock_item_id": si_atorvastatin.id, "qty": 80, "rate": 100},
               {"stock_item_id": si_pantoprazole.id, "qty": 60, "rate": 110},
               {"stock_item_id": si_amlodipine.id, "qty": 50, "rate": 58}],
        party_id=p_healthfirst.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Supply to HealthFirst - monthly repeat order",
        reference="PO-HF-002", due_date="2024-08-10")
    create_einvoice(db, c.id, v7.id, gst_reg.id, "generated",
                     irn="MEDIX20240710001", ack_no="EI-2024-5007", ack_dt="2024-07-10 15:30:00")

    # PAY-004: Payment to Himalaya ₹150,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "MDX-PAY-2024-0004", "2024-07-15", amount=150000,
        party_ledger_id=p9_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_himalaya.id, narration="Payment to Himalaya for July purchase")

    # RECP-002: Receipt from MedPlus ₹400,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "MDX-RECP-2024-0002", "2024-07-20", amount=400000,
        party_ledger_id=p3_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_medplus.id, narration="Receipt from MedPlus for June invoices")

    # INV-008: Sale to Lifeline (inter-state repeat)
    v8 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2024-0008", "2024-08-05",
        items=[{"stock_item_id": si_gloves.id, "qty": 60, "rate": 300},
               {"stock_item_id": si_syringe.id, "qty": 50, "rate": 220},
               {"stock_item_id": si_diclofenac.id, "qty": 40, "rate": 58}],
        party_id=p_lifeline.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="29",
        narration="Supply to Lifeline Medical - surgical supplies",
        reference="PO-LL-002", due_date="2024-09-05")
    create_einvoice(db, c.id, v8.id, gst_reg.id, "generated",
                     irn="MEDIX20240805001", ack_no="EI-2024-5008", ack_dt="2024-08-05 11:30:00")
    create_eway_bill(db, c.id, v8.id, gst_reg.id, "generated",
                      eway_bill_number="EW240805001", vehicle_number="MH12EF9012",
                      transport_mode="Road", distance_km=850,
                      from_state="27", to_state="29")

    # INV-009: Sale to Wellness (small)
    v9 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2024-0009", "2024-08-15",
        items=[{"stock_item_id": si_suncscreen.id, "qty": 40, "rate": 150},
               {"stock_item_id": si_facewash.id, "qty": 35, "rate": 105}],
        party_id=p_wellness.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Supply to Wellness Pharmacy - derma products",
        reference="PO-WL-002", due_date="2024-09-15")
    create_einvoice(db, c.id, v9.id, gst_reg.id, "generated",
                     irn="MEDIX20240815001", ack_no="EI-2024-5009", ack_dt="2024-08-15 10:00:00")

    # RECP-003: Receipt from City Hospital ₹1,000,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "MDX-RECP-2024-0003", "2024-08-20", amount=1000000,
        party_ledger_id=p1_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_city.id, narration="Receipt from City Hospital for July-Aug invoices")

    # PUR-005: Purchase from BD (surgical)
    build_purchase_voucher(db, c.id, admin_user.id, "MDX-PUR-2024-0005", "2024-09-01",
        items=[{"stock_item_id": si_gloves.id, "qty": 100, "rate": 220},
               {"stock_item_id": si_syringe.id, "qty": 80, "rate": 160}],
        party_id=p_bd.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Purchase from BD India - surgical disposables",
        due_date="2024-10-01")

    # PAY-005: Payment to BD ₹300,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "MDX-PAY-2024-0005", "2024-09-10", amount=300000,
        party_ledger_id=p10_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_bd.id, narration="Payment to BD India for surgical supplies")

    # RECP-004: Receipt from HealthFirst ₹350,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "MDX-RECP-2024-0004", "2024-09-15", amount=350000,
        party_ledger_id=p2_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_healthfirst.id, narration="Receipt from HealthFirst for July-Aug")

    # INV-010: Sale to City Hospital (inter-state, to Gujarat branch) — large
    v10 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2024-0010", "2024-10-01",
        items=[{"stock_item_id": si_paracetamol.id, "qty": 300, "rate": 55},
               {"stock_item_id": si_amoxicillin.id, "qty": 200, "rate": 135},
               {"stock_item_id": si_ceftriaxone.id, "qty": 100, "rate": 85},
               {"stock_item_id": si_meropenem.id, "qty": 50, "rate": 220}],
        party_id=p_city.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="24",
        narration="Supply to City Hospital Gujarat branch - inter-state",
        reference="PO-CH-003", due_date="2024-11-01")
    create_einvoice(db, c.id, v10.id, gst_reg.id, "generated",
                     irn="MEDIX20241001001", ack_no="EI-2024-5010", ack_dt="2024-10-01 14:00:00")
    create_eway_bill(db, c.id, v10.id, gst_reg.id, "generated",
                      eway_bill_number="EW241001001", vehicle_number="MH12GH3456",
                      transport_mode="Road", distance_km=420,
                      from_state="27", to_state="24")

    # ═══════════════════════════════════════════════════════
    # FY 2025-26 (CURRENT)
    # ═══════════════════════════════════════════════════════
    print("  FY 2025-26 vouchers...")

    build_opening_journal(db, c.id, admin_user.id, "2025-26", [
        {"ledger_id": cash_ledger.id, "debit": 350000, "credit": 0},
        {"ledger_id": bank_ledger.id, "debit": 3200000, "credit": 0},
        {"ledger_id": p1_ledger.id, "debit": 1500000, "credit": 0},
        {"ledger_id": p2_ledger.id, "debit": 600000, "credit": 0},
        {"ledger_id": p3_ledger.id, "debit": 220000, "credit": 0},
        {"ledger_id": p4_ledger.id, "debit": 340000, "credit": 0},
        {"ledger_id": p5_ledger.id, "debit": 130000, "credit": 0},
        {"ledger_id": p6_ledger.id, "debit": 0, "credit": 400000},
        {"ledger_id": p7_ledger.id, "debit": 0, "credit": 250000},
        {"ledger_id": p8_ledger.id, "debit": 0, "credit": 180000},
        {"ledger_id": p9_ledger.id, "debit": 0, "credit": 120000},
        {"ledger_id": p10_ledger.id, "debit": 0, "credit": 50000},
        {"ledger_id": capital.id, "debit": 0, "credit": 5340000},
    ])

    # PUR-006: Purchase from Cipla
    build_purchase_voucher(db, c.id, admin_user.id, "MDX-PUR-2025-0001", "2025-04-10",
        items=[{"stock_item_id": si_paracetamol.id, "qty": 250, "rate": 42},
               {"stock_item_id": si_amoxicillin.id, "qty": 200, "rate": 108},
               {"stock_item_id": si_atorvastatin.id, "qty": 150, "rate": 78},
               {"stock_item_id": si_amlodipine.id, "qty": 100, "rate": 40}],
        party_id=p_cipla.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Purchase from Cipla - Q1 FY26 order",
        due_date="2025-05-10")

    # PUR-007: Purchase from Sun Pharma
    build_purchase_voucher(db, c.id, admin_user.id, "MDX-PUR-2025-0002", "2025-04-15",
        items=[{"stock_item_id": si_metformin.id, "qty": 200, "rate": 58},
               {"stock_item_id": si_pantoprazole.id, "qty": 250, "rate": 82},
               {"stock_item_id": si_cetirizine.id, "qty": 400, "rate": 32}],
        party_id=p_sun.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="24",
        narration="Purchase from Sun Pharma (inter-state Gujarat)",
        due_date="2025-05-15")

    # INV-011: Sale to City Hospital
    v11 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2025-0001", "2025-04-20",
        items=[{"stock_item_id": si_paracetamol.id, "qty": 150, "rate": 58},
               {"stock_item_id": si_amoxicillin.id, "qty": 100, "rate": 140},
               {"stock_item_id": si_ceftriaxone.id, "qty": 60, "rate": 90},
               {"stock_item_id": si_meropenem.id, "qty": 35, "rate": 235}],
        party_id=p_city.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Supply to City Hospital - Q1 FY26",
        reference="PO-CH-004", due_date="2025-05-20")
    create_einvoice(db, c.id, v11.id, gst_reg.id, "generated",
                     irn="MEDIX20250420001", ack_no="EI-2025-6001", ack_dt="2025-04-20 14:30:00")

    # INV-012: Sale to HealthFirst
    v12 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2025-0002", "2025-04-25",
        items=[{"stock_item_id": si_atorvastatin.id, "qty": 70, "rate": 105},
               {"stock_item_id": si_metformin.id, "qty": 60, "rate": 85},
               {"stock_item_id": si_pantoprazole.id, "qty": 90, "rate": 115}],
        party_id=p_healthfirst.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Supply to HealthFirst - Q1 FY26",
        reference="PO-HF-003", due_date="2025-05-25")
    create_einvoice(db, c.id, v12.id, gst_reg.id, "generated",
                     irn="MEDIX20250425001", ack_no="EI-2025-6002", ack_dt="2025-04-25 11:15:00")

    # INV-013: Sale to MedPlus (inter-state Gujarat)
    v13 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2025-0003", "2025-05-05",
        items=[{"stock_item_id": si_paracetamol.id, "qty": 180, "rate": 58},
               {"stock_item_id": si_azithromycin.id, "qty": 70, "rate": 75},
               {"stock_item_id": si_ibuprofen.id, "qty": 100, "rate": 35}],
        party_id=p_medplus.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="24",
        narration="Supply to MedPlus - inter-state Gujarat",
        reference="PO-MP-002", due_date="2025-06-05")
    create_einvoice(db, c.id, v13.id, gst_reg.id, "generated",
                     irn="MEDIX20250505001", ack_no="EI-2025-6003", ack_dt="2025-05-05 16:00:00")
    create_eway_bill(db, c.id, v13.id, gst_reg.id, "generated",
                      eway_bill_number="EW250505001", vehicle_number="MH12IJ7890",
                      transport_mode="Road", distance_km=420,
                      from_state="27", to_state="24")

    # PAY-006: Payment to Cipla ₹600,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "MDX-PAY-2025-0001", "2025-05-10", amount=600000,
        party_ledger_id=p6_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_cipla.id, narration="Payment to Cipla for April purchases")

    # RECP-005: Receipt from City Hospital ₹900,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "MDX-RECP-2025-0001", "2025-05-15", amount=900000,
        party_ledger_id=p1_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_city.id, narration="Receipt from City Hospital for April")

    # PAY-007: Payment to Sun Pharma ₹400,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "MDX-PAY-2025-0002", "2025-05-20", amount=400000,
        party_ledger_id=p7_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_sun.id, narration="Payment to Sun Pharma for April purchases")

    # INV-014: Sale to Lifeline (inter-state Karnataka)
    v14 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2025-0004", "2025-05-25",
        items=[{"stock_item_id": si_gloves.id, "qty": 70, "rate": 310},
               {"stock_item_id": si_syringe.id, "qty": 60, "rate": 230},
               {"stock_item_id": si_diclofenac.id, "qty": 50, "rate": 60}],
        party_id=p_lifeline.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="29",
        narration="Supply to Lifeline Medical - surgical supplies",
        reference="PO-LL-003", due_date="2025-06-25")
    create_einvoice(db, c.id, v14.id, gst_reg.id, "generated",
                     irn="MEDIX20250525001", ack_no="EI-2025-6004", ack_dt="2025-05-25 10:30:00")
    create_eway_bill(db, c.id, v14.id, gst_reg.id, "generated",
                      eway_bill_number="EW250525001", vehicle_number="MH12KL1234",
                      transport_mode="Road", distance_km=850,
                      from_state="27", to_state="29")

    # INV-015: Sale to Wellness
    v15 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2025-0005", "2025-06-01",
        items=[{"stock_item_id": si_suncscreen.id, "qty": 50, "rate": 155},
               {"stock_item_id": si_facewash.id, "qty": 40, "rate": 110},
               {"stock_item_id": si_ashwagandha.id, "qty": 30, "rate": 190}],
        party_id=p_wellness.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Supply to Wellness - cosmetics and ayurvedic",
        reference="PO-WL-003", due_date="2025-07-01")
    create_einvoice(db, c.id, v15.id, gst_reg.id, "generated",
                     irn="MEDIX20250601001", ack_no="EI-2025-6005", ack_dt="2025-06-01 09:00:00")

    # PUR-008: Purchase from Dr Reddy's
    build_purchase_voucher(db, c.id, admin_user.id, "MDX-PUR-2025-0003", "2025-06-05",
        items=[{"stock_item_id": si_azithromycin.id, "qty": 120, "rate": 50},
               {"stock_item_id": si_ceftriaxone.id, "qty": 90, "rate": 58}],
        party_id=p_drreddy.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="36",
        narration="Purchase from Dr Reddy's (inter-state Telangana)",
        due_date="2025-07-05")

    # RECP-006: Receipt from HealthFirst ₹400,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "MDX-RECP-2025-0002", "2025-06-10", amount=400000,
        party_ledger_id=p2_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_healthfirst.id, narration="Receipt from HealthFirst for May")

    # PAY-008: Payment to Dr Reddy's ₹250,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "MDX-PAY-2025-0003", "2025-06-15", amount=250000,
        party_ledger_id=p8_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_drreddy.id, narration="Payment to Dr Reddy's for June purchase")

    # INV-016: Sale to City Hospital
    v16 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2025-0006", "2025-06-20",
        items=[{"stock_item_id": si_paracetamol.id, "qty": 250, "rate": 58},
               {"stock_item_id": si_amoxicillin.id, "qty": 150, "rate": 140},
               {"stock_item_id": si_meropenem.id, "qty": 45, "rate": 235}],
        party_id=p_city.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Supply to City Hospital - June order",
        reference="PO-CH-005", due_date="2025-07-20")
    create_einvoice(db, c.id, v16.id, gst_reg.id, "generated",
                     irn="MEDIX20250620001", ack_no="EI-2025-6006", ack_dt="2025-06-20 14:00:00")

    # RECP-007: Receipt from MedPlus ₹500,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "MDX-RECP-2025-0003", "2025-06-25", amount=500000,
        party_ledger_id=p3_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_medplus.id, narration="Receipt from MedPlus for May-June")

    # PAY-009: Payment to Himalaya ₹180,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "MDX-PAY-2025-0004", "2025-07-01", amount=180000,
        party_ledger_id=p9_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_himalaya.id, narration="Payment to Himalaya for ayurvedic stock")

    # PUR-009: Purchase from BD
    build_purchase_voucher(db, c.id, admin_user.id, "MDX-PUR-2025-0004", "2025-07-05",
        items=[{"stock_item_id": si_gloves.id, "qty": 120, "rate": 225},
               {"stock_item_id": si_syringe.id, "qty": 100, "rate": 165}],
        party_id=p_bd.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Purchase from BD India - surgical disposables",
        due_date="2025-08-05")

    # INV-017: Sale to HealthFirst
    v17 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2025-0007", "2025-07-10",
        items=[{"stock_item_id": si_atorvastatin.id, "qty": 90, "rate": 105},
               {"stock_item_id": si_pantoprazole.id, "qty": 80, "rate": 115},
               {"stock_item_id": si_cetirizine.id, "qty": 100, "rate": 48}],
        party_id=p_healthfirst.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="27",
        narration="Supply to HealthFirst - July order",
        reference="PO-HF-004", due_date="2025-08-10")
    create_einvoice(db, c.id, v17.id, gst_reg.id, "generated",
                     irn="MEDIX20250710001", ack_no="EI-2025-6007", ack_dt="2025-07-10 11:00:00")

    # PAY-010: Payment to BD ₹350,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "MDX-PAY-2025-0005", "2025-07-15", amount=350000,
        party_ledger_id=p10_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_bd.id, narration="Payment to BD India for surgical supplies")

    # RECP-008: Receipt from City Hospital ₹1,200,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "MDX-RECP-2025-0004", "2025-07-20", amount=1200000,
        party_ledger_id=p1_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_city.id, narration="Receipt from City Hospital for June-July")

    # INV-018: Sale to Lifeline (inter-state)
    v18 = build_sales_voucher(db, c.id, admin_user.id, "MDX-INV-2025-0008", "2025-07-25",
        items=[{"stock_item_id": si_gloves.id, "qty": 80, "rate": 310},
               {"stock_item_id": si_syringe.id, "qty": 70, "rate": 230},
               {"stock_item_id": si_ceftriaxone.id, "qty": 40, "rate": 90}],
        party_id=p_lifeline.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="27", party_state="29",
        narration="Supply to Lifeline Medical - July order",
        reference="PO-LL-004", due_date="2025-08-25")
    create_einvoice(db, c.id, v18.id, gst_reg.id, "generated",
                     irn="MEDIX20250725001", ack_no="EI-2025-6008", ack_dt="2025-07-25 15:00:00")
    create_eway_bill(db, c.id, v18.id, gst_reg.id, "generated",
                      eway_bill_number="EW250725001", vehicle_number="MH12MN5678",
                       transport_mode="Road", distance_km=850,
                       from_state="27", to_state="29")

    # ── GST Returns (filed monthly for FY24-25) ──
    print("  GST Returns, bank recon, recurring templates...")
    gst_gstin_id = gst_reg.id
    gstr1_filed = create_gst_return(db, c.id, gst_gstin_id, "GSTR1", "2024-04",
                                     status="filed", filed_date="2024-05-20",
                                     ack_number="GSTR1-27AABCM4567A1Z8-2404")
    create_gst_return(db, c.id, gst_gstin_id, "GSTR1", "2024-05",
                       status="filed", filed_date="2024-06-18",
                       ack_number="GSTR1-27AABCM4567A1Z8-2405")
    create_gst_return(db, c.id, gst_gstin_id, "GSTR1", "2024-06",
                       status="filed", filed_date="2024-07-17",
                       ack_number="GSTR1-27AABCM4567A1Z8-2406")
    create_gst_return(db, c.id, gst_gstin_id, "GSTR3B", "2024-04",
                       status="filed", filed_date="2024-05-20",
                       ack_number="GSTR3B-27AABCM4567A1Z8-2404")
    create_gst_return(db, c.id, gst_gstin_id, "GSTR3B", "2024-05",
                       status="filed", filed_date="2024-06-18",
                       ack_number="GSTR3B-27AABCM4567A1Z8-2405")

    # ── GST Challans ──
    create_gst_challan(db, c.id, gst_gstin_id, "CHAL-2024-001", "2024-05-20",
                        amount=185000, cgst=45000, sgst=45000, igst=95000,
                        bank_name="ICICI Bank", status="applied",
                        gst_return_id=gstr1_filed.id)
    create_gst_challan(db, c.id, gst_gstin_id, "CHAL-2024-002", "2024-06-18",
                        amount=210000, cgst=52000, sgst=52000, igst=106000,
                        bank_name="ICICI Bank", status="applied")

    # ── Payment Allocations (link payments to invoices) ──
    # Find the first payment and invoice vouchers to allocate
    v_pay1 = db.query(Voucher).filter(Voucher.company_id == c.id,
                                       Voucher.voucher_number == "MDX-PAY-2024-0001").first()
    v_inv1 = db.query(Voucher).filter(Voucher.company_id == c.id,
                                       Voucher.voucher_number == "MDX-INV-2024-0001").first()
    if v_pay1 and v_inv1:
        create_payment_allocation(db, c.id, v_inv1.id, v_pay1.id, 400000,
                                   "2024-06-10", "Partial allocation against INV-001")
    v_pay2 = db.query(Voucher).filter(Voucher.company_id == c.id,
                                       Voucher.voucher_number == "MDX-PAY-2024-0002").first()
    v_inv2 = db.query(Voucher).filter(Voucher.company_id == c.id,
                                       Voucher.voucher_number == "MDX-INV-2024-0002").first()
    if v_pay2 and v_inv2:
        create_payment_allocation(db, c.id, v_inv2.id, v_pay2.id, 350000,
                                   "2024-06-10", "Partial allocation against INV-002")

    # ── Recurring Templates ──
    # Monthly cloud hosting purchase
    RecurringTemplate(
        company_id=c.id, name="Monthly Bulk Medicine Purchase",
        voucher_type="purchase",
        template_payload={"items": [
            {"stock_item_id": si_paracetamol.id, "qty": 200, "rate": 42},
            {"stock_item_id": si_amoxicillin.id, "qty": 150, "rate": 108},
        ], "party_id": p_cipla.id, "narration": "Monthly medicine purchase from Cipla"},
        frequency="monthly", next_run_date="2025-09-01",
        last_run_date="2025-08-01", is_active=True)
    db.flush()
    # Quarterly AMC renewal
    RecurringTemplate(
        company_id=c.id, name="Quarterly BD Supply Payment",
        voucher_type="payment",
        template_payload={"party_id": p_bd.id, "amount": 180000,
                          "narration": "Quarterly BD surgical supplies payment"},
        frequency="quarterly", next_run_date="2025-10-01",
        last_run_date="2025-07-01", is_active=True)
    db.flush()

    # ── Bank Statement Lines ──
    create_bank_statement_line(db, c.id, bank_ledger.id, "2024-04-15",
                                "NEFT from Cipla - Invoice MDX-INV-2024-0001",
                                debit=0, credit=500000, reference="NEFT-CIPLA-001")
    create_bank_statement_line(db, c.id, bank_ledger.id, "2024-04-20",
                                "NEFT from HealthFirst - Invoice MDX-INV-2024-0002",
                                debit=0, credit=350000, reference="NEFT-HF-001")
    create_bank_statement_line(db, c.id, bank_ledger.id, "2024-05-10",
                                "RTGS to Sun Pharma",
                                debit=350000, credit=0, reference="RTGS-SUN-001")
    create_bank_statement_line(db, c.id, bank_ledger.id, "2024-06-05",
                                "NEFT from City Hospital - Invoice MDX-INV-2024-0003",
                                debit=0, credit=800000, reference="NEFT-CH-001")

    _log_counts(db, c)
    return c


# ═══════════════════════════════════════════════════════════════════════════
# COMPANY 5: TechVista Solutions (Karnataka, TDS Heavy, IT Consulting)
# ═══════════════════════════════════════════════════════════════════════════

COMPANY_TECHVISTA = dict(
    name="TechVista Solutions",
    legal_name="TechVista Solutions Pvt Ltd",
    gstin="29AAACT8901B1Z4",
    state_code="29",
    pan="AAACT8901B",
    address="503, Prestige Tech Park, Whitefield, Bengaluru 560066",
    phone="080-45678901",
    email="accounts@techvistasolutions.in",
    website="www.techvistasolutions.in",
    bank_name="Kotak Mahindra Bank",
    bank_account_number="80100056789012",
    bank_ifsc="KKBK0005678",
    bank_branch="Whitefield, Bengaluru",
    books_begin_from="2024-04-01",
)


def seed_techvista(db: Session, admin_user: User) -> Company:
    print("\n=== Creating Company 5: TechVista Solutions (TDS Heavy, IT Services) ===")
    c = create_company(db, admin_user.id, **COMPANY_TECHVISTA)

    fy2425 = create_fy(db, c.id, "2024-25", "2024-04-01", "2025-03-31", is_closed=True)
    fy2526 = create_fy(db, c.id, "2025-26", "2025-04-01", "2026-03-31")

    # ── GST Registration ──
    gst_reg = create_gst_reg(db, c.id, "29AAACT8901B1Z4",
                              "TechVista Solutions Pvt Ltd", "29",
                              "AAACT8901B", "TechVista")

    # ── TDS Sections ──
    sec_194j = create_tds_section(db, c.id, "194J", "Fees for Technical Services",
                                   "TDS", 10.0, 30000)
    sec_194c_o = create_tds_section(db, c.id, "194C-O", "Contractors (Other than Individual)",
                                     "TDS", 2.0, 30000)
    sec_194c_i = create_tds_section(db, c.id, "194C-I", "Contractors (Individual/HUF)",
                                     "TDS", 1.0, 30000)
    sec_194h = create_tds_section(db, c.id, "194H", "Commission or Brokerage",
                                   "TDS", 5.0, 15000)

    # ── Customize ledgers ──
    bank = find_ledger(db, c.id, "Bank Account")
    if bank:
        bank.name = "Kotak Mahindra - Whitefield"
        bank.opening_balance = 4500000.00
        bank.opening_balance_type = "Dr"
    cash = find_ledger(db, c.id, "Cash")
    if cash:
        cash.opening_balance = 150000.00
        cash.opening_balance_type = "Dr"

    debtors_ctrl = create_ledger(db, c.id, GRP_RECEIVABLES, GRP_RECEIVABLES)
    creditors_ctrl = create_ledger(db, c.id, GRP_PAYABLES, GRP_PAYABLES)

    # TDS Payable ledger
    tds_payable = create_ledger(db, c.id, "TDS Payable", "Duties & Taxes")

    # ── Cost Centres ──
    cen_dev = CostCentre(company_id=c.id, name="Software Development",
                         description="Product and custom development")
    cen_infra = CostCentre(company_id=c.id, name="Infrastructure & Cloud",
                           description="Cloud and hosting services")
    cen_consult = CostCentre(company_id=c.id, name="Consulting Services",
                             description="IT consulting and advisory")
    db.add(cen_dev); db.add(cen_infra); db.add(cen_consult); db.flush()

    # ── Units ──
    for u in [("Nos", "Numbers"), ("Hrs", "Hours"), ("Lic", "Licenses"),
              ("Box", "Boxes"), ("Set", "Sets"), ("Mon", "Months")]:
        db.add(Unit(company_id=c.id, name=u[0], description=u[1]))
    db.flush()

    # ── Stock Groups ──
    sg_sw = create_stock_group(db, c.id, "Software Products", "Licensed software products")
    sg_cloud = create_stock_group(db, c.id, "Cloud Services", "Cloud hosting and SaaS")
    sg_hw = create_stock_group(db, c.id, "Hardware & Accessories", "Server and network hardware")
    sg_amc = create_stock_group(db, c.id, "AMC & Support", "Annual maintenance contracts")

    # ── SAC/HSN Codes ──
    hsn_data = [
        ("8523", "Computer software (recorded media)", 18.0),
        ("998314", "IT design and development services", 18.0),
        ("998319", "Other IT services n.e.s.", 18.0),
        ("998611", "Cloud hosting and infrastructure", 18.0),
        ("8471", "Computer hardware and peripherals", 18.0),
        ("8504", "Electrical transformers and power supplies", 18.0),
        ("9985", "Support services", 18.0),
        ("8517", "Telecom and network equipment", 18.0),
        ("8415", "Air conditioning machines", 18.0),
        ("8528", "Monitors and displays", 18.0),
        ("8443", "Printers and printing supplies", 18.0),
    ]
    for hsn, desc, rate in hsn_data:
        db.add(HsnSac(company_id=c.id, code=hsn, description=desc, gst_rate=rate))
    db.flush()

    # ── Stock Items ──
    si_erp = create_stock_item(db, c.id, "ERPNext Enterprise License",
                                sg_sw.id, "8523", 18.0, "Lic", 20, 250000.00, "TV-SW-ERP")
    si_crm = create_stock_item(db, c.id, "CRM Pro Annual License",
                                sg_sw.id, "8523", 18.0, "Lic", 30, 120000.00, "TV-SW-CRM")
    si_analytics = create_stock_item(db, c.id, "Analytics Suite License",
                                      sg_sw.id, "8523", 18.0, "Lic", 15, 180000.00, "TV-SW-ANA")
    si_aws = create_stock_item(db, c.id, "AWS Cloud Hosting (per month)",
                                sg_cloud.id, "998611", 18.0, "Mon", 50, 45000.00, "TV-CL-AWS")
    si_azure = create_stock_item(db, c.id, "Azure Cloud Hosting (per month)",
                                  sg_cloud.id, "998611", 18.0, "Mon", 40, 38000.00, "TV-CL-AZR")
    si_gcp = create_stock_item(db, c.id, "GCP Cloud Hosting (per month)",
                                sg_cloud.id, "998611", 18.0, "Mon", 25, 35000.00, "TV-CL-GCP")
    si_server = create_stock_item(db, c.id, "Dell PowerEdge Server R740",
                                   sg_hw.id, "8471", 18.0, "Nos", 8, 350000.00, "TV-HW-SRV")
    si_switch = create_stock_item(db, c.id, "Cisco Catalyst 9300 Switch",
                                   sg_hw.id, "8517", 18.0, "Nos", 12, 125000.00, "TV-HW-SWI")
    si_ups = create_stock_item(db, c.id, "APC Smart-UPS 3000VA",
                                sg_hw.id, "8504", 18.0, "Nos", 10, 85000.00, "TV-HW-UPS")
    si_monitor = create_stock_item(db, c.id, "Dell 27\" 4K Monitor",
                                    sg_hw.id, "8528", 18.0, "Nos", 20, 35000.00, "TV-HW-MON")
    si_amc_hw = create_stock_item(db, c.id, "Hardware AMC (per year)",
                                   sg_amc.id, "9985", 18.0, "Nos", 30, 45000.00, "TV-AMC-HW")
    si_amc_sw = create_stock_item(db, c.id, "Software AMC (per year)",
                                   sg_amc.id, "9985", 18.0, "Nos", 25, 60000.00, "TV-AMC-SW")
    si_firewall = create_stock_item(db, c.id, "Fortinet FortiGate 100F",
                                     sg_hw.id, "8517", 18.0, "Nos", 6, 180000.00, "TV-HW-FW")
    si_nas = create_stock_item(db, c.id, "Synology NAS 12-Bay",
                                sg_hw.id, "8471", 18.0, "Nos", 5, 220000.00, "TV-HW-NAS")
    si_cabling = create_stock_item(db, c.id, "Structured Cabling (per point)",
                                    sg_hw.id, "8544", 18.0, "Nos", 200, 800.00, "TV-HW-CBL")

    # ── Stock Group & Item: Finished Goods (Assembly) ──
    sg_assembled = create_stock_group(db, c.id, "Assembled Systems",
                                      "Pre-configured and assembled IT systems")
    si_rack = create_stock_item(db, c.id, "Assembled Server Rack Unit",
                                sg_assembled.id, "8471", 18.0, "Nos", 5, 750000.00, "TV-HW-RACK")
    db.flush()

    # ── Parties ──
    # Customers (enterprises)
    p1_ledger = create_ledger(db, c.id, "Infosys BPO - Receivable", GRP_RECEIVABLES, opening=2800000, opening_type="Dr")
    p2_ledger = create_ledger(db, c.id, "Wipro Technologies - Receivable", GRP_RECEIVABLES, opening=1500000, opening_type="Dr")
    p3_ledger = create_ledger(db, c.id, "TCS - Receivable", GRP_RECEIVABLES, opening=900000, opening_type="Dr")
    p4_ledger = create_ledger(db, c.id, "Reliance Jio - Receivable", GRP_RECEIVABLES, opening=650000, opening_type="Dr")
    p5_ledger = create_ledger(db, c.id, "HDFC Bank - Receivable", GRP_RECEIVABLES, opening=400000, opening_type="Dr")

    # Service providers (for TDS)
    p6_ledger = create_ledger(db, c.id, "CloudFirst Solutions - Payable", GRP_PAYABLES, opening=800000, opening_type="Cr")
    p7_ledger = create_ledger(db, c.id, "DataPipe Analytics - Payable", GRP_PAYABLES, opening=550000, opening_type="Cr")
    p8_ledger = create_ledger(db, c.id, "NetSecure Systems - Payable", GRP_PAYABLES, opening=420000, opening_type="Cr")
    p9_ledger = create_ledger(db, c.id, "SkillBridge Consulting - Payable", GRP_PAYABLES, opening=280000, opening_type="Cr")
    p10_ledger = create_ledger(db, c.id, "Rajesh Kumar (Individual) - Payable", GRP_PAYABLES, opening=120000, opening_type="Cr")
    p11_ledger = create_ledger(db, c.id, "Priya Sharma (Individual) - Payable", GRP_PAYABLES, opening=80000, opening_type="Cr")
    p12_ledger = create_ledger(db, c.id, "Amit Patel (Commission Agent) - Payable", GRP_PAYABLES, opening=60000, opening_type="Cr")

    # Additional service providers
    p13_ledger = create_ledger(db, c.id, "ServerHost India - Payable", GRP_PAYABLES, opening=350000, opening_type="Cr")
    p14_ledger = create_ledger(db, c.id, "TechPrint Solutions - Payable", GRP_PAYABLES, opening=45000, opening_type="Cr")
    p15_ledger = create_ledger(db, c.id, "CyberShield Labs - Payable", GRP_PAYABLES, opening=180000, opening_type="Cr")
    p16_ledger = create_ledger(db, c.id, "FleetMove Transport - Payable", GRP_PAYABLES, opening=35000, opening_type="Cr")

    p_infosys = create_party(db, c.id, "Infosys BPO", "customer", ledger_id=p1_ledger.id,
                              gstin="29AABCI1234A1Z5", state_code="29", pan="AABCI1234A",
                              address="Infosys BPO, Electronic City, Bengaluru",
                              contact="Venkat Subramanian", phone="080-28520001",
                              email="venkat@infosysbpo.com")
    p_wipro = create_party(db, c.id, "Wipro Technologies", "customer", ledger_id=p2_ledger.id,
                            gstin="29AABCW5678A1Z3", state_code="29", pan="AABCW5678A",
                            address="Wipro SEZ, Sarjapur Road, Bengaluru",
                            contact="Anand Krishnamurthy", phone="080-28530001",
                            email="anand@wipro.com")
    p_tcs = create_party(db, c.id, "TCS", "customer", ledger_id=p3_ledger.id,
                          gstin="27AABCT9012A1Z7", state_code="27", pan="AABCT9012A",
                          address="TCS, Thane, Maharashtra",
                          contact="Sanjay Gupta", phone="022-67890123",
                          email="sanjay@tcs.com")
    p_jio = create_party(db, c.id, "Reliance Jio", "customer", ledger_id=p4_ledger.id,
                          gstin="27AABCR3456A1Z1", state_code="27", pan="AABCR3456A",
                          address="Jio World Centre, Mumbai",
                          contact="Amit Sharma", phone="022-23456789",
                          email="amit@jio.com")
    p_hdfc = create_party(db, c.id, "HDFC Bank", "customer", ledger_id=p5_ledger.id,
                           gstin="27AABCH7890A1Z4", state_code="27", pan="AABCH7890A",
                           address="HDFC Bank House, Mumbai",
                           contact="Deepak Nair", phone="022-34567890",
                           email="deepak@hdfcbank.com")

    p_cloudfirst = create_party(db, c.id, "CloudFirst Solutions", "supplier", ledger_id=p6_ledger.id,
                                 gstin="27AABCC2345A1Z8", state_code="27", pan="AABCC2345A",
                                 address="CloudFirst, Mumbai", contact="Ravi Shankar",
                                 phone="022-45678901", email="ravi@cloudfirst.in")
    p_datapipe = create_party(db, c.id, "DataPipe Analytics", "supplier", ledger_id=p7_ledger.id,
                               gstin="24AABCD6789A1Z2", state_code="24", pan="AABCD6789A",
                               address="DataPipe, Ahmedabad", contact="Ketan Mehta",
                               phone="079-56789012", email="ketan@datapipe.in")
    p_netsecure = create_party(db, c.id, "NetSecure Systems", "supplier", ledger_id=p8_ledger.id,
                                gstin="36AABCN0123A1Z6", state_code="36", pan="AABCN0123A",
                                address="NetSecure, Hyderabad", contact="Pavan Reddy",
                                phone="040-67890123", email="pavan@netsecure.in")
    p_skillbridge = create_party(db, c.id, "SkillBridge Consulting", "supplier", ledger_id=p9_ledger.id,
                                  gstin="29AABCS4567A1Z9", state_code="29", pan="AABCS4567A",
                                  address="SkillBridge, Bengaluru", contact="Nitin Verma",
                                  phone="080-78901234", email="nitin@skillbridge.in")
    p_rajesh = create_party(db, c.id, "Rajesh Kumar", "supplier", ledger_id=p10_ledger.id,
                             gstin=None, state_code="29", pan="BJTPK4567M",
                             address="Bengaluru", contact="Rajesh Kumar",
                             phone="9876543210", email="rajesh.kumar@gmail.com")
    p_priya = create_party(db, c.id, "Priya Sharma", "supplier", ledger_id=p11_ledger.id,
                            gstin=None, state_code="27", pan="CFLPS8901N",
                            address="Mumbai", contact="Priya Sharma",
                            phone="9876543211", email="priya.sharma@gmail.com")
    p_amit = create_party(db, c.id, "Amit Patel", "supplier", ledger_id=p12_ledger.id,
                           gstin="24AABCA2345B1Z1", state_code="24", pan="AABCA2345B",
                           address="Ahmedabad", contact="Amit Patel",
                           phone="9876543212", email="amit.patel@agents.in")

    p_serverhost = create_party(db, c.id, "ServerHost India", "supplier", ledger_id=p13_ledger.id,
                                 gstin="29AABCS8901A1Z3", state_code="29", pan="AABCS8901A",
                                 address="ServerHost, Bengaluru", contact="Vikram Singh",
                                 phone="080-89012345", email="vikram@serverhost.in")
    p_techprint = create_party(db, c.id, "TechPrint Solutions", "supplier", ledger_id=p14_ledger.id,
                                gstin="27AABCT2345A1Z5", state_code="27", pan="AABCT2345A",
                                address="TechPrint, Mumbai", contact="Sanjay Patil",
                                phone="022-90123456", email="sanjay@techprint.in")
    p_cybershield = create_party(db, c.id, "CyberShield Labs", "supplier", ledger_id=p15_ledger.id,
                                  gstin="27AABCC6789B1Z8", state_code="27", pan="AABCC6789B",
                                  address="CyberShield, Pune", contact="Aditya Deshmukh",
                                  phone="020-01234567", email="aditya@cybershield.in")
    p_fleetmove = create_party(db, c.id, "FleetMove Transport", "supplier", ledger_id=p16_ledger.id,
                                gstin="29AABCF0123A1Z2", state_code="29", pan="AABCF0123A",
                                address="FleetMove, Bengaluru", contact="Suresh Babu",
                                phone="080-12345678", email="suresh@fleetmove.in")
    db.flush()

    bank_ledger = find_ledger(db, c.id, "Kotak Mahindra - Whitefield")
    cash_ledger = find_ledger(db, c.id, "Cash")
    capital = find_ledger(db, c.id, "Capital Account")

    # ═══════════════════════════════════════════════════════
    # FY 2024-25 (CLOSED)
    # ═══════════════════════════════════════════════════════
    print("  FY 2024-25 vouchers...")

    build_opening_journal(db, c.id, admin_user.id, "2024-25", [
        {"ledger_id": cash_ledger.id, "debit": 150000, "credit": 0},
        {"ledger_id": bank_ledger.id, "debit": 4500000, "credit": 0},
        {"ledger_id": p1_ledger.id, "debit": 2800000, "credit": 0},
        {"ledger_id": p2_ledger.id, "debit": 1500000, "credit": 0},
        {"ledger_id": p3_ledger.id, "debit": 900000, "credit": 0},
        {"ledger_id": p4_ledger.id, "debit": 650000, "credit": 0},
        {"ledger_id": p5_ledger.id, "debit": 400000, "credit": 0},
        {"ledger_id": p6_ledger.id, "debit": 0, "credit": 800000},
        {"ledger_id": p7_ledger.id, "debit": 0, "credit": 550000},
        {"ledger_id": p8_ledger.id, "debit": 0, "credit": 420000},
        {"ledger_id": p9_ledger.id, "debit": 0, "credit": 280000},
        {"ledger_id": p10_ledger.id, "debit": 0, "credit": 120000},
        {"ledger_id": p11_ledger.id, "debit": 0, "credit": 80000},
        {"ledger_id": p12_ledger.id, "debit": 0, "credit": 60000},
        {"ledger_id": p13_ledger.id, "debit": 0, "credit": 350000},
        {"ledger_id": p14_ledger.id, "debit": 0, "credit": 45000},
        {"ledger_id": p15_ledger.id, "debit": 0, "credit": 180000},
        {"ledger_id": p16_ledger.id, "debit": 0, "credit": 35000},
        {"ledger_id": capital.id, "debit": 0, "credit": 8290000},
    ])

    # PUR-001: Purchase server + switch from CloudFirst
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2024-0001", "2024-04-10",
        items=[{"stock_item_id": si_server.id, "qty": 3, "rate": 320000},
               {"stock_item_id": si_switch.id, "qty": 5, "rate": 115000}],
        party_id=p_cloudfirst.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="27",
        narration="Purchase of server and networking equipment from CloudFirst",
        due_date="2024-05-10")

    # PUR-002: Purchase from ServerHost
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2024-0002", "2024-04-15",
        items=[{"stock_item_id": si_aws.id, "qty": 3, "rate": 40000},
               {"stock_item_id": si_azure.id, "qty": 2, "rate": 35000}],
        party_id=p_serverhost.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Cloud hosting subscription from ServerHost India",
        due_date="2024-05-15")

    # INV-001: Sale to Infosys BPO (intra-state Karnataka)
    build_sales_voucher(db, c.id, admin_user.id, "TV-INV-2024-0001", "2024-04-20",
        items=[{"stock_item_id": si_erp.id, "qty": 2, "rate": 250000},
               {"stock_item_id": si_crm.id, "qty": 3, "rate": 120000}],
        party_id=p_infosys.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Supply of ERP and CRM licenses to Infosys BPO",
        reference="PO-INF-001", due_date="2024-05-20")

    # INV-002: Sale to Wipro (intra-state)
    build_sales_voucher(db, c.id, admin_user.id, "TV-INV-2024-0002", "2024-05-01",
        items=[{"stock_item_id": si_analytics.id, "qty": 2, "rate": 180000},
               {"stock_item_id": si_server.id, "qty": 2, "rate": 350000},
               {"stock_item_id": si_firewall.id, "qty": 1, "rate": 180000}],
        party_id=p_wipro.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Supply of analytics suite and infrastructure to Wipro",
        reference="PO-WIP-001", due_date="2024-06-01")

    # PUR-003: Purchase from DataPipe (analytics services) — TDS 194J
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2024-0003", "2024-05-10",
        items=[{"stock_item_id": si_analytics.id, "qty": 1, "rate": 150000}],
        party_id=p_datapipe.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="24",
        narration="Analytics platform subscription from DataPipe (inter-state Gujarat)",
        due_date="2024-06-10")

    # INV-003: Sale to TCS (inter-state Maharashtra → IGST)
    build_sales_voucher(db, c.id, admin_user.id, "TV-INV-2024-0003", "2024-05-20",
        items=[{"stock_item_id": si_erp.id, "qty": 3, "rate": 250000},
               {"stock_item_id": si_crm.id, "qty": 2, "rate": 120000},
               {"stock_item_id": si_amc_sw.id, "qty": 5, "rate": 60000}],
        party_id=p_tcs.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="27",
        narration="Supply of software licenses and AMC to TCS (inter-state)",
        reference="PO-TCS-001", due_date="2024-06-20")

    # PAY-001: Payment to CloudFirst ₹400,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2024-0001", "2024-05-25", amount=400000,
        party_ledger_id=p6_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_cloudfirst.id, narration="Payment to CloudFirst for server purchase")

    # PUR-004: Purchase firewall from NetSecure — TDS 194C-O
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2024-0004", "2024-06-01",
        items=[{"stock_item_id": si_firewall.id, "qty": 2, "rate": 170000},
               {"stock_item_id": si_ups.id, "qty": 3, "rate": 80000}],
        party_id=p_netsecure.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="36",
        narration="Purchase of firewall and UPS from NetSecure (inter-state Telangana)",
        due_date="2024-07-01")

    # RECP-001: Receipt from Infosys BPO ₹1,200,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "TV-RECP-2024-0001", "2024-06-10", amount=1200000,
        party_ledger_id=p1_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_infosys.id, narration="Receipt from Infosys BPO for April order")

    # PUR-005: Rajesh Kumar consulting (individual, TDS 194J)
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2024-0005", "2024-06-15",
        items=[{"stock_item_id": si_erp.id, "qty": 1, "rate": 50000}],
        party_id=p_rajesh.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Consulting fee - Rajesh Kumar (individual)",
        due_date="2024-07-15")

    # PAY-002: Payment to DataPipe ₹200,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2024-0002", "2024-06-20", amount=200000,
        party_ledger_id=p7_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_datapipe.id, narration="Payment to DataPipe for analytics subscription")

    # INV-004: Sale to Reliance Jio (inter-state Maharashtra)
    build_sales_voucher(db, c.id, admin_user.id, "TV-INV-2024-0004", "2024-07-01",
        items=[{"stock_item_id": si_server.id, "qty": 4, "rate": 350000},
               {"stock_item_id": si_switch.id, "qty": 8, "rate": 125000},
               {"stock_item_id": si_nas.id, "qty": 2, "rate": 220000}],
        party_id=p_jio.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="27",
        narration="Supply of infrastructure to Reliance Jio (inter-state)",
        reference="PO-JIO-001", due_date="2024-08-01")

    # PUR-006: SkillBridge consulting (individual, TDS 194C-I)
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2024-0006", "2024-07-10",
        items=[{"stock_item_id": si_crm.id, "qty": 1, "rate": 40000}],
        party_id=p_skillbridge.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Training and consulting from SkillBridge",
        due_date="2024-08-10")

    # PUR-007: Amit Patel commission (TDS 194H)
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2024-0007", "2024-07-15",
        items=[{"stock_item_id": si_crm.id, "qty": 1, "rate": 30000}],
        party_id=p_amit.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="24",
        narration="Commission to Amit Patel for client referral (inter-state Gujarat)",
        due_date="2024-08-15")

    # RECP-002: Receipt from Wipro ₹800,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "TV-RECP-2024-0002", "2024-07-20", amount=800000,
        party_ledger_id=p2_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_wipro.id, narration="Receipt from Wipro for May order")

    # PAY-003: Payment to NetSecure ₹350,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2024-0003", "2024-08-01", amount=350000,
        party_ledger_id=p8_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_netsecure.id, narration="Payment to NetSecure for firewall and UPS")

    # INV-005: Sale to HDFC Bank (intra-state)
    build_sales_voucher(db, c.id, admin_user.id, "TV-INV-2024-0005", "2024-08-10",
        items=[{"stock_item_id": si_crm.id, "qty": 5, "rate": 120000},
               {"stock_item_id": si_amc_sw.id, "qty": 5, "rate": 60000}],
        party_id=p_hdfc.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="27",
        narration="Supply of CRM licenses to HDFC Bank (inter-state)",
        reference="PO-HDFC-001", due_date="2024-09-10")

    # PAY-004: Payment to SkillBridge ₹100,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2024-0004", "2024-08-15", amount=100000,
        party_ledger_id=p9_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_skillbridge.id, narration="Payment to SkillBridge for training")

    # PUR-008: Purchase from CyberShield — security audit
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2024-0008", "2024-09-01",
        items=[{"stock_item_id": si_firewall.id, "qty": 1, "rate": 160000}],
        party_id=p_cybershield.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="27",
        narration="Security audit and firewall from CyberShield (inter-state Maharashtra)",
        due_date="2024-10-01")

    # RECP-003: Receipt from TCS ₹600,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "TV-RECP-2024-0003", "2024-09-10", amount=600000,
        party_ledger_id=p3_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_tcs.id, narration="Receipt from TCS for May-June order")

    # PAY-005: Payment to Rajesh Kumar ₹50,000 (TDS deducted in TDS entries)
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2024-0005", "2024-09-15", amount=50000,
        party_ledger_id=p10_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_rajesh.id, narration="Payment to Rajesh Kumar for consulting")

    # RECP-004: Receipt from Reliance Jio ₹1,500,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "TV-RECP-2024-0004", "2024-09-20", amount=1500000,
        party_ledger_id=p4_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_jio.id, narration="Receipt from Jio for July order")

    # INV-006: Sale to Infosys (repeat)
    build_sales_voucher(db, c.id, admin_user.id, "TV-INV-2024-0006", "2024-10-01",
        items=[{"stock_item_id": si_aws.id, "qty": 6, "rate": 45000},
               {"stock_item_id": si_amc_hw.id, "qty": 4, "rate": 45000},
               {"stock_item_id": si_monitor.id, "qty": 10, "rate": 35000}],
        party_id=p_infosys.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Cloud services, AMC and monitors to Infosys BPO",
        reference="PO-INF-002", due_date="2024-11-01")

    # PAY-006: Payment to CyberShield ₹160,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2024-0006", "2024-10-10", amount=160000,
        party_ledger_id=p15_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_cybershield.id, narration="Payment to CyberShield for security services")

    # PUR-009: Priya Sharma consulting (individual, TDS 194J)
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2024-0009", "2024-10-15",
        items=[{"stock_item_id": si_analytics.id, "qty": 1, "rate": 60000}],
        party_id=p_priya.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="27",
        narration="Consulting fee - Priya Sharma (individual, Maharashtra)",
        due_date="2024-11-15")

    # PAY-007: Payment to Priya Sharma ₹60,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2024-0007", "2024-10-20", amount=60000,
        party_ledger_id=p11_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_priya.id, narration="Payment to Priya Sharma for consulting")

    # RECP-005: Receipt from HDFC Bank ₹500,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "TV-RECP-2024-0005", "2024-10-25", amount=500000,
        party_ledger_id=p5_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_hdfc.id, narration="Receipt from HDFC Bank for August order")

    # PUR-010: FleetMove transport (TDS 194C-I)
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2024-0010", "2024-11-01",
        items=[{"stock_item_id": si_cabling.id, "qty": 50, "rate": 800}],
        party_id=p_fleetmove.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Cabling installation by FleetMove Transport",
        due_date="2024-12-01")

    # INV-007: Sale to Wipro (repeat)
    build_sales_voucher(db, c.id, admin_user.id, "TV-INV-2024-0007", "2024-11-10",
        items=[{"stock_item_id": si_erp.id, "qty": 2, "rate": 250000},
               {"stock_item_id": si_nas.id, "qty": 1, "rate": 220000}],
        party_id=p_wipro.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="ERP license and NAS to Wipro",
        reference="PO-WIP-002", due_date="2024-12-10")

    # PAY-008: Payment to FleetMove ₹40,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2024-0008", "2024-11-15", amount=40000,
        party_ledger_id=p16_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_fleetmove.id, narration="Payment to FleetMove for cabling services")

    # PUR-011: Purchase from TechPrint
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2024-0011", "2024-11-20",
        items=[{"stock_item_id": si_monitor.id, "qty": 5, "rate": 32000}],
        party_id=p_techprint.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="27",
        narration="Monitors from TechPrint (inter-state Maharashtra)",
        due_date="2024-12-20")

    # RECP-006: Receipt from Infosys ₹900,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "TV-RECP-2024-0006", "2024-12-01", amount=900000,
        party_ledger_id=p1_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_infosys.id, narration="Receipt from Infosys for Oct-Nov")

    # PAY-009: Payment to TechPrint ₹160,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2024-0009", "2024-12-05", amount=160000,
        party_ledger_id=p14_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_techprint.id, narration="Payment to TechPrint for monitors")

    # PUR-012: Purchase from ServerHost
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2024-0012", "2024-12-10",
        items=[{"stock_item_id": si_gcp.id, "qty": 3, "rate": 32000},
               {"stock_item_id": si_aws.id, "qty": 2, "rate": 40000}],
        party_id=p_serverhost.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Cloud subscriptions from ServerHost",
        due_date="2025-01-10")

    # INV-008: Sale to TCS (repeat)
    build_sales_voucher(db, c.id, admin_user.id, "TV-INV-2024-0008", "2024-12-15",
        items=[{"stock_item_id": si_erp.id, "qty": 2, "rate": 250000},
               {"stock_item_id": si_amc_hw.id, "qty": 3, "rate": 45000}],
        party_id=p_tcs.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="27",
        narration="ERP and AMC to TCS (inter-state)",
        reference="PO-TCS-002", due_date="2025-01-15")

    # PAY-010: Payment to ServerHost ₹200,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2024-0010", "2024-12-20", amount=200000,
        party_ledger_id=p13_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_serverhost.id, narration="Payment to ServerHost for cloud services")

    # RECP-007: Receipt from Reliance Jio ₹400,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "TV-RECP-2024-0007", "2024-12-25", amount=400000,
        party_ledger_id=p4_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_jio.id, narration="Partial receipt from Jio for July order")

    # PUR-013: Amit Patel commission (TDS 194H)
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2024-0013", "2025-01-05",
        items=[{"stock_item_id": si_crm.id, "qty": 1, "rate": 35000}],
        party_id=p_amit.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="24",
        narration="Commission to Amit Patel for Q3 referrals (inter-state Gujarat)",
        due_date="2025-02-05")

    # INV-009: Sale to Reliance Jio
    build_sales_voucher(db, c.id, admin_user.id, "TV-INV-2024-0009", "2025-01-10",
        items=[{"stock_item_id": si_server.id, "qty": 3, "rate": 350000},
               {"stock_item_id": si_ups.id, "qty": 5, "rate": 85000}],
        party_id=p_jio.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="27",
        narration="Infrastructure supply to Jio (inter-state)",
        reference="PO-JIO-002", due_date="2025-02-10")

    # PAY-011: Payment to Amit Patel ₹35,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2025-0001", "2025-01-15", amount=35000,
        party_ledger_id=p12_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_amit.id, narration="Commission payment to Amit Patel")

    # RECP-008: Receipt from Wipro ₹700,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "TV-RECP-2025-0001", "2025-01-20", amount=700000,
        party_ledger_id=p2_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_wipro.id, narration="Receipt from Wipro for Nov-Dec order")

    # PUR-014: Rajesh Kumar consulting (individual, TDS 194J)
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2025-0001", "2025-02-01",
        items=[{"stock_item_id": si_erp.id, "qty": 1, "rate": 55000}],
        party_id=p_rajesh.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Architecture consulting - Rajesh Kumar",
        due_date="2025-03-01")

    # PAY-012: Payment to Rajesh Kumar ₹55,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2025-0002", "2025-02-10", amount=55000,
        party_ledger_id=p10_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_rajesh.id, narration="Payment to Rajesh Kumar for architecture consulting")

    # RECP-009: Receipt from Infosys ₹1,000,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "TV-RECP-2025-0002", "2025-02-15", amount=1000000,
        party_ledger_id=p1_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_infosys.id, narration="Receipt from Infosys for Jan-Feb")

    # INV-010: Sale to HDFC Bank
    build_sales_voucher(db, c.id, admin_user.id, "TV-INV-2024-0010", "2025-02-20",
        items=[{"stock_item_id": si_erp.id, "qty": 1, "rate": 250000},
               {"stock_item_id": si_crm.id, "qty": 2, "rate": 120000},
               {"stock_item_id": si_amc_sw.id, "qty": 3, "rate": 60000}],
        party_id=p_hdfc.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="27",
        narration="Software and AMC to HDFC Bank (inter-state)",
        reference="PO-HDFC-002", due_date="2025-03-20")

    # PAY-013: Payment to CloudFirst ₹200,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2025-0003", "2025-02-25", amount=200000,
        party_ledger_id=p6_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_cloudfirst.id, narration="Payment to CloudFirst for Q4 services")

    # PUR-015: Purchase from DataPipe — analytics (TDS 194J)
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2025-0002", "2025-03-01",
        items=[{"stock_item_id": si_analytics.id, "qty": 1, "rate": 160000}],
        party_id=p_datapipe.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="24",
        narration="Analytics platform renewal from DataPipe (inter-state Gujarat)",
        due_date="2025-04-01")

    # PAY-014: Payment to DataPipe ₹160,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2025-0004", "2025-03-05", amount=160000,
        party_ledger_id=p7_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_datapipe.id, narration="Payment to DataPipe for analytics renewal")

    # RECP-010: Receipt from TCS ₹500,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "TV-RECP-2025-0003", "2025-03-10", amount=500000,
        party_ledger_id=p3_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_tcs.id, narration="Receipt from TCS for Jan-Feb")

    # PAY-015: Payment to NetSecure ₹100,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2025-0005", "2025-03-15", amount=100000,
        party_ledger_id=p8_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_netsecure.id, narration="Payment to NetSecure for firewall support")

    # RECP-011: Receipt from Reliance Jio ₹200,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "TV-RECP-2025-0004", "2025-03-20", amount=200000,
        party_ledger_id=p4_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_jio.id, narration="Final receipt from Jio for Jan order")

    # ═══════════════════════════════════════════════════════
    # FY 2025-26 (CURRENT)
    # ═══════════════════════════════════════════════════════
    print("  FY 2025-26 vouchers...")

    build_opening_journal(db, c.id, admin_user.id, "2025-26", [
        {"ledger_id": cash_ledger.id, "debit": 200000, "credit": 0},
        {"ledger_id": bank_ledger.id, "debit": 5800000, "credit": 0},
        {"ledger_id": p1_ledger.id, "debit": 2200000, "credit": 0},
        {"ledger_id": p2_ledger.id, "debit": 800000, "credit": 0},
        {"ledger_id": p3_ledger.id, "debit": 800000, "credit": 0},
        {"ledger_id": p4_ledger.id, "debit": 550000, "credit": 0},
        {"ledger_id": p5_ledger.id, "debit": 100000, "credit": 0},
        {"ledger_id": p6_ledger.id, "debit": 0, "credit": 400000},
        {"ledger_id": p7_ledger.id, "debit": 0, "credit": 190000},
        {"ledger_id": p8_ledger.id, "debit": 0, "credit": 220000},
        {"ledger_id": p9_ledger.id, "debit": 0, "credit": 180000},
        {"ledger_id": p10_ledger.id, "debit": 0, "credit": 65000},
        {"ledger_id": p11_ledger.id, "debit": 0, "credit": 20000},
        {"ledger_id": p12_ledger.id, "debit": 0, "credit": 25000},
        {"ledger_id": p13_ledger.id, "debit": 0, "credit": 150000},
        {"ledger_id": p14_ledger.id, "debit": 0, "credit": 20000},
        {"ledger_id": p15_ledger.id, "debit": 0, "credit": 20000},
        {"ledger_id": p16_ledger.id, "debit": 0, "credit": 10000},
        {"ledger_id": capital.id, "debit": 0, "credit": 9370000},
    ])

    # PUR-016: Purchase servers from CloudFirst
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2025-0003", "2025-04-10",
        items=[{"stock_item_id": si_server.id, "qty": 4, "rate": 330000},
               {"stock_item_id": si_switch.id, "qty": 6, "rate": 118000}],
        party_id=p_cloudfirst.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="27",
        narration="Purchase of servers and switches from CloudFirst",
        due_date="2025-05-10")

    # INV-011: Sale to Infosys BPO (intra-state)
    build_sales_voucher(db, c.id, admin_user.id, "TV-INV-2025-0001", "2025-04-15",
        items=[{"stock_item_id": si_erp.id, "qty": 3, "rate": 260000},
               {"stock_item_id": si_crm.id, "qty": 4, "rate": 125000},
               {"stock_item_id": si_analytics.id, "qty": 2, "rate": 190000}],
        party_id=p_infosys.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Supply of software licenses to Infosys BPO - FY26",
        reference="PO-INF-003", due_date="2025-05-15")

    # INV-012: Sale to Wipro
    build_sales_voucher(db, c.id, admin_user.id, "TV-INV-2025-0002", "2025-04-20",
        items=[{"stock_item_id": si_server.id, "qty": 3, "rate": 360000},
               {"stock_item_id": si_firewall.id, "qty": 2, "rate": 185000}],
        party_id=p_wipro.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Infrastructure supply to Wipro - FY26",
        reference="PO-WIP-003", due_date="2025-05-20")

    # PUR-017: Purchase from ServerHost
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2025-0004", "2025-04-25",
        items=[{"stock_item_id": si_aws.id, "qty": 4, "rate": 42000},
               {"stock_item_id": si_azure.id, "qty": 3, "rate": 36000}],
        party_id=p_serverhost.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Cloud subscriptions from ServerHost",
        due_date="2025-05-25")

    # PAY-016: Payment to CloudFirst ₹600,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2025-0006", "2025-05-05", amount=600000,
        party_ledger_id=p6_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_cloudfirst.id, narration="Payment to CloudFirst for server purchase")

    # RECP-012: Receipt from Infosys ₹1,500,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "TV-RECP-2025-0005", "2025-05-10", amount=1500000,
        party_ledger_id=p1_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_infosys.id, narration="Receipt from Infosys for April order")

    # PAY-017: Payment to ServerHost ₹300,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2025-0007", "2025-05-15", amount=300000,
        party_ledger_id=p13_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_serverhost.id, narration="Payment to ServerHost for cloud services")

    # INV-013: Sale to TCS (inter-state)
    build_sales_voucher(db, c.id, admin_user.id, "TV-INV-2025-0003", "2025-05-20",
        items=[{"stock_item_id": si_erp.id, "qty": 2, "rate": 260000},
               {"stock_item_id": si_amc_sw.id, "qty": 4, "rate": 65000}],
        party_id=p_tcs.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="27",
        narration="ERP and AMC to TCS (inter-state Maharashtra)",
        reference="PO-TCS-003", due_date="2025-06-20")

    # PUR-018: Rajesh Kumar consulting (TDS 194J)
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2025-0005", "2025-06-01",
        items=[{"stock_item_id": si_analytics.id, "qty": 1, "rate": 65000}],
        party_id=p_rajesh.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Data architecture consulting - Rajesh Kumar",
        due_date="2025-07-01")

    # RECP-013: Receipt from Wipro ₹900,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "TV-RECP-2025-0006", "2025-06-05", amount=900000,
        party_ledger_id=p2_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_wipro.id, narration="Receipt from Wipro for April-May order")

    # PAY-018: Payment to Rajesh Kumar ₹65,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2025-0008", "2025-06-10", amount=65000,
        party_ledger_id=p10_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_rajesh.id, narration="Payment to Rajesh Kumar for consulting")

    # PUR-019: SkillBridge consulting (TDS 194C-I)
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2025-0006", "2025-06-15",
        items=[{"stock_item_id": si_crm.id, "qty": 1, "rate": 45000}],
        party_id=p_skillbridge.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="29",
        narration="Training from SkillBridge",
        due_date="2025-07-15")

    # INV-014: Sale to Reliance Jio (inter-state)
    build_sales_voucher(db, c.id, admin_user.id, "TV-INV-2025-0004", "2025-06-20",
        items=[{"stock_item_id": si_server.id, "qty": 5, "rate": 360000},
               {"stock_item_id": si_nas.id, "qty": 3, "rate": 230000},
               {"stock_item_id": si_ups.id, "qty": 4, "rate": 90000}],
        party_id=p_jio.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="27",
        narration="Infrastructure to Jio - FY26 expansion",
        reference="PO-JIO-003", due_date="2025-07-20")

    # PUR-020: Amit Patel commission (TDS 194H)
    build_purchase_voucher(db, c.id, admin_user.id, "TV-PUR-2025-0007", "2025-06-25",
        items=[{"stock_item_id": si_crm.id, "qty": 1, "rate": 38000}],
        party_id=p_amit.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="24",
        narration="Commission to Amit Patel for Q1 referrals",
        due_date="2025-07-25")

    # PAY-019: Payment to SkillBridge ₹45,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2025-0009", "2025-07-01", amount=45000,
        party_ledger_id=p9_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_skillbridge.id, narration="Payment to SkillBridge for training")

    # RECP-014: Receipt from TCS ₹400,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "receipt",
        "TV-RECP-2025-0007", "2025-07-05", amount=400000,
        party_ledger_id=p3_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_tcs.id, narration="Receipt from TCS for May-June")

    # PAY-020: Payment to Amit Patel ₹38,000
    build_payment_receipt_voucher(db, c.id, admin_user.id, "payment",
        "TV-PAY-2025-0010", "2025-07-10", amount=38000,
        party_ledger_id=p12_ledger.id, cash_bank_ledger_id=bank_ledger.id,
        party_id=p_amit.id, narration="Commission payment to Amit Patel")

    # INV-015: Sale to HDFC Bank
    build_sales_voucher(db, c.id, admin_user.id, "TV-INV-2025-0005", "2025-07-15",
        items=[{"stock_item_id": si_erp.id, "qty": 2, "rate": 260000},
               {"stock_item_id": si_crm.id, "qty": 3, "rate": 125000},
               {"stock_item_id": si_amc_hw.id, "qty": 4, "rate": 48000}],
        party_id=p_hdfc.id, cash_bank_ledger_id=bank_ledger.id,
        company_state="29", party_state="27",
        narration="Software and AMC to HDFC Bank (inter-state)",
        reference="PO-HDFC-003", due_date="2025-08-15")

    # ── GST Returns (filed quarterly for FY24-25) ──
    print("  GST Returns, TDS entries, bank recon, recurring templates...")
    gst_gstin_id = gst_reg.id
    gstr1_q1 = create_gst_return(db, c.id, gst_gstin_id, "GSTR1", "2024-04",
                                  status="filed", filed_date="2024-07-15",
                                  ack_number="GSTR1-29AAACT8901B1Z4-2404")
    gstr1_q2 = create_gst_return(db, c.id, gst_gstin_id, "GSTR1", "2024-07",
                                  status="filed", filed_date="2024-10-14",
                                  ack_number="GSTR1-29AAACT8901B1Z4-2407")
    gstr1_q3 = create_gst_return(db, c.id, gst_gstin_id, "GSTR1", "2024-10",
                                  status="filed", filed_date="2025-01-13",
                                  ack_number="GSTR1-29AAACT8901B1Z4-2410")
    gstr1_q4 = create_gst_return(db, c.id, gst_gstin_id, "GSTR1", "2025-01",
                                  status="filed", filed_date="2025-04-14",
                                  ack_number="GSTR1-29AAACT8901B1Z4-2501")

    # ── GST Challans ──
    create_gst_challan(db, c.id, gst_gstin_id, "CHAL-TV-2024-001", "2024-07-15",
                        amount=420000, cgst=105000, sgst=105000, igst=210000,
                        bank_name="Kotak Mahindra", status="applied",
                        gst_return_id=gstr1_q1.id)
    create_gst_challan(db, c.id, gst_gstin_id, "CHAL-TV-2024-002", "2024-10-14",
                        amount=380000, cgst=95000, sgst=95000, igst=190000,
                        bank_name="Kotak Mahindra", status="applied")
    create_gst_challan(db, c.id, gst_gstin_id, "CHAL-TV-2024-003", "2025-01-13",
                        amount=350000, cgst=87500, sgst=87500, igst=175000,
                        bank_name="Kotak Mahindra", status="applied")

    # ── TDS Entries (on payments to contractors and professionals) ──
    tds_sec_194j = db.query(TdsTcsSection).filter(
        TdsTcsSection.company_id == c.id, TdsTcsSection.section_code == "194J").first()
    tds_sec_194c_o = db.query(TdsTcsSection).filter(
        TdsTcsSection.company_id == c.id, TdsTcsSection.section_code == "194C-O").first()
    tds_sec_194c_i = db.query(TdsTcsSection).filter(
        TdsTcsSection.company_id == c.id, TdsTcsSection.section_code == "194C-I").first()
    tds_sec_194h = db.query(TdsTcsSection).filter(
        TdsTcsSection.company_id == c.id, TdsTcsSection.section_code == "194H").first()

    # TDS on Rajesh Kumar payments (194J - 10%)
    tv_pay_rk = db.query(Voucher).filter(Voucher.company_id == c.id,
                                          Voucher.voucher_number == "TV-PAY-2025-0002").first()
    if tds_sec_194j:
        TdsTcsEntry(company_id=c.id, section_id=tds_sec_194j.id,
                     party_id=p_rajesh.id, voucher_id=tv_pay_rk.id if tv_pay_rk else None,
                     tds_tcs_type="TDS", base_amount=50000, rate=10.0,
                     deducted_amount=5000, entry_date="2024-09-15", status="deposited")
        db.flush()
    # TDS on CloudFirst payments (194C-O - 2%)
    tv_pay_cf = db.query(Voucher).filter(Voucher.company_id == c.id,
                                          Voucher.voucher_number == "TV-PAY-2025-0006").first()
    if tds_sec_194c_o:
        TdsTcsEntry(company_id=c.id, section_id=tds_sec_194c_o.id,
                     party_id=p_cloudfirst.id, voucher_id=tv_pay_cf.id if tv_pay_cf else None,
                     tds_tcs_type="TDS", base_amount=400000, rate=2.0,
                     deducted_amount=8000, entry_date="2024-05-25", status="deposited")
        db.flush()
    # TDS on SkillBridge payments (194C-I - 1%)
    tv_pay_sb = db.query(Voucher).filter(Voucher.company_id == c.id,
                                          Voucher.voucher_number == "TV-PAY-2025-0009").first()
    if tds_sec_194c_i:
        TdsTcsEntry(company_id=c.id, section_id=tds_sec_194c_i.id,
                     party_id=p_skillbridge.id, voucher_id=tv_pay_sb.id if tv_pay_sb else None,
                     tds_tcs_type="TDS", base_amount=40000, rate=1.0,
                     deducted_amount=400, entry_date="2024-08-15", status="deposited")
        db.flush()
    # TDS on Amit Patel commission (194H - 5%)
    tv_pay_ap = db.query(Voucher).filter(Voucher.company_id == c.id,
                                          Voucher.voucher_number == "TV-PAY-2025-0010").first()
    if tds_sec_194h:
        TdsTcsEntry(company_id=c.id, section_id=tds_sec_194h.id,
                     party_id=p_amit.id, voucher_id=tv_pay_ap.id if tv_pay_ap else None,
                     tds_tcs_type="TDS", base_amount=30000, rate=5.0,
                     deducted_amount=1500, entry_date="2024-09-15", status="deposited")
        db.flush()

    # ── TDS Returns (quarterly) ──
    create_tds_return(db, c.id, "TDS", "Q1", "2024-25",
                       total_entries=1, total_amount=400000, total_tax=8000,
                       status="filed", filing_date="2024-07-31",
                       ack_number="TDS-Q1-2024-25-TV")
    create_tds_return(db, c.id, "TDS", "Q2", "2024-25",
                       total_entries=1, total_amount=50000, total_tax=5000,
                       status="filed", filing_date="2024-10-31",
                       ack_number="TDS-Q2-2024-25-TV")
    create_tds_return(db, c.id, "TDS", "Q3", "2024-25",
                       total_entries=2, total_amount=70000, total_tax=1900,
                       status="filed", filing_date="2025-01-31",
                       ack_number="TDS-Q3-2024-25-TV")
    create_tds_return(db, c.id, "TDS", "Q4", "2024-25",
                       total_entries=0, total_amount=0, total_tax=0,
                       status="filed", filing_date="2025-04-30",
                       ack_number="TDS-Q4-2024-25-TV")

    # ── Payment Allocations ──
    v_pay_inf = db.query(Voucher).filter(Voucher.company_id == c.id,
                                          Voucher.voucher_number == "TV-PAY-2024-0001").first()
    v_inv_inf = db.query(Voucher).filter(Voucher.company_id == c.id,
                                          Voucher.voucher_number == "TV-INV-2024-0001").first()
    if v_pay_inf and v_inv_inf:
        create_payment_allocation(db, c.id, v_inv_inf.id, v_pay_inf.id, 400000,
                                   "2024-05-25", "Partial allocation against Infosys INV-001")
    v_pay_wip = db.query(Voucher).filter(Voucher.company_id == c.id,
                                          Voucher.voucher_number == "TV-PAY-2024-0002").first()
    v_inv_wip = db.query(Voucher).filter(Voucher.company_id == c.id,
                                          Voucher.voucher_number == "TV-INV-2024-0002").first()
    if v_pay_wip and v_inv_wip:
        create_payment_allocation(db, c.id, v_inv_wip.id, v_pay_wip.id, 200000,
                                   "2024-06-20", "Partial allocation against Wipro INV-002")

    # ── Recurring Templates ──
    RecurringTemplate(
        company_id=c.id, name="Monthly AWS Cloud Hosting",
        voucher_type="purchase",
        template_payload={"items": [
            {"stock_item_id": si_aws.id, "qty": 4, "rate": 42000},
        ], "party_id": p_serverhost.id, "narration": "Monthly AWS cloud hosting subscription"},
        frequency="monthly", next_run_date="2025-09-01",
        last_run_date="2025-08-01", is_active=True)
    db.flush()
    RecurringTemplate(
        company_id=c.id, name="Monthly Infosys Cloud Services",
        voucher_type="sales",
        template_payload={"items": [
            {"stock_item_id": si_aws.id, "qty": 6, "rate": 45000},
        ], "party_id": p_infosys.id, "narration": "Monthly cloud services to Infosys BPO"},
        frequency="monthly", next_run_date="2025-09-01",
        last_run_date="2025-08-01", is_active=True)
    db.flush()

    # ── Bank Statement Lines ──
    create_bank_statement_line(db, c.id, bank_ledger.id, "2024-04-20",
                                "NEFT from Infosys BPO - TV-INV-2024-0001",
                                debit=0, credit=1200000, reference="NEFT-INF-001")
    create_bank_statement_line(db, c.id, bank_ledger.id, "2024-05-01",
                                "NEFT from Wipro - TV-INV-2024-0002",
                                debit=0, credit=800000, reference="NEFT-WIP-001")
    create_bank_statement_line(db, c.id, bank_ledger.id, "2024-05-25",
                                "RTGS to CloudFirst Solutions",
                                debit=400000, credit=0, reference="RTGS-CF-001")
    create_bank_statement_line(db, c.id, bank_ledger.id, "2024-07-01",
                                "NEFT from TCS - TV-INV-2024-0003",
                                debit=0, credit=600000, reference="NEFT-TCS-001")

    _log_counts(db, c)
    return c

def _log_counts(db: Session, c: Company) -> None:
    print(f"  Company '{c.name}' created.")
    print(f"    Vouchers: {db.query(Voucher).filter(Voucher.company_id == c.id).count()}")
    print(f"    Parties: {db.query(Party).filter(Party.company_id == c.id).count()}")
    print(f"    Stock Items: {db.query(StockItem).filter(StockItem.company_id == c.id).count()}")
    print(f"    Stock Groups: {db.query(StockGroup).filter(StockGroup.company_id == c.id).count()}")
    print(f"    Units: {db.query(Unit).filter(Unit.company_id == c.id).count()}")
    print(f"    Cost Centres: {db.query(CostCentre).filter(CostCentre.company_id == c.id).count()}")
    print(f"    TDS Sections: {db.query(TdsTcsSection).filter(TdsTcsSection.company_id == c.id).count()}")
    print(f"    TDS Entries: {db.query(TdsTcsEntry).filter(TdsTcsEntry.company_id == c.id).count()}")
    print(f"    Bank Lines: {db.query(BankStatementLine).filter(BankStatementLine.company_id == c.id).count()}")
    print(f"    E-Invoices: {db.query(EInvoice).filter(EInvoice.company_id == c.id).count()}")
    print(f"    E-Way Bills: {db.query(EwayBill).filter(EwayBill.company_id == c.id).count()}")
    print(f"    GST Returns: {db.query(GstReturn).filter(GstReturn.company_id == c.id).count()}")
    print(f"    Payment Allocs: {db.query(PaymentAllocation).filter(PaymentAllocation.company_id == c.id).count()}")
    print(f"    Recurring Tmpls: {db.query(RecurringTemplate).filter(RecurringTemplate.company_id == c.id).count()}")


# ─── Main ─────────────────────────────────────────────────────────────────

def seed_manufacturing(db: Session, company_id: str) -> None:
    """Create realistic BOMs and production orders for Apex Enterprises.

    BOMs model electronics assembly:
    - Wireless Mouse: PCB + Sensor + Battery + Housing + Cable → 1 Mouse
    - USB Flash Drive: PCB + Metal Casing → 1 USB Drive
    """
    from app.services.manufacturing import create_bom, create_production_order, confirm_production_order

    items = {i.name: i for i in db.query(StockItem).filter(StockItem.company_id == company_id).all()}

    # Finished goods (existing)
    si_usb = items.get("USB Flash Drive 32GB")
    si_mouse = items.get("Wireless Mouse")

    # Raw materials (new)
    si_pcb_mouse = items.get("Mouse PCB Board")
    si_sensor = items.get("Mouse Optical Sensor")
    si_battery = items.get("AA Battery Pair")
    si_housing = items.get("Plastic Mouse Housing")
    si_usb_cable = items.get("USB Cable 1m")
    si_pcb_usb = items.get("USB Flash Drive PCB")
    si_casing = items.get("Metal Drive Casing")

    if not all([si_usb, si_mouse, si_pcb_mouse, si_sensor, si_battery,
                si_housing, si_usb_cable, si_pcb_usb, si_casing]):
        print(f"  Skipping manufacturing seed — missing stock items for {company_id[:8]}...")
        return

    # Initialize stock balances for raw materials (needed for cost reports)
    raw_materials = [
        (si_pcb_mouse, 200, 85.0),
        (si_sensor, 200, 120.0),
        (si_battery, 300, 25.0),
        (si_housing, 200, 45.0),
        (si_usb_cable, 200, 35.0),
        (si_pcb_usb, 150, 180.0),
        (si_casing, 150, 60.0),
    ]
    for si, qty, rate in raw_materials:
        sb = StockBalance(
            company_id=company_id,
            stock_item_id=si.id,
            quantity=qty,
            avg_rate=Decimal(str(rate)),
            total_value=Decimal(str(qty * rate)),
            last_entry_date="2026-07-01",
        )
        db.add(sb)
    db.flush()

    from app.schemas.manufacturing import BomCreate, BomLineCreate, ProductionOrderCreate

    # ── BOM 1: Wireless Mouse Assembly ──
    bom_mouse = create_bom(db, company_id, BomCreate(
        name="Wireless Mouse Assembly",
        finished_item_id=si_mouse.id,
        output_qty=1.0,
        lines=[
            BomLineCreate(stock_item_id=si_pcb_mouse.id, quantity=1.0, wastage_pct=2.0),
            BomLineCreate(stock_item_id=si_sensor.id, quantity=1.0, wastage_pct=0),
            BomLineCreate(stock_item_id=si_battery.id, quantity=1.0, wastage_pct=0),
            BomLineCreate(stock_item_id=si_housing.id, quantity=1.0, wastage_pct=0),
            BomLineCreate(stock_item_id=si_usb_cable.id, quantity=1.0, wastage_pct=0),
        ],
    ))
    print(f"  BOM 1: {bom_mouse.name} (output: {bom_mouse.output_qty})")

    # ── BOM 2: USB Flash Drive Assembly ──
    bom_usb = create_bom(db, company_id, BomCreate(
        name="USB Flash Drive Assembly",
        finished_item_id=si_usb.id,
        output_qty=1.0,
        lines=[
            BomLineCreate(stock_item_id=si_pcb_usb.id, quantity=1.0, wastage_pct=1.0),
            BomLineCreate(stock_item_id=si_casing.id, quantity=1.0, wastage_pct=0),
        ],
    ))
    print(f"  BOM 2: {bom_usb.name} (output: {bom_usb.output_qty})")

    # ── Production Orders ──
    admin = db.query(User).filter(User.email == "admin@zledger.com").first()
    user_id = admin.id if admin else None

    # Order 1: Mouse assembly — completed
    order1 = create_production_order(db, company_id, user_id, ProductionOrderCreate(
        bom_id=bom_mouse.id,
        order_date="2026-07-01",
        planned_qty=50.0,
        narration="Batch 1: Assemble 50 wireless mice for City Mart order",
    ))
    confirm_production_order(db, company_id, order1.id)
    print(f"  Order 1: {order1.order_number} (completed, 50 mice)")

    # Order 2: USB drive assembly — draft
    order2 = create_production_order(db, company_id, user_id, ProductionOrderCreate(
        bom_id=bom_usb.id,
        order_date="2026-07-10",
        planned_qty=30.0,
        narration="Batch 2: USB drives for Royal Emporium — awaiting PCB delivery",
    ))
    print(f"  Order 2: {order2.order_number} (draft, 30 drives)")

    db.commit()


def seed_manufacturing_greenleaf(db: Session, company_id: str) -> None:
    """Create BOMs and production orders for GreenLeaf Organics.
    GreenLeaf repacks bulk organic goods into retail packs.
    """
    from app.services.manufacturing import create_bom, create_production_order, confirm_production_order

    items = {i.name: i for i in db.query(StockItem).filter(StockItem.company_id == company_id).all()}

    si_rice = items.get("Organic Basmati Rice 1kg")
    si_bulk_rice = items.get("Organic Basmati Rice 25kg")
    si_pouches = items.get("Eco-Friendly Pouches 1kg")
    si_label = items.get("Product Labels Roll 1000")
    si_honey = items.get("Organic Forest Honey 500g")
    si_bulk_honey = items.get("Bulk Forest Honey 5kg")

    if not all([si_rice, si_bulk_rice, si_pouches, si_label, si_honey, si_bulk_honey]):
        print(f"  Skipping manufacturing seed — missing stock items for GreenLeaf")
        return

    from app.schemas.manufacturing import BomCreate, BomLineCreate, ProductionOrderCreate
    from decimal import Decimal

    # Stock balances for raw materials (skip if already exists from opening stock)
    existing_sbs = {sb.stock_item_id for sb in db.query(StockBalance).filter(StockBalance.company_id == company_id).all()}
    rms = [
        (si_bulk_rice, 20, 2000.0),
        (si_pouches, 1000, 2.50),
        (si_label, 500, 1.50),
        (si_bulk_honey, 10, 1400.0),
    ]
    for si, qty, rate in rms:
        if si.id in existing_sbs:
            continue
        db.add(StockBalance(
            company_id=company_id, stock_item_id=si.id,
            quantity=qty, avg_rate=Decimal(str(rate)),
            total_value=Decimal(str(qty * rate)),
            last_entry_date="2026-07-01",
        ))
    db.flush()

    # BOM 1: Rice Repacking (25kg bulk → 25 retail packs)
    bom_rice = create_bom(db, company_id, BomCreate(
        name="Basmati Rice 1kg Repacking",
        finished_item_id=si_rice.id,
        output_qty=25.0,
        lines=[
            BomLineCreate(stock_item_id=si_bulk_rice.id, quantity=1.0, wastage_pct=0.5),
            BomLineCreate(stock_item_id=si_pouches.id, quantity=25.0, wastage_pct=1.0),
            BomLineCreate(stock_item_id=si_label.id, quantity=25.0, wastage_pct=0.5),
        ],
    ))
    print(f"  BOM 1: {bom_rice.name} (output: {bom_rice.output_qty})")

    # BOM 2: Honey Bottling (5kg bulk → 10 x 500g bottles)
    bom_honey = create_bom(db, company_id, BomCreate(
        name="Honey Bottling 5kg → 500ml",
        finished_item_id=si_honey.id,
        output_qty=10.0,
        lines=[
            BomLineCreate(stock_item_id=si_bulk_honey.id, quantity=1.0, wastage_pct=1.0),
            BomLineCreate(stock_item_id=si_label.id, quantity=10.0, wastage_pct=0.5),
        ],
    ))
    print(f"  BOM 2: {bom_honey.name} (output: {bom_honey.output_qty})")

    # Production Orders
    admin = db.query(User).filter(User.email == "admin@zledger.com").first()
    user_id = admin.id if admin else None

    # Order 1: Rice repacking — completed
    order1 = create_production_order(db, company_id, user_id, ProductionOrderCreate(
        bom_id=bom_rice.id,
        order_date="2026-07-02",
        planned_qty=200.0,
        narration="Pack 200 units of Organic Basmati Rice 1kg for Nature's Basket order",
    ))
    confirm_production_order(db, company_id, order1.id)
    print(f"  Order 1: {order1.order_number} (completed, 200 packs)")

    # Order 2: Honey — draft
    order2 = create_production_order(db, company_id, user_id, ProductionOrderCreate(
        bom_id=bom_honey.id,
        order_date="2026-07-15",
        planned_qty=50.0,
        narration="Bottle 50 units of Forest Honey for HealthFirst Retail",
    ))
    print(f"  Order 2: {order2.order_number} (draft, 50 bottles)")

    db.commit()


def seed_manufacturing_buildright(db: Session, company_id: str) -> None:
    """Create BOMs and production orders for BuildRight Construction.
    BuildRight manufactures precast concrete blocks from raw materials.
    """
    from app.services.manufacturing import create_bom, create_production_order, confirm_production_order

    items = {i.name: i for i in db.query(StockItem).filter(StockItem.company_id == company_id).all()}

    si_cement = items.get("Portland Cement 50kg")
    si_sand = items.get("River Sand Fine Grade")
    si_aggregate = items.get("Coarse Aggregate 20mm")
    si_precast = items.get("Precast Concrete Block 40x20x20cm")

    if not all([si_cement, si_sand, si_aggregate, si_precast]):
        print(f"  Skipping manufacturing seed — missing stock items for BuildRight")
        return

    from app.schemas.manufacturing import BomCreate, BomLineCreate, ProductionOrderCreate
    from decimal import Decimal

    # Stock balances for raw materials (skip if already exists from opening stock)
    existing_sbs = {sb.stock_item_id for sb in db.query(StockBalance).filter(StockBalance.company_id == company_id).all()}
    rms = [
        (si_cement, 100, 350.0),
        (si_sand, 5000, 1.50),
        (si_aggregate, 4000, 2.00),
    ]
    for si, qty, rate in rms:
        if si.id in existing_sbs:
            continue
        db.add(StockBalance(
            company_id=company_id, stock_item_id=si.id,
            quantity=qty, avg_rate=Decimal(str(rate)),
            total_value=Decimal(str(qty * rate)),
            last_entry_date="2026-07-01",
        ))
    db.flush()

    # BOM: Precast Concrete Block (M20 mix: 1 cement : 1.5 sand : 3 aggregate)
    # Per block: 0.5 bag cement + 25kg sand + 50kg aggregate
    bom_block = create_bom(db, company_id, BomCreate(
        name="Precast Concrete Block M20 Mix",
        finished_item_id=si_precast.id,
        output_qty=1.0,
        lines=[
            BomLineCreate(stock_item_id=si_cement.id, quantity=0.5, wastage_pct=2.0),
            BomLineCreate(stock_item_id=si_sand.id, quantity=25.0, wastage_pct=3.0),
            BomLineCreate(stock_item_id=si_aggregate.id, quantity=50.0, wastage_pct=3.0),
        ],
    ))
    print(f"  BOM 1: {bom_block.name} (output: {bom_block.output_qty})")

    # Production Order
    admin = db.query(User).filter(User.email == "admin@zledger.com").first()
    user_id = admin.id if admin else None

    order1 = create_production_order(db, company_id, user_id, ProductionOrderCreate(
        bom_id=bom_block.id,
        order_date="2026-07-05",
        planned_qty=100.0,
        narration="Cast 100 precast concrete blocks for Project Alpha site work",
    ))
    confirm_production_order(db, company_id, order1.id)
    print(f"  Order 1: {order1.order_number} (completed, 100 blocks)")

    db.commit()


def seed_manufacturing_medix(db: Session, company_id: str) -> None:
    """Create BOMs and production orders for Medix Pharma.
    Medix assembles first aid kits from surgical and pharmaceutical supplies.
    """
    from app.services.manufacturing import create_bom, create_production_order, confirm_production_order

    items = {i.name: i for i in db.query(StockItem).filter(StockItem.company_id == company_id).all()}

    si_gloves = items.get("Disposable Gloves (100 nos)")
    si_bandage = items.get("Bandage Roll 10cm x 2m")
    si_antiseptic = items.get("Antiseptic Solution 100ml")
    si_gauze = items.get("Sterile Gauze Pad 10x10cm (5-pk)")
    si_tape = items.get("Adhesive Tape Roll 2.5cm x 5m")
    si_fakit = items.get("Comprehensive First Aid Kit")

    if not all([si_gloves, si_bandage, si_antiseptic, si_gauze, si_tape, si_fakit]):
        print(f"  Skipping manufacturing seed — missing stock items for Medix")
        return

    from app.schemas.manufacturing import BomCreate, BomLineCreate, ProductionOrderCreate
    from decimal import Decimal

    # Stock balances for raw materials (skip if already exists from opening stock)
    existing_sbs = {sb.stock_item_id for sb in db.query(StockBalance).filter(StockBalance.company_id == company_id).all()}
    rms = [
        (si_gloves, 200, 250.0),
        (si_bandage, 500, 15.0),
        (si_antiseptic, 300, 35.0),
        (si_gauze, 600, 12.0),
        (si_tape, 400, 8.0),
    ]
    for si, qty, rate in rms:
        if si.id in existing_sbs:
            continue
        db.add(StockBalance(
            company_id=company_id, stock_item_id=si.id,
            quantity=qty, avg_rate=Decimal(str(rate)),
            total_value=Decimal(str(qty * rate)),
            last_entry_date="2026-07-01",
        ))
    db.flush()

    # BOM: First Aid Kit
    bom_fakit = create_bom(db, company_id, BomCreate(
        name="Comprehensive First Aid Kit Assembly",
        finished_item_id=si_fakit.id,
        output_qty=1.0,
        lines=[
            BomLineCreate(stock_item_id=si_bandage.id, quantity=2.0, wastage_pct=0),
            BomLineCreate(stock_item_id=si_antiseptic.id, quantity=1.0, wastage_pct=0),
            BomLineCreate(stock_item_id=si_gauze.id, quantity=3.0, wastage_pct=0),
            BomLineCreate(stock_item_id=si_tape.id, quantity=1.0, wastage_pct=0),
            BomLineCreate(stock_item_id=si_gloves.id, quantity=1.0, wastage_pct=0),
        ],
    ))
    print(f"  BOM 1: {bom_fakit.name} (output: {bom_fakit.output_qty})")

    # Production Orders
    admin = db.query(User).filter(User.email == "admin@zledger.com").first()
    user_id = admin.id if admin else None

    # Order 1: Completed
    order1 = create_production_order(db, company_id, user_id, ProductionOrderCreate(
        bom_id=bom_fakit.id,
        order_date="2026-07-03",
        planned_qty=25.0,
        narration="Assemble 25 first aid kits for City Hospital bulk order",
    ))
    confirm_production_order(db, company_id, order1.id)
    print(f"  Order 1: {order1.order_number} (completed, 25 kits)")

    # Order 2: Draft
    order2 = create_production_order(db, company_id, user_id, ProductionOrderCreate(
        bom_id=bom_fakit.id,
        order_date="2026-07-20",
        planned_qty=50.0,
        narration="Batch 2: 50 kits for HealthFirst Pharmacy — awaiting antiseptic delivery",
    ))
    print(f"  Order 2: {order2.order_number} (draft, 50 kits)")

    db.commit()


def seed_manufacturing_techvista(db: Session, company_id: str) -> None:
    """Create BOMs and production orders for TechVista Solutions.
    TechVista assembles server rack units from hardware components.
    """
    from app.services.manufacturing import create_bom, create_production_order, confirm_production_order

    items = {i.name: i for i in db.query(StockItem).filter(StockItem.company_id == company_id).all()}

    si_server = items.get("Dell PowerEdge Server R740")
    si_switch = items.get("Cisco Catalyst 9300 Switch")
    si_ups = items.get("APC Smart-UPS 3000VA")
    si_cabling = items.get("Structured Cabling (per point)")
    si_rack = items.get("Assembled Server Rack Unit")

    if not all([si_server, si_switch, si_ups, si_cabling, si_rack]):
        print(f"  Skipping manufacturing seed — missing stock items for TechVista")
        return

    from app.schemas.manufacturing import BomCreate, BomLineCreate, ProductionOrderCreate
    from decimal import Decimal

    # Stock balances for raw materials (skip if already exists from opening stock)
    existing_sbs = {sb.stock_item_id for sb in db.query(StockBalance).filter(StockBalance.company_id == company_id).all()}
    rms = [
        (si_server, 10, 350000.0),
        (si_switch, 8, 125000.0),
        (si_ups, 10, 85000.0),
        (si_cabling, 100, 800.0),
    ]
    for si, qty, rate in rms:
        if si.id in existing_sbs:
            continue
        db.add(StockBalance(
            company_id=company_id, stock_item_id=si.id,
            quantity=qty, avg_rate=Decimal(str(rate)),
            total_value=Decimal(str(qty * rate)),
            last_entry_date="2026-07-01",
        ))
    db.flush()

    # BOM: Assembled Server Rack
    bom_rack = create_bom(db, company_id, BomCreate(
        name="Server Rack Assembly (2U x 4 servers)",
        finished_item_id=si_rack.id,
        output_qty=1.0,
        lines=[
            BomLineCreate(stock_item_id=si_server.id, quantity=4.0, wastage_pct=0),
            BomLineCreate(stock_item_id=si_switch.id, quantity=2.0, wastage_pct=0),
            BomLineCreate(stock_item_id=si_ups.id, quantity=2.0, wastage_pct=0),
            BomLineCreate(stock_item_id=si_cabling.id, quantity=10.0, wastage_pct=2.0),
        ],
    ))
    print(f"  BOM 1: {bom_rack.name} (output: {bom_rack.output_qty})")

    # Production Order
    admin = db.query(User).filter(User.email == "admin@zledger.com").first()
    user_id = admin.id if admin else None

    order1 = create_production_order(db, company_id, user_id, ProductionOrderCreate(
        bom_id=bom_rack.id,
        order_date="2026-07-10",
        planned_qty=2.0,
        narration="Assemble 2 server racks for Wipro data center expansion project",
    ))
    confirm_production_order(db, company_id, order1.id)
    print(f"  Order 1: {order1.order_number} (completed, 2 racks)")

    db.commit()


# ═══════════════════════════════════════════════════════════════════════════
# GENERIC COMPANY-TYPE SEEDER — one company per constitution type
# ═══════════════════════════════════════════════════════════════════════════

import random
import string
from datetime import date, timedelta

random.seed(42)

# Industry presets: each provides stock groups/items and an expense profile.
INDUSTRIES = {
    "trading": dict(
        items=[
            ("Stationery", "A4 Paper Ream", "4801", 12, "Nos", 220, 180),
            ("Stationery", "Ball Pen", "9608", 18, "Nos", 18, 30),
            ("Electronics", "Wireless Mouse", "8471", 18, "Nos", 450, 320),
            ("Electronics", "USB Flash Drive 32GB", "8523", 18, "Nos", 380, 290),
            ("Office Supplies", "Printer Cartridge", "8443", 18, "Nos", 1500, 1100),
            ("Furniture", "Office Chair", "9401", 18, "Nos", 4200, 3200),
        ],
        finished=["Wireless Mouse", "USB Flash Drive 32GB", "Office Chair"],
        raw=["A4 Paper Ream", "Ball Pen", "Printer Cartridge"],
    ),
    "manufacturing": dict(
        items=[
            ("Components", "Steel Rod 10mm", "7214", 18, "Kg", 75, 60),
            ("Components", "Aluminium Sheet", "7606", 18, "Kg", 240, 200),
            ("Components", "Copper Wire", "7408", 18, "Kg", 780, 690),
            ("Components", "PVC Granules", "3904", 18, "Kg", 95, 80),
            ("Finished Goods", "Steel Bracket", "7308", 18, "Nos", 320, 230),
            ("Finished Goods", "Assembled Panel", "8538", 18, "Nos", 1850, 1400),
            ("Finished Goods", "Wiring Harness", "8544", 18, "Nos", 540, 410),
        ],
        finished=["Steel Bracket", "Assembled Panel", "Wiring Harness"],
        raw=["Steel Rod 10mm", "Aluminium Sheet", "Copper Wire", "PVC Granules"],
    ),
    "pharma": dict(
        items=[
            ("Medicines", "Paracetamol 500mg", "3004", 12, "Strip", 30, 22),
            ("Medicines", "Amoxicillin 250mg", "3004", 12, "Strip", 55, 40),
            ("Medicines", "Cetirizine 10mg", "3004", 12, "Strip", 18, 12),
            ("Medical Supplies", "Surgical Gloves", "4015", 12, "Box", 420, 330),
            ("Medical Supplies", "IV Fluid Set", "9018", 12, "Nos", 65, 48),
            ("Equipment", "Digital Thermometer", "9025", 12, "Nos", 280, 210),
        ],
        finished=["Paracetamol 500mg", "Amoxicillin 250mg", "Surgical Gloves", "Digital Thermometer"],
        raw=["Paracetamol 500mg", "Amoxicillin 250mg", "Cetirizine 10mg"],
    ),
    "construction": dict(
        items=[
            ("Cement", "OPC Cement 50kg", "2523", 28, "Bag", 420, 360),
            ("Steel", "TMT Bar 12mm", "7214", 18, "Kg", 78, 66),
            ("Aggregates", "Crushed Stone 20mm", "2517", 5, "Ton", 950, 800),
            ("Sand", "River Sand", "2505", 5, "CuM", 2100, 1800),
            ("Finishing", "Wall Putty", "3214", 18, "Kg", 42, 33),
            ("Finishing", "Emulsion Paint", "3209", 18, "Ltr", 320, 260),
        ],
        finished=["OPC Cement 50kg", "TMT Bar 12mm", "Wall Putty", "Emulsion Paint"],
        raw=["OPC Cement 50kg", "TMT Bar 12mm", "Crushed Stone 20mm", "River Sand"],
    ),
    "it_services": dict(
        items=[
            ("Services", "Software Development Service", "9983", 18, "Nos", 150000, 0),
            ("Services", "Annual Maintenance Contract", "9987", 18, "Nos", 60000, 0),
            ("Services", "Cloud Hosting Service", "9984", 18, "Nos", 24000, 0),
            ("Services", "Consulting Service", "9983", 18, "Nos", 80000, 0),
            ("Hardware", "Laptop", "8471", 18, "Nos", 62000, 54000),
            ("Hardware", "Server Rack", "8471", 18, "Nos", 48000, 40000),
        ],
        finished=["Software Development Service", "Annual Maintenance Contract", "Cloud Hosting Service"],
        raw=["Laptop", "Server Rack"],
    ),
    "retail": dict(
        items=[
            ("Grocery", "Basmati Rice 1kg", "1006", 5, "Pkg", 140, 110),
            ("Grocery", "Refined Oil 1L", "1512", 5, "Pkg", 145, 118),
            ("Beverages", "Tea 250gm", "0902", 5, "Pkg", 240, 195),
            ("Household", "Detergent 1kg", "3402", 18, "Pkg", 120, 92),
            ("Personal Care", "Shampoo 200ml", "3305", 18, "Pkg", 95, 70),
            ("Snacks", "Biscuits Pack", "1905", 12, "Pkg", 30, 22),
        ],
        finished=["Basmati Rice 1kg", "Refined Oil 1L", "Tea 250gm", "Detergent 1kg"],
        raw=["Basmati Rice 1kg", "Refined Oil 1L", "Biscuits Pack"],
    ),
    "ngo": dict(
        items=[
            ("Relief Goods", "Food Kit", "9991", 0, "Kit", 850, 700),
            ("Relief Goods", "Blanket", "6301", 5, "Nos", 320, 260),
            ("Relief Goods", "Hygiene Kit", "9991", 0, "Kit", 450, 380),
            ("Services", "Training Program", "9992", 0, "Nos", 12000, 0),
            ("Administration", "Office Supplies", "4801", 12, "Nos", 220, 180),
        ],
        finished=["Food Kit", "Blanket", "Training Program"],
        raw=["Office Supplies", "Blanket"],
    ),
    "finance": dict(
        items=[
            ("Financial Products", "Loan Processing Fee", "9971", 18, "Nos", 2500, 0),
            ("Financial Products", "Advisory Fee", "9971", 18, "Nos", 18000, 0),
            ("Financial Products", "Wealth Management Fee", "9971", 18, "Nos", 45000, 0),
            ("Equipment", "ATM Terminal", "8471", 18, "Nos", 95000, 82000),
            ("Equipment", "POS Machine", "8471", 18, "Nos", 8000, 6500),
        ],
        finished=["Loan Processing Fee", "Advisory Fee", "Wealth Management Fee"],
        raw=["ATM Terminal", "POS Machine"],
    ),
    "agriculture": dict(
        items=[
            ("Seeds", "Wheat Seed 10kg", "1209", 0, "Bag", 650, 520),
            ("Fertilizer", "Urea 50kg", "3102", 0, "Bag", 290, 235),
            ("Produce", "Basmati Paddy", "1006", 0, "Quintal", 2200, 1800),
            ("Produce", "Fresh Vegetables", "0709", 0, "Kg", 40, 28),
            ("Equipment", "Power Tiller", "8432", 12, "Nos", 45000, 38000),
        ],
        finished=["Basmati Paddy", "Fresh Vegetables", "Wheat Seed 10kg"],
        raw=["Urea 50kg", "Power Tiller"],
    ),
}

# Constitution → (display suffix, legal suffix, industry, registration_type, tds_heavy, einvoice_heavy)
COMPANY_TYPE_PLAN = [
    ("proprietorship", "Apex Enterprises", "trading", "regular", False, False),
    ("partnership", "Partnership Uttar Co", "it_services", "regular", True, False),
    ("private_limited", "Pvt Ltd Karnataka Co", "manufacturing", "regular", False, True),
]

STATE_NAMES = {
    "27": "Maharashtra", "29": "Karnataka", "24": "Gujarat", "33": "Tamil Nadu",
    "06": "Haryana", "09": "Uttar Pradesh", "19": "West Bengal", "36": "Telangana",
}
INTER_STATE_CODES = ["29", "24", "33", "06", "09", "19", "36"]

# Renamed COA group display names (kept in sync with app/services/coa.py).
GRP_RECEIVABLES = "Trade Receivables"
GRP_PAYABLES = "Trade Payables"
GRP_DEPOSITS = "Deposits & Security"

CUSTOMER_NAMES = [
    "Royal Emporium", "Global Distributors", "Metro Retail", "Prime Traders",
    "Sterling Enterprises", "Vanguard Supplies", "Bluechip Distributors",
    "Crest Commerce", "Pioneer Agencies", "Summit Sales", "Apex Merchants",
    "Nova Traders", "Orion Impex", "Zenith Wholesale", "Lumen Stores",
]
SUPPLIER_NAMES = [
    "National Wholesale", "Continental Supplies", "Pioneer Components",
    "Standard Traders", "Associated Agencies", "Bharat Distributors",
    "Crown Suppliers", "Delta Impex", "Everest Materials", "Frontier Cargo",
    "Granite Holdings", "Horizon Resources", "Indus Traders", "Jupiter Mills",
]
PROF_PARTIES = [
    "Kumar & Associates (CA)", "Mehta Legal", "Rao Consultancy",
    "Sharma Contractors", "Infra Builders", "Tech Maintenance Pvt Ltd",
]


def _gstin_for(state_code: str, seq: int) -> str:
    # Valid GSTIN = 2-char state + 10-char PAN + 1-char entity + 'Z' + 1-char check.
    # PAN = 5 letters + 4 digits + 1 letter (10 chars).
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    pan = (
        f"{letters[seq % 26]}{letters[(seq // 26) % 26]}"
        f"{letters[(seq * 3) % 26]}{letters[(seq * 5) % 26]}{letters[(seq * 7) % 26]}"
        f"{1000 + (seq % 9000)}"
        f"{letters[(seq * 11) % 26]}"
    )
    if len(pan) != 10:
        pan = f"AAZPL{1000 + (seq % 9000)}A"
    return f"{state_code}{pan}1Z{letters[seq % 26]}"


def _pan_for(seq: int) -> str:
    # PAN = 5 letters + 4 digits + 1 letter (10 chars).
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return (
        f"{letters[seq % 26]}{letters[(seq // 26) % 26]}{letters[(seq * 3) % 26]}"
        f"{letters[(seq * 5) % 26]}{letters[(seq * 7) % 26]}"
        f"{1000 + (seq % 9000)}"
        f"{letters[(seq * 11) % 26]}"
    )


def _balance_opening_entries(db: Session, company_id: str) -> None:
    """Ensure the company opens with balanced books.

    Asset/liability opening balances (bank, debtors, creditors) are seeded with
    no offsetting capital. Compute the net of all ledger openings and set the
    Capital Account opening to absorb it so Dr == Cr at opening.
    """
    dr = db.execute(
        text("SELECT COALESCE(SUM(opening_balance),0) FROM ledgers "
             "WHERE company_id=:cid AND opening_balance_type='Dr'"),
        {"cid": company_id},
    ).scalar() or 0
    cr = db.execute(
        text("SELECT COALESCE(SUM(opening_balance),0) FROM ledgers "
             "WHERE company_id=:cid AND opening_balance_type='Cr'"),
        {"cid": company_id},
    ).scalar() or 0
    net = float(dr) - float(cr)  # >0 => excess Dr, needs Cr capital
    if abs(net) < 0.01:
        return
    cap = find_ledger(db, company_id, "Capital Account")
    if not cap:
        return
    cap.opening_balance = abs(net)
    cap.opening_balance_type = "Cr" if net > 0 else "Dr"
    db.flush()


def seed_company_type(
    db: Session, admin_user: User, idx: int,
    constitution: str, suffix: str, industry: str,
    registration_type: str, tds_heavy: bool, einvoice_heavy: bool,
) -> Company:
    # Company #1 keeps the canonical "Apex Enterprises" identity expected by
    # the existing E2E fixtures ( Maharashtra, GSTIN 27AABCP1234A1Z5 ).
    if idx == 0:
        state_code = "27"
        pan = "AABCP1234A"
        gstin = "27AABCP1234A1Z5"
        base_name = "Apex Enterprises"
    else:
        state_code = random.choice(list(STATE_NAMES.keys()))
        pan = _pan_for(idx)
        gstin = _gstin_for(state_code, 100 + idx) if registration_type == "regular" else None
        base_name = f"{suffix} {STATE_NAMES[state_code].split()[0]} Co"
    state_name = STATE_NAMES[state_code]
    legal = f"{base_name} ({suffix})" if idx != 0 else "Apex Enterprises Private Limited"
    print(f"\n=== Creating Company {idx+1}: {base_name} [{constitution}] ===")

    c = create_company(db, admin_user.id, name=base_name, legal_name=legal,
                       gstin=gstin if registration_type == "regular" else None,
                       state_code=state_code, pan=pan,
                       address=f"Plot {idx+1}, {state_name} Industrial Area",
                       phone=f"0{random.randint(11,99)}-{random.randint(10000000,99999999)}",
                       email=f"accounts{idx+1}@example.in",
                       website=f"www.{base_name.split()[0].lower()}.in",
                       bank_name="HDFC Bank", bank_account_number=f"50{random.randint(100000000000,999999999999)}",
                       bank_ifsc="HDFC0001234", bank_branch=f"{state_name} Branch",
                       books_begin_from="2023-04-01",
                       tan=("".join(random.choices(string.ascii_uppercase, k=4)) + f"{random.randint(10000,99999)}" + random.choice(string.ascii_uppercase)) if registration_type=="regular" else None,
                        cin=(f"L{idx+10000:05d}{chr(65+idx)}{chr(66+idx)}{2023}PTC{idx:06d}" if constitution in ("private_limited","public_limited","llp") else None),
                       constitution=constitution,
                       income_tax_regime="new" if constitution in ("proprietorship","huf","others") else "old",
                       audit_required=(constitution in ("private_limited","public_limited","llp","trust","society","public_limited")))

    # ── Financial Years (4: 2023-24, 2024-25, 2025-26 closed, 2026-27 open) ──
    fys = [
        create_fy(db, c.id, "2023-24", "2023-04-01", "2024-03-31", is_closed=True),
        create_fy(db, c.id, "2024-25", "2024-04-01", "2025-03-31", is_closed=True),
        create_fy(db, c.id, "2025-26", "2025-04-01", "2026-03-31", is_closed=True),
        create_fy(db, c.id, "2026-27", "2026-04-01", "2027-03-31"),
    ]

    cash = find_ledger(db, c.id, "Cash")
    bank = find_ledger(db, c.id, "Bank Account")
    # Rename default bank ledger to the canonical demo bank so test fixtures
    # (LEDGERS.hdfcBank = "HDFC Bank - Current A/c") stay valid across companies.
    if bank:
        bank.name = "HDFC Bank - Current A/c"
    # extra bank ledger
    bank2 = create_ledger(db, c.id, "SBI Bank - Savings A/c", "Bank Accounts", opening=150000, opening_type="Dr")
    # Generic control ledgers referenced by test fixtures / standard books.
    create_ledger(db, c.id, GRP_RECEIVABLES, GRP_RECEIVABLES, opening=0)
    create_ledger(db, c.id, GRP_PAYABLES, GRP_PAYABLES, opening=0)
    # expense ledgers
    rent = create_ledger(db, c.id, "Rent", "Indirect Expenses", opening=0)
    salary = create_ledger(db, c.id, "Salaries & Wages", "Indirect Expenses", opening=0)
    electricity = create_ledger(db, c.id, "Electricity Charges", "Indirect Expenses", opening=0)
    professional = create_ledger(db, c.id, "Professional Fees", "Indirect Expenses", opening=0)
    interest = create_ledger(db, c.id, "Interest on Investments", "Indirect Incomes", opening=0)

    # ── Parties ──
    customers, suppliers, prof = [], [], []
    for i, nm in enumerate(CUSTOMER_NAMES[:10]):
        pstate = random.choice(INTER_STATE_CODES if random.random() > 0.4 else [state_code])
        pl = create_ledger(db, c.id, f"{nm}", GRP_RECEIVABLES,
                           opening=random.choice([0, 0, 0, 5000, 12000]), opening_type="Dr")
        p = create_party(db, c.id, nm, "customer", pl.id,
                         gstin=_gstin_for(pstate, i) if pstate != state_code or random.random() > 0.5 else None,
                         state_code=pstate, pan=_pan_for(i), address=f"{i+1} Market Road")
        customers.append(p)
    for i, nm in enumerate(SUPPLIER_NAMES[:10]):
        pstate = random.choice(INTER_STATE_CODES if random.random() > 0.4 else [state_code])
        pl = create_ledger(db, c.id, f"{nm}", GRP_PAYABLES,
                           opening=random.choice([0, 0, 8000, 15000]), opening_type="Cr")
        p = create_party(db, c.id, nm, "supplier", pl.id,
                         gstin=_gstin_for(pstate, i+10) if pstate != state_code or random.random() > 0.5 else None,
                         state_code=pstate, pan=_pan_for(i+10), address=f"{i+1} Supply Lane")
        suppliers.append(p)
    if tds_heavy:
        for i, nm in enumerate(PROF_PARTIES):
            pl = create_ledger(db, c.id, f"{nm}", GRP_PAYABLES,
                               opening=random.choice([0, 0, 6000]), opening_type="Cr")
            p = create_party(db, c.id, nm, "supplier", pl.id,
                             state_code=state_code, pan=_pan_for(i+20), address="Pro Office")
            prof.append(p)

    # Canonical demo parties for Apex Enterprises (expected by existing E2E specs).
    if idx == 0:
        for nm, role in [("Royal Emporium", "customer"), ("Metro Retail", "customer"),
                         ("City Mart", "customer"), ("Global Distributors", "supplier"),
                         ("Prime Imports", "supplier")]:
            if db.query(Party).filter(Party.company_id == c.id, Party.name == nm).first():
                continue
            pl = create_ledger(db, c.id, f"{nm}" if role == "customer" else f"{nm}",
                               GRP_RECEIVABLES if role == "customer" else GRP_PAYABLES,
                               opening=10000 if role == "customer" else 8000,
                               opening_type="Dr" if role == "customer" else "Cr")
            p = create_party(db, c.id, nm, role, pl.id,
                             gstin=_gstin_for(state_code, 50) if role == "customer" else _gstin_for("29", 51),
                             state_code=state_code if role == "customer" else "29",
                             pan="ABZP5000Q", address="Demo Address")
            (customers if role == "customer" else suppliers).append(p)

    # ── Stock items ──
    ind = INDUSTRIES[industry]
    sg_map = {}
    item_objs = {}
    for grp, nm, hsn, rate, uom, op_rate, op_qty in ind["items"]:
        sg = sg_map.get(grp) or create_stock_group(db, c.id, grp)
        sg_map[grp] = sg
        si = create_stock_item(db, c.id, nm, sg.id, hsn, rate, uom,
                               opening_qty=op_qty, opening_rate=op_rate,
                               sku=f"SKU-{idx}{len(item_objs):03d}")
        item_objs[nm] = si
        # ensure HSN/SAC master exists
        if not db.query(HsnSac).filter(HsnSac.company_id == c.id, HsnSac.code == hsn).first():
            db.add(HsnSac(company_id=c.id, code=hsn, description=nm, gst_rate=rate))
    db.flush()

    # ── GST registration + sections ──
    if registration_type == "regular":
        create_gst_reg(db, c.id, gstin, legal, state_code, pan=pan,
                       registration_type="regular")
        # TDS sections
        sec_194c = create_tds_section(db, c.id, "194C", "Payments to contractors", "TDS", 2.0, 30000)
        sec_194j = create_tds_section(db, c.id, "194J", "Professional/technical fees", "TDS", 10.0, 30000)
        sec_194h = create_tds_section(db, c.id, "194H", "Commission/brokerage", "TDS", 5.0, 15000)
        if tds_heavy:
            create_tds_section(db, c.id, "194I", "Rent of plant/machinery", "TDS", 2.0, 240000)
    else:
        comp_gstin = _gstin_for(state_code, 200 + idx) if not gstin else gstin
        create_gst_reg(db, c.id, comp_gstin, legal, state_code, pan=pan,
                       registration_type="composition", composition_rate=1.0)

    # ── Per-FY bulk data ──
    for fy in fys:
        _seed_fy_transactions(db, c, fy, admin_user, customers, suppliers, prof,
                              item_objs, ind, cash, bank, bank2, rent, salary,
                              electricity, professional, interest,
                              state_code, registration_type, tds_heavy, einvoice_heavy)

    # ── Manufacturing / assets (generic, built from this company's items) ──
    _seed_manufacturing_generic(db, c.id, item_objs, ind)
    _seed_fixed_assets_generic(db, c.id)
    seed_batches(db, c.id)
    _seed_production_orders_generic(db, c.id, admin_user, item_objs, ind)
    seed_work_centers_and_routings(db, c.id)

    # ── Balance opening entries ──
    # Asset/liability opening balances (bank, debtors, creditors, fixed assets)
    # are seeded with no offsetting capital. Set the Capital Account opening to
    # the net so the company books open balanced (Dr == Cr).
    _balance_opening_entries(db, c.id)

    db.commit()
    return c


def _seed_fy_transactions(db, c, fy, admin_user, customers, suppliers, prof,
                          item_objs, ind, cash, bank, bank2, rent, salary,
                          electricity, professional, interest, state_code,
                          registration_type, tds_heavy, einvoice_heavy):
    company_id = c.id
    user_id = admin_user.id
    items = list(item_objs.values())
    fy_start = date.fromisoformat(fy.start_date)
    fy_end = date.fromisoformat(fy.end_date)
    # ~ monthly spread
    months = (fy_end.year - fy_start.year) * 12 + (fy_end.month - fy_start.month)
    days_total = (fy_end - fy_start).days

    sales_n = 50 if fy.is_closed else 25
    purch_n = 35 if fy.is_closed else 18

    for n in range(sales_n):
        d = fy_start + timedelta(days=random.randint(0, max(1, days_total - 1)))
        cust = random.choice(customers)
        pstate = cust.state_code or state_code
        nitems = random.randint(1, 3)
        chosen = random.sample(items, min(nitems, len(items)))
        lines = []
        for si in chosen:
            qty = random.randint(1, 20)
            rate = round(float(si.opening_rate or 100) * random.uniform(0.9, 1.3), 2)
            if rate == 0:
                rate = round(random.uniform(500, 5000), 2)
            lines.append({"stock_item_id": si.id, "qty": qty, "rate": rate})
        v = build_sales_voucher(db, company_id, user_id,
                                f"S-{fy.name[:4]}-{n+1:04d}", d.isoformat(),
                                lines, cust.id, bank.id, state_code, pstate,
                                narration=f"Sale to {cust.name}", reference=f"INV-{n+1}")
        if einvoice_heavy and v.grand_total and float(v.grand_total) > 50000:
            gr = db.query(GstRegistration).filter(GstRegistration.company_id == company_id).first()
            create_einvoice(db, company_id, v.id, gr.id if gr else None,
                           status="generated", irn=f"IRN{random.randint(10**14, 10**15-1)}",
                           ack_no=str(random.randint(10**12, 10**13-1)), ack_dt=d.isoformat())
            if float(v.grand_total) > 100000:
                create_eway_bill(db, company_id, v.id, gr.id if gr else None,
                                 status="generated", eway_bill_number=str(random.randint(10**11, 10**12-1)),
                                 vehicle_number=f"MH{random.randint(1,99) if state_code!='27' else random.randint(1,99)}-AB-{random.randint(1000,9999)}",
                                 transport_mode="Road", distance_km=random.randint(50, 800),
                                 from_state=state_code, to_state=pstate)

    for n in range(purch_n):
        d = fy_start + timedelta(days=random.randint(0, max(1, days_total - 1)))
        sup = random.choice(suppliers)
        pstate = sup.state_code or state_code
        nitems = random.randint(1, 3)
        chosen = random.sample(items, min(nitems, len(items)))
        lines = []
        for si in chosen:
            qty = random.randint(1, 15)
            rate = round(float(si.opening_rate or 100) * random.uniform(0.85, 1.15), 2)
            if rate == 0:
                rate = round(random.uniform(400, 4000), 2)
            lines.append({"stock_item_id": si.id, "qty": qty, "rate": rate})
        build_purchase_voucher(db, company_id, user_id,
                               f"P-{fy.name[:4]}-{n+1:04d}", d.isoformat(), lines,
                               sup.id, bank.id, state_code, pstate,
                               narration=f"Purchase from {sup.name}", reference=f"BILL-{n+1}")

    # Credit notes (subset)
    for n in range(max(2, sales_n // 10)):
        d = fy_start + timedelta(days=random.randint(0, max(1, days_total - 1)))
        cust = random.choice(customers)
        pstate = cust.state_code or state_code
        si = random.choice(items)
        build_credit_note_voucher(db, company_id, user_id,
                                  f"CN-{fy.name[:4]}-{n+1:03d}", d.isoformat(),
                                  [{"stock_item_id": si.id, "qty": random.randint(1, 3),
                                    "rate": round(float(si.opening_rate or 200), 2)}],
                                  cust.id, bank.id, state_code, pstate,
                                  narration="Sales return")

    # Debit notes
    for n in range(max(2, purch_n // 10)):
        d = fy_start + timedelta(days=random.randint(0, max(1, days_total - 1)))
        sup = random.choice(suppliers)
        pstate = sup.state_code or state_code
        si = random.choice(items)
        build_debit_note_voucher(db, company_id, user_id,
                                 f"DN-{fy.name[:4]}-{n+1:03d}", d.isoformat(),
                                 [{"stock_item_id": si.id, "qty": random.randint(1, 3),
                                   "rate": round(float(si.opening_rate or 200), 2)}],
                                 sup.id, bank.id, state_code, pstate,
                                 narration="Purchase return")

    # Payments / receipts / journals / contra
    for m in range(max(1, months)):
        d = fy_start + timedelta(days=int((days_total / max(1, months)) * m))
        build_payment_receipt_voucher(db, company_id, user_id, "payment",
                                      f"PAY-{fy.name[:4]}-{m+1:03d}", d.isoformat(),
                                      round(random.uniform(20000, 90000), 2),
                                      rent.id if m % 2 == 0 else salary.id, bank.id,
                                      narration="Expense payment")
        build_payment_receipt_voucher(db, company_id, user_id, "receipt",
                                      f"RCV-{fy.name[:4]}-{m+1:03d}", d.isoformat(),
                                      round(random.uniform(30000, 120000), 2),
                                      random.choice(customers).ledger_id, bank.id,
                                      party_id=random.choice(customers).id,
                                      narration="Receipt from customer")
        if registration_type == "regular":
            elec_amt = round(random.uniform(3000, 12000), 2)
            build_journal_voucher(db, company_id, user_id,
                                  f"JV-{fy.name[:4]}-{m+1:03d}", d.isoformat(),
                                  [{"ledger_id": electricity.id, "debit": elec_amt},
                                   {"ledger_id": bank.id, "credit": elec_amt}],
                                  narration="Electricity & bank transfer")
            build_contra_voucher(db, company_id, user_id,
                                 f"CT-{fy.name[:4]}-{m+1:03d}", d.isoformat(),
                                 bank.id, cash.id, round(random.uniform(5000, 40000), 2),
                                 narration="Cash withdrawal")

    # TDS entries + returns
    if tds_heavy:
        sec194c = db.query(TdsTcsSection).filter(TdsTcsSection.company_id == company_id,
                                                 TdsTcsSection.section_code == "194C").first()
        sec194j = db.query(TdsTcsSection).filter(TdsTcsSection.company_id == company_id,
                                                 TdsTcsSection.section_code == "194J").first()
        for n in range(8):
            d = fy_start + timedelta(days=random.randint(0, max(1, days_total - 1)))
            sec = sec194c if n % 2 == 0 else sec194j
            if not sec:
                continue
            amt = round(random.uniform(50000, 300000), 2)
            tax = round(amt * sec.rate / 100, 2)
            party = random.choice(prof) if prof else None
            pv = build_payment_receipt_voucher(db, company_id, user_id, "payment",
                                               f"TDS-{fy.name[:4]}-{n+1:03d}", d.isoformat(),
                                               amt, professional.id, bank.id,
                                               party_id=party.id if party else None,
                                               narration=f"Payment to {party.name if party else 'party'} (TDS {sec.section_code})")
            db.add(TdsTcsEntry(company_id=company_id, voucher_id=pv.id,
                               section_id=sec.id,
                               party_id=party.id if party else None,
                               tds_tcs_type="TDS", base_amount=amt,
                               rate=sec.rate, deducted_amount=tax,
                               entry_date=d.isoformat(), status="deducted"))
        # TDS return per quarter
        for q in ["Q1", "Q2", "Q3", "Q4"]:
            create_tds_return(db, company_id, "24Q" if tds_heavy else "26Q", q,
                              fy.name, total_entries=2, total_amount=200000,
                              total_tax=20000, status="filed",
                              filing_date=fy_start.isoformat(), ack_number=f"ACK{random.randint(10**9,10**10-1)}")

    # GST returns (monthly GSTR-1 + GSTR-3B) for open/closed FYs
    if registration_type == "regular":
        gr = db.query(GstRegistration).filter(GstRegistration.company_id == company_id).first()
        gr_id = gr.id if gr else None
        for m in range(max(1, months)):
            d = fy_start + timedelta(days=int((days_total / max(1, months)) * m))
            period = _month_period(d)
            create_gst_return(db, company_id, gr_id,
                              "GSTR1", period, status="filed",
                              filed_date=d.isoformat(),
                              ack_number=f"G1{random.randint(10**10,10**11-1)}",
                              data_json={"summary": "auto"})
            create_gst_return(db, company_id, gr_id,
                              "GSTR3B", period, status="filed",
                              filed_date=d.isoformat(),
                              ack_number=f"G3{random.randint(10**10,10**11-1)}",
                              data_json={"summary": "auto"})
        create_gst_return(db, company_id,
                          gr_id,
                          "GSTR9", fy.name, status="filed",
                          filed_date=fy_start.isoformat(),
                          ack_number=f"G9{random.randint(10**10,10**11-1)}")

    # Recurring templates
    db.add(RecurringTemplate(company_id=company_id, name="Monthly Rent",
             voucher_type="payment", frequency="monthly",
             next_run_date="2026-08-01", is_active=True,
             template_payload={"narration": "Monthly rent",
                              "lines": [{"ledger_name": "Rent", "debit": 45000, "credit": 0},
                                        {"ledger_name": "Bank Account", "debit": 0, "credit": 45000}]},
             created_by=user_id))
    db.add(RecurringTemplate(company_id=company_id, name="Monthly Salary",
             voucher_type="payment", frequency="monthly",
             next_run_date="2026-08-01", is_active=True,
             template_payload={"narration": "Salary",
                              "lines": [{"ledger_name": "Salaries & Wages", "debit": 120000, "credit": 0},
                                        {"ledger_name": "Bank Account", "debit": 0, "credit": 120000}]},
             created_by=user_id))

    # Bank statement lines + reconciliation
    for n in range(10):
        d = fy_start + timedelta(days=random.randint(0, max(1, days_total - 1)))
        create_bank_statement_line(db, company_id, bank.id, d.isoformat(),
                                   random.choice(["NEFT receipt", "UPI payment", "Cheque clear"]),
                                   debit=round(random.uniform(1000, 50000), 2) if n % 2 else 0,
                                   credit=round(random.uniform(1000, 50000), 2) if n % 2 == 0 else 0,
                                   reference=f"BTX-{n+1}")


def _month_period(d: date, m: int | None = None) -> str | None:
    if m is not None:
        d = d + timedelta(days=int(30 * m))
    return f"{d.year % 100:02d}{d.month:02d}"


def _quarter(d: str) -> str:
    m = int(d[5:7])
    if 4 <= m <= 6: return "Q1"
    if 7 <= m <= 9: return "Q2"
    if 10 <= m <= 12: return "Q3"
    return "Q4"


def _seed_manufacturing_generic(db: Session, company_id: str, item_objs: dict, ind: dict) -> None:
    from app.services.manufacturing import create_bom
    from app.schemas.manufacturing import BomCreate, BomLineCreate

    finished = [item_objs[n] for n in ind["finished"] if n in item_objs]
    raw = [item_objs[n] for n in ind["raw"] if n in item_objs]
    if len(finished) < 1 or len(raw) < 1:
        return
    # Stock balances for raw materials (only if not already created by opening qty)
    from app.models.stock import StockBalance as SB
    for si in raw:
        exists = db.query(SB).filter(SB.company_id == company_id,
                                     SB.stock_item_id == si.id).first()
        if exists:
            continue
        qty = 200
        rate = float(si.opening_rate or 100)
        db.add(StockBalance(company_id=company_id, stock_item_id=si.id,
                            quantity=qty, avg_rate=Decimal(str(rate)),
                            total_value=Decimal(str(qty * rate)),
                            last_entry_date="2026-07-01"))
    db.flush()
    # One BOM: first finished from up to 3 raw
    bom = create_bom(db, company_id, BomCreate(
        name=f"{finished[0].name} Assembly",
        finished_item_id=finished[0].id, output_qty=1.0,
        lines=[BomLineCreate(stock_item_id=r.id, quantity=1.0, wastage_pct=2.0) for r in raw[:3]],
    ))
    print(f"  BOM: {bom.name}")


def _seed_production_orders_generic(db: Session, company_id: str, admin_user: User, item_objs: dict, ind: dict) -> None:
    """Create sample production orders against the company's BOM(s)."""
    from app.services.manufacturing import create_production_order, confirm_production_order
    from app.schemas.manufacturing import ProductionOrderCreate
    from app.models.manufacturing import BillOfMaterials

    boms = db.query(BillOfMaterials).filter(BillOfMaterials.company_id == company_id).all()
    if not boms:
        return
    user_id = admin_user.id if admin_user else None
    # One DRAFT order for the first BOM (matches frontend test expectation),
    # and one CONFIRMED order for the second BOM (if any).
    order1 = create_production_order(db, company_id, user_id, ProductionOrderCreate(
        bom_id=boms[0].id,
        order_date="2026-07-01",
        planned_qty=50.0,
        narration="Batch 1: assemble finished goods (draft)",
    ))
    if len(boms) > 1:
        order2 = create_production_order(db, company_id, user_id, ProductionOrderCreate(
            bom_id=boms[1].id,
            order_date="2026-07-10",
            planned_qty=30.0,
            narration="Batch 2: second BOM (confirmed)",
        ))
        confirm_production_order(db, company_id, order2.id)
    db.flush()


def _seed_fixed_assets_generic(db: Session, company_id: str) -> None:
    from app.models.asset import AssetCategory, AssetRegister
    cats = {"Computers & Electronics": ("wdv", 12.5, 5),
            "Office Furniture": ("wdv", 5.28, 10),
            "Motor Vehicles": ("wdv", 15.0, 8)}
    cat_map = {}
    for name, (method, rate, life) in cats.items():
        cat = AssetCategory(company_id=company_id, name=name,
                            depreciation_method=method, rate_pct=rate,
                            useful_life_years=life, is_active=True)
        db.add(cat); db.flush(); cat_map[name] = cat
    assets = [
        ("Computers & Electronics", "IT-001", "Dell Laptop", "2025-07-01", 85000, 5000),
        ("Office Furniture", "FUR-001", "Workstation", "2025-09-10", 200000, 15000),
        ("Motor Vehicles", "VEH-001", "Delivery Van", "2025-11-01", 650000, 50000),
    ]
    for cn, code, nm, pdate, cost, salv in assets:
        c = cat_map.get(cn)
        if c:
            db.add(AssetRegister(company_id=company_id, category_id=c.id,
                                 asset_code=code, name=nm, purchase_date=pdate,
                                 cost=cost, salvage_value=salv, wdv=cost,
                                 put_to_use_date=pdate, is_active=True))
    db.flush()


def seed_all_company_types(db: Session, admin_user: User) -> list[Company]:
    companies = []
    for idx, (constitution, suffix, industry, reg_type, tds_h, einv_h) in enumerate(COMPANY_TYPE_PLAN):
        c = seed_company_type(db, admin_user, idx, constitution, suffix, industry,
                              reg_type, tds_h, einv_h)
        companies.append(c)
    return companies


def main() -> None:
    print("=" * 60)
    print("ZLedger Demo Data Seeder — all company types")
    print("=" * 60)

    max_retries = 3
    for attempt in range(1, max_retries + 1):
        db = SessionLocal()
        try:
            Base.metadata.create_all(bind=engine)

            admin = db.query(User).filter(User.email == "admin@zledger.com").first()
            if not admin:
                print("ERROR: admin@zledger.com not found. Bootstrap the app first.")
                sys.exit(1)
            print(f"Admin: {admin.email} (id={admin.id[:8]}...)")

            # Wipe EVERYTHING except the superadmin user.
            truncate_all(db)

            # Create one company per constitution/company-type, each with full data.
            companies = seed_all_company_types(db, admin)

            total_users = db.query(User).count()
            total_companies = db.query(Company).count()
            total_members = db.query(CompanyMember).count()
            total_vouchers = db.query(Voucher).count()
            total_vl = db.query(VoucherLine).count()
            total_parties = db.query(Party).count()
            total_items = db.query(StockItem).count()
            total_groups = db.query(AccountGroup).count()
            total_ledgers = db.query(Ledger).count()
            total_fy = db.query(FinancialYear).count()
            total_gst = db.query(GstReturn).count()

            print("\n" + "=" * 60)
            print("SEED COMPLETE")
            print("=" * 60)
            print(f"  Users:          {total_users}   (superadmin only)")
            print(f"  Companies:      {total_companies}   (one per constitution type)")
            print(f"  CompanyMembers: {total_members}")
            print(f"  FinancialYears: {total_fy}")
            print(f"  Vouchers:       {total_vouchers}")
            print(f"  Voucher Lines:  {total_vl}")
            print(f"  Parties:        {total_parties}")
            print(f"  Stock Items:    {total_items}")
            print(f"  GST Returns:    {total_gst}")
            print(f"  Account Groups: {total_groups}")
            print(f"  Ledgers:        {total_ledgers}")
            print("=" * 60)
            print("Login: admin@zledger.com / katheikei (superadmin, owner of all companies)")
            print("=" * 60)
            break

        except Exception as e:
            db.close()
            if attempt < max_retries:
                import time
                print(f"  Seed attempt {attempt} failed: {e}")
                print(f"  Retrying in 3s (attempt {attempt+1}/{max_retries})...")
                time.sleep(3)
            else:
                print(f"  Seed failed after {max_retries} attempts: {e}")
                raise
        finally:
            db.close()


def seed_batches(db: Session, company_id: str) -> None:
    """Create sample batches for items with batch tracking enabled."""
    from app.models.batch import Batch, BatchLedger
    from app.models.stock import StockItem

    # Ensure the raw-material items referenced by the sample batches exist
    # (the bulk industry seed may not include them for every company).
    rm_group = db.query(AccountGroup).filter(
        AccountGroup.company_id == company_id,
        AccountGroup.system_code == "GRP_RAW_MATERIALS",
    ).first()
    if not rm_group:
        rm_group = create_stock_group(db, company_id, "Raw Materials")
    raw_material_items = {
        "Mouse PCB Board": ("8473", 18),
        "USB Flash Drive PCB": ("8473", 18),
        "Metal Drive Casing": ("8302", 18),
    }
    existing = {i.name: i for i in db.query(StockItem).filter(StockItem.company_id == company_id).all()}
    for name, (hsn, rate) in raw_material_items.items():
        if name not in existing:
            si = create_stock_item(db, company_id, name, rm_group.id, hsn, rate, uom="Nos")
            existing[name] = si

    # Enable batch tracking on some raw materials and finished goods
    items = existing

    # Enable batch tracking on key items
    batch_tracked_items = [
        "Mouse PCB Board", "USB Flash Drive PCB", "Metal Drive Casing",
        "Wireless Mouse", "USB Flash Drive 32GB",
    ]
    for item_name in batch_tracked_items:
        item = items.get(item_name)
        if item:
            item.tracking_mode = "batch"
    db.flush()

    # Create batches for raw materials
    batch_data = [
        ("Mouse PCB Board", "PCB-M-2026-001", "2026-06-15", None, 100.0),
        ("Mouse PCB Board", "PCB-M-2026-002", "2026-06-20", None, 100.0),
        ("USB Flash Drive PCB", "PCB-U-2026-001", "2026-06-10", None, 80.0),
        ("USB Flash Drive PCB", "PCB-U-2026-002", "2026-06-25", None, 70.0),
        ("Metal Drive Casing", "CAS-2026-001", "2026-06-12", None, 80.0),
        ("Metal Drive Casing", "CAS-2026-002", "2026-06-22", None, 70.0),
    ]

    batches = {}
    for item_name, batch_number, mfg_date, exp_date, qty in batch_data:
        item = items.get(item_name)
        if not item:
            continue
        batch = Batch(
            company_id=company_id,
            stock_item_id=item.id,
            batch_number=batch_number,
            manufacturing_date=mfg_date,
            expiry_date=exp_date,
            quantity=qty,
            status="active",
        )
        db.add(batch)
        batches[(item_name, batch_number)] = batch
    db.flush()

    # Create batches for finished goods from completed production orders
    # Order 1: 50 mice completed
    mouse = items.get("Wireless Mouse")
    if mouse:
        batch = Batch(
            company_id=company_id,
            stock_item_id=mouse.id,
            batch_number="PRD-2026-0001",
            manufacturing_date="2026-07-01",
            quantity=50.0,
            status="active",
        )
        db.add(batch)
    db.flush()

    print(f"  Created {len(batches)} raw material batches + 1 finished goods batch")
    db.commit()


def seed_fixed_assets(db: Session, company_id: str) -> None:
    """Create sample fixed asset categories and assets for depreciation demo."""
    from app.models.asset import AssetCategory, AssetRegister

    cats = {
        "Computers & Electronics": ("wdv", 12.5, 5),
        "Office Furniture": ("wdv", 5.28, 10),
        "Motor Vehicles": ("wdv", 15.0, 8),
    }
    cat_map: dict[str, AssetCategory] = {}
    for name, (method, rate, life) in cats.items():
        c = AssetCategory(
            company_id=company_id,
            name=name,
            depreciation_method=method,
            rate_pct=rate,
            useful_life_years=life,
            is_active=True,
        )
        db.add(c)
        db.flush()
        cat_map[name] = c

    assets = [
        ("Computers & Electronics", "IT-001", "Dell Latitude Laptop", "2026-07-01", 85000, 5000),
        ("Computers & Electronics", "IT-002", "HP Desktop Workstation", "2026-09-15", 120000, 8000),
        ("Office Furniture", "FUR-001", "Modular Workstation Set", "2026-05-10", 200000, 15000),
        ("Motor Vehicles", "VEH-001", "Delivery Van", "2026-04-01", 650000, 50000),
    ]
    for cat_name, code, name, pdate, cost, salvage in assets:
        cat = cat_map.get(cat_name)
        if not cat:
            continue
        a = AssetRegister(
            company_id=company_id,
            category_id=cat.id,
            asset_code=code,
            name=name,
            purchase_date=pdate,
            cost=cost,
            salvage_value=salvage,
            wdv=cost,
            put_to_use_date=pdate,
            is_active=True,
        )
        db.add(a)
    db.flush()
    print(f"  Created {len(cat_map)} asset categories + {len(assets)} assets")
    db.commit()


def seed_work_centers_and_routings(db: Session, company_id: str) -> None:
    """Create sample work centers and routings for manufacturing."""
    from app.models.manufacturing import WorkCenter, Routing, RoutingOperation, BillOfMaterials
    from app.models.stock import StockItem

    items = {i.name: i for i in db.query(StockItem).filter(StockItem.company_id == company_id).all()}

    # Create work centers
    wc_data = [
        ("Assembly Line A", "Production", 10, "units/hr", 250.0),
        ("Soldering Station", "Production", 15, "units/hr", 180.0),
        ("Testing Lab", "Quality", 20, "units/hr", 150.0),
        ("Packaging", "Shipping", 25, "units/hr", 120.0),
    ]
    work_centers = {}
    for name, dept, cap, unit, rate in wc_data:
        wc = WorkCenter(
            company_id=company_id, name=name, department=dept,
            capacity=cap, capacity_unit=unit, hourly_rate=rate, is_active=True,
        )
        db.add(wc)
        work_centers[name] = wc
    db.flush()

    # Create routings for BOMs
    boms = {b.name: b for b in db.query(BillOfMaterials).filter(BillOfMaterials.company_id == company_id).all()}

    # Mouse Assembly Routing
    mouse_bom = boms.get("Wireless Mouse Assembly")
    if mouse_bom:
        routing = Routing(
            company_id=company_id, name="Mouse Assembly Routing",
            finished_item_id=mouse_bom.finished_item_id, is_active=True,
        )
        db.add(routing)
        db.flush()
        ops = [
            (1, "Soldering Station", "Solder PCB components", 10, 2.5),
            (2, "Assembly Line A", "Assemble mouse body", 5, 3.0),
            (3, "Testing Lab", "Quality testing", 5, 1.5),
            (4, "Packaging", "Pack finished product", 3, 1.0),
        ]
        for step, wc_name, desc, setup, run in ops:
            op = RoutingOperation(
                routing_id=routing.id, step_number=step,
                work_center_id=work_centers[wc_name].id,
                description=desc, setup_time_minutes=setup,
                run_time_per_unit_minutes=run,
            )
            db.add(op)

    # USB Drive Assembly Routing
    usb_bom = boms.get("USB Drive Assembly")
    if usb_bom:
        routing = Routing(
            company_id=company_id, name="USB Drive Assembly Routing",
            finished_item_id=usb_bom.finished_item_id, is_active=True,
        )
        db.add(routing)
        db.flush()
        ops = [
            (1, "Soldering Station", "Solder flash chip to PCB", 8, 2.0),
            (2, "Assembly Line A", "Assemble drive casing", 5, 2.5),
            (3, "Testing Lab", "Flash firmware & test", 10, 3.0),
            (4, "Packaging", "Package USB drive", 3, 1.0),
        ]
        for step, wc_name, desc, setup, run in ops:
            op = RoutingOperation(
                routing_id=routing.id, step_number=step,
                work_center_id=work_centers[wc_name].id,
                description=desc, setup_time_minutes=setup,
                run_time_per_unit_minutes=run,
            )
            db.add(op)

    db.flush()
    print(f"  Created {len(work_centers)} work centers + 2 routings")
    db.commit()


if __name__ == "__main__":
    main()
