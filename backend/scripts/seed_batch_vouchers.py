#!/usr/bin/env python3
"""Batch voucher generator — adds hundreds of realistic vouchers to each company.

Run AFTER the main seed script:
    docker-compose exec api python scripts/seed_demo_data.py
    docker-compose exec api python scripts/seed_batch_vouchers.py
"""
from __future__ import annotations
import sys, os, random
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.db import SessionLocal, engine, Base
from app.models import *
from app.models.user import User, Company
from app.models.accounting import AccountGroup, Ledger, Party, HsnSac
from app.models.stock import StockGroup, StockItem
from app.models.voucher import Voucher, VoucherLine
from app.models.recurring_template import RecurringTemplate
from app.models.masters import Unit

random.seed(42)


def rnd(a):
    return float(Decimal(str(a)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def find_ledger(db, cid, name):
    return db.query(Ledger).filter(Ledger.company_id == cid, Ledger.name == name).first()


def _week_dates(start, end, interval=7):
    s = datetime.strptime(start, "%Y-%m-%d")
    e = datetime.strptime(end, "%Y-%m-%d")
    dates = []
    while s <= e:
        dates.append(s.strftime("%Y-%m-%d"))
        s += timedelta(days=interval)
    return dates


def _pick(items, n=3):
    n = min(n, len(items))
    chosen = random.sample(items, n)
    return [{"stock_item_id": i["id"], "qty": random.randint(5, 50),
             "rate": i["rate"]} for i in chosen]


def _create_voucher(db, cid, uid, vtype, vnum, vdate, **kw):
    kw.setdefault("status", "posted")
    v = Voucher(company_id=cid, voucher_type=vtype, voucher_number=vnum,
                voucher_date=vdate, created_by=uid, **kw)
    db.add(v)
    db.flush()
    return v


def _add_line(db, vid, lid, debit=0, credit=0, stock_item_id=None,
              quantity=None, rate=None, taxable_value=None,
              cgst_amount=None, sgst_amount=None, igst_amount=None, is_inter_state=False):
    vl = VoucherLine(voucher_id=vid, ledger_id=lid, debit=debit, credit=credit,
                     stock_item_id=stock_item_id, quantity=quantity, rate=rate,
                     taxable_value=taxable_value, cgst_amount=cgst_amount,
                     sgst_amount=sgst_amount, igst_amount=igst_amount,
                     is_inter_state=is_inter_state)
    db.add(vl)
    db.flush()
    return vl


def _build_sales(db, cid, uid, num, date, items, party_id, bank_id, comp_state, party_state,
                 narration=None, reference=None, due_date=None):
    sales_led = find_ledger(db, cid, "Sales")
    is_inter = party_state != comp_state
    v = _create_voucher(db, cid, uid, "sales", num, date,
                        narration=narration, reference=reference, party_id=party_id,
                        place_of_supply=party_state, counterparty_state_code=party_state,
                        due_date=due_date)
    total_tax = Decimal("0")
    for item in items:
        si = db.get(StockItem, item["stock_item_id"])
        if not si:
            continue
        qty = Decimal(str(item["qty"]))
        rate = Decimal(str(item["rate"]))
        gst = Decimal(str(si.gst_rate))
        taxable = Decimal(str(rnd(qty * rate)))
        tax_amt = rnd(taxable * gst / Decimal("100"))
        if is_inter:
            igst = tax_amt
            cgst = sgst = Decimal("0")
        else:
            cgst = sgst = rnd(Decimal(str(tax_amt)) / Decimal("2"))
            igst = Decimal("0")
        total_tax += Decimal(str(tax_amt))
        _add_line(db, v.id, sales_led.id, debit=0, credit=rnd(taxable),
                  stock_item_id=si.id, quantity=float(qty), rate=float(rate),
                  taxable_value=rnd(taxable), cgst_amount=rnd(cgst),
                  sgst_amount=rnd(sgst), igst_amount=rnd(igst), is_inter_state=is_inter)
    v.subtotal = float(sum(Decimal(str(it["qty"])) * Decimal(str(it["rate"])) for it in items))
    v.tax_total = float(total_tax)
    v.grand_total = float(Decimal(str(v.subtotal)) + total_tax)
    return v


def _build_purchase(db, cid, uid, num, date, items, party_id, bank_id, comp_state, party_state,
                    narration=None, due_date=None):
    purchase_led = find_ledger(db, cid, "Purchases")
    is_inter = party_state != comp_state
    v = _create_voucher(db, cid, uid, "purchase", num, date,
                        narration=narration, party_id=party_id,
                        place_of_supply=party_state, counterparty_state_code=party_state,
                        due_date=due_date)
    total_tax = Decimal("0")
    for item in items:
        si = db.get(StockItem, item["stock_item_id"])
        if not si:
            continue
        qty = Decimal(str(item["qty"]))
        rate = Decimal(str(item["rate"]))
        gst = Decimal(str(si.gst_rate))
        taxable = Decimal(str(rnd(qty * rate)))
        tax_amt = rnd(taxable * gst / Decimal("100"))
        if is_inter:
            igst = tax_amt
            cgst = sgst = Decimal("0")
        else:
            cgst = sgst = rnd(Decimal(str(tax_amt)) / Decimal("2"))
            igst = Decimal("0")
        total_tax += Decimal(str(tax_amt))
        _add_line(db, v.id, purchase_led.id, debit=rnd(taxable), credit=0,
                  stock_item_id=si.id, quantity=float(qty), rate=float(rate),
                  taxable_value=rnd(taxable), cgst_amount=rnd(cgst),
                  sgst_amount=rnd(sgst), igst_amount=rnd(igst), is_inter_state=is_inter)
        if bank_id:
            _add_line(db, v.id, bank_id, debit=0, credit=float(taxable + Decimal(str(tax_amt))))
    v.subtotal = float(sum(Decimal(str(it["qty"])) * Decimal(str(it["rate"])) for it in items))
    v.tax_total = float(total_tax)
    v.grand_total = float(Decimal(str(v.subtotal)) + total_tax)
    return v


def _build_payment(db, cid, uid, num, date, amount, party_ledger_id, bank_id, party_id, narration=None):
    v = _create_voucher(db, cid, uid, "payment", num, date,
                        narration=narration, party_id=party_id)
    _add_line(db, v.id, party_ledger_id, debit=amount, credit=0)
    _add_line(db, v.id, bank_id, debit=0, credit=amount)
    v.grand_total = amount
    return v


def _build_receipt(db, cid, uid, num, date, amount, party_ledger_id, bank_id, party_id, narration=None):
    v = _create_voucher(db, cid, uid, "receipt", num, date,
                        narration=narration, party_id=party_id)
    _add_line(db, v.id, bank_id, debit=amount, credit=0)
    _add_line(db, v.id, party_ledger_id, debit=0, credit=amount)
    v.grand_total = amount
    return v


def _build_journal(db, cid, uid, num, date, lines_data, narration=None):
    v = _create_voucher(db, cid, uid, "journal", num, date, narration=narration)
    for ld in lines_data:
        _add_line(db, v.id, ld["ledger_id"], debit=ld.get("debit", 0), credit=ld.get("credit", 0))
    return v


def _get_parties_by_company(db, cid, names):
    result = []
    for name in names:
        p = db.query(Party).filter(Party.company_id == cid, Party.name == name).first()
        if p:
            result.append({"party_id": p.id, "name": p.name,
                           "state_code": p.state_code or "27", "short": name[:4].upper(),
                           "ledger_id": p.ledger_id})
    return result


def _get_items_by_company(db, cid):
    return [{"id": si.id, "rate": float(si.opening_rate or 1000), "uom": si.unit_of_measure}
            for si in db.query(StockItem).filter(StockItem.company_id == cid).all()]


def _count(db, cid):
    return db.query(Voucher).filter(Voucher.company_id == cid).count()


# ═══════════════════════════════════════════════════════════════════════════
# COMPANY GENERATORS
# ═══════════════════════════════════════════════════════════════════════════

def batch_apex(db, c, uid):
    print("  Batch: Apex Enterprises...")
    customers = _get_parties_by_company(db, c.id, ["Royal Emporium", "City Mart", "Metro Retail"])
    suppliers = _get_parties_by_company(db, c.id, ["Global Distributors", "Prime Imports"])
    items = _get_items_by_company(db, c.id)
    bank = find_ledger(db, c.id, "HDFC Bank - Current A/c")
    bank_id = bank.id if bank else None
    capital = find_ledger(db, c.id, "Capital Account")

    n = 0
    for d in _week_dates("2024-04-15", "2025-03-31", 7):
        cust = random.choice(customers)
        n += 1
        _build_sales(db, c.id, uid, f"AX-INV-B{n:04d}", d,
                     _pick(items, random.randint(1, 3)),
                     cust["party_id"], bank_id, "27", cust["state_code"],
                     narration=f"Supply to {cust['name']}",
                     due_date=(datetime.strptime(d, "%Y-%m-%d") + timedelta(days=30)).strftime("%Y-%m-%d"))

    n = 0
    for d in _week_dates("2024-04-10", "2025-03-25", 14):
        supp = random.choice(suppliers)
        n += 1
        _build_purchase(db, c.id, uid, f"AX-PUR-B{n:04d}", d,
                        _pick(items, random.randint(1, 2)),
                        supp["party_id"], bank_id, "27", supp["state_code"],
                        narration=f"Purchase from {supp['name']}")

    n = 0
    for d in _week_dates("2024-05-01", "2025-03-01", 30):
        p = random.choice(customers + suppliers)
        n += 1
        amt = random.randint(50000, 300000)
        _build_receipt(db, c.id, uid, f"AX-RECP-B{n:04d}", d, amt,
                       p["ledger_id"], bank_id, p["party_id"],
                       narration=f"Receipt from {p['name']}")

    n = 0
    for d in _week_dates("2024-06-01", "2025-03-01", 30):
        n += 1
        amt = random.randint(5000, 50000)
        _build_journal(db, c.id, uid, f"AX-JRN-B{n:04d}", d,
                       [{"ledger_id": capital.id, "debit": amt, "credit": 0},
                        {"ledger_id": bank.id, "debit": 0, "credit": amt}],
                       narration="Miscellaneous adjustment")

    print(f"    +{_count(db, c.id)} vouchers (batch)")


def batch_buildright(db, c, uid):
    print("  Batch: BuildRight Construction...")
    customers = _get_parties_by_company(db, c.id, ["Skyline Developers", "Gujarat Metro"])
    suppliers = _get_parties_by_company(db, c.id, ["Gujarat Cement Ltd", "SteelMasters India"])
    items = _get_items_by_company(db, c.id)
    bank = find_ledger(db, c.id, "Axis Bank Business A/c")
    bank_id = bank.id if bank else None

    n = 0
    for d in _week_dates("2024-04-15", "2025-03-31", 7):
        cust = random.choice(customers)
        n += 1
        _build_sales(db, c.id, uid, f"BR-INV-B{n:04d}", d,
                     _pick(items, random.randint(1, 3)),
                     cust["party_id"], bank_id, "24", cust["state_code"],
                     narration=f"Supply to {cust['name']}",
                     due_date=(datetime.strptime(d, "%Y-%m-%d") + timedelta(days=45)).strftime("%Y-%m-%d"))

    n = 0
    for d in _week_dates("2024-04-10", "2025-03-25", 14):
        supp = random.choice(suppliers)
        n += 1
        _build_purchase(db, c.id, uid, f"BR-PUR-B{n:04d}", d,
                        _pick(items, random.randint(1, 2)),
                        supp["party_id"], bank_id, "24", supp["state_code"],
                        narration=f"Purchase from {supp['name']}")

    n = 0
    for d in _week_dates("2024-05-01", "2025-03-01", 30):
        p = random.choice(customers + suppliers)
        n += 1
        amt = random.randint(80000, 400000)
        _build_payment(db, c.id, uid, f"BR-PAY-B{n:04d}", d, amt,
                       p["ledger_id"], bank_id, p["party_id"],
                       narration=f"Payment to {p['name']}")

    print(f"    +{_count(db, c.id)} vouchers (batch)")


def batch_medix(db, c, uid):
    print("  Batch: Medix Pharma Distributors...")
    customers = _get_parties_by_company(db, c.id, [
        "City Hospital", "HealthFirst Pharmacy", "MedPlus Chemist",
        "Lifeline Medical Store", "Wellness Pharmacy",
    ])
    suppliers = _get_parties_by_company(db, c.id, ["Cipla Ltd", "Sun Pharma", "Dr Reddy's Labs"])
    items = _get_items_by_company(db, c.id)
    bank = find_ledger(db, c.id, "ICICI Bank - Pune MIDC")
    bank_id = bank.id if bank else None

    n = 0
    for d in _week_dates("2024-04-15", "2025-03-31", 5):
        cust = random.choice(customers)
        n += 1
        _build_sales(db, c.id, uid, f"MDX-INV-B{n:04d}", d,
                     _pick(items, random.randint(2, 5)),
                     cust["party_id"], bank_id, "27", cust["state_code"],
                     narration=f"Supply to {cust['name']}",
                     due_date=(datetime.strptime(d, "%Y-%m-%d") + timedelta(days=30)).strftime("%Y-%m-%d"))

    n = 0
    for d in _week_dates("2024-04-10", "2025-03-25", 10):
        supp = random.choice(suppliers)
        n += 1
        _build_purchase(db, c.id, uid, f"MDX-PUR-B{n:04d}", d,
                        _pick(items, random.randint(2, 4)),
                        supp["party_id"], bank_id, "27", supp["state_code"],
                        narration=f"Purchase from {supp['name']}")

    n = 0
    for d in _week_dates("2024-05-01", "2025-03-01", 15):
        party = random.choice(customers + suppliers)
        n += 1
        amt = random.randint(100000, 600000)
        _build_receipt(db, c.id, uid, f"MDX-RECP-B{n:04d}", d, amt,
                       party["ledger_id"], bank_id, party["party_id"],
                       narration=f"Receipt from {party['name']}")

    print(f"    +{_count(db, c.id)} vouchers (batch)")


def batch_techvista(db, c, uid):
    print("  Batch: TechVista Solutions...")
    customers = _get_parties_by_company(db, c.id, [
        "Infosys BPO", "Wipro Technologies", "TCS", "Reliance Jio", "HDFC Bank",
    ])
    suppliers = _get_parties_by_company(db, c.id, [
        "CloudFirst Solutions", "DataPipe Analytics", "NetSecure Systems", "ServerHost India",
    ])
    items = _get_items_by_company(db, c.id)
    bank = find_ledger(db, c.id, "Kotak Mahindra - Whitefield")
    bank_id = bank.id if bank else None
    capital = find_ledger(db, c.id, "Capital Account")

    n = 0
    for d in _week_dates("2024-04-15", "2025-03-31", 5):
        cust = random.choice(customers)
        n += 1
        _build_sales(db, c.id, uid, f"TV-INV-B{n:04d}", d,
                     _pick(items, random.randint(1, 3)),
                     cust["party_id"], bank_id, "29", cust["state_code"],
                     narration=f"Supply to {cust['name']}",
                     due_date=(datetime.strptime(d, "%Y-%m-%d") + timedelta(days=30)).strftime("%Y-%m-%d"))

    n = 0
    for d in _week_dates("2024-04-10", "2025-03-25", 10):
        supp = random.choice(suppliers)
        n += 1
        _build_purchase(db, c.id, uid, f"TV-PUR-B{n:04d}", d,
                        _pick(items, random.randint(1, 2)),
                        supp["party_id"], bank_id, "29", supp["state_code"],
                        narration=f"Purchase from {supp['name']}")

    n = 0
    for d in _week_dates("2024-05-01", "2025-03-01", 15):
        party = random.choice(customers + suppliers)
        n += 1
        amt = random.randint(100000, 800000)
        _build_receipt(db, c.id, uid, f"TV-RECP-B{n:04d}", d, amt,
                       party["ledger_id"], bank_id, party["party_id"],
                       narration=f"Receipt from {party['name']}")

    n = 0
    for d in _week_dates("2024-06-01", "2025-03-01", 30):
        n += 1
        amt = random.randint(10000, 100000)
        _build_journal(db, c.id, uid, f"TV-JRN-B{n:04d}", d,
                       [{"ledger_id": capital.id, "debit": amt, "credit": 0},
                        {"ledger_id": bank.id, "debit": 0, "credit": amt}],
                       narration="Miscellaneous adjustment")

    print(f"    +{_count(db, c.id)} vouchers (batch)")


def main():
    print("=" * 60)
    print("ZLedger Batch Voucher Generator")
    print("=" * 60)

    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == "admin@zledger.com").first()
        if not admin:
            print("ERROR: admin@zledger.com not found. Run seed_demo_data.py first.")
            sys.exit(1)

        companies = db.query(Company).all()
        if not companies:
            print("ERROR: No companies found. Run seed_demo_data.py first.")
            sys.exit(1)

        before = db.query(Voucher).count()
        print(f"Existing vouchers: {before}\n")

        for c in companies:
            name = c.name.lower()
            if "apex" in name:
                batch_apex(db, c, admin.id)
            elif "buildright" in name:
                batch_buildright(db, c, admin.id)
            elif "medix" in name:
                batch_medix(db, c, admin.id)
            elif "techvista" in name:
                batch_techvista(db, c, admin.id)
            else:
                print(f"  Skipping {c.name} (no batch generator)")

        db.commit()

        after = db.query(Voucher).count()
        print(f"\n{'=' * 60}")
        print(f"BATCH COMPLETE: {before} → {after} vouchers (+{after - before})")
        print(f"{'=' * 60}")
        for c in companies:
            cnt = db.query(Voucher).filter(Voucher.company_id == c.id).count()
            print(f"  {c.name}: {cnt} vouchers")
        print(f"{'=' * 60}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
