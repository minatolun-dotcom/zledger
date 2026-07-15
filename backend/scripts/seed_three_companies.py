"""Standalone seeder for three additional demo companies in ZLedger.

Companies:
  1. Grace Covenant Church (Non-profit trust, Karnataka)
  2. Himalayan Fresh Juices Pvt Ltd (Fruit-juice manufacturer, Maharashtra)
  3. PureDrop RO Water Solutions Pvt Ltd (RO water & purifier manufacturer, Tamil Nadu)

Run from the backend directory inside the running stack:
    docker compose exec api python -m scripts.seed_three_companies

This script ADDS the three companies to the live database without disturbing
the five existing demo companies. It reuses the builders from
``scripts.seed_demo_data`` so every voucher is double-entry balanced and GST /
stock postings are handled by the same code paths the app uses.
"""

import random
from datetime import date, timedelta
from decimal import Decimal

from scripts.seed_demo_data import (
    rnd, find_ledger, create_ledger, create_company, create_fy, create_gst_reg,
    create_party, create_stock_group, create_stock_item, create_tds_section,
    create_bank_statement_line,
    build_opening_journal, build_sales_voucher, build_purchase_voucher,
    build_contra_voucher, build_payment_receipt_voucher, build_journal_voucher,
    build_credit_note_voucher, build_debit_note_voucher,
    create_voucher, add_line, create_stock_entry,
)
from app.core.db import SessionLocal, engine, Base
from app.models.user import User, Company
from app.models.stock import StockBalance, StockItem
from app.models.asset import AssetCategory, AssetRegister
from app.models.accounting import Ledger
from app.services.stock_valuation import update_stock_balance_weighted_avg
from app.services.manufacturing import (
    create_bom, create_production_order, confirm_production_order,
)
from app.schemas.manufacturing import BomCreate, BomLineCreate, ProductionOrderCreate


RNG = random.Random(20250715)
FY_START = "2025-04-01"
FY_END = "2026-03-31"

# ── Reusable name pools (Indian) ──────────────────────────────────────────
CUSTOMER_NAMES = [
    "City Mart Retail Pvt Ltd", "Royal Emporium", "Metro Hypermarket",
    "Spencers Retail", "Big Basket Wholesale", "Reliance Fresh",
    "Vijay Stores", "Annapoorna Supermarket", "Nilgiri's", "Food World",
    "Provision Mart", "Daily Needs Stores", "Global Traders", "Sri Lakshmi Agencies",
    "Krishna Distributors", "Sai Marketing", "Vaibhav Enterprises", "Om Sai Traders",
    "Lakshmi Provision Stores", "Vinayaka Agencies", "Balaji Wholesale",
    "Shreeji Mart", "Patel Sons", "Gupta Brothers", "Mehta & Co",
    "Southern Supplies", "Coastal Distributors", "Deccan Traders",
    "Heritage Foods", "Mother Dairy Outlet", "Nandini Retail", "Aavin Stores",
    "Hotel Grand Rama", "Cafe Coffee Day", "Domino's Franchise", "Subway Outlet",
    "Canteen Express", "Corporate Cafeteria Pvt Ltd", "Railway Catering",
    "Airport Lounge Services",
]
SUPPLIER_NAMES = [
    "Farm Fresh Produce", "Sahyadri Farmers Coop", "Green Valley Orchards",
    "Krishnagiri Fruit Mandi", "Hosur Agro Farms", "Tamil Nadu Agro Supply",
    "Maharashtra Fruit Growers", "Pune Wholesale Market", "Deccan Agri Ltd",
    "Packer's Paradise", "Bottle Tech Industries", "Crown Caps & Seals",
    "Label Print Systems", "Sugar & Syrup Mills", "Flavour House India",
    "Cold Chain Logistics", "Refrigeration Spares", "Compressor World",
    "PET Bottle Mfg", "Cap & Closure Co", "Carton Box Industries",
    "R.O. Membrane Suppliers", "Filter Media India", "Pump & Motor House",
    "Electrical Components Ltd", "Packaging Films Pvt Ltd", "Adhesive & Tape Co",
    "Industrial Gases Supply", "Chemical Additives", "Mineral Salt Refinery",
]
EMPLOYEE_NAMES = [
    "Amit Sharma", "Priya Nair", "Rahul Verma", "Sunita Reddy", "Vikram Singh",
    "Kavya Menon", "Suresh Kumar", "Deepa Iyer", "Arjun Patel", "Meera Joshi",
    "Ravi Chandra", "Anita Deshmukh", "Karthik Rao", "Lakshmi Priya", "Mohan Das",
    "Geetha V", "Naveen Thomas", "Saranya B", "Prakash Yadav", "Shalini Gupta",
]


# ── Generic helpers ───────────────────────────────────────────────────────
def ensure_ledger(db, company_id, name, group_name, **extra):
    existing = find_ledger(db, company_id, name)
    if existing:
        return existing
    return create_ledger(db, company_id, name, group_name, **extra)


def get_admin(db):
    return db.query(User).filter(User.email == "admin@zledger.com").first()


def add_days(iso, n):
    return (date.fromisoformat(iso) + timedelta(days=n)).isoformat()


