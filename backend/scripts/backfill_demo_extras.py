"""Idempotent backfill of fixed assets + TDS entries for the three demo companies.

The live dataset (Grace Covenant Church, Himalayan Fresh Juices, PureDrop RO) was
seeded before ``seed_three_companies.py`` gained the ``seed_fixed_assets`` step, so
those companies have zero asset categories/registers and zero TDS entries.

This script tops up the missing demo data WITHOUT touching existing vouchers,
stock, parties or FYs. Safe to run repeatedly — it skips anything already present.

Run:  docker compose exec -T api python -m scripts.backfill_demo_extras
"""
from __future__ import annotations

from app.core.db import get_db
from app.models.user import Company
from app.models.accounting import Party
from app.models.asset import AssetCategory, AssetRegister
from app.models.tds_tcs import TdsTcsSection, TdsTcsEntry
from app.models.voucher import Voucher

DEMO_COMPANIES = [
    "Grace Covenant Church",
    "Himalayan Fresh Juices Pvt Ltd",
    "PureDrop RO Water Solutions Pvt Ltd",
]

# ── Asset categories (block-of-assets, Indian IT Act rates, WDV) ──────────────
ASSET_CATEGORIES = {
    "Computers & Electronics": ("wdv", 40.0, 3),
    "Office Furniture": ("wdv", 10.0, 10),
    "Motor Vehicles": ("wdv", 15.0, 8),
    "Plant & Machinery": ("wdv", 15.0, 12),
    "Buildings": ("slm", 10.0, 30),
}

# ── Per-company asset registers ──────────────────────────────────────────────
# (category, code, name, purchase_date, cost, salvage)
ASSETS_BY_COMPANY = {
    "Grace Covenant Church": [
        ("Computers & Electronics", "GCC-IT-001", "Office Desktop Computers (x3)", "2024-05-10", 165000, 12000),
        ("Computers & Electronics", "GCC-IT-002", "Sound & Projection System", "2024-06-15", 320000, 20000),
        ("Office Furniture", "GCC-FUR-001", "Auditorium Chairs (200 nos)", "2024-04-20", 480000, 30000),
        ("Office Furniture", "GCC-FUR-002", "Office Desks & Cabinets", "2024-07-01", 145000, 10000),
        ("Motor Vehicles", "GCC-VEH-001", "Community Outreach Van", "2024-08-12", 920000, 80000),
        ("Buildings", "GCC-BLD-001", "Fellowship Hall Extension", "2024-04-01", 3500000, 0),
    ],
    "Himalayan Fresh Juices Pvt Ltd": [
        ("Computers & Electronics", "HFJ-IT-001", "Accounts & Billing Workstations", "2024-05-05", 210000, 15000),
        ("Office Furniture", "HFJ-FUR-001", "Admin Office Furniture", "2024-04-18", 175000, 12000),
        ("Motor Vehicles", "HFJ-VEH-001", "Refrigerated Delivery Truck", "2024-06-01", 1850000, 150000),
        ("Motor Vehicles", "HFJ-VEH-002", "Distribution Tempo", "2024-09-10", 780000, 60000),
        ("Plant & Machinery", "HFJ-MAC-001", "Automatic Bottle Filling Line", "2024-05-20", 4200000, 300000),
        ("Plant & Machinery", "HFJ-MAC-002", "Fruit Pulp Extractor & Pasteurizer", "2024-07-15", 2650000, 200000),
        ("Plant & Machinery", "HFJ-MAC-003", "Cold Storage Chiller Unit", "2024-08-01", 1950000, 150000),
    ],
    "PureDrop RO Water Solutions Pvt Ltd": [
        ("Computers & Electronics", "PDR-IT-001", "Sales & Service CRM Workstations", "2024-05-08", 195000, 14000),
        ("Office Furniture", "PDR-FUR-001", "Showroom & Office Furniture", "2024-04-22", 160000, 11000),
        ("Motor Vehicles", "PDR-VEH-001", "Water Can Delivery Truck", "2024-06-05", 1650000, 130000),
        ("Motor Vehicles", "PDR-VEH-002", "Service Engineer Van", "2024-10-01", 720000, 55000),
        ("Plant & Machinery", "PDR-MAC-001", "RO Purification & Filling Plant", "2024-05-25", 3850000, 280000),
        ("Plant & Machinery", "PDR-MAC-002", "20L Can Washing & Sanitizing Line", "2024-07-10", 1450000, 110000),
        ("Plant & Machinery", "PDR-MAC-003", "UV Sterilization & Ozonation Unit", "2024-08-20", 980000, 70000),
    ],
}


