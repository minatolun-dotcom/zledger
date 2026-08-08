"""Test-data cleanup per AGENTS.md protocol.

Removes: [E2E]/[AUDIT] vouchers + their allocations/stock/tds entries,
[E2E] recurring templates, Test Co*/E2E companies, E2E financial years,
Test BOM* manufacturing records, and orphaned users (no company membership).
Keeps the 3 demo companies untouched.
"""
from sqlalchemy import select

from app.core.db import get_db
from app.models.accounting import FinancialYear
from app.models.manufacturing import BillOfMaterials, BomLine, ProductionOrder, ProductionOrderLine
from app.models.payment_allocation import PaymentAllocation
from app.models.recurring_template import RecurringTemplate
from app.models.stock import StockEntry
from app.models.tds_tcs import TdsTcsEntry
from app.models.user import Company, CompanyMember, User
from app.models.voucher import Voucher

db = next(get_db())

# [E2E] recurring templates
for t in db.query(RecurringTemplate).filter(RecurringTemplate.name.like("[E2E]%")).all():
    db.delete(t)

# [AUDIT]/[E2E] vouchers + dependent rows
ids = [v.id for v in db.query(Voucher).filter(Voucher.narration.like("[AUDIT]%")).all()]
ids += [v.id for v in db.query(Voucher).filter(Voucher.narration.like("[E2E]%")).all()]
ids = list(set(ids))
if ids:
    for a in db.query(PaymentAllocation).filter(
        (PaymentAllocation.payment_voucher_id.in_(ids))
        | (PaymentAllocation.invoice_voucher_id.in_(ids))
    ).all():
        db.delete(a)
    for s in db.query(StockEntry).filter(StockEntry.voucher_id.in_(ids)).all():
        db.delete(s)
    for t in db.query(TdsTcsEntry).filter(TdsTcsEntry.voucher_id.in_(ids)).all():
        db.delete(t)
    for v in db.query(Voucher).filter(Voucher.id.in_(ids)).all():
        db.delete(v)
    print(f"deleted {len(ids)} [E2E]/[AUDIT] vouchers")

# Test BOMs (cascade PO lines -> POs -> BOM lines -> BOMs)
test_boms = db.query(BillOfMaterials).filter(BillOfMaterials.name.like("Test BOM%")).all()
bom_ids = [str(b.id) for b in test_boms]
if bom_ids:
    orders = db.query(ProductionOrder).filter(ProductionOrder.bom_id.in_(bom_ids)).all()
    order_ids = [str(o.id) for o in orders]
    if order_ids:
        for l in db.query(ProductionOrderLine).filter(ProductionOrderLine.production_order_id.in_(order_ids)).all():
            db.delete(l)
    for o in orders:
        db.delete(o)
    for l in db.query(BomLine).filter(BomLine.bom_id.in_(bom_ids)).all():
        db.delete(l)
    for b in test_boms:
        db.delete(b)
    print(f"deleted {len(bom_ids)} test BOMs")

# Test companies: bare "Test Co" AND "Test Co <suffix>" AND any containing E2E
test_company_ids = set()
for c in db.query(Company).filter(Company.name == "Test Co").all():
    test_company_ids.add(c.id)
for c in db.query(Company).filter(Company.name.like("Test Co %")).all():
    test_company_ids.add(c.id)
for c in db.query(Company).filter(Company.name.like("%E2E%")).all():
    test_company_ids.add(c.id)
for cid in test_company_ids:
    c = db.get(Company, cid)
    if c:
        db.delete(c)
if test_company_ids:
    print(f"deleted {len(test_company_ids)} test companies")

for fy in db.query(FinancialYear).filter(FinancialYear.name.like("%E2E%")).all():
    db.delete(fy)
for v in db.query(Voucher).filter(Voucher.narration.in_(["test", "Test", "TEST"])).all():
    db.delete(v)

# Orphaned users (no company membership) -> leftover test users
db.flush()
member_ids = select(CompanyMember.user_id)
orphan_users = db.query(User).filter(~User.id.in_(member_ids)).all()
for u in orphan_users:
    db.delete(u)
if orphan_users:
    print(f"deleted {len(orphan_users)} orphaned users")

db.commit()
print("Test data cleaned")