# ── Company specs ─────────────────────────────────────────────────────────
def company_specs():
    return [
        dict(
            key="grace",
            name="Grace Covenant Church",
            legal_name="Grace Covenant Church Trust",
            gstin="29AADCG0001A1Z8",
            state_code="29",
            pan="AADCG0001A",
            address="45, Church Street, Richmond Town, Bengaluru 560025",
            phone="080-41234567",
            email="office@gracecovenant.org",
            website="www.gracecovenant.org",
            bank_name="Canara Bank",
            bank_account_number="05671010012345",
            bank_ifsc="CNRB0000567",
            bank_branch="Richmond Town, Bengaluru",
            books_begin_from="2025-04-01",
            industry="church",
        ),
        dict(
            key="himalayan",
            name="Himalayan Fresh Juices Pvt Ltd",
            legal_name="Himalayan Fresh Juices Private Limited",
            gstin="27AAECH0001A1Z2",
            state_code="27",
            pan="AAECH0001A",
            address="Plot 12, MIDC Bhosari, Pune 411026",
            phone="020-67890011",
            email="accounts@himalayanjuices.in",
            website="www.himalayanjuices.in",
            bank_name="HDFC Bank",
            bank_account_number="50100123456789",
            bank_ifsc="HDFC0001234",
            bank_branch="Bhosari, Pune",
            books_begin_from="2025-04-01",
            industry="juice",
        ),
        dict(
            key="puredrop",
            name="PureDrop RO Water Solutions Pvt Ltd",
            legal_name="PureDrop RO Water Solutions Private Limited",
            gstin="33AALCP0001A1Z5",
            state_code="33",
            pan="AALCP0001A",
            address="78, Industrial Estate, Ambattur, Chennai 600058",
            phone="044-23456789",
            email="finance@puredrop.in",
            website="www.puredrop.in",
            bank_name="ICICI Bank",
            bank_account_number="00340123456789",
            bank_ifsc="ICIC0000034",
            bank_branch="Ambattur, Chennai",
            books_begin_from="2025-04-01",
            industry="ro",
        ),
    ]


# ── Stock item templates per industry ─────────────────────────────────────
def stock_items_for(industry):
    items = []  # (name, hsn, gst_rate, uom)
    if industry == "juice":
        flavors = ["Mango", "Orange", "Guava", "Mixed Fruit", "Litchi", "Pineapple",
                   "Watermelon", "Apple", "Grapes", "Pomegranate", "Lemon",
                   "Amla", "Beetroot", "Mosambi", "Strawberry", "Blueberry"]
        sizes = [("200ml", 14.0), ("500ml", 28.0), ("1L", 52.0), ("2L", 98.0)]
        for f in flavors:
            for sz, base in sizes:
                items.append((f"{f} Juice {sz}", "2204", 12.0, "Nos"))
        items += [
            ("Fruit Pulp Concentrate", "2009", 12.0, "Kg"),
            ("Sugar Syrup", "1701", 5.0, "Kg"),
            ("PET Bottle 200ml", "3923", 18.0, "Nos"),
            ("PET Bottle 500ml", "3923", 18.0, "Nos"),
            ("PET Bottle 1L", "3923", 18.0, "Nos"),
            ("PET Bottle 2L", "3923", 18.0, "Nos"),
            ("Bottle Cap 28mm", "8309", 18.0, "Nos"),
            ("Shrink Label", "3919", 18.0, "Nos"),
            ("Corrugated Carton 24x200ml", "4819", 12.0, "Nos"),
            ("Corrugated Carton 12x1L", "4819", 12.0, "Nos"),
            ("Reverse Osmosis Membrane", "8421", 18.0, "Nos"),
            ("Juice Filling Machine Spare", "8438", 18.0, "Nos"),
            ("Preservative Solution", "3824", 18.0, "Ltr"),
            ("Flavour Essence", "3302", 18.0, "Ltr"),
        ]
    elif industry == "ro":
        items += [
            ("Packaged Drinking Water 500ml", "2201", 12.0, "Nos"),
            ("Packaged Drinking Water 1L", "2201", 12.0, "Nos"),
            ("Packaged Drinking Water 2L", "2201", 12.0, "Nos"),
            ("Packaged Drinking Water 5L", "2201", 12.0, "Nos"),
            ("Packaged Drinking Water 20L Can", "2201", 12.0, "Nos"),
            ("RO Purifier Basic", "8421", 18.0, "Nos"),
            ("RO Purifier Deluxe", "8421", 18.0, "Nos"),
            ("Commercial RO Plant 500 LPH", "8421", 18.0, "Nos"),
            ("UV Water Purifier", "8421", 18.0, "Nos"),
            ("Water Filter Candles", "8421", 18.0, "Nos"),
            ("Sediment Filter 10 inch", "8421", 18.0, "Nos"),
            ("Carbon Block Filter", "8421", 18.0, "Nos"),
            ("RO Membrane 300 GPD", "8421", 18.0, "Nos"),
            ("Inline Filter Set", "8421", 18.0, "Nos"),
            ("Water Storage Tank 100L", "3924", 18.0, "Nos"),
            ("SS Water Dispenser", "8419", 18.0, "Nos"),
            ("PET Preform 20L", "3923", 18.0, "Nos"),
            ("Bottle Cap 30mm", "8309", 18.0, "Nos"),
            ("Water Pump 0.5 HP", "8413", 18.0, "Nos"),
            ("PVC Pipe 1 inch", "3917", 18.0, "Mtr"),
            ("Mineral Salt Mix", "2530", 5.0, "Kg"),
            ("Ozone Generator", "8543", 18.0, "Nos"),
        ]
    else:  # church
        items += [
            ("Church Hymn Books", "4901", 0.0, "Nos"),
            ("Communion Wafers", "1905", 0.0, "Pkt"),
            ("Prayer Candles", "3406", 5.0, "Nos"),
            ("Sound System Cables", "8544", 18.0, "Nos"),
            ("LED Stage Lights", "9405", 18.0, "Nos"),
            ("Office Stationery", "4820", 12.0, "Nos"),
            ("Cleaning Supplies", "3405", 18.0, "Nos"),
            ("Sunday School Materials", "4903", 0.0, "Nos"),
            ("Congregation Chairs", "9401", 18.0, "Nos"),
            ("Generators Diesel", "2710", 18.0, "Ltr"),
            ("Borewell Water", "2201", 0.0, "Kl"),
            ("Printed Sermon Booklets", "4911", 12.0, "Nos"),
            ("Musical Instruments", "9207", 18.0, "Nos"),
            ("Altar Flowers", "0603", 0.0, "Nos"),
            ("Church Kitchen Utensils", "7323", 18.0, "Nos"),
        ]
    # generic filler items to broaden the catalogue
    generic = [
        ("Printer Paper A4", "4802", 12.0, "Rim"),
        ("Ink Cartridge", "3215", 18.0, "Nos"),
        ("Cleaning Service", "9985", 18.0, "Job"),
        ("Pest Control", "9985", 18.0, "Job"),
        ("Security Service", "9985", 18.0, "Job"),
        ("Website Hosting", "9983", 18.0, "Yr"),
        ("Software Subscription", "9984", 18.0, "Yr"),
        ("Courier Charges", "9968", 18.0, "Nos"),
    ]
    items += generic
    return items