def backfill_assets(db, company: Company) -> int:
    existing = {
        a.asset_code
        for a in db.query(AssetRegister).filter(AssetRegister.company_id == company.id).all()
    }
    cat_map: dict[str, AssetCategory] = {
        c.name: c
        for c in db.query(AssetCategory).filter(AssetCategory.company_id == company.id).all()
    }
    for name, (method, rate, life) in ASSET_CATEGORIES.items():
        if name not in cat_map:
            cat = AssetCategory(
                company_id=company.id, name=name, depreciation_method=method,
                rate_pct=rate, useful_life_years=life, is_active=True,
            )
            db.add(cat)
            db.flush()
            cat_map[name] = cat

    added = 0
    for cat, code, aname, pdate, cost, salvage in ASSETS_BY_COMPANY.get(company.name, []):
        if code in existing:
            continue
        db.add(AssetRegister(
            company_id=company.id, category_id=cat_map[cat].id, asset_code=code,
            name=aname, purchase_date=pdate, cost=float(cost),
            salvage_value=float(salvage), accumulated_depreciation=0.0,
            wdv=float(cost), put_to_use_date=pdate, is_active=True,
            last_depreciated_fy_id=None,
        ))
        added += 1
    return added


def backfill_tds_entries(db, company: Company) -> int:
    """Attach a handful of TDS deductions to existing payment vouchers."""
    existing = db.query(TdsTcsEntry).filter(TdsTcsEntry.company_id == company.id).count()
    if existing:
        return 0

    sec_194c = db.query(TdsTcsSection).filter(
        TdsTcsSection.company_id == company.id,
        TdsTcsSection.section_code == "194C",
    ).first()
    sec_192 = db.query(TdsTcsSection).filter(
        TdsTcsSection.company_id == company.id,
        TdsTcsSection.section_code == "192",
    ).first()
    if not sec_194c and not sec_192:
        return 0

    payments = db.query(Voucher).filter(
        Voucher.company_id == company.id,
        Voucher.voucher_type == "payment",
        Voucher.party_id.isnot(None),
    ).order_by(Voucher.voucher_date).limit(8).all()
    if not payments:
        return 0

    added = 0
    for idx, v in enumerate(payments):
        sec = sec_194c or sec_192
        rate = float(sec.rate)
        base = float(getattr(v, "grand_total", 0) or 0) or (25000 + idx * 5000)
        deducted = round(base * rate / 100.0, 2)
        status = "deposited" if idx % 3 else "pending"
        challan = f"{company.name[:3].upper()}-CHL-{idx + 1:03d}" if status == "deposited" else None
        dep_date = v.voucher_date if status == "deposited" else None
        db.add(TdsTcsEntry(
            company_id=company.id, voucher_id=v.id, party_id=v.party_id,
            section_id=sec.id, tds_tcs_type="tds", base_amount=base, rate=rate,
            deducted_amount=deducted, entry_date=v.voucher_date, status=status,
            challan_number=challan, deposition_date=dep_date,
        ))
        added += 1
    return added


def main() -> None:
    db = next(get_db())
    companies = db.query(Company).filter(Company.name.in_(DEMO_COMPANIES)).all()
    if not companies:
        print("No demo companies found — nothing to backfill.")
        return
    for c in companies:
        a = backfill_assets(db, c)
        t = backfill_tds_entries(db, c)
        db.commit()
        total_assets = db.query(AssetRegister).filter(AssetRegister.company_id == c.id).count()
        total_tds = db.query(TdsTcsEntry).filter(TdsTcsEntry.company_id == c.id).count()
        print(f"{c.name}: +{a} assets (now {total_assets}), +{t} TDS entries (now {total_tds})")
    print("Backfill complete.")


if __name__ == "__main__":
    main()