# ── Core seeding ──────────────────────────────────────────────────────────
def seed_company(db, admin, spec):
    print(f"\n=== Creating Company: {spec['name']} ===")
    company_state = spec["state_code"]
    company_kwargs = {k: v for k, v in spec.items()
                      if k not in ("key", "industry")}
    c = create_company(db, admin.id, **company_kwargs)
    cid = c.id

    create_fy(db, cid, "2024-2025", "2024-04-01", "2025-03-31", is_closed=True)
    fy = create_fy(db, cid, "2025-2026", FY_START, FY_END)
    create_fy(db, cid, "2026-2027", "2026-04-01", "2027-03-31")

    create_gst_reg(db, cid, spec["gstin"], spec["legal_name"], spec["state_code"],
                   pan=spec["pan"], trade_name=spec["name"])

    # ── Ledgers ──
    ensure_ledger(db, cid, "Cash in Hand", "Cash-in-Hand", opening=0)
    bank1 = ensure_ledger(db, cid, f"{spec['bank_name']} - Current A/c", "Bank Accounts", opening=0)
    bank2 = ensure_ledger(db, cid, "Axis Bank - Savings A/c", "Bank Accounts", opening=0)
    banks = [bank1, bank2]

    stock_in_hand = ensure_ledger(db, cid, "Stock-in-Hand", "Stock-in-Hand")
    fixed_assets_ledger = ensure_ledger(db, cid, "Fixed Assets", "Fixed Assets")
    accum_dep = ensure_ledger(db, cid, "Accumulated Depreciation", "Fixed Assets")
    capital = ensure_ledger(db, cid, "Capital Account", "Capital Account")
    bank_loan = ensure_ledger(db, cid, "Term Loan - Bank", "Loans & Advances (Liabilities)")
    sundry_cr = ensure_ledger(db, cid, "Sundry Creditors", "Sundry Creditors")
    sundry_dr = ensure_ledger(db, cid, "Sundry Debtors", "Sundry Debtors")

    # expense ledgers
    exp_ledgers = {}
    for name in ["Rent Expense", "Electricity Expense", "Telephone Expense",
                 "Salaries & Wages", "Printing & Stationery", "Travelling Expense",
                 "Repairs & Maintenance", "Insurance Expense", "Bank Charges",
                 "Professional Fees", "Advertising Expense", "Audit Fees",
                 "Office Expenses", "Vehicle Expenses", "Fuel & Lubricants",
                 "Depreciation Expense", "PF Expense", "ESI Expense",
                 "Donations & Charity", "Interest Expense", "Power & Fuel"]:
        exp_ledgers[name] = ensure_ledger(db, cid, name, "Indirect Expenses")

    # income ledgers
    inc_ledgers = {}
    for name in ["Interest Income", "Other Income", "Rental Income",
                 "Donation Income", "Canteen Income", "Scrap Sales",
                 "Service Income", "Hall Rental Income"]:
        inc_ledgers[name] = ensure_ledger(db, cid, name, "Indirect Incomes")

    # ── Units & stock groups ──
    from app.models.masters import Unit
    for u in ["Nos", "Kg", "Ltr", "Pkt", "Mtr", "Rim", "Job", "Yr", "Kl"]:
        if not db.query(Unit).filter(Unit.company_id == cid, Unit.name == u).first():
            db.add(Unit(company_id=cid, name=u, is_active=True))
    db.flush()

    sg_raw = create_stock_group(db, cid, "Raw Materials")
    sg_pack = create_stock_group(db, cid, "Packaging Materials")
    sg_fg = create_stock_group(db, cid, "Finished Goods")
    sg_gen = create_stock_group(db, cid, "General Items")

    # ── Stock items + opening balance ──
    item_defs = stock_items_for(spec["industry"])
    RNG.shuffle(item_defs)
    items = []
    opening_value = Decimal("0")
    for name, hsn, gst_rate, uom in item_defs:
        fg_keys = ["Juice", "Water", "Purifier", "Filter", "RO", "Dispenser",
                   "Membrane", "Candles", "Books", "Chairs", "Lights", "Instruments"]
        pack_keys = ["Bottle", "Cap", "Label", "Carton", "Preform"]
        if any(k in name for k in fg_keys):
            grp = sg_fg
        elif any(k in name for k in pack_keys):
            grp = sg_pack
        else:
            grp = sg_raw
        op_qty = RNG.randint(0, 180)
        op_rate = round(gst_rate + RNG.uniform(5, 120), 2)
        si = create_stock_item(db, cid, name, grp.id, hsn, float(gst_rate),
                               uom=uom, opening_qty=float(op_qty),
                               opening_rate=float(op_rate),
                               sku=f"SKU-{RNG.randint(10000,99999)}")
        items.append(si)
        if op_qty > 0:
            sb = StockBalance(company_id=cid, stock_item_id=si.id,
                              quantity=op_qty, avg_rate=Decimal(str(op_rate)),
                              total_value=Decimal(str(round(op_qty * op_rate, 2))),
                              last_entry_date="2024-04-01")
            db.add(sb)
            opening_value += Decimal(str(round(op_qty * op_rate, 2)))
    db.flush()
    print(f"  Created {len(items)} stock items; opening stock value = {rnd(opening_value)}")

    # ── Parties ──
    customers, suppliers, employees = [], [], []
    # customers
    for nm in CUSTOMER_NAMES:
        st = RNG.choice(["27", "29", "33", "24", "06", "09"])
        led = ensure_ledger(db, cid, nm, "Sundry Debtors")
        p = create_party(db, cid, nm, "customer", led.id,
                         gstin=(f"{st}AACU{rng_pan()}1Z{rng_z()}" if RNG.random() > 0.3 else None),
                         state_code=st, phone=f"9{RNG.randint(100000000,999999999)}",
                         email=f"accounts@{slug(nm)}.com",
                         address=f"{RNG.randint(1,200)} Main Road, City")
        customers.append((p, st))
    for nm in SUPPLIER_NAMES:
        st = RNG.choice(["27", "29", "33", "24", "06", "09"])
        led = ensure_ledger(db, cid, nm, "Sundry Creditors")
        p = create_party(db, cid, nm, "supplier", led.id,
                         gstin=(f"{st}AAFS{rng_pan()}1Z{rng_z()}" if RNG.random() > 0.2 else None),
                         state_code=st, phone=f"9{RNG.randint(100000000,999999999)}",
                         email=f"sales@{slug(nm)}.com",
                         address=f"{RNG.randint(1,200)} Market Yard, City")
        suppliers.append((p, st))
    for nm in EMPLOYEE_NAMES:
        led = ensure_ledger(db, cid, nm, "Sundry Creditors")
        p = create_party(db, cid, nm, "employee", led.id,
                         state_code=company_state, phone=f"9{RNG.randint(100000000,999999999)}",
                         email=f"{slug(nm)}@{slug(spec['name'])}.com")
        employees.append((p, led.id))

    # church donors / recipients
    donors, charities = [], []
    if spec["industry"] == "church":
        for nm in ["Bro. Thomas Cherian", "Sis. Mary John", "Mr. Rajesh Kumar",
                   "Mrs. Lakshmi Rao", "Mr. David Paul", "Family of S. Nair",
                   "Ms. Anjali Menon", "Mr. Joseph K."]:
            led = ensure_ledger(db, cid, nm, "Sundry Debtors")
            p = create_party(db, cid, nm, "donor", led.id, state_code="29",
                             phone=f"9{RNG.randint(100000000,999999999)}")
            donors.append((p, led.id))
        for nm in ["Orphanage Care Trust", "Mission India Foundation",
                   "Food For All NGO", "Rural Health Society"]:
            led = ensure_ledger(db, cid, nm, "Sundry Creditors")
            p = create_party(db, cid, nm, "charity", led.id, state_code="29")
            charities.append((p, led.id))
    db.flush()

    # ── TDS sections ──
    create_tds_section(db, cid, "192", "Salaries", "tds", 10.0)
    create_tds_section(db, cid, "194C", "Payments to Contractors", "tds", 2.0)

    # ── Opening journal (balanced) ──
    cash_open = Decimal(str(RNG.randint(80000, 250000)))
    bank1_open = Decimal(str(RNG.randint(1500000, 4500000)))
    bank2_open = Decimal(str(RNG.randint(200000, 900000)))
    fa_open = Decimal(str(RNG.randint(1200000, 3500000)))
    debtors_open = Decimal(str(RNG.randint(300000, 1200000)))
    creditors_open = Decimal(str(RNG.randint(400000, 1500000)))
    loan_open = Decimal(str(RNG.randint(800000, 2500000)))

    op_lines = [
        {"ledger_id": find_ledger(db, cid, "Cash in Hand").id, "debit": cash_open},
        {"ledger_id": bank1.id, "debit": bank1_open},
        {"ledger_id": bank2.id, "debit": bank2_open},
        {"ledger_id": fixed_assets_ledger.id, "debit": fa_open},
        {"ledger_id": stock_in_hand.id, "debit": opening_value},
        {"ledger_id": sundry_dr.id, "debit": debtors_open},
        {"ledger_id": sundry_cr.id, "credit": creditors_open},
        {"ledger_id": bank_loan.id, "credit": loan_open},
    ]
    total_debit = sum(Decimal(str(l.get("debit", 0))) for l in op_lines)
    total_credit = sum(Decimal(str(l.get("credit", 0))) for l in op_lines)
    op_lines.append({"ledger_id": capital.id, "credit": rnd(total_debit - total_credit)})
    build_opening_journal(db, cid, admin.id, "2024-2025", op_lines)

    # running stock availability for sales capping (continuous across FYs)
    avail = {si.id: Decimal(str(si.opening_qty)) for si in items}

    counters = dict(inv=0, pur=0, pay=0, rct=0, cnt=0, jv=0, dn=0, cn=0)

    def vno(prefix):
        counters[prefix] = counters.get(prefix, 0) + 1
        return f"{prefix.upper()}-{counters[prefix]:04d}"

    # payroll statutory payable ledgers (created once)
    pf_pay = ensure_ledger(db, cid, "PF Payable", "Duties & Taxes")
    esi_pay = ensure_ledger(db, cid, "ESI Payable", "Duties & Taxes")
    tds_pay = ensure_ledger(db, cid, "TDS Payable", "Duties & Taxes")
    pt_pay = ensure_ledger(db, cid, "Professional Tax Payable", "Duties & Taxes")
    salary_pay = ensure_ledger(db, cid, "Salaries Payable", "Sundry Creditors")

    # fixed assets register (purchased in FY1)
    seed_fixed_assets(db, cid)

    cash_led = find_ledger(db, cid, "Cash in Hand")
    expense_names = ["Rent Expense", "Electricity Expense", "Telephone Expense",
                     "Printing & Stationery", "Travelling Expense",
                     "Repairs & Maintenance", "Insurance Expense", "Bank Charges",
                     "Professional Fees", "Advertising Expense", "Audit Fees",
                     "Office Expenses", "Vehicle Expenses", "Fuel & Lubricants",
                     "Power & Fuel", "Interest Expense"]

    fys = [
        ("2024-2025", "2024-04-01", "2025-03-31"),
        ("2025-2026", "2025-04-01", "2026-03-31"),
        ("2026-2027", "2026-04-01", "2027-03-31"),
    ]
    # per-FY transaction volumes
    scales = {
        "2024-2025": dict(purch=45, sales=75, dn=5, cn=5, exp=35, pr=25, cnt=8,
                          church_don=25, church_ch=8, hall=4),
        "2025-2026": dict(purch=70, sales=130, dn=6, cn=6, exp=45, pr=35, cnt=10,
                          church_don=40, church_ch=12, hall=6),
        "2026-2027": dict(purch=55, sales=100, dn=5, cn=5, exp=38, pr=28, cnt=9,
                          church_don=32, church_ch=10, hall=5),
    }
    if spec["industry"] == "church":
        for k in scales:
            s = scales[k]
            scales[k] = dict(purch=int(s["purch"] * 0.5), sales=int(s["sales"] * 0.35),
                             dn=4, cn=4, exp=s["exp"], pr=int(s["pr"] * 0.7),
                             cnt=s["cnt"], church_don=s["church_don"],
                             church_ch=s["church_ch"], hall=s["hall"])

    def rdate(fs, fe):
        span = (date.fromisoformat(fe) - date.fromisoformat(fs)).days
        return add_days(fs, RNG.randint(0, span))

    for (fyname, fs, fe) in fys:
        sc = scales[fyname]
        stock_before = Decimal("0")
        for sb in db.query(StockBalance).filter(StockBalance.company_id == cid).all():
            stock_before += Decimal(str(sb.total_value))

        # ── Purchases (inward stock, input GST) ──
        for _ in range(sc["purch"]):
            sup, st = RNG.choice(suppliers)
            d = rdate(fs, fe)
            nlines = RNG.randint(2, 6)
            chosen = RNG.sample(items, min(nlines, len(items)))
            plines = []
            for si in chosen:
                qty = Decimal(str(RNG.randint(10, 200)))
                rate = Decimal(str(round(si.gst_rate + RNG.uniform(5, 120), 2)))
                avail[si.id] += qty
                plines.append({"stock_item_id": si.id, "qty": float(qty),
                               "rate": float(rate), "discount_pct": RNG.choice([0, 0, 5, 10]),
                               "gst_rate_override": float(si.gst_rate)})
            bk = RNG.choice(banks)
            build_purchase_voucher(db, cid, admin.id, vno("pur"), d, plines, sup.id,
                                   bk.id, company_state, st,
                                   narration=f"Purchase from {sup.name}",
                                   reference=f"PO-{RNG.randint(1000,9999)}")

        # ── Sales (outward stock, output GST) ──
        for _ in range(sc["sales"]):
            cust, st = RNG.choice(customers)
            d = rdate(fs, fe)
            nlines = RNG.randint(1, 4)
            sellable = [si for si in items if avail[si.id] > 1]
            if not sellable:
                continue
            chosen = RNG.sample(sellable, min(nlines, len(sellable)))
            slines = []
            for si in chosen:
                maxq = int(avail[si.id])
                qty = Decimal(str(RNG.randint(1, min(maxq, 120))))
                rate = Decimal(str(round(si.gst_rate + RNG.uniform(8, 160), 2)))
                avail[si.id] -= qty
                slines.append({"stock_item_id": si.id, "qty": float(qty),
                               "rate": float(rate), "discount_pct": RNG.choice([0, 0, 3, 5]),
                               "gst_rate_override": float(si.gst_rate)})
            pay_led = RNG.choice(banks).id if RNG.random() > 0.25 else cash_led.id
            build_sales_voucher(db, cid, admin.id, vno("inv"), d, slines, cust.id,
                                pay_led, company_state, st,
                                narration=f"Sale to {cust.name}",
                                reference=f"SO-{RNG.randint(1000,9999)}")

        # ── Purchase returns (debit notes) ──
        for _ in range(sc["dn"]):
            sup, st = RNG.choice(suppliers)
            d = rdate(fs, fe)
            si = RNG.choice(items)
            qty = Decimal(str(RNG.randint(1, 20)))
            rate = Decimal(str(round(si.gst_rate + RNG.uniform(5, 100), 2)))
            if avail[si.id] + qty >= 0:
                avail[si.id] += qty
            build_debit_note_voucher(db, cid, admin.id, vno("dn"), d,
                                     [{"stock_item_id": si.id, "qty": float(qty), "rate": float(rate)}],
                                     sup.id, None, company_state, st,
                                     narration="Purchase return")

        # ── Sales returns (credit notes) ──
        for _ in range(sc["cn"]):
            cust, st = RNG.choice(customers)
            d = rdate(fs, fe)
            si = RNG.choice(items)
            qty = Decimal(str(RNG.randint(1, 10)))
            rate = Decimal(str(round(si.gst_rate + RNG.uniform(8, 150), 2)))
            avail[si.id] -= qty
            build_credit_note_voucher(db, cid, admin.id, vno("cn"), d,
                                      [{"stock_item_id": si.id, "qty": float(qty), "rate": float(rate)}],
                                      cust.id, None, company_state, st,
                                      narration="Sales return")

        # ── Expense payments (cash/bank) ──
        for _ in range(sc["exp"]):
            d = rdate(fs, fe)
            en = RNG.choice(expense_names)
            amt = float(round(RNG.uniform(2000, 90000), 2))
            bk = RNG.choice(banks)
            sup, st = RNG.choice(suppliers)
            build_payment_receipt_voucher(db, cid, admin.id, "payment", vno("pay"), d,
                                          amt, exp_ledgers[en].id, bk.id,
                                          narration=f"{en} - {sup.name}")

        # ── Supplier payments / customer receipts ──
        for _ in range(sc["pr"]):
            d = rdate(fs, fe)
            bk = RNG.choice(banks)
            if RNG.random() < 0.5:
                sup, st = RNG.choice(suppliers)
                amt = float(round(RNG.uniform(10000, 250000), 2))
                build_payment_receipt_voucher(db, cid, admin.id, "payment", vno("pay"), d,
                                              amt, find_ledger(db, cid, sup.name).id, bk.id,
                                              party_id=sup.id, narration=f"Payment to {sup.name}")
            else:
                cust, st = RNG.choice(customers)
                amt = float(round(RNG.uniform(10000, 300000), 2))
                build_payment_receipt_voucher(db, cid, admin.id, "receipt", vno("rct"), d,
                                              amt, find_ledger(db, cid, cust.name).id, bk.id,
                                              party_id=cust.id, narration=f"Receipt from {cust.name}")

        # ── Contra (cash deposit / withdrawal) ──
        for _ in range(sc["cnt"]):
            d = rdate(fs, fe)
            amt = float(round(RNG.uniform(20000, 200000), 2))
            if RNG.random() < 0.5:
                build_contra_voucher(db, cid, admin.id, vno("cnt"), d,
                                     find_ledger(db, cid, "Cash in Hand").id, bank1.id, amt,
                                     narration="Cash deposited to bank")
            else:
                build_contra_voucher(db, cid, admin.id, vno("cnt"), d,
                                     bank1.id, find_ledger(db, cid, "Cash in Hand").id, amt,
                                     narration="Cash withdrawn from bank")

        # ── Church-specific: donations & charity ──
        if spec["industry"] == "church":
            for _ in range(sc["church_don"]):
                d = rdate(fs, fe)
                donor, dled = RNG.choice(donors)
                amt = float(round(RNG.uniform(500, 50000), 2))
                bk = RNG.choice(banks)
                build_payment_receipt_voucher(db, cid, admin.id, "receipt", vno("rct"), d,
                                              amt, inc_ledgers["Donation Income"].id, bk.id,
                                              party_id=donor.id, narration=f"Donation from {donor.name}")
            for _ in range(sc["church_ch"]):
                d = rdate(fs, fe)
                ch, cled = RNG.choice(charities)
                amt = float(round(RNG.uniform(5000, 80000), 2))
                bk = RNG.choice(banks)
                build_payment_receipt_voucher(db, cid, admin.id, "payment", vno("pay"), d,
                                              amt, exp_ledgers["Donations & Charity"].id, bk.id,
                                              party_id=ch.id, narration=f"Charity to {ch.name}")
            for _ in range(sc["hall"]):
                d = rdate(fs, fe)
                bk = RNG.choice(banks)
                amt = float(round(RNG.uniform(10000, 40000), 2))
                build_payment_receipt_voucher(db, cid, admin.id, "receipt", vno("rct"), d,
                                              amt, inc_ledgers["Hall Rental Income"].id, bk.id,
                                              narration="Hall rental income")

        # ── Payroll (accounting-only): 12 monthly journals + disbursement ──
        for m in range(12):
            md = add_days(fs, m * 30 + RNG.randint(0, 5))
            tot_gross = tot_pf = tot_esi = tot_pt = tot_tds = tot_net = 0
            for (emp, eled) in employees:
                basic = RNG.choice([28000, 32000, 38000, 45000, 52000])
                hra = int(basic * 0.4)
                spl = int(basic * 0.2)
                gross = basic + hra + spl
                pf = int(basic * 0.12)
                esi = int(gross * 0.0325) if gross < 21000 else 0
                pt = 200
                tds = int(gross * 0.05)
                net = gross - pf - esi - pt - tds
                tot_gross += gross; tot_pf += pf; tot_esi += esi
                tot_pt += pt; tot_tds += tds; tot_net += net
            build_journal_voucher(db, cid, admin.id, vno("jv"), md, [
                {"ledger_id": exp_ledgers["Salaries & Wages"].id, "debit": float(tot_gross)},
                {"ledger_id": exp_ledgers["PF Expense"].id, "debit": float(tot_pf)},
                {"ledger_id": exp_ledgers["ESI Expense"].id, "debit": float(tot_esi)},
                {"ledger_id": salary_pay.id, "credit": float(tot_net)},
                {"ledger_id": pf_pay.id, "credit": float(tot_pf * 2)},
                {"ledger_id": esi_pay.id, "credit": float(tot_esi * 2)},
                {"ledger_id": pt_pay.id, "credit": float(tot_pt)},
                {"ledger_id": tds_pay.id, "credit": float(tot_tds)},
            ], narration=f"Payroll run - {fyname}")
            bk = RNG.choice(banks)
            build_payment_receipt_voucher(db, cid, admin.id, "payment", vno("pay"), md,
                                          float(round(tot_net, 2)), salary_pay.id, bk.id,
                                          narration=f"Salary disbursement - {fyname}")

        # ── Manufacturing in the current FY ──
        if fyname == "2025-2026" and spec["industry"] in ("juice", "ro"):
            seed_manufacturing_for(db, cid, items, spec["industry"])

        # ── Year-end depreciation ──
        dep_amt = Decimal(str(RNG.randint(120000, 350000)))
        build_journal_voucher(db, cid, admin.id, vno("jv"), add_days(fe, -5), [
            {"ledger_id": exp_ledgers["Depreciation Expense"].id, "debit": float(dep_amt)},
            {"ledger_id": accum_dep.id, "credit": float(dep_amt)},
        ], narration=f"Depreciation - {fyname}")

        # ── Closing stock adjustment for this FY (P&L <-> BS tie-out) ──
        stock_after = Decimal("0")
        for sb in db.query(StockBalance).filter(StockBalance.company_id == cid).all():
            stock_after += Decimal(str(sb.total_value))
        diff = stock_after - stock_before
        if abs(diff) > 1:
            if diff > 0:
                build_journal_voucher(db, cid, admin.id, vno("jv"), add_days(fe, -3), [
                    {"ledger_id": stock_in_hand.id, "debit": float(diff)},
                    {"ledger_id": find_ledger(db, cid, "Purchases").id, "credit": float(diff)},
                ], narration=f"Closing stock adjustment - {fyname}")
            else:
                build_journal_voucher(db, cid, admin.id, vno("jv"), add_days(fe, -3), [
                    {"ledger_id": find_ledger(db, cid, "Purchases").id, "debit": float(-diff)},
                    {"ledger_id": stock_in_hand.id, "credit": float(-diff)},
                ], narration=f"Closing stock adjustment - {fyname}")

    # ── Bank reconciliation statements (per FY) ──
    for (fyname, fs, fe) in fys:
        for bk in banks:
            for _ in range(18):
                d = rdate(fs, fe)
                amt = float(round(RNG.uniform(2000, 200000), 2))
                if RNG.random() < 0.5:
                    create_bank_statement_line(db, cid, bk.id, d, "Bank charges / UTR clearing",
                                               debit=amt, reference=f"UTR{RNG.randint(100000,999999)}")
                else:
                    create_bank_statement_line(db, cid, bk.id, d, "Customer deposit / NEFT credit",
                                               credit=amt, reference=f"NEFT{RNG.randint(100000,999999)}")

    db.commit()
    print(f"  Seeded {spec['name']} with {sum(counters.values())} vouchers across 3 FYs")
    return c


# ── sub-seeders ───────────────────────────────────────────────────────────
def seed_fixed_assets(db, company_id):
    from app.models.asset import AssetCategory, AssetRegister
    cats = {
        "Computers & Electronics": ("wdv", 12.5, 5),
        "Office Furniture": ("wdv", 5.28, 10),
        "Motor Vehicles": ("wdv", 15.0, 8),
        "Plant & Machinery": ("wdv", 15.0, 12),
    }
    cat_map = {}
    for name, (method, rate, life) in cats.items():
        c = AssetCategory(company_id=company_id, name=name,
                          depreciation_method=method, rate_pct=rate,
                          useful_life_years=life, is_active=True)
        db.add(c); db.flush(); cat_map[name] = c
    assets = [
        ("Computers & Electronics", "IT-001", "Office Laptops", "2025-05-01", 180000, 10000),
        ("Office Furniture", "FUR-001", "Modular Workstation", "2025-04-15", 250000, 20000),
        ("Motor Vehicles", "VEH-001", "Delivery Van", "2025-04-01", 750000, 60000),
        ("Plant & Machinery", "MAC-001", "Filling Line Machinery", "2025-06-01", 2200000, 150000),
    ]
    for cat, code, name, pdate, cost, salvage in assets:
        a = AssetRegister(company_id=company_id, category_id=cat_map[cat].id,
                          asset_code=code, name=name, purchase_date=pdate,
                          cost=cost, salvage_value=salvage, wdv=cost,
                          put_to_use_date=pdate, is_active=True)
        db.add(a)
    db.flush()


def seed_manufacturing_for(db, company_id, items, industry):
    from app.models.manufacturing import BillOfMaterials
    items_by = {i.name: i for i in items}
    if industry == "juice":
        fg = items_by.get("Mango Juice 1L")
        rm1 = items_by.get("Fruit Pulp Concentrate")
        rm2 = items_by.get("Sugar Syrup")
        rm3 = items_by.get("PET Bottle 1L")
        rm4 = items_by.get("Bottle Cap 28mm")
        if not all([fg, rm1, rm2, rm3, rm4]):
            print("  Skipping manufacturing - missing items"); return
        bom = create_bom(db, company_id, BomCreate(
            name="Mango Juice 1L Assembly", finished_item_id=fg.id, output_qty=1.0,
            lines=[
                BomLineCreate(stock_item_id=rm1.id, quantity=0.4, wastage_pct=1.0),
                BomLineCreate(stock_item_id=rm2.id, quantity=0.2, wastage_pct=1.0),
                BomLineCreate(stock_item_id=rm3.id, quantity=1.0, wastage_pct=0),
                BomLineCreate(stock_item_id=rm4.id, quantity=1.0, wastage_pct=0),
            ]))
        order = create_production_order(db, company_id, None, ProductionOrderCreate(
            bom_id=bom.id, order_date="2025-09-01", planned_qty=500.0,
            narration="Season batch - Mango Juice 1L"))
        confirm_production_order(db, company_id, order.id)
    else:
        fg = items_by.get("Packaged Drinking Water 20L Can")
        rm1 = items_by.get("PET Preform 20L")
        rm2 = items_by.get("Bottle Cap 30mm")
        rm3 = items_by.get("Mineral Salt Mix")
        if not all([fg, rm1, rm2, rm3]):
            print("  Skipping manufacturing - missing items"); return
        bom = create_bom(db, company_id, BomCreate(
            name="20L Water Can Assembly", finished_item_id=fg.id, output_qty=1.0,
            lines=[
                BomLineCreate(stock_item_id=rm1.id, quantity=1.0, wastage_pct=1.0),
                BomLineCreate(stock_item_id=rm2.id, quantity=1.0, wastage_pct=0),
                BomLineCreate(stock_item_id=rm3.id, quantity=0.01, wastage_pct=0),
            ]))
        order = create_production_order(db, company_id, None, ProductionOrderCreate(
            bom_id=bom.id, order_date="2025-08-01", planned_qty=300.0,
            narration="Monthly batch - 20L cans"))
        confirm_production_order(db, company_id, order.id)


# ── small utils ───────────────────────────────────────────────────────────
def rng_pan():
    import string
    return "".join(RNG.choice(string.ascii_uppercase + string.digits) for _ in range(5))


def rng_z():
    return str(RNG.randint(1, 9))


def slug(s):
    return "".join(ch for ch in s.lower().replace("&", "and").replace(".", "")
                   if ch.isalnum()).rstrip()


# ── main ──────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("ZLedger — Seed Three Additional Demo Companies")
    print("=" * 60)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        admin = get_admin(db)
        if not admin:
            print("ERROR: admin@zledger.com not found. Bootstrap the app first.")
            return
        existing = {c.name for c in db.query(Company).all()}
        for spec in company_specs():
            if spec["name"] in existing:
                print(f"SKIP (already exists): {spec['name']}")
                continue
            seed_company(db, admin, spec)
        print("\nDone. Reconciling trial balances...")
        reconcile(db)
    finally:
        db.close()


def reconcile(db):
    from app.models.accounting import Ledger
    from app.models.voucher import Voucher, VoucherLine
    from sqlalchemy import func, select
    fy_ranges = [("2024-2025", "2024-04-01", "2025-03-31"),
                 ("2025-2026", "2025-04-01", "2026-03-31"),
                 ("2026-2027", "2026-04-01", "2027-03-31")]
    companies = db.query(Company).filter(
        Company.name.in_(["Grace Covenant Church",
                          "Himalayan Fresh Juices Pvt Ltd",
                          "PureDrop RO Water Solutions Pvt Ltd"])).all()
    for c in companies:
        res = db.execute(
            select(func.coalesce(func.sum(VoucherLine.debit), 0) - func.coalesce(func.sum(VoucherLine.credit), 0))
            .join(Voucher, Voucher.id == VoucherLine.voucher_id)
            .filter(Voucher.company_id == c.id)
        ).scalar()
        res = float(res or 0)
        print(f"  {c.name}: ALL-FY TB net = {round(res, 2)}  (should be ~0)")
        for fyname, fs, fe in fy_ranges:
            fy_net = db.execute(
                select(func.coalesce(func.sum(VoucherLine.debit), 0) - func.coalesce(func.sum(VoucherLine.credit), 0))
                .join(Voucher, Voucher.id == VoucherLine.voucher_id)
                .filter(Voucher.company_id == c.id,
                        Voucher.voucher_date >= fs, Voucher.voucher_date <= fe)
            ).scalar()
            cnt = db.query(Voucher).filter(Voucher.company_id == c.id,
                                           Voucher.voucher_date >= fs,
                                           Voucher.voucher_date <= fe).count()
            print(f"      {fyname}: vouchers={cnt:4d}  net={round(float(fy_net or 0), 2)}")
        # stock qty sanity
        from app.models.stock import StockBalance
        neg = db.query(StockBalance).filter(StockBalance.company_id == c.id,
                                            StockBalance.quantity < 0).count()
        print(f"      negative stock balances: {neg}")


if __name__ == "__main__":
    main()
